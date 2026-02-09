'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { db } from '@/lib/db';
import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';

// Helper: recursively collect all nodes from a tree
function collectNodes(node: any, treeName: string, treeId: string, results: any[] = []): any[] {
    if (!node || typeof node === 'string') return results;
    if (node.ref || node.subTreeRef) return results;

    const nodeInfo: any = {
        treeId,
        treeName,
        nodeId: node.id || null,
    };

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
    if (node.sqlSelectedPipelines) nodeInfo.sqlSelectedPipelines = node.sqlSelectedPipelines;
    if (node.pythonSelectedPipelines) nodeInfo.pythonSelectedPipelines = node.pythonSelectedPipelines;

    if (nodeInfo.sqlQuery || nodeInfo.pythonCode || nodeInfo.question || nodeInfo.decision) {
        results.push(nodeInfo);
    }

    if (node.options) {
        for (const [_optionName, child] of Object.entries(node.options)) {
            if (Array.isArray(child)) {
                for (const c of child) {
                    collectNodes(c, treeName, treeId, results);
                }
            } else {
                collectNodes(child, treeName, treeId, results);
            }
        }
    }

    return results;
}

// Helper: fetch all trees for a company directly from DB (no auth needed)
async function fetchTreesForCompany(companyId: string, type?: string) {
    const where: any = { companyId };
    if (type) where.type = type;

    return db.tree.findMany({
        where,
        select: {
            id: true,
            name: true,
            description: true,
            type: true,
            jsonDecisionTree: true,
        },
    });
}

// Helper: fetch a single tree directly from DB
async function fetchTreeById(treeId: string) {
    return db.tree.findUnique({
        where: { id: treeId },
        select: {
            id: true,
            name: true,
            description: true,
            type: true,
            jsonDecisionTree: true,
        },
    });
}

// Tool 1: List all trees and pipelines
const listTreesAndPipelines = ai.defineTool(
    {
        name: 'listTreesAndPipelines',
        description: 'Elenca tutti gli alberi decisionali e le pipeline disponibili nella company. Usa questo tool per scoprire quali dati e query sono disponibili.',
        inputSchema: z.object({
            companyId: z.string().describe("L'ID della company. Lo trovi nel system prompt."),
            type: z.string().optional().describe('Filtra per tipo: "RULE" o "PIPELINE". Ometti per vedere tutti.'),
        }),
        outputSchema: z.string().describe('Lista JSON degli alberi/pipeline disponibili con id, nome, descrizione e tipo.'),
    },
    async (input) => {
        try {
            const trees = await fetchTreesForCompany(input.companyId, input.type);
            if (trees.length === 0) return JSON.stringify({ error: 'Nessun albero trovato' });

            const summary = trees.map(t => {
                let nodeCount = 0;
                let nodesWithSQL = 0;
                let nodesWithPython = 0;
                try {
                    const tree = JSON.parse(t.jsonDecisionTree);
                    const nodes = collectNodes(tree, t.name, t.id);
                    nodeCount = nodes.length;
                    nodesWithSQL = nodes.filter(n => n.sqlQuery).length;
                    nodesWithPython = nodes.filter(n => n.pythonCode).length;
                } catch { /* ignore */ }

                return {
                    id: t.id,
                    name: t.name,
                    description: t.description,
                    type: t.type || 'RULE',
                    nodeCount,
                    nodesWithSQL,
                    nodesWithPython,
                };
            });

            return JSON.stringify(summary, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: `Errore: ${e.message}` });
        }
    }
);

// Tool 2: Get all nodes with their content from a tree
const getTreeContent = ai.defineTool(
    {
        name: 'getTreeContent',
        description: "Legge TUTTI i nodi di un albero con le loro query SQL, codice Python, widget e dipendenze. Usa questo per esplorare il contenuto completo di un albero.",
        inputSchema: z.object({
            treeId: z.string().describe("L'ID dell'albero da esplorare."),
        }),
        outputSchema: z.string().describe('Tutti i nodi con i dettagli in formato JSON.'),
    },
    async (input) => {
        try {
            const tree = await fetchTreeById(input.treeId);
            if (!tree) return JSON.stringify({ error: 'Albero non trovato' });

            const treeData = JSON.parse(tree.jsonDecisionTree);
            const nodes = collectNodes(treeData, tree.name, tree.id);

            return JSON.stringify({
                treeName: tree.name,
                treeDescription: tree.description,
                treeType: tree.type,
                totalNodes: nodes.length,
                nodes: nodes.slice(0, 50), // Limita per token
            }, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: `Errore: ${e.message}` });
        }
    }
);

// Tool 3: Search nodes across all trees
const searchNodesForQuery = ai.defineTool(
    {
        name: 'searchNodesForQuery',
        description: 'Cerca in TUTTI gli alberi della company i nodi che contengono una keyword specifica nelle query SQL, codice Python, nomi dei risultati, domande o decisioni.',
        inputSchema: z.object({
            companyId: z.string().describe("L'ID della company. Lo trovi nel system prompt."),
            searchTerm: z.string().describe('Il termine di ricerca (es. "fatturato", "vendite", "ordini", "capacita", "ore", "HR").'),
        }),
        outputSchema: z.string().describe('Lista dei nodi trovati con il contesto rilevante.'),
    },
    async (input) => {
        try {
            const trees = await fetchTreesForCompany(input.companyId);
            if (trees.length === 0) return JSON.stringify({ results: [], message: 'Nessun albero trovato' });

            const term = input.searchTerm.toLowerCase();
            const matches: any[] = [];

            for (const tree of trees) {
                try {
                    const treeData = JSON.parse(tree.jsonDecisionTree);
                    const nodes = collectNodes(treeData, tree.name, tree.id);

                    for (const node of nodes) {
                        const searchableText = [
                            node.sqlQuery,
                            node.pythonCode,
                            node.sqlResultName,
                            node.pythonResultName,
                            node.question,
                            node.decision,
                        ].filter(Boolean).join(' ').toLowerCase();

                        if (searchableText.includes(term)) {
                            matches.push(node);
                        }
                    }
                } catch { /* ignore malformed trees */ }
            }

            if (matches.length === 0) {
                return JSON.stringify({ results: [], message: `Nessun nodo trovato per "${input.searchTerm}". Prova con termini diversi o usa listTreesAndPipelines per vedere tutti gli alberi disponibili.` });
            }

            return JSON.stringify({ resultCount: matches.length, results: matches.slice(0, 20) }, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: `Errore: ${e.message}` });
        }
    }
);

// Tool 4: Execute SQL query (uses _bypassAuth)
const executeSqlQuery = ai.defineTool(
    {
        name: 'executeSqlQuery',
        description: 'Esegue una query SQL su un connettore database. Puoi eseguire sia query esistenti trovate nei nodi, sia query nuove scritte da te.',
        inputSchema: z.object({
            query: z.string().describe('La query SQL da eseguire.'),
            connectorId: z.string().describe("L'ID del connettore database da usare. Trovalo nei dettagli dei nodi (sqlConnectorId)."),
        }),
        outputSchema: z.string().describe('Risultati della query in formato JSON. Massimo 100 righe.'),
    },
    async (input) => {
        try {
            // Use _bypassAuth=true since we're calling from within Genkit (no HTTP session)
            const result = await executeSqlPreviewAction(input.query, input.connectorId, [], true);
            if (result.error) return JSON.stringify({ error: result.error });
            const data = result.data || [];
            const truncated = data.length > 100;
            return JSON.stringify({
                rowCount: data.length,
                data: data.slice(0, 100),
                truncated,
                columns: data.length > 0 ? Object.keys(data[0]) : [],
            }, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: `Errore esecuzione SQL: ${e.message}` });
        }
    }
);

// Tool 5: Execute Python code (uses _bypassAuth)
const executePythonCode = ai.defineTool(
    {
        name: 'executePythonCode',
        description: "Esegue codice Python. Puoi usarlo per analisi dati, calcoli o generazione di variabili.",
        inputSchema: z.object({
            code: z.string().describe('Il codice Python da eseguire.'),
            outputType: z.enum(['table', 'variable', 'chart']).describe("Tipo di output: 'table' per dati tabellari, 'variable' per valori singoli, 'chart' per grafici."),
            connectorId: z.string().optional().describe('ID del connettore (opzionale).'),
        }),
        outputSchema: z.string().describe('Risultati Python in formato JSON.'),
    },
    async (input) => {
        try {
            // Use _bypassAuth=true
            const result = await executePythonPreviewAction(
                input.code,
                input.outputType,
                {},
                [],
                input.connectorId,
                true
            );
            if (!result.success) return JSON.stringify({ error: result.error || 'Errore esecuzione Python' });

            return JSON.stringify({
                data: result.data?.slice(0, 100),
                variables: result.variables,
                columns: result.columns,
                rowCount: result.rowCount,
                stdout: result.stdout,
            }, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: `Errore esecuzione Python: ${e.message}` });
        }
    }
);

// Tool 6: Search Knowledge Base
const searchKnowledgeBase = ai.defineTool(
    {
        name: 'searchKnowledgeBase',
        description: 'Cerca nella Knowledge Base aziendale. Contiene correzioni e risposte validate dagli utenti.',
        inputSchema: z.object({
            query: z.string().describe('Termine di ricerca per trovare entry nella KB.'),
            companyId: z.string().describe("L'ID della company. Lo trovi nel system prompt."),
        }),
        outputSchema: z.string().describe('Entry della Knowledge Base trovate.'),
    },
    async (input) => {
        try {
            const term = input.query.toLowerCase();
            const entries = await db.knowledgeBaseEntry.findMany({
                where: {
                    companyId: input.companyId,
                    OR: [
                        { question: { contains: term, mode: 'insensitive' } },
                        { answer: { contains: term, mode: 'insensitive' } },
                        { tags: { hasSome: [term] } },
                        { category: { contains: term, mode: 'insensitive' } },
                    ],
                },
                take: 10,
                orderBy: { updatedAt: 'desc' },
            });

            if (entries.length === 0) {
                return JSON.stringify({ results: [], message: 'Nessuna entry trovata nella Knowledge Base.' });
            }

            return JSON.stringify({
                results: entries.map(e => ({
                    id: e.id,
                    question: e.question,
                    answer: e.answer,
                    tags: e.tags,
                    category: e.category,
                })),
            }, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: `Errore ricerca KB: ${e.message}` });
        }
    }
);

// Tool 7: Save to Knowledge Base
const saveToKnowledgeBase = ai.defineTool(
    {
        name: 'saveToKnowledgeBase',
        description: "Salva una nuova entry nella Knowledge Base. Usa quando l'utente ti corregge o per memorizzare risposte importanti.",
        inputSchema: z.object({
            question: z.string().describe('La domanda o il contesto originale.'),
            answer: z.string().describe('La risposta corretta o la correzione.'),
            tags: z.array(z.string()).describe('Tag per categorizzare (es. ["vendite", "fatturato", "SQL"]).'),
            category: z.string().optional().describe('Categoria (es. "SQL", "Python", "Procedure", "Dati").'),
            companyId: z.string().describe("L'ID della company. Lo trovi nel system prompt."),
        }),
        outputSchema: z.string().describe('Conferma del salvataggio.'),
    },
    async (input) => {
        try {
            const entry = await db.knowledgeBaseEntry.create({
                data: {
                    question: input.question,
                    answer: input.answer,
                    tags: input.tags,
                    category: input.category || 'Generale',
                    companyId: input.companyId,
                },
            });
            return JSON.stringify({ success: true, id: entry.id, message: 'Entry salvata nella Knowledge Base.' });
        } catch (e: any) {
            return JSON.stringify({ error: `Errore salvataggio KB: ${e.message}` });
        }
    }
);

// Input/Output schemas
const SuperAgentInputSchema = z.object({
    messages: z.array(z.object({
        role: z.enum(['user', 'model', 'tool', 'system']),
        content: z.array(z.object({
            text: z.string().optional(),
            media: z.any().optional(),
            toolRequest: z.any().optional(),
            toolResponse: z.any().optional(),
        })),
    })).describe('La cronologia della conversazione.'),
    companyId: z.string().describe("L'ID della company dell'utente."),
});
export type SuperAgentInput = z.infer<typeof SuperAgentInputSchema>;

const SuperAgentOutputSchema = z.string().describe("La risposta dell'agente.");
export type SuperAgentOutput = z.infer<typeof SuperAgentOutputSchema>;

export async function superAgentFlow(input: SuperAgentInput): Promise<SuperAgentOutput> {
    // Pre-load tree summary to include in system prompt for better context
    let treeSummary = '';
    try {
        const trees = await fetchTreesForCompany(input.companyId);
        if (trees.length > 0) {
            const summaries = trees.map(t => {
                let nodeDetails = '';
                try {
                    const treeData = JSON.parse(t.jsonDecisionTree);
                    const nodes = collectNodes(treeData, t.name, t.id);
                    const sqlNodes = nodes.filter(n => n.sqlQuery).map(n => `  - ${n.sqlResultName || n.nodeId}: ${n.sqlQuery?.substring(0, 100)}...`);
                    const pythonNodes = nodes.filter(n => n.pythonCode).map(n => `  - ${n.pythonResultName || n.nodeId}: ${n.pythonCode?.substring(0, 80)}...`);
                    if (sqlNodes.length > 0) nodeDetails += `\n  Query SQL:\n${sqlNodes.join('\n')}`;
                    if (pythonNodes.length > 0) nodeDetails += `\n  Codice Python:\n${pythonNodes.join('\n')}`;
                } catch { /* ignore */ }
                return `- **${t.name}** (ID: ${t.id}, tipo: ${t.type}): ${t.description}${nodeDetails}`;
            });
            treeSummary = `\n\nALBERI DISPONIBILI NELLA COMPANY:\n${summaries.join('\n\n')}`;
        }
    } catch { /* ignore */ }

    const systemMessage = {
        role: 'system' as const,
        content: [{
            text: `Sei FridAI, un super agente IA esperto nell'analisi dati e nella gestione di pipeline e alberi decisionali.
Hai accesso a tutti gli alberi decisionali, query SQL, codice Python e widget della company dell'utente.

REGOLE FONDAMENTALI:

1. **ESPLORA SEMPRE GLI ALBERI**: Ad ogni domanda sui dati, USA i tool per esplorare gli alberi. Hai gia' un riepilogo qui sotto, ma usa getTreeContent per i dettagli completi e searchNodesForQuery per cercare keyword specifiche.

2. **ESEGUI LE QUERY**: Se trovi una query SQL esistente in un nodo, ESEGUILA con executeSqlQuery usando il connectorId del nodo. Se serve una query nuova, scrivila ed eseguila.

3. **GRAFICI CON RECHARTS**: Per i grafici, restituisci i dati in questo formato ESATTO:

\`\`\`recharts
{
  "type": "bar-chart",
  "data": [{"month": "Gen", "valore": 100}],
  "xAxisKey": "month",
  "dataKeys": ["valore"],
  "colors": ["#8884d8"],
  "title": "Titolo"
}
\`\`\`

Tipi: bar-chart, line-chart, pie-chart, area-chart.

4. **FAI DOMANDE**: Se non trovi dati sufficienti, chiedi all'utente.

5. **KNOWLEDGE BASE**: Consulta la KB per correzioni precedenti. Quando l'utente ti corregge, salva nella KB.

6. **TABELLE MARKDOWN**: Per dati tabellari usa il formato markdown con | ... |

7. **CODICE**: Mostra SQL in \`\`\`sql e Python in \`\`\`python.

8. **ITALIANO**: Rispondi sempre in italiano.

9. **FONTI**: Cita il nome dell'albero come fonte.

Company ID: ${input.companyId}${treeSummary}`
        }],
    };

    // Sanitize message history
    const cleanHistory = input.messages.map(m => {
        const cleanContent = m.content.map(c => {
            const part: any = {};
            if (c.text !== undefined && c.text !== null) part.text = c.text;
            if (c.media) part.media = c.media;

            if (c.toolRequest) {
                if (c.toolRequest.function && c.toolRequest.function.name) {
                    let args = {};
                    try {
                        args = typeof c.toolRequest.function.arguments === 'string'
                            ? JSON.parse(c.toolRequest.function.arguments)
                            : c.toolRequest.function.arguments;
                    } catch { /* ignore */ }

                    part.toolRequest = {
                        name: c.toolRequest.function.name,
                        input: args,
                        ref: c.toolRequest.id,
                    };
                } else {
                    part.toolRequest = c.toolRequest;
                }
            }

            if (c.toolResponse) {
                if (c.toolResponse.id && c.toolResponse.result) {
                    part.toolResponse = {
                        name: c.toolResponse.name || 'unknown',
                        output: c.toolResponse.result,
                        ref: c.toolResponse.id,
                    };
                } else {
                    part.toolResponse = c.toolResponse;
                }
            }

            if (Object.keys(part).length === 0) {
                return { text: '' };
            }
            return part;
        });
        return { role: m.role, content: cleanContent };
    });

    const fullHistory = [systemMessage, ...cleanHistory];

    const { text } = await ai.generate({
        model: 'googleai/gemini-2.5-flash',
        messages: fullHistory,
        tools: [
            listTreesAndPipelines,
            getTreeContent,
            searchNodesForQuery,
            executeSqlQuery,
            executePythonCode,
            searchKnowledgeBase,
            saveToKnowledgeBase,
        ],
    });

    return text;
}
