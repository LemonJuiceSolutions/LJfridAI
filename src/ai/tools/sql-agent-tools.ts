/**
 * @fileOverview SQL Agent tools for Vercel AI SDK.
 * Converts the existing Genkit tool definitions to the AI SDK `tool()` format.
 * Reuses the same implementation functions from sql-agent-flow.ts.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { db } from '@/lib/db';
import { executeSqlPreviewAction } from '@/app/actions';

// ─── Tool Implementation Functions ───────────────────────────────────────────
// These are extracted from sql-agent-flow.ts to be shared between both systems.

async function doExploreDbSchema(input: { connectorId: string }) {
    try {
        const connector = await db.connector.findUnique({
            where: { id: input.connectorId },
            select: { databaseMap: true },
        });
        if (connector?.databaseMap) {
            try {
                const map = JSON.parse(connector.databaseMap);
                const tables = (map.tables || []).map((t: any) => ({
                    table_name: t.fullName,
                    row_count: t.rowCount,
                    description: t.userDescription || t.description || null,
                    columns_count: t.columns?.length || 0,
                    primary_keys: t.primaryKeyColumns || [],
                    foreign_keys: (t.foreignKeysOut || []).map((fk: any) => `${fk.sourceColumn} → ${fk.targetTable}.${fk.targetColumn}`),
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

async function doExploreTableColumns(input: { connectorId: string; tableName: string }) {
    try {
        const connector = await db.connector.findUnique({
            where: { id: input.connectorId },
            select: { databaseMap: true },
        });
        if (connector?.databaseMap) {
            try {
                const map = JSON.parse(connector.databaseMap);
                const searchName = input.tableName.toLowerCase();
                const table = (map.tables || []).find((t: any) =>
                    t.name.toLowerCase() === searchName ||
                    t.fullName.toLowerCase() === searchName ||
                    t.fullName.toLowerCase().endsWith('.' + searchName)
                );
                if (table) {
                    const columns = (table.columns || []).map((c: any) => ({
                        column_name: c.name,
                        data_type: c.dataType + (c.maxLength && c.maxLength > 0 ? `(${c.maxLength})` : ''),
                        is_nullable: c.isNullable ? 'YES' : 'NO',
                        is_primary_key: c.isPrimaryKey,
                        is_foreign_key: c.isForeignKey,
                        fk_target: c.foreignKeyTarget ? `${c.foreignKeyTarget.table}.${c.foreignKeyTarget.column}` : null,
                        description: c.userDescription || c.description || null,
                    }));
                    return JSON.stringify({ table: table.fullName, columns, source: 'cached_map' }, null, 2);
                }
            } catch { /* fall through */ }
        }
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

async function doTestSqlQuery(input: { query: string; connectorId: string }) {
    try {
        const result = await executeSqlPreviewAction(input.query, input.connectorId, [], true);
        if (result.error) return JSON.stringify({ error: result.error, suggestion: 'Controlla nomi tabella e colonne. Usa exploreDbSchema e exploreTableColumns per verificare.' });
        const data = result.data || [];
        return JSON.stringify({
            success: true,
            rowCount: data.length,
            columns: data.length > 0 ? Object.keys(data[0]) : [],
            sampleData: data.slice(0, 5),
        }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message, suggestion: 'Verifica la sintassi SQL e i nomi delle tabelle/colonne.' });
    }
}

async function doSearchKB(input: { query: string; companyId: string }) {
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

async function doListConnectors(input: { companyId: string }) {
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

async function doSaveToKB(input: { question: string; answer: string; tags: string[]; category: string; companyId: string }) {
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

function collectSqlNodes(node: any, results: { nodeId: string; sqlQuery: string; sqlResultName?: string; sqlConnectorId?: string }[] = []): typeof results {
    if (!node || typeof node === 'string') return results;
    if (node.ref || node.subTreeRef) return results;
    if (node.sqlQuery) {
        results.push({
            nodeId: node.id || null,
            sqlQuery: node.sqlQuery,
            sqlResultName: node.sqlResultName,
            sqlConnectorId: node.sqlConnectorId,
        });
    }
    if (node.options) {
        for (const [, child] of Object.entries(node.options)) {
            if (Array.isArray(child)) {
                for (const c of child) collectSqlNodes(c, results);
            } else {
                collectSqlNodes(child as any, results);
            }
        }
    }
    return results;
}

async function doBrowseOtherQueries(input: { companyId: string; connectorId?: string }) {
    try {
        const queries: { source: string; name: string; query: string; connectorId?: string; sameConnector: boolean }[] = [];

        const trees = await db.tree.findMany({
            where: { companyId: input.companyId },
            select: { id: true, name: true, jsonDecisionTree: true },
        });

        for (const tree of trees) {
            let treeData: any;
            try { treeData = JSON.parse(tree.jsonDecisionTree); } catch { continue; }
            const nodes = collectSqlNodes(treeData);
            for (const node of nodes) {
                queries.push({
                    source: `Albero: ${tree.name}`,
                    name: node.sqlResultName || node.nodeId || 'query',
                    query: (node.sqlQuery || '').substring(0, 1500),
                    connectorId: node.sqlConnectorId,
                    sameConnector: !!(input.connectorId && node.sqlConnectorId === input.connectorId),
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
                const isPython = node.isPython === true || node.type === 'python';
                const script = node.script || node.sqlQuery || '';
                if (!script || isPython) continue;
                if (node.type === 'start' || node.type === 'end') continue;
                const nodeConnId = node.sqlConnectorId || node.connectorId;
                queries.push({
                    source: `Pipeline: ${pipeline.name}`,
                    name: node.sqlResultName || node.name || node.id || 'query',
                    query: script.substring(0, 1500),
                    connectorId: nodeConnId,
                    sameConnector: !!(input.connectorId && nodeConnId === input.connectorId),
                });
            }
        }

        queries.sort((a, b) => (b.sameConnector ? 1 : 0) - (a.sameConnector ? 1 : 0));

        const limited = queries.slice(0, 50);
        if (limited.length === 0) {
            return JSON.stringify({ results: [], message: 'Nessuna query SQL trovata in altri alberi o pipeline.' });
        }
        const sameCount = limited.filter(q => q.sameConnector).length;
        return JSON.stringify({ totalFound: queries.length, showing: limited.length, sameConnectorCount: sameCount, queries: limited }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

// ─── Vercel AI SDK Tool Definitions ──────────────────────────────────────────

/**
 * Creates the SQL agent tools for Vercel AI SDK.
 * Closures capture connectorId and companyId so tools auto-inject them.
 */
export function createSqlAgentTools(opts: {
    connectorId?: string;
    companyId?: string;
}) {
    // Capture in closures to auto-inject into tool calls
    const cid = opts.connectorId || '';
    const cpid = opts.companyId || '';

    const tools: Record<string, any> = {};

    if (opts.connectorId) {
        tools.exploreDbSchema = tool({
            description: 'Esplora lo schema del database: elenca tutte le tabelle disponibili.',
            inputSchema: z.object({
                connectorId: z.string().describe("L'ID del connettore database."),
            }),
            execute: async ({ connectorId }) => doExploreDbSchema({ connectorId: connectorId || cid }),
        });

        tools.exploreTableColumns = tool({
            description: 'Esplora le colonne di una tabella specifica con tipo di dato.',
            inputSchema: z.object({
                connectorId: z.string().describe("L'ID del connettore database."),
                tableName: z.string().describe('Il nome della tabella da esplorare.'),
            }),
            execute: async ({ connectorId, tableName }) => doExploreTableColumns({ connectorId: connectorId || cid, tableName }),
        });

        tools.testSqlQuery = tool({
            description: "Esegue QUALSIASI query SQL sul database e restituisce i risultati. Usalo per: (1) testare query, (2) CERCARE TABELLE con INFORMATION_SCHEMA.TABLES, (3) esplorare dati. E' il tuo strumento principale di esplorazione!",
            inputSchema: z.object({
                query: z.string().describe('La query SQL da eseguire (qualsiasi query valida, incluse INFORMATION_SCHEMA).'),
                connectorId: z.string().describe("L'ID del connettore database."),
            }),
            execute: async ({ query, connectorId }) => doTestSqlQuery({ query, connectorId: connectorId || cid }),
        });
    }

    if (opts.companyId) {
        tools.searchKnowledgeBase = tool({
            description: 'Cerca nella Knowledge Base aziendale query SQL simili, strutture di tabelle e correzioni precedenti.',
            inputSchema: z.object({
                query: z.string().describe('Termine di ricerca.'),
                companyId: z.string().describe("L'ID della company."),
            }),
            execute: async ({ query, companyId }) => doSearchKB({ query, companyId: companyId || cpid }),
        });

        tools.listSqlConnectors = tool({
            description: 'Elenca tutti i connettori SQL disponibili.',
            inputSchema: z.object({
                companyId: z.string().describe("L'ID della company."),
            }),
            execute: async ({ companyId }) => doListConnectors({ companyId: companyId || cpid }),
        });

        tools.sqlSaveToKnowledgeBase = tool({
            description: "Salva una informazione nella Knowledge Base aziendale. Usa dopo aver trovato una query corretta o quando l'utente conferma un risultato.",
            inputSchema: z.object({
                question: z.string().describe('La domanda o descrizione.'),
                answer: z.string().describe('La risposta o query.'),
                tags: z.array(z.string()).describe('Tag per la ricerca.'),
                category: z.string().describe('Categoria.'),
                companyId: z.string().describe("L'ID della company."),
            }),
            execute: async ({ question, answer, tags, category, companyId }) =>
                doSaveToKB({ question, answer, tags, category, companyId: companyId || cpid }),
        });

        tools.browseOtherQueries = tool({
            description: 'Sfoglia le query SQL scritte in altri alberi e pipeline della company. Passa il connectorId per filtrare le query dello stesso database.',
            inputSchema: z.object({
                companyId: z.string().describe("L'ID della company."),
                connectorId: z.string().optional().describe("L'ID del connettore attuale per prioritizzare query dello stesso DB."),
            }),
            execute: async ({ companyId, connectorId }) =>
                doBrowseOtherQueries({ companyId: companyId || cpid, connectorId }),
        });
    }

    return tools;
}

// Re-export doTestSqlQuery for use in pre-flight discovery
export { doTestSqlQuery };
