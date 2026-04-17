'use server';

import { db } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/session';
import { executeSqlPreviewAction } from '@/app/actions/sql';

export async function getKnowledgeBaseEntriesAction(
    search?: string,
    category?: string
): Promise<{ data: any[] | null; error: string | null }> {
    const user = await getAuthenticatedUser();
    if (!user?.companyId) return { data: null, error: 'Non autorizzato' };

    try {
        const where: any = { companyId: user.companyId };

        if (search) {
            const term = search.toLowerCase();
            where.OR = [
                { question: { contains: term, mode: 'insensitive' } },
                { answer: { contains: term, mode: 'insensitive' } },
                { tags: { hasSome: [term] } },
            ];
        }

        if (category) {
            where.category = category;
        }

        const entries = await db.knowledgeBaseEntry.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: 100,
        });

        return { data: entries, error: null };
    } catch (e: any) {
        return { data: null, error: e.message };
    }
}

export async function createKnowledgeBaseEntryAction(data: {
    question: string;
    answer: string;
    tags: string[];
    category?: string;
    context?: string;
}): Promise<{ data: any | null; error: string | null }> {
    const user = await getAuthenticatedUser();
    if (!user?.companyId) return { data: null, error: 'Non autorizzato' };

    try {
        const entry = await db.knowledgeBaseEntry.create({
            data: {
                question: data.question,
                answer: data.answer,
                tags: data.tags,
                category: data.category || 'Generale',
                context: data.context,
                companyId: user.companyId,
            },
        });

        return { data: entry, error: null };
    } catch (e: any) {
        return { data: null, error: e.message };
    }
}

export async function updateKnowledgeBaseEntryAction(
    id: string,
    data: {
        question?: string;
        answer?: string;
        tags?: string[];
        category?: string;
        context?: string;
    }
): Promise<{ data: any | null; error: string | null }> {
    const user = await getAuthenticatedUser();
    if (!user?.companyId) return { data: null, error: 'Non autorizzato' };

    try {
        // Verify ownership
        const existing = await db.knowledgeBaseEntry.findUnique({ where: { id } });
        if (!existing || existing.companyId !== user.companyId) {
            return { data: null, error: 'Entry non trovata' };
        }

        const entry = await db.knowledgeBaseEntry.update({
            where: { id },
            data,
        });

        return { data: entry, error: null };
    } catch (e: any) {
        return { data: null, error: e.message };
    }
}

export async function deleteKnowledgeBaseEntryAction(
    id: string
): Promise<{ success: boolean; error: string | null }> {
    const user = await getAuthenticatedUser();
    if (!user?.companyId) return { success: false, error: 'Non autorizzato' };

    try {
        const existing = await db.knowledgeBaseEntry.findUnique({ where: { id } });
        if (!existing || existing.companyId !== user.companyId) {
            return { success: false, error: 'Entry non trovata' };
        }

        await db.knowledgeBaseEntry.delete({ where: { id } });
        return { success: true, error: null };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getKnowledgeBaseCategoriesAction(): Promise<{ data: string[] | null; error: string | null }> {
    const user = await getAuthenticatedUser();
    if (!user?.companyId) return { data: null, error: 'Non autorizzato' };

    try {
        const entries = await db.knowledgeBaseEntry.findMany({
            where: { companyId: user.companyId },
            select: { category: true },
            distinct: ['category'],
        });

        const categories = entries
            .map((e: any) => e.category)
            .filter((c: any): c is string => c !== null);

        return { data: categories, error: null };
    } catch (e: any) {
        return { data: null, error: e.message };
    }
}

// --- Auto-sync Knowledge Base from Trees ---

// Recursive node collector (same logic as super-agent-flow.ts)
function collectNodes(node: any, treeName: string, treeId: string, results: any[] = []): any[] {
    if (!node || typeof node === 'string') return results;
    if (node.ref || node.subTreeRef) return results;

    const nodeInfo: any = { treeId, treeName, nodeId: node.id || null };

    if (node.question) nodeInfo.question = node.question;
    if (node.decision) nodeInfo.decision = node.decision;
    if (node.sqlQuery) nodeInfo.sqlQuery = node.sqlQuery;
    if (node.sqlResultName) nodeInfo.sqlResultName = node.sqlResultName;
    if (node.sqlConnectorId) nodeInfo.sqlConnectorId = node.sqlConnectorId;
    if (node.pythonCode) nodeInfo.pythonCode = node.pythonCode;
    if (node.pythonResultName) nodeInfo.pythonResultName = node.pythonResultName;
    if (node.pythonOutputType) nodeInfo.pythonOutputType = node.pythonOutputType;
    if (node.pythonConnectorId) nodeInfo.pythonConnectorId = node.pythonConnectorId;
    if (node.widgetConfig) nodeInfo.widgetConfig = node.widgetConfig;

    if (nodeInfo.sqlQuery || nodeInfo.pythonCode || nodeInfo.question || nodeInfo.decision) {
        results.push(nodeInfo);
    }

    if (node.options) {
        for (const [, child] of Object.entries(node.options)) {
            if (Array.isArray(child)) {
                for (const c of child) collectNodes(c, treeName, treeId, results);
            } else {
                collectNodes(child, treeName, treeId, results);
            }
        }
    }

    return results;
}

export async function syncKnowledgeBaseFromTreesAction(
    executeQueries?: boolean
): Promise<{ success: boolean; created: number; updated: number; errors: string[]; error?: string }> {
    const user = await getAuthenticatedUser();
    if (!user?.companyId) return { success: false, created: 0, updated: 0, errors: [], error: 'Non autorizzato' };

    const companyId = user.companyId;
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    try {
        // Fetch all trees for the company
        const trees = await db.tree.findMany({
            where: { companyId },
            select: { id: true, name: true, description: true, type: true, jsonDecisionTree: true },
        });

        if (trees.length === 0) {
            return { success: true, created: 0, updated: 0, errors: ['Nessun albero trovato.'] };
        }

        // Load existing auto-synced entries to detect duplicates via context field
        const existingEntries = await db.knowledgeBaseEntry.findMany({
            where: { companyId, context: { not: null } },
            select: { id: true, context: true },
        });
        const existingContextMap = new Map<string, string>();
        for (const e of existingEntries) {
            if (e.context) {
                try {
                    const ctx = JSON.parse(e.context);
                    if (ctx.syncKey) existingContextMap.set(ctx.syncKey, e.id);
                } catch { /* not a sync entry */ }
            }
        }

        for (const tree of trees) {
            let treeData: any;
            try {
                treeData = JSON.parse(tree.jsonDecisionTree);
            } catch {
                errors.push(`Albero "${tree.name}": JSON non valido`);
                continue;
            }

            const nodes = collectNodes(treeData, tree.name, tree.id);

            // 1. Create KB entry for the tree itself (metadata)
            const treeSyncKey = `tree:${tree.id}`;
            const sqlNodes = nodes.filter(n => n.sqlQuery);
            const pythonNodes = nodes.filter(n => n.pythonCode);
            const decisionNodes = nodes.filter(n => n.question || n.decision);

            const treeAnswer = [
                `Albero: ${tree.name}`,
                tree.description ? `Descrizione: ${tree.description}` : null,
                `Tipo: ${tree.type || 'RULE'}`,
                `Nodi totali: ${nodes.length}`,
                `Query SQL: ${sqlNodes.length}`,
                `Script Python: ${pythonNodes.length}`,
                `Decisioni: ${decisionNodes.length}`,
                '',
                sqlNodes.length > 0 ? `Query SQL disponibili:\n${sqlNodes.map(n => `- ${n.sqlResultName || n.nodeId}: ${(n.sqlQuery || '').substring(0, 120)}...`).join('\n')}` : null,
                pythonNodes.length > 0 ? `Script Python disponibili:\n${pythonNodes.map(n => `- ${n.pythonResultName || n.nodeId}: ${(n.pythonCode || '').substring(0, 80)}...`).join('\n')}` : null,
            ].filter(Boolean).join('\n');

            const treeContext = JSON.stringify({ syncKey: treeSyncKey, treeId: tree.id, type: 'tree-metadata' });
            const treeTags = ['albero', 'struttura', tree.name.toLowerCase(), (tree.type || 'rule').toLowerCase()].filter(Boolean);

            if (existingContextMap.has(treeSyncKey)) {
                await db.knowledgeBaseEntry.update({
                    where: { id: existingContextMap.get(treeSyncKey)! },
                    data: { question: `Albero: ${tree.name} - Struttura`, answer: treeAnswer, tags: treeTags, category: 'Struttura', context: treeContext },
                });
                updated++;
            } else {
                await db.knowledgeBaseEntry.create({
                    data: { question: `Albero: ${tree.name} - Struttura`, answer: treeAnswer, tags: treeTags, category: 'Struttura', context: treeContext, companyId },
                });
                created++;
            }

            // 2. Create KB entries for each SQL node
            for (const node of sqlNodes) {
                const syncKey = `sql:${tree.id}:${node.nodeId}`;
                const resultName = node.sqlResultName || node.nodeId || 'query';

                let answer = `Query SQL dall'albero "${tree.name}":\n\n\`\`\`sql\n${node.sqlQuery}\n\`\`\`\n\nNome risultato: ${resultName}`;
                if (node.sqlConnectorId) answer += `\nConnettore: ${node.sqlConnectorId}`;

                // Optionally execute query to capture sample results
                if (executeQueries && node.sqlConnectorId) {
                    try {
                        const result = await executeSqlPreviewAction(node.sqlQuery, node.sqlConnectorId, [], true);
                        if (result.data && result.data.length > 0) {
                            const columns = Object.keys(result.data[0]);
                            const sampleRows = result.data.slice(0, 5);
                            answer += `\n\nColonne: ${columns.join(', ')}`;
                            answer += `\nRighe totali: ${result.data.length}`;
                            answer += `\nCampione dati:\n${JSON.stringify(sampleRows, null, 2)}`;
                        } else if (result.error) {
                            answer += `\n\n(Errore esecuzione: ${result.error})`;
                        }
                    } catch (e: any) {
                        errors.push(`SQL "${resultName}": ${e.message}`);
                    }
                }

                const context = JSON.stringify({ syncKey, treeId: tree.id, nodeId: node.nodeId, connectorId: node.sqlConnectorId, type: 'sql' });
                const tags = ['sql', tree.name.toLowerCase(), resultName.toLowerCase()].filter(Boolean);

                if (existingContextMap.has(syncKey)) {
                    await db.knowledgeBaseEntry.update({
                        where: { id: existingContextMap.get(syncKey)! },
                        data: { question: `Albero: ${tree.name} - Query: ${resultName}`, answer, tags, category: 'SQL', context },
                    });
                    updated++;
                } else {
                    await db.knowledgeBaseEntry.create({
                        data: { question: `Albero: ${tree.name} - Query: ${resultName}`, answer, tags, category: 'SQL', context, companyId },
                    });
                    created++;
                }
            }

            // 3. Create KB entries for each Python node
            for (const node of pythonNodes) {
                const syncKey = `python:${tree.id}:${node.nodeId}`;
                const resultName = node.pythonResultName || node.nodeId || 'script';

                let answer = `Script Python dall'albero "${tree.name}":\n\n\`\`\`python\n${node.pythonCode}\n\`\`\`\n\nNome risultato: ${resultName}`;
                if (node.pythonOutputType) answer += `\nTipo output: ${node.pythonOutputType}`;
                if (node.pythonConnectorId) answer += `\nConnettore: ${node.pythonConnectorId}`;

                const context = JSON.stringify({ syncKey, treeId: tree.id, nodeId: node.nodeId, outputType: node.pythonOutputType, type: 'python' });
                const tags = ['python', tree.name.toLowerCase(), resultName.toLowerCase(), node.pythonOutputType || ''].filter(Boolean);

                if (existingContextMap.has(syncKey)) {
                    await db.knowledgeBaseEntry.update({
                        where: { id: existingContextMap.get(syncKey)! },
                        data: { question: `Albero: ${tree.name} - Script: ${resultName}`, answer, tags, category: 'Python', context },
                    });
                    updated++;
                } else {
                    await db.knowledgeBaseEntry.create({
                        data: { question: `Albero: ${tree.name} - Script: ${resultName}`, answer, tags, category: 'Python', context, companyId },
                    });
                    created++;
                }
            }

            // 4. Create KB entries for decision/question nodes
            for (const node of decisionNodes) {
                if (!node.question && !node.decision) continue;
                const syncKey = `decision:${tree.id}:${node.nodeId}`;
                const label = node.question || node.decision || '';

                let answer = `Nodo decisionale dell'albero "${tree.name}":\n\n`;
                if (node.question) answer += `Domanda: ${node.question}\n`;
                if (node.decision) answer += `Decisione: ${node.decision}\n`;

                const context = JSON.stringify({ syncKey, treeId: tree.id, nodeId: node.nodeId, type: 'decision' });
                const tags = ['decisione', 'logica', tree.name.toLowerCase()];

                if (existingContextMap.has(syncKey)) {
                    await db.knowledgeBaseEntry.update({
                        where: { id: existingContextMap.get(syncKey)! },
                        data: { question: `Albero: ${tree.name} - ${node.question ? 'Domanda' : 'Decisione'}: ${label.substring(0, 100)}`, answer, tags, category: 'Logica Decisionale', context },
                    });
                    updated++;
                } else {
                    await db.knowledgeBaseEntry.create({
                        data: { question: `Albero: ${tree.name} - ${node.question ? 'Domanda' : 'Decisione'}: ${label.substring(0, 100)}`, answer, tags, category: 'Logica Decisionale', context, companyId },
                    });
                    created++;
                }
            }
        }

        return { success: true, created, updated, errors };
    } catch (e: any) {
        return { success: false, created, updated, errors, error: e.message };
    }
}
