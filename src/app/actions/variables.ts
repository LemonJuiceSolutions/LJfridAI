'use server';

import type { Variable, VariableOption, StoredTree } from '@/lib/types';
import { db } from '@/lib/db';
import { nanoid } from 'nanoid';
import uniqBy from 'lodash/uniqBy';
import omit from 'lodash/omit';
import { getAuthenticatedUser } from './auth';
import { serverCache } from '@/lib/server-cache';
import { getTreesAction, getTreeAction } from './trees';
import { recursiveTreeUpdateById } from '@/lib/tree-utils';

export async function getVariablesAction(): Promise<{ data: Variable[] | null; error: string | null; }> {
    try {
        const user = await getAuthenticatedUser();
        const now = Date.now();

        if (serverCache.variables && (now - serverCache.variablesTimestamp) < serverCache.CACHE_DURATION) {
            return { data: serverCache.variables, error: null };
        }

        const cachedTrees = (serverCache.trees && (now - serverCache.treesTimestamp) < serverCache.CACHE_DURATION)
            ? serverCache.trees
            : null;

        const treesPromise = cachedTrees
            ? Promise.resolve(cachedTrees)
            : db.tree.findMany({
                where: { companyId: user.companyId },
                select: { id: true, name: true, jsonDecisionTree: true, companyId: true }
            });

        const variablesPromise = db.variable.findMany({
            where: { companyId: user.companyId },
            orderBy: { name: 'asc' }
        });

        const [treesData, variablesData] = await Promise.all([treesPromise, variablesPromise]);

        const variables: Variable[] = variablesData.map(v => ({
            id: v.id,
            name: v.name,
            type: v.type as Variable['type'],
            possibleValues: (v.possibleValues as any) || [],
            createdAt: v.createdAt.toISOString(),
            usedIn: []
        }));

        const variableMapById = new Map(variables.map(v => [v.id, v]));

        for (const treeData of treesData) {
            const treeId = treeData.id;
            const treeName = treeData.name;

            const findVarIds = (node: any) => {
                if (typeof node !== 'object' || node === null) return;

                if (node.variableId) {
                    const dbVar = variableMapById.get(node.variableId);
                    if (dbVar && !dbVar.usedIn?.some(t => t.id === treeId)) {
                        if (!dbVar.usedIn) {
                            dbVar.usedIn = [];
                        }
                        dbVar.usedIn.push({ id: treeId, name: treeName });
                    }
                }

                if (node.options) {
                    for (const key in node.options) {
                        findVarIds(node.options[key]);
                    }
                }
            };

            try {
                if ((treeData as any).jsonDecisionTree) {
                    const jsonTree = JSON.parse((treeData as any).jsonDecisionTree);
                    findVarIds(jsonTree);
                }
            } catch (e) {
                console.warn(`Malformed JSON in tree ${treeId}, skipping variable usage check for it.`);
            }
        }

        serverCache.variables = variables;
        serverCache.variablesTimestamp = now;

        return { data: variables, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto durante il recupero delle variabili.';
        console.error("Error in getVariablesAction: ", e);
        return { data: null, error };
    }
}

export async function deleteAllVariablesAction(): Promise<{ success: boolean, error: string | null }> {
    try {
        await db.variable.deleteMany();
        return { success: true, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante l'eliminazione di massa.";
        console.error("Error in deleteAllVariablesAction: ", e);
        return { success: false, error };
    }
}

export async function deleteVariableAction(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
        await db.variable.delete({ where: { id } });
        return { success: true, error: null };
    } catch (e) {
        const error = e instanceof Error ? e.message : "Errore durante l'eliminazione della variabile.";
        return { success: false, error };
    }
}

export async function updateVariableAction(treeId: string | undefined, id: string, updateData: Partial<Variable>): Promise<{ success: boolean; data: StoredTree | null; error: string | null; }> {
    try {
        const user = await getAuthenticatedUser();
        if (!id) throw new Error("ID variabile non fornito.");

        const transactionOps: any[] = [];

        const oldVarData = await db.variable.findFirst({ where: { id, companyId: user.companyId } });
        if (!oldVarData) throw new Error("Variabile da aggiornare non trovata.");

        const updatedPossibleValues = updateData.possibleValues?.map(opt => ({
            ...opt,
            id: opt.id || nanoid(8),
        }));

        const newName = updateData.name?.trim();
        const newPossibleValues = updatedPossibleValues ? uniqBy((updatedPossibleValues || []).map(v => ({ ...v, name: v.name.trim() })).filter(v => v.name), 'name') : undefined;

        const dbUpdatePayload: any = { ...omit(updateData, 'id', 'usedIn', 'createdAt', 'possibleValues') };
        if (newPossibleValues) dbUpdatePayload.possibleValues = newPossibleValues;
        if (newName) dbUpdatePayload.name = newName;

        transactionOps.push(db.variable.update({ where: { id }, data: dbUpdatePayload }));

        const [allVarsResult, allTreesResult] = await Promise.all([
            getVariablesAction(),
            getTreesAction()
        ]);
        if (allVarsResult.error) throw new Error(allVarsResult.error);
        if (allTreesResult.error) throw new Error(allTreesResult.error);
        const affectedTreesIds = allVarsResult.data?.find(v => v.id === id)?.usedIn?.map(t => t.id) || [];

        if (affectedTreesIds.length > 0) {
            const affectedTreeDocs = allTreesResult.data!.filter(t => affectedTreesIds.includes(t.id));

            for (const treeDoc of affectedTreeDocs) {
                if (!treeDoc.jsonDecisionTree) continue;
                let jsonTree;
                try {
                    jsonTree = JSON.parse(treeDoc.jsonDecisionTree);
                } catch (e) {
                    console.warn(`Skipping malformed tree ${treeDoc.id}`);
                    continue;
                }

                const finalPossibleValues = newPossibleValues || (oldVarData.possibleValues as any);
                const finalOldPossibleValues = (oldVarData.possibleValues as any);

                const { node: updatedJsonTree, updated } = recursiveTreeUpdateById(jsonTree, id, newName || oldVarData.name, finalPossibleValues, finalOldPossibleValues);

                if (updated) {
                    transactionOps.push(db.tree.update({
                        where: { id: treeDoc.id },
                        data: { jsonDecisionTree: JSON.stringify(updatedJsonTree) }
                    }));
                }
            }
        }

        await db.$transaction(transactionOps);

        if (treeId && typeof treeId === 'string') {
            const finalTreeResult = await getTreeAction(treeId);
            return { success: true, data: finalTreeResult.data, error: null };
        }

        return { success: true, data: null, error: null };

    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante l'aggiornamento della variabile.";
        console.error("Error in updateVariableAction: ", e);
        return { success: false, data: null, error };
    }
}

export async function mergeVariablesAction(
    sourceVariableId: string,
    targetVariableId: string,
    finalName: string,
    finalPossibleValues: VariableOption[]
): Promise<{ success: boolean; error: string | null }> {
    try {
        if (!sourceVariableId || !targetVariableId || !finalName) {
            throw new Error("ID sorgente, ID destinazione e nome finale sono obbligatori.");
        }

        const transactionOps: any[] = [];

        const allVars = await getVariablesAction();
        if (allVars.error) throw new Error(allVars.error);

        const sourceVarInfo = allVars.data?.find(v => v.id === sourceVariableId);
        const sourceTreeIds = sourceVarInfo?.usedIn?.map(t => t.id) || [];

        if (sourceTreeIds.length > 0) {
            const affectedTreesResult = await getTreesAction(sourceTreeIds);
            if (affectedTreesResult.error) throw new Error(affectedTreesResult.error);

            for (const tree of affectedTreesResult.data!) {
                let jsonTree = JSON.parse(tree.jsonDecisionTree);

                const replaceVarId = (node: any) => {
                    if (typeof node !== 'object' || node === null) return node;

                    if (node.variableId === sourceVariableId) {
                        node.variableId = targetVariableId;
                        node.question = finalName;

                        const newOptions: { [key: string]: any } = {};
                        const currentOptions = node.options || {};
                        for (const finalValue of finalPossibleValues) {
                            newOptions[finalValue.name] = currentOptions[finalValue.name] || { decision: 'Percorso non definito', id: nanoid(8) };
                        }
                        node.options = newOptions;
                    }

                    if (node.options) {
                        for (const key in node.options) {
                            node.options[key] = replaceVarId(node.options[key]);
                        }
                    }
                    return node;
                };

                const updatedJsonTree = replaceVarId(jsonTree);

                transactionOps.push(db.tree.update({
                    where: { id: tree.id },
                    data: { jsonDecisionTree: JSON.stringify(updatedJsonTree) }
                }));
            }
        }

        transactionOps.push(db.variable.update({
            where: { id: targetVariableId },
            data: {
                name: finalName,
                possibleValues: uniqBy(finalPossibleValues.map(v => ({ ...v, id: v.id || nanoid(8) })), 'name')
            }
        }));

        transactionOps.push(db.variable.delete({ where: { id: sourceVariableId } }));

        await db.$transaction(transactionOps);
        return { success: true, error: null };

    } catch (e) {
        const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto durante la fusione.";
        console.error("Error in mergeVariablesAction: ", e);
        return { success: false, error };
    }
}
