/**
 * @fileOverview SQL Agent tools for Vercel AI SDK.
 * Converts the existing Genkit tool definitions to the AI SDK `tool()` format.
 * Reuses the same implementation functions from sql-agent-flow.ts.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { db } from '@/lib/db';
import { executeSqlPreviewAction } from '@/app/actions';
import { getCachedParsedMap } from '@/lib/database-map-cache';

// ─── Tool Implementation Functions ───────────────────────────────────────────
// These are extracted from sql-agent-flow.ts to be shared between both systems.

export async function doExploreDbSchema(input: { connectorId: string }) {
    try {
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

export async function doExploreTableColumns(input: { connectorId: string; tableName: string }) {
    try {
        const connector = await db.connector.findUnique({
            where: { id: input.connectorId },
            select: { databaseMap: true },
        });
        if (connector?.databaseMap) {
            try {
                const map = getCachedParsedMap(input.connectorId, connector.databaseMap);
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

export async function doTestSqlQuery(input: { query: string; connectorId: string }) {
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

export async function doSearchKB(input: { query: string; companyId: string }) {
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

export async function doListConnectors(input: { companyId: string }) {
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

export async function doSaveToKB(input: { question: string; answer: string; tags: string[]; category: string; companyId: string }) {
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

export async function doBrowseOtherQueries(input: { companyId: string; connectorId?: string }) {
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

// ─── Edit Script (find-and-replace) — shared with Python agent ──────────────

export async function doEditScript(input: { oldString: string; newString: string; currentScript: string; replaceAll?: boolean }) {
    try {
        const { oldString, newString, currentScript, replaceAll } = input;

        if (!currentScript) {
            return JSON.stringify({ error: 'Nessuno script/query corrente da modificare.' });
        }

        if (!currentScript.includes(oldString)) {
            const lines = oldString.split('\n');
            const firstLine = lines[0].trim();
            const matchingLines = currentScript.split('\n')
                .map((l, i) => ({ line: l, num: i + 1 }))
                .filter(({ line }) => line.includes(firstLine));

            let hint = '';
            if (matchingLines.length > 0) {
                hint = ` Trovate righe simili a: ${matchingLines.slice(0, 3).map(m => `riga ${m.num}`).join(', ')}. Usa readScriptLines per vedere il contesto esatto.`;
            }
            return JSON.stringify({ error: `Stringa da sostituire non trovata nello script corrente.${hint}` });
        }

        const occurrences = currentScript.split(oldString).length - 1;
        if (occurrences > 1 && !replaceAll) {
            return JSON.stringify({
                error: `Trovate ${occurrences} occorrenze di oldString. Usa replaceAll=true per sostituirle tutte, oppure fornisci più contesto per rendere la stringa unica.`,
                occurrences,
            });
        }

        const updatedScript = replaceAll
            ? currentScript.split(oldString).join(newString)
            : currentScript.replace(oldString, newString);

        return JSON.stringify({
            success: true,
            updatedScript,
            lineCount: updatedScript.split('\n').length,
            replacements: replaceAll ? occurrences : 1,
        });
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

// ─── Read Script Lines ──────────────────────────────────────────────────────

export async function doReadScriptLines(input: { currentScript: string; startLine?: number; endLine?: number; searchPattern?: string }) {
    try {
        const { currentScript, startLine, endLine, searchPattern } = input;

        if (!currentScript) {
            return JSON.stringify({ error: 'Nessuno script/query corrente.' });
        }

        const allLines = currentScript.split('\n');
        const totalLines = allLines.length;

        if (searchPattern) {
            const matches: { lineNum: number; line: string; context: string[] }[] = [];
            const regex = new RegExp(searchPattern, 'gi');
            for (let i = 0; i < allLines.length; i++) {
                if (regex.test(allLines[i])) {
                    const ctxStart = Math.max(0, i - 2);
                    const ctxEnd = Math.min(allLines.length, i + 3);
                    matches.push({
                        lineNum: i + 1,
                        line: allLines[i],
                        context: allLines.slice(ctxStart, ctxEnd).map((l, j) => `${ctxStart + j + 1}: ${l}`),
                    });
                }
                if (matches.length >= 20) break;
            }
            return JSON.stringify({ totalLines, matchCount: matches.length, matches });
        }

        const start = Math.max(1, startLine || 1);
        const end = Math.min(totalLines, endLine || Math.min(start + 99, totalLines));
        const lines = allLines.slice(start - 1, end).map((l, i) => `${start + i}: ${l}`);

        return JSON.stringify({ totalLines, range: `${start}-${end}`, lines });
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
    /** Current SQL script in the node editor — used by editScript/readScriptLines tools */
    currentScript?: string;
}) {
    // Capture in closures to auto-inject into tool calls
    const cid = opts.connectorId || '';
    const cpid = opts.companyId || '';
    // Mutable ref so editScript can chain multiple edits on the latest version
    let liveScript = opts.currentScript || '';

    const tools: Record<string, any> = {};

    // ── think — internal reasoning tool (like Claude Code's thinking) ────────
    tools.think = tool({
        description: "Usa questo tool per RAGIONARE internamente prima di agire. Pianifica il prossimo passo, analizza errori, valuta alternative. Il contenuto NON viene mostrato all'utente. Usalo SEMPRE quando: (1) devi decidere tra più approcci, (2) un tool call è fallita e devi capire perché, (3) il task è complesso e serve un piano.",
        inputSchema: z.object({
            reasoning: z.string().describe("Il tuo ragionamento interno: analisi del problema, piano d'azione, valutazione alternative."),
        }),
        execute: async ({ reasoning }) => JSON.stringify({ ok: true }),
    });

    if (opts.connectorId) {
        tools.exploreDbSchema = tool({
            description: 'Esplora lo schema del database: elenca tutte le tabelle disponibili.',
            inputSchema: z.object({
                connectorId: z.string().describe("L'ID del connettore database."),
            }),
            execute: async ({ connectorId }) => doExploreDbSchema({ connectorId: connectorId || cid }),
        });

        tools.exploreDbSchemaChunked = tool({
            description: `Esplora lo schema del database con PAGINAZIONE. Usa questo tool al posto di exploreDbSchema quando il database ha MOLTE tabelle (>50).
Restituisce un sottoinsieme di tabelle alla volta. Usa offset e limit per navigare, searchTerm per filtrare per nome.`,
            inputSchema: z.object({
                connectorId: z.string().describe("L'ID del connettore database."),
                offset: z.number().optional().describe("Indice di partenza (default: 0)."),
                limit: z.number().optional().describe("Numero max di tabelle (default: 50, max: 100)."),
                searchTerm: z.string().optional().describe("Filtra tabelle il cui nome contiene questo termine."),
            }),
            execute: async ({ connectorId, offset = 0, limit = 50, searchTerm }) => {
                try {
                    const fullResult = await doExploreDbSchema({ connectorId: connectorId || cid });
                    const parsed = JSON.parse(fullResult);
                    if (parsed.error) return fullResult;

                    let tables = parsed.tables || [];
                    const totalTables = tables.length;

                    if (searchTerm) {
                        const term = searchTerm.toLowerCase();
                        tables = tables.filter((t: any) =>
                            (t.table_name || '').toLowerCase().includes(term) ||
                            (t.description || '').toLowerCase().includes(term)
                        );
                    }

                    const filteredTotal = tables.length;
                    const clampedLimit = Math.min(limit, 100);
                    const chunk = tables.slice(offset, offset + clampedLimit);
                    const hasMore = offset + clampedLimit < filteredTotal;

                    return JSON.stringify({
                        tables: chunk,
                        pagination: { totalTables, filteredTotal: searchTerm ? filteredTotal : totalTables, offset, limit: clampedLimit, returned: chunk.length, hasMore, nextOffset: hasMore ? offset + clampedLimit : null },
                        source: parsed.source || 'unknown',
                    }, null, 2);
                } catch (e: any) {
                    return JSON.stringify({ error: `Errore: ${e.message}` });
                }
            },
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

    // ── editScript — find-and-replace on current SQL query ─────────────────
    tools.editScript = tool({
        description: "Modifica la query SQL corrente con find-and-replace. Usa QUESTO tool per modificare query grandi invece di riscriverle. Fornisci la stringa esatta da trovare (oldString) e la sostituzione (newString). Il risultato include la query aggiornata che viene automaticamente applicata al nodo.",
        inputSchema: z.object({
            oldString: z.string().describe("La stringa ESATTA da trovare nella query corrente. Deve corrispondere carattere per carattere."),
            newString: z.string().describe("La stringa sostitutiva."),
            replaceAll: z.boolean().optional().describe("Se true, sostituisce TUTTE le occorrenze. Default: false."),
        }),
        execute: async ({ oldString, newString, replaceAll }) => {
            const result = await doEditScript({ oldString, newString, currentScript: liveScript, replaceAll });
            try {
                const parsed = JSON.parse(result);
                if (parsed.success && parsed.updatedScript) {
                    liveScript = parsed.updatedScript;
                }
            } catch { /* ignore */ }
            return result;
        },
    });

    // ── readScriptLines — read specific lines or search within current query ─
    tools.readScriptLines = tool({
        description: "Leggi righe specifiche o cerca pattern nella query SQL corrente. Utile per query grandi: prima cerca/leggi la sezione da modificare, poi usa editScript.",
        inputSchema: z.object({
            startLine: z.number().optional().describe("Riga iniziale da leggere (1-based). Default: 1."),
            endLine: z.number().optional().describe("Riga finale da leggere."),
            searchPattern: z.string().optional().describe("Pattern regex da cercare nella query."),
        }),
        execute: async ({ startLine, endLine, searchPattern }) =>
            doReadScriptLines({ currentScript: liveScript, startLine, endLine, searchPattern }),
    });

    return tools;
}

// doTestSqlQuery is now exported at declaration site
