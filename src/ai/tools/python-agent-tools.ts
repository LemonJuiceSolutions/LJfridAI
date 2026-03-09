/**
 * @fileOverview Python Agent tools for Vercel AI SDK.
 * Mirrors sql-agent-tools.ts but for the Python agent.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { db } from '@/lib/db';
import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';
import { getCachedParsedMap } from '@/lib/database-map-cache';

// ─── Tool Implementation Functions ───────────────────────────────────────────

async function doPyExploreDbSchema(input: { connectorId: string }) {
    try {
        // Python agent uses simpler schema exploration (no cached databaseMap)
        const connector = await db.connector.findUnique({
            where: { id: input.connectorId },
            select: { databaseMap: true },
        });
        if (connector?.databaseMap) {
            try {
                const map = getCachedParsedMap(input.connectorId, connector.databaseMap);
                const tables = (map.tables || []).map((t: any) => ({
                    table_name: t.fullName,
                    row_count: t.rowCount,
                    description: t.userDescription || t.description || null,
                    columns_count: t.columns?.length || 0,
                }));
                return JSON.stringify({ tables, source: 'cached_map' }, null, 2);
            } catch { /* fall through */ }
        }
        const result = await executeSqlPreviewAction(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
            input.connectorId, [], true
        );
        if (result.error) return JSON.stringify({ error: result.error });
        return JSON.stringify({ tables: result.data || [] }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

async function doPyExploreTableColumns(input: { connectorId: string; tableName: string }) {
    try {
        const result = await executeSqlPreviewAction(
            `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${input.tableName.replace(/'/g, "''")}' ORDER BY ordinal_position`,
            input.connectorId, [], true
        );
        if (result.error) return JSON.stringify({ error: result.error });
        return JSON.stringify({ table: input.tableName, columns: result.data || [] }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

async function doPyTestSqlQuery(input: { query: string; connectorId: string }) {
    try {
        const result = await executeSqlPreviewAction(input.query, input.connectorId, [], true);
        if (result.error) return JSON.stringify({ error: result.error, suggestion: 'Controlla nomi tabella e colonne.' });
        const data = result.data || [];
        return JSON.stringify({
            success: true,
            rowCount: data.length,
            columns: data.length > 0 ? Object.keys(data[0]) : [],
            sampleData: data.slice(0, 5),
        }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

async function doPyTestCode(input: { code: string; outputType: string; connectorId?: string; sqlQuery?: string }) {
    try {
        let inputData: Record<string, any[]> = {};

        // If sqlQuery is provided, pre-fetch data from the database so that `df` is populated
        if (input.sqlQuery && input.connectorId) {
            try {
                const sqlResult = await executeSqlPreviewAction(input.sqlQuery, input.connectorId, [], true);
                if (sqlResult.data && sqlResult.data.length > 0) {
                    // Use 'df' as key so it maps directly to the df variable in Python
                    inputData['df'] = sqlResult.data;
                }
            } catch (sqlErr: any) {
                console.warn('[pyTestCode] SQL pre-fetch failed:', sqlErr.message);
                // Continue without data - the Python code will get an empty df
            }
        }

        const result = await executePythonPreviewAction(input.code, input.outputType as any, inputData, [], input.connectorId, true);
        if (!result.success) return JSON.stringify({ error: result.error || 'Errore esecuzione' });
        return JSON.stringify({
            success: true,
            data: result.data?.slice(0, 5),
            variables: result.variables,
            columns: result.columns,
            rowCount: result.rowCount,
            stdout: result.stdout,
        }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

async function doPySearchKB(input: { query: string; companyId: string }) {
    try {
        const term = input.query.toLowerCase();
        const entries = await db.knowledgeBaseEntry.findMany({
            where: {
                companyId: input.companyId,
                OR: [
                    { question: { contains: term, mode: 'insensitive' } },
                    { answer: { contains: term, mode: 'insensitive' } },
                    { tags: { hasSome: [term] } },
                ],
            },
            take: 5,
            orderBy: { updatedAt: 'desc' },
        });
        if (entries.length === 0) return JSON.stringify({ results: [], message: 'Nessuna entry trovata.' });
        return JSON.stringify({ results: entries.map(e => ({ question: e.question, answer: e.answer, category: e.category })) }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

async function doPyListConnectors(input: { companyId: string }) {
    try {
        const connectors = await db.connector.findMany({
            where: { companyId: input.companyId, type: 'SQL' },
            select: { id: true, name: true },
        });
        return JSON.stringify({ connectors }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

async function doPySaveToKB(input: { question: string; answer: string; tags: string[]; category: string; companyId: string }) {
    try {
        await db.knowledgeBaseEntry.create({
            data: {
                question: input.question,
                answer: input.answer,
                tags: input.tags,
                category: input.category,
                companyId: input.companyId,
            },
        });
        return JSON.stringify({ success: true, message: 'Salvato nella Knowledge Base!' });
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

// ─── Browse Other Scripts (cross-tree/pipeline) ─────────────────────────────

function collectScriptNodes(node: any, results: { nodeId: string; sqlQuery?: string; pythonCode?: string; resultName?: string; connectorId?: string; type: string }[] = []): typeof results {
    if (!node || typeof node === 'string') return results;
    if (node.ref || node.subTreeRef) return results;

    if (node.sqlQuery) {
        results.push({
            nodeId: node.id || null,
            sqlQuery: node.sqlQuery,
            resultName: node.sqlResultName,
            connectorId: node.sqlConnectorId,
            type: 'sql',
        });
    }
    if (node.pythonCode) {
        results.push({
            nodeId: node.id || null,
            pythonCode: node.pythonCode,
            resultName: node.pythonResultName,
            connectorId: node.pythonConnectorId,
            type: 'python',
        });
    }

    if (node.options) {
        for (const [, child] of Object.entries(node.options)) {
            if (Array.isArray(child)) {
                for (const c of child) collectScriptNodes(c, results);
            } else {
                collectScriptNodes(child as any, results);
            }
        }
    }
    return results;
}

async function doPyBrowseOtherScripts(input: { companyId: string; connectorId?: string }) {
    try {
        const scripts: { source: string; name: string; code: string; type: string; connectorId?: string; sameConnector: boolean }[] = [];

        const trees = await db.tree.findMany({
            where: { companyId: input.companyId },
            select: { id: true, name: true, jsonDecisionTree: true },
        });

        for (const tree of trees) {
            let treeData: any;
            try { treeData = JSON.parse(tree.jsonDecisionTree); } catch { continue; }
            const nodes = collectScriptNodes(treeData);
            for (const node of nodes) {
                scripts.push({
                    source: `Albero: ${tree.name}`,
                    name: node.resultName || node.nodeId || 'script',
                    code: ((node.sqlQuery || node.pythonCode) || '').substring(0, 1500),
                    type: node.type,
                    connectorId: node.connectorId,
                    sameConnector: !!(input.connectorId && node.connectorId === input.connectorId),
                });
            }
        }

        const pipelines = await db.pipeline.findMany({
            where: { companyId: input.companyId },
            select: { id: true, name: true, nodes: true },
        });

        for (const pipeline of pipelines) {
            const pNodes = pipeline.nodes as any;
            if (!pNodes || typeof pNodes !== 'object') continue;
            const nodeEntries = Array.isArray(pNodes) ? pNodes : Object.values(pNodes);
            for (const node of nodeEntries as any[]) {
                const script = node.script || node.sqlQuery || node.pythonCode || '';
                if (!script) continue;
                if (node.type === 'start' || node.type === 'end') continue;
                const isPython = node.isPython === true || node.type === 'python';
                const nodeConnId = node.sqlConnectorId || node.pythonConnectorId || node.connectorId;
                scripts.push({
                    source: `Pipeline: ${pipeline.name}`,
                    name: node.sqlResultName || node.pythonResultName || node.name || node.id || 'script',
                    code: script.substring(0, 1500),
                    type: isPython ? 'python' : 'sql',
                    connectorId: nodeConnId,
                    sameConnector: !!(input.connectorId && nodeConnId === input.connectorId),
                });
            }
        }

        scripts.sort((a, b) => (b.sameConnector ? 1 : 0) - (a.sameConnector ? 1 : 0));

        const limited = scripts.slice(0, 50);
        if (limited.length === 0) {
            return JSON.stringify({ results: [], message: 'Nessuno script trovato in altri alberi o pipeline.' });
        }
        const sameCount = limited.filter(s => s.sameConnector).length;
        return JSON.stringify({ totalFound: scripts.length, showing: limited.length, sameConnectorCount: sameCount, scripts: limited }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

// ─── Vercel AI SDK Tool Definitions ──────────────────────────────────────────

/**
 * Creates the Python agent tools for Vercel AI SDK.
 * Closures capture connectorId and companyId so tools auto-inject them.
 */
export function createPythonAgentTools(opts: {
    connectorId?: string;
    companyId?: string;
}) {
    const cid = opts.connectorId || '';
    const cpid = opts.companyId || '';

    const tools: Record<string, any> = {};

    // pyTestCode is ALWAYS available — it's the core Python tool
    tools.pyTestCode = tool({
        description: "Esegue codice Python di test per verificare che funzioni. Restituisce dati, variabili, stdout. E' il tuo strumento PRINCIPALE per testare il codice! Se passi sqlQuery, i dati vengono pre-caricati dal database e iniettati come df nel codice Python.",
        inputSchema: z.object({
            code: z.string().describe('Il codice Python da eseguire.'),
            outputType: z.enum(['table', 'variable', 'chart', 'html']).describe("Tipo di output atteso: 'table' per DataFrame, 'chart' per grafici Plotly, 'variable' per dizionari, 'html' per HTML."),
            sqlQuery: z.string().optional().describe("Query SQL opzionale per pre-caricare i dati dal database. Se specificata, il risultato viene iniettato come df nel codice Python. Esempio: 'SELECT * FROM dbo.NomeTabella'. Usa SEMPRE questo parametro quando testi codice che lavora su una tabella del DB."),
        }),
        execute: async ({ code, outputType, sqlQuery }) => doPyTestCode({ code, outputType, connectorId: cid || undefined, sqlQuery }),
    });

    if (opts.connectorId) {
        tools.pyExploreDbSchema = tool({
            description: 'Esplora lo schema del database: elenca tutte le tabelle disponibili. Utile per capire i dati che arriveranno in input.',
            inputSchema: z.object({
                connectorId: z.string().describe("L'ID del connettore database."),
            }),
            execute: async ({ connectorId }) => doPyExploreDbSchema({ connectorId: connectorId || cid }),
        });

        tools.pyExploreTableColumns = tool({
            description: 'Esplora le colonne di una tabella specifica con tipo di dato.',
            inputSchema: z.object({
                connectorId: z.string().describe("L'ID del connettore database."),
                tableName: z.string().describe('Il nome della tabella da esplorare.'),
            }),
            execute: async ({ connectorId, tableName }) => doPyExploreTableColumns({ connectorId: connectorId || cid, tableName }),
        });

        tools.pyTestSqlQuery = tool({
            description: "Esegue una query SQL di test per capire la struttura dei dati che il codice Python ricevera' in input.",
            inputSchema: z.object({
                query: z.string().describe('La query SQL da testare.'),
                connectorId: z.string().describe("L'ID del connettore database."),
            }),
            execute: async ({ query, connectorId }) => doPyTestSqlQuery({ query, connectorId: connectorId || cid }),
        });
    }

    if (opts.companyId) {
        tools.pySearchKnowledgeBase = tool({
            description: 'Cerca nella Knowledge Base aziendale script Python simili e correzioni precedenti.',
            inputSchema: z.object({
                query: z.string().describe('Termine di ricerca.'),
                companyId: z.string().describe("L'ID della company."),
            }),
            execute: async ({ query, companyId }) => doPySearchKB({ query, companyId: companyId || cpid }),
        });

        tools.pyListSqlConnectors = tool({
            description: 'Elenca tutti i connettori SQL (database) disponibili.',
            inputSchema: z.object({
                companyId: z.string().describe("L'ID della company."),
            }),
            execute: async ({ companyId }) => doPyListConnectors({ companyId: companyId || cpid }),
        });

        tools.pySaveToKnowledgeBase = tool({
            description: "Salva una informazione nella Knowledge Base aziendale. Usa dopo aver trovato uno script corretto.",
            inputSchema: z.object({
                question: z.string().describe('La domanda o descrizione.'),
                answer: z.string().describe('La risposta o codice.'),
                tags: z.array(z.string()).describe('Tag per la ricerca.'),
                category: z.string().describe('Categoria.'),
            }),
            execute: async ({ question, answer, tags, category }) =>
                doPySaveToKB({ question, answer, tags, category, companyId: cpid }),
        });

        tools.pyBrowseOtherScripts = tool({
            description: 'Sfoglia le query SQL e gli script Python scritti in altri alberi e pipeline della company. Passa il connectorId per filtrare gli script dello stesso database.',
            inputSchema: z.object({
                companyId: z.string().describe("L'ID della company."),
                connectorId: z.string().optional().describe("L'ID del connettore attuale per prioritizzare script dello stesso DB."),
            }),
            execute: async ({ companyId, connectorId }) => doPyBrowseOtherScripts({ companyId: companyId || cpid, connectorId: connectorId || cid || undefined }),
        });
    }

    return tools;
}
