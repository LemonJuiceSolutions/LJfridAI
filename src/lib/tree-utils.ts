/**
 * Pure (non-async) tree manipulation helpers.
 * NO 'use server' — safe to import from both server and client code.
 */
import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import { nanoid } from 'nanoid';
import type { DecisionNode, DecisionLeaf, Variable, VariableOption } from '@/lib/types';

export function findNodeByQuestion(node: DecisionNode | DecisionLeaf | string | { ref: string } | { subTreeRef: string } | any, questionOrDecision: string): DecisionNode | DecisionLeaf | null {
    if (!node) return null;
    if (typeof node === 'string') return null;
    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findNodeByQuestion(item, questionOrDecision);
            if (found) return found;
        }
        return null;
    }
    if ('ref' in node || 'subTreeRef' in node) return null;
    if ('question' in node && node.question === questionOrDecision) return node as DecisionNode;
    if ('decision' in node && node.decision === questionOrDecision) return node as DecisionLeaf;
    if ('options' in node && node.options) {
        for (const key in node.options) {
            const found = findNodeByQuestion(node.options[key], questionOrDecision);
            if (found) return found;
        }
    }
    return null;
}

export function getLastAssistantQuestion(history: string | undefined): string | null {
    if (!history) return null;
    const lines = history.split('\n').map(s => s.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].toLowerCase().startsWith('assistant:')) {
            return lines[i].slice('assistant:'.length).trim();
        }
    }
    return null;
}

export function findNodeById(node: any, id: string): any | null {
    if (!node) return null;
    if (typeof node === 'string') return null;
    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findNodeById(item, id);
            if (found) return found;
        }
        return null;
    }
    if ('ref' in node || 'subTreeRef' in node) return null;
    if (node.id === id) return node;
    if ('options' in node && node.options) {
        for (const key in node.options) {
            const found = findNodeById(node.options[key], id);
            if (found) return found;
        }
    }
    return null;
}

export function formatVariablesToTable(variables: Variable[]): string {
    if (!variables || variables.length === 0) return 'Nessuna variabile estratta.';
    let table = 'Nome Variabile | Tipo | Valori Possibili\n--- | --- | ---\n';
    variables.forEach((v) => {
        const valuesString = (v.possibleValues || []).map(opt => `${opt.name} (${opt.abbreviation}, ${opt.value})`).join('; ');
        table += `${v.name} | ${v.type} | ${valuesString}\n`;
    });
    return table;
}

export function extractSubTreeRefs(node: any): string[] {
    let refs: string[] = [];
    if (!node || typeof node !== 'object') return refs;
    if (Array.isArray(node)) {
        node.forEach(child => { refs = [...refs, ...extractSubTreeRefs(child)]; });
        return refs;
    }
    if (node.subTreeRef) refs.push(node.subTreeRef);
    if (node.options) {
        Object.values(node.options).forEach(child => { refs = [...refs, ...extractSubTreeRefs(child)]; });
    }
    return refs;
}

export function recursiveTreeUpdate(
    node: any,
    oldQuestionName: string,
    newQuestionName: string,
    newPossibleValues: VariableOption[],
    newVariableId?: string,
): { node: any, updated: boolean } {
    let updated = false;
    if (typeof node !== "object" || node === null) return { node, updated };
    const newNode = cloneDeep(node);
    if (newNode.question === oldQuestionName) {
        if (newQuestionName !== oldQuestionName) { newNode.question = newQuestionName; updated = true; }
        if (newVariableId && newNode.variableId !== newVariableId) { newNode.variableId = newVariableId; updated = true; }
        if (newPossibleValues && newNode.options) {
            const newOptions: { [key: string]: any } = {};
            newPossibleValues.forEach(opt => {
                newOptions[opt.name] = newNode.options[opt.name] || { decision: 'Percorso non definito', id: nanoid(8) };
            });
            if (!isEqual(newNode.options, newOptions)) { newNode.options = newOptions; updated = true; }
        }
    }
    if (newNode.options) {
        for (const key in newNode.options) {
            const result = recursiveTreeUpdate(newNode.options[key], oldQuestionName, newQuestionName, newPossibleValues, newVariableId);
            if (result.updated) { newNode.options[key] = result.node; updated = true; }
        }
    }
    return { node: newNode, updated };
}

export function recursiveTreeUpdateById(
    node: any,
    variableId: string,
    newQuestionName: string,
    newPossibleValues: VariableOption[],
    oldPossibleValues: VariableOption[] = []
): { node: any, updated: boolean } {
    let updated = false;
    const newNode = cloneDeep(node);
    if (typeof node !== "object" || node === null) return { node, updated };
    if (newNode.variableId === variableId) {
        if (newQuestionName !== newNode.question) { newNode.question = newQuestionName; updated = true; }
        if (newPossibleValues && newNode.options) {
            const newOptions: { [key: string]: any } = {};
            const currentOptions = newNode.options;
            const oldOptionsMapById = new Map<string, any>();
            oldPossibleValues.forEach(oldOpt => {
                if (oldOpt.id && currentOptions[oldOpt.name]) oldOptionsMapById.set(oldOpt.id, currentOptions[oldOpt.name]);
            });
            const oldOptionsMapByName = new Map(oldPossibleValues.map(opt => [opt.name, currentOptions[opt.name]]));
            newPossibleValues.forEach(newOpt => {
                let correspondingChild;
                if (newOpt.id && oldOptionsMapById.has(newOpt.id)) {
                    correspondingChild = oldOptionsMapById.get(newOpt.id);
                } else {
                    const oldOptMatch = oldPossibleValues.find(o => o.name === newOpt.name);
                    if (oldOptMatch) correspondingChild = oldOptionsMapByName.get(oldOptMatch.name);
                }
                newOptions[newOpt.name] = correspondingChild || { decision: 'Percorso non definito', id: nanoid(8) };
            });
            if (!isEqual(newNode.options, newOptions)) { newNode.options = newOptions; updated = true; }
        }
    }
    if (newNode.options) {
        for (const key in newNode.options) {
            const result = recursiveTreeUpdateById(newNode.options[key], variableId, newQuestionName, newPossibleValues, oldPossibleValues);
            if (result.updated) { newNode.options[key] = result.node; updated = true; }
        }
    }
    return { node: newNode, updated };
}
