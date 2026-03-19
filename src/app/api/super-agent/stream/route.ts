/**
 * Super-Agent Streaming Endpoint
 * Uses Vercel AI SDK streamText (same framework as /api/agents/chat-stream)
 * Tools ported from src/ai/flows/super-agent-flow.ts
 */
import { NextRequest } from 'next/server';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getOpenRouterSettingsAction } from '@/actions/openrouter';
import { getAiProviderAction, type AiProvider } from '@/actions/ai-settings';
import { getOpenRouterModel } from '@/ai/providers/openrouter-provider';
import { streamFromClaudeCli } from '@/ai/providers/claude-cli-provider';
import { createMcpConfig } from '@/lib/mcp-config';
import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';
import { setAgentUsageCache } from '@/lib/agent-usage-cache';
import { createWidgetTree } from '@/lib/create-widget';
import { doExploreDbSchema } from '@/ai/tools/sql-agent-tools';

export const maxDuration = 120;

// Widget creation helpers are now in @/lib/create-widget.ts

// ─── Helpers (same logic as super-agent-flow.ts) ────────────────────────────

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

    if (nodeInfo.sqlQuery || nodeInfo.pythonCode || nodeInfo.question || nodeInfo.decision) {
        results.push(nodeInfo);
    }

    if (node.options) {
        for (const [, child] of Object.entries(node.options)) {
            if (Array.isArray(child)) {
                for (const c of child) collectNodes(c, treeName, treeId, results);
            } else {
                collectNodes(child as any, treeName, treeId, results);
            }
        }
    }
    return results;
}

async function fetchTreesForCompany(companyId: string, type?: string) {
    const where: any = { companyId };
    if (type) where.type = type;
    return db.tree.findMany({ where, select: { id: true, name: true, description: true, type: true, jsonDecisionTree: true } });
}

async function fetchTreeById(treeId: string) {
    return db.tree.findUnique({ where: { id: treeId }, select: { id: true, name: true, description: true, type: true, jsonDecisionTree: true } });
}

// ─── Tools Factory ───────────────────────────────────────────────────────────

function createSuperAgentTools(companyId: string) {
    // Track the last successful SQL execution so createWidget can auto-fill connectorId & query.
    // The LLM often forgets to pass connectorId or rewrites the query with wrong syntax.
    // This tracker solves both problems by capturing the exact query+connector that worked.
    const tracker = { lastSql: null as { query: string; connectorId: string; columns: string[] } | null };

    return {
        listSqlConnectors: tool({
            description: 'Elenca tutti i connettori SQL (database) disponibili nella company. Usa questo tool per scoprire quali database sono disponibili e i loro ID, prima di eseguire query SQL.',
            inputSchema: z.object({
                dummy: z.string().optional().describe('Non usato, lascia vuoto.'),
            }),
            execute: async () => {
                try {
                    const connectors = await db.connector.findMany({
                        where: { companyId, type: 'SQL' },
                        select: { id: true, name: true },
                    });
                    if (connectors.length === 0) return JSON.stringify({ connectors: [], message: 'Nessun connettore SQL trovato.' });
                    return JSON.stringify({ connectors }, null, 2);
                } catch (e: any) {
                    return JSON.stringify({ error: `Errore: ${e.message}` });
                }
            },
        }),

        listTreesAndPipelines: tool({
            description: 'Elenca tutti gli alberi decisionali e le pipeline disponibili nella company. Usa questo tool per scoprire quali dati e query sono disponibili.',
            inputSchema: z.object({
                type: z.string().optional().describe('Filtra per tipo: "RULE" o "PIPELINE". Ometti per vedere tutti.'),
            }),
            execute: async ({ type }) => {
                try {
                    const trees = await fetchTreesForCompany(companyId, type);
                    if (trees.length === 0) return JSON.stringify({ error: 'Nessun albero trovato' });
                    return JSON.stringify({
                        count: trees.length,
                        trees: trees.map(t => ({ id: t.id, name: t.name, description: t.description, type: t.type })),
                    }, null, 2);
                } catch (e: any) {
                    return JSON.stringify({ error: `Errore: ${e.message}` });
                }
            },
        }),

        getTreeContent: tool({
            description: 'Legge TUTTI i nodi di un albero con le loro query SQL, codice Python, widget e dipendenze. Usa questo per esplorare il contenuto completo di un albero.',
            inputSchema: z.object({
                treeId: z.string().describe("L'ID dell'albero da esplorare."),
            }),
            execute: async ({ treeId }) => {
                try {
                    const tree = await fetchTreeById(treeId);
                    if (!tree) return JSON.stringify({ error: 'Albero non trovato' });
                    const treeData = JSON.parse(tree.jsonDecisionTree);
                    const nodes = collectNodes(treeData, tree.name, tree.id);
                    return JSON.stringify({ treeName: tree.name, treeDescription: tree.description, treeType: tree.type, totalNodes: nodes.length, nodes: nodes.slice(0, 50) }, null, 2);
                } catch (e: any) {
                    return JSON.stringify({ error: `Errore: ${e.message}` });
                }
            },
        }),

        searchNodesForQuery: tool({
            description: 'Cerca in TUTTI gli alberi della company i nodi che contengono una keyword specifica nelle query SQL, codice Python, nomi dei risultati, domande o decisioni.',
            inputSchema: z.object({
                searchTerm: z.string().describe('Il termine di ricerca (es. "fatturato", "vendite", "ordini").'),
            }),
            execute: async ({ searchTerm }) => {
                try {
                    const trees = await fetchTreesForCompany(companyId);
                    if (trees.length === 0) return JSON.stringify({ results: [], message: 'Nessun albero trovato' });

                    const term = searchTerm.toLowerCase();
                    const matches: any[] = [];

                    for (const tree of trees) {
                        try {
                            const treeData = JSON.parse(tree.jsonDecisionTree);
                            const nodes = collectNodes(treeData, tree.name, tree.id);
                            for (const node of nodes) {
                                const searchableText = [node.sqlQuery, node.pythonCode, node.sqlResultName, node.pythonResultName, node.question, node.decision]
                                    .filter(Boolean).join(' ').toLowerCase();
                                if (searchableText.includes(term)) matches.push(node);
                            }
                        } catch { /* ignore */ }
                    }

                    if (matches.length === 0) return JSON.stringify({ results: [], message: `Nessun nodo trovato per "${searchTerm}". Prova con termini diversi.` });
                    return JSON.stringify({ resultCount: matches.length, results: matches.slice(0, 20) }, null, 2);
                } catch (e: any) {
                    return JSON.stringify({ error: `Errore: ${e.message}` });
                }
            },
        }),

        executeSqlQuery: tool({
            description: 'Esegue una query SQL su un connettore database. Puoi eseguire sia query esistenti trovate nei nodi, sia query nuove scritte da te.',
            inputSchema: z.object({
                query: z.string().describe('La query SQL da eseguire.'),
                connectorId: z.string().describe("L'ID del connettore database da usare."),
            }),
            execute: async ({ query, connectorId }) => {
                try {
                    const result = await executeSqlPreviewAction(query, connectorId, [], true);
                    if (result.error) return JSON.stringify({ error: result.error });
                    const data = result.data || [];
                    const columns = data.length > 0 ? Object.keys(data[0]) : [];
                    // Track this successful execution for createWidget auto-fill
                    tracker.lastSql = { query, connectorId, columns };
                    return JSON.stringify({ rowCount: data.length, data: data.slice(0, 100), truncated: data.length > 100, columns }, null, 2);
                } catch (e: any) {
                    return JSON.stringify({ error: `Errore esecuzione SQL: ${e.message}` });
                }
            },
        }),

        executePythonCode: tool({
            description: "Esegue codice Python. Puoi usarlo per analisi dati, calcoli o generazione di variabili.",
            inputSchema: z.object({
                code: z.string().describe('Il codice Python da eseguire.'),
                outputType: z.enum(['table', 'variable', 'chart']).describe("Tipo di output."),
                connectorId: z.string().optional().describe('ID del connettore (opzionale).'),
            }),
            execute: async ({ code, outputType, connectorId }) => {
                try {
                    const result = await executePythonPreviewAction(code, outputType, {}, [], connectorId, true);
                    if (!result.success) return JSON.stringify({ error: result.error || 'Errore esecuzione Python' });
                    return JSON.stringify({ data: result.data?.slice(0, 100), variables: result.variables, columns: result.columns, rowCount: result.rowCount, stdout: result.stdout }, null, 2);
                } catch (e: any) {
                    return JSON.stringify({ error: `Errore esecuzione Python: ${e.message}` });
                }
            },
        }),

        searchKnowledgeBase: tool({
            description: 'Cerca nella Knowledge Base aziendale. Contiene correzioni e risposte validate dagli utenti.',
            inputSchema: z.object({
                query: z.string().describe('Termine di ricerca per trovare entry nella KB.'),
            }),
            execute: async ({ query }) => {
                try {
                    const term = query.toLowerCase();
                    const entries = await db.knowledgeBaseEntry.findMany({
                        where: {
                            companyId,
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
                    if (entries.length === 0) return JSON.stringify({ results: [], message: 'Nessuna entry trovata nella Knowledge Base.' });
                    return JSON.stringify({ results: entries.map(e => ({ id: e.id, question: e.question, answer: e.answer, tags: e.tags, category: e.category })) }, null, 2);
                } catch (e: any) {
                    return JSON.stringify({ error: `Errore ricerca KB: ${e.message}` });
                }
            },
        }),

        saveToKnowledgeBase: tool({
            description: "Salva una nuova entry nella Knowledge Base. Usa quando l'utente ti corregge o per memorizzare risposte importanti.",
            inputSchema: z.object({
                question: z.string().describe('La domanda o il contesto originale.'),
                answer: z.string().describe('La risposta corretta o la correzione.'),
                tags: z.array(z.string()).describe('Tag per categorizzare.'),
                category: z.string().optional().describe('Categoria (es. "SQL", "Python", "Dati").'),
            }),
            execute: async ({ question, answer, tags, category }) => {
                try {
                    const entry = await db.knowledgeBaseEntry.create({ data: { question, answer, tags, category: category || 'Generale', companyId } });
                    return JSON.stringify({ success: true, id: entry.id, message: 'Entry salvata nella Knowledge Base.' });
                } catch (e: any) {
                    return JSON.stringify({ error: `Errore salvataggio KB: ${e.message}` });
                }
            },
        }),

        createWidget: tool({
            description: `Crea un albero decisionale (widget) di tipo PIPELINE con nodi SQL → Python → Grafico già configurati e pronti all'uso nella sezione Regole.
Usa questo tool quando l'utente chiede di creare un widget, un albero, una pipeline, o di salvare un'analisi come regola.
La query SQL e il connectorId vengono recuperati AUTOMATICAMENTE dall'ultima executeSqlQuery eseguita con successo. Tu devi solo passare treeName, chartType, xAxisKey e dataKeys.`,
            inputSchema: z.object({
                treeName: z.string().describe("Nome dell'albero/widget (es. 'Ricavi Mensili 2025-2026')."),
                chartType: z.string().describe("Tipo di grafico: 'bar-chart', 'line-chart', 'area-chart', 'pie-chart', 'scatter-chart'."),
                sqlQuery: z.string().optional().describe('Opzionale: sovrascrive la query SQL auto-rilevata. Di norma NON passarlo, viene preso in automatico.'),
                connectorId: z.string().optional().describe('Opzionale: sovrascrive il connectorId auto-rilevato. Di norma NON passarlo, viene preso in automatico.'),
                pythonCode: z.string().optional().describe('Codice Python usato (opzionale, se hai usato executePythonCode).'),
                xAxisKey: z.string().optional().describe("Nome della colonna per l'asse X del grafico."),
                dataKeys: z.array(z.string()).optional().describe("Nomi delle colonne per l'asse Y del grafico (serie dati)."),
                data: z.array(z.any()).optional().describe('I dati del grafico (array di oggetti). Necessario solo se non hai una query SQL.'),
            }),
            execute: async ({ treeName, chartType, sqlQuery: _llmSqlQuery, connectorId: _llmConnectorId, pythonCode, xAxisKey, dataKeys, data }) => {
                try {
                    // ALWAYS prefer tracker over LLM — the LLM rewrites queries with wrong syntax
                    const finalSqlQuery = tracker.lastSql?.query || _llmSqlQuery;
                    const finalConnectorId = tracker.lastSql?.connectorId || _llmConnectorId;

                    console.log('[createWidget] tracker.lastSql:', tracker.lastSql ? {
                        hasQuery: !!tracker.lastSql.query,
                        queryPreview: tracker.lastSql.query?.substring(0, 80),
                        connectorId: tracker.lastSql.connectorId,
                        columns: tracker.lastSql.columns,
                    } : 'NULL — no SQL was executed before createWidget!');
                    console.log('[createWidget] LLM passed:', { sqlQuery: _llmSqlQuery?.substring(0, 80), connectorId: _llmConnectorId });
                    console.log('[createWidget] Using:', { sqlQuery: finalSqlQuery?.substring(0, 80), connectorId: finalConnectorId });

                    // Auto-detect xAxisKey and dataKeys from tracker columns if not provided
                    let finalXAxisKey = xAxisKey;
                    let finalDataKeys = dataKeys;
                    if (tracker.lastSql?.columns && tracker.lastSql.columns.length >= 2) {
                        if (!finalXAxisKey) finalXAxisKey = tracker.lastSql.columns[0];
                        if (!finalDataKeys || finalDataKeys.length === 0) finalDataKeys = tracker.lastSql.columns.slice(1);
                    }

                    const result = await createWidgetTree({
                        treeName,
                        chartType,
                        sqlQuery: finalSqlQuery,
                        connectorId: finalConnectorId,
                        pythonCode,
                        xAxisKey: finalXAxisKey,
                        dataKeys: finalDataKeys,
                        data,
                        companyId,
                    });
                    console.log('[createWidget] Result:', JSON.stringify(result).substring(0, 200));
                    return JSON.stringify(result);
                } catch (e: any) {
                    return JSON.stringify({ error: `Errore creazione widget: ${e.message}` });
                }
            },
        }),

        createTree: tool({
            description: `Crea un nuovo albero decisionale salvandolo direttamente nel database.
TU devi generare la struttura dell'albero a partire dalla descrizione dell'utente.

WORKFLOW:
1. Leggi la descrizione delle regole di business dall'utente
2. Identifica tutte le variabili decisionali e i loro possibili valori
3. Costruisci la struttura JSON dell'albero con domande, opzioni e decisioni
4. Scrivi una versione in linguaggio naturale
5. Chiama questo tool con tutti i campi generati

FORMATO jsonDecisionTree (JSON valido):
{"question":"Domanda?", "options":{"Opzione1":{"question":"Sotto-domanda?", "options":{...}}, "Opzione2":{"decision":"Decisione finale"}}}
Ogni nodo ha "question" + "options". Le foglie hanno "decision" al posto di "question"+"options".`,
            inputSchema: z.object({
                name: z.string().describe("Nome breve e descrittivo per l'albero (2-5 parole, in italiano). Es: 'Triage Supporto Tecnico'"),
                description: z.string().describe("La descrizione originale delle regole di business fornita dall'utente."),
                jsonDecisionTree: z.string().describe('JSON valido della struttura ad albero. Ogni nodo: {"question":"...", "options":{"Opt1":{...}, "Opt2":{"decision":"..."}}}'),
                naturalLanguageDecisionTree: z.string().describe("Versione in linguaggio naturale dell'albero (in italiano)."),
                questionsScript: z.string().optional().describe("Lista numerata di tutte le domande in ordine."),
                type: z.enum(['RULE', 'PIPELINE']).optional().describe("Tipo: 'RULE' per regole decisionali (default), 'PIPELINE' per pipeline."),
            }),
            execute: async ({ name, description, jsonDecisionTree, naturalLanguageDecisionTree, questionsScript, type }) => {
                try {
                    // Validate JSON
                    try {
                        JSON.parse(jsonDecisionTree);
                    } catch (e) {
                        return JSON.stringify({ error: `JSON dell'albero non valido: ${(e as Error).message}. Correggi il JSON e riprova.` });
                    }

                    const createdTree = await db.tree.create({
                        data: {
                            name,
                            description,
                            jsonDecisionTree,
                            naturalLanguageDecisionTree: naturalLanguageDecisionTree || '',
                            questionsScript: questionsScript || '',
                            type: type || 'RULE',
                            companyId,
                        },
                    });

                    return JSON.stringify({
                        success: true,
                        treeId: createdTree.id,
                        treeName: createdTree.name,
                        treeType: createdTree.type,
                        message: `Albero "${createdTree.name}" creato con successo! Lo trovi nella sezione Regole.`,
                    }, null, 2);
                } catch (e: any) {
                    return JSON.stringify({ error: `Errore creazione albero: ${e.message}` });
                }
            },
        }),

        exploreDbSchemaChunked: tool({
            description: `Esplora lo schema di un database con paginazione. Utile per database con MOLTE tabelle (>50).
Restituisce un sottoinsieme di tabelle alla volta per evitare di sovraccaricare la memoria.
Usa 'offset' e 'limit' per navigare. Se non li specifichi, restituisce le prime 50 tabelle.
Se il database ha poche tabelle, usa direttamente executeSqlQuery con INFORMATION_SCHEMA.`,
            inputSchema: z.object({
                connectorId: z.string().describe("L'ID del connettore database."),
                offset: z.number().optional().describe("Indice di partenza (default: 0)."),
                limit: z.number().optional().describe("Numero massimo di tabelle da restituire (default: 50, max: 100)."),
                searchTerm: z.string().optional().describe("Filtra le tabelle il cui nome contiene questo termine (case-insensitive)."),
            }),
            execute: async ({ connectorId, offset = 0, limit = 50, searchTerm }) => {
                try {
                    const fullResult = await doExploreDbSchema({ connectorId });
                    const parsed = JSON.parse(fullResult);
                    if (parsed.error) return fullResult;

                    let tables = parsed.tables || [];
                    const totalTables = tables.length;

                    // Apply search filter
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
                        pagination: {
                            totalTables,
                            filteredTotal: searchTerm ? filteredTotal : totalTables,
                            offset,
                            limit: clampedLimit,
                            returned: chunk.length,
                            hasMore,
                            nextOffset: hasMore ? offset + clampedLimit : null,
                        },
                        source: parsed.source || 'unknown',
                    }, null, 2);
                } catch (e: any) {
                    return JSON.stringify({ error: `Errore esplorazione schema: ${e.message}` });
                }
            },
        }),

        fixWidgetNode: tool({
            description: `Corregge la query SQL o il codice Python di un nodo in un albero/widget già creato.
Usa questo tool DOPO createWidget se i testResults mostrano errori, oppure quando l'utente ti dice che un nodo di un albero ha errori.
Trova il nodo per ID nell'albero, aggiorna la query SQL o il codice Python, e ritesta.`,
            inputSchema: z.object({
                treeId: z.string().describe("L'ID dell'albero da correggere."),
                nodeId: z.string().describe("L'ID del nodo da correggere (lo trovi nei testResults o in getTreeContent)."),
                newSqlQuery: z.string().optional().describe('La nuova query SQL corretta (se il problema è nel SQL).'),
                newPythonCode: z.string().optional().describe('Il nuovo codice Python corretto (se il problema è nel Python).'),
            }),
            execute: async ({ treeId, nodeId, newSqlQuery, newPythonCode }) => {
                try {
                    const tree = await db.tree.findUnique({ where: { id: treeId } });
                    if (!tree) return JSON.stringify({ error: 'Albero non trovato' });

                    const treeData = JSON.parse(tree.jsonDecisionTree);

                    // Recursive function to find and update a node by ID
                    function updateNode(node: any): boolean {
                        if (!node || typeof node === 'string') return false;
                        if (node.id === nodeId) {
                            if (newSqlQuery) node.sqlQuery = newSqlQuery;
                            if (newPythonCode) node.pythonCode = newPythonCode;
                            return true;
                        }
                        if (node.options) {
                            for (const [, child] of Object.entries(node.options)) {
                                if (Array.isArray(child)) {
                                    for (const c of child) { if (updateNode(c)) return true; }
                                } else {
                                    if (updateNode(child as any)) return true;
                                }
                            }
                        }
                        return false;
                    }

                    const found = updateNode(treeData);
                    if (!found) return JSON.stringify({ error: `Nodo con id "${nodeId}" non trovato nell'albero.` });

                    // Test the fix before saving
                    const testResults: { sql?: string; python?: string } = {};

                    if (newSqlQuery) {
                        // Find the connectorId from the node
                        const connId = tracker.lastSql?.connectorId;
                        if (connId) {
                            try {
                                const sqlResult = await executeSqlPreviewAction(newSqlQuery, connId, [], true);
                                if (sqlResult.error) {
                                    testResults.sql = `ANCORA ERRORE: ${sqlResult.error}`;
                                } else {
                                    testResults.sql = `OK - ${(sqlResult.data || []).length} righe`;
                                    // Update tracker with the fixed query
                                    tracker.lastSql = { query: newSqlQuery, connectorId: connId, columns: sqlResult.data?.length ? Object.keys(sqlResult.data[0]) : [] };
                                }
                            } catch (e: any) {
                                testResults.sql = `ANCORA ERRORE: ${e.message}`;
                            }
                        }
                    }

                    if (newPythonCode) {
                        try {
                            const pyDeps = tracker.lastSql ? [{ tableName: 'dati', query: tracker.lastSql.query, connectorId: tracker.lastSql.connectorId }] : [];
                            const pyResult = await executePythonPreviewAction(newPythonCode, 'chart', {}, pyDeps, tracker.lastSql?.connectorId, true);
                            testResults.python = pyResult.success ? 'OK - Grafico generato' : `ANCORA ERRORE: ${pyResult.error}`;
                        } catch (e: any) {
                            testResults.python = `ANCORA ERRORE: ${e.message}`;
                        }
                    }

                    // Save the updated tree
                    await db.tree.update({
                        where: { id: treeId },
                        data: { jsonDecisionTree: JSON.stringify(treeData) },
                    });

                    const hasErrors = testResults.sql?.startsWith('ANCORA') || testResults.python?.startsWith('ANCORA');
                    return JSON.stringify({
                        success: true,
                        fixed: !hasErrors,
                        testResults,
                        message: hasErrors
                            ? 'Nodo aggiornato ma ci sono ancora errori. Riprova con una correzione diversa.'
                            : 'Nodo corretto e testato con successo!',
                    });
                } catch (e: any) {
                    return JSON.stringify({ error: `Errore correzione nodo: ${e.message}` });
                }
            },
        }),
    };
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { email: session.user.email },
            include: { company: true },
        });
        if (!user?.company) {
            return new Response(JSON.stringify({ error: 'User not associated with a company' }), { status: 400 });
        }

        const companyId = user.company.id;
        const body = await request.json();
        const { messages, model, conversationId } = body;

        // Extract user message from AI SDK UIMessage format
        let userMessage = '';
        if (Array.isArray(messages) && messages.length > 0) {
            const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
            if (lastUserMsg) {
                if (Array.isArray(lastUserMsg.parts)) {
                    userMessage = lastUserMsg.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('');
                } else if (typeof lastUserMsg.content === 'string') {
                    userMessage = lastUserMsg.content;
                }
            }
        }

        if (!userMessage) {
            return new Response(JSON.stringify({ error: 'Missing required field: userMessage' }), { status: 400 });
        }

        // Load conversation history from DB
        let conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [];
        let existingConversation = null;

        if (conversationId) {
            existingConversation = await db.superAgentConversation.findUnique({ where: { id: conversationId } });
            if (existingConversation && existingConversation.companyId === companyId) {
                const allMessages = existingConversation.messages as any[];
                const filtered = allMessages.filter((m: any) => m.role === 'user' || m.role === 'model').slice(-20);
                conversationHistory = filtered.map((m: any) => ({
                    role: m.role === 'model' ? 'assistant' as const : 'user' as const,
                    content: typeof m.content === 'string' ? m.content : (m.content?.[0]?.text || ''),
                }));
            }
        }

        // Pre-load tree summary for system prompt
        let treeSummary = '';
        try {
            const trees = await fetchTreesForCompany(companyId);
            if (trees.length > 0) {
                const summaries = trees.map(t => {
                    let nodeCount = 0, sqlCount = 0, pythonCount = 0;
                    try {
                        const nodes = collectNodes(JSON.parse(t.jsonDecisionTree), t.name, t.id);
                        nodeCount = nodes.length;
                        sqlCount = nodes.filter(n => n.sqlQuery).length;
                        pythonCount = nodes.filter(n => n.pythonCode).length;
                    } catch { /* ignore */ }
                    return `- ${t.name} (ID: ${t.id}, tipo: ${t.type || 'RULE'}, ${nodeCount} nodi, ${sqlCount} SQL, ${pythonCount} Python)`;
                });
                treeSummary = `\n\nALBERI DISPONIBILI:\n${summaries.join('\n')}`;
            }
        } catch { /* ignore */ }

        const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const systemPrompt = `Sei FridAI, un super agente IA esperto nell'analisi dati aziendali. NON MOLLARE MAI. Sei tenace, persistente e creativo nel trovare i dati.

DATA DI OGGI: ${today}
Company ID: ${companyId}

## RAGIONAMENTO STRUTTURATO (OBBLIGATORIO):
Prima di OGNI risposta finale, segui questo processo mentale:
1. **COMPRENDI**: Riformula internamente la richiesta dell'utente per assicurarti di averla capita
2. **PIANIFICA**: Identifica quali tool usare e in quale ordine
3. **ESEGUI**: Usa i tool uno alla volta, analizzando ogni risultato
4. **VERIFICA**: Prima di rispondere, controlla che i dati siano coerenti e completi
5. **RISPONDI**: Solo dopo aver verificato, presenta la risposta finale

## WORKFLOW (segui SEMPRE questi passi in ordine):
1. CERCA nella Knowledge Base (searchKnowledgeBase) - contiene query, script e info già validate
2. Se la KB non basta, cerca negli alberi (searchNodesForQuery) con DIVERSE keyword (sinonimi, varianti)
3. Se non trovi, usa listTreesAndPipelines per vedere TUTTI gli alberi, poi esplora quelli rilevanti con getTreeContent
4. Se non conosci il connettore DB, usa listSqlConnectors per vedere tutti i database disponibili
5. Quando trovi una query SQL, ESEGUILA con executeSqlQuery
6. Se la query fallisce, PROVA a correggerla o a scriverne una nuova basandoti sullo schema

## REGOLE DI PERSISTENZA (CRITICHE):
- NON ARRENDERTI MAI. Se un tool fallisce, prova un approccio diverso.
- Se una ricerca non trova nulla, prova con SINONIMI (es: "fatturato" → "vendite" → "ricavi" → "importo")
- Se un connettore non funziona, usa listSqlConnectors per trovare quello giusto
- Se una query SQL fallisce, analizza l'errore, correggi la query e riprova
- HAI fino a 30 tentativi con i tool. USALI TUTTI se necessario. Non dire mai "ho raggiunto il limite".

## AUTO-APPRENDIMENTO KNOWLEDGE BASE (FONDAMENTALE):
- Dopo OGNI risposta con dati, chiedi all'utente: "I dati sono corretti? Confermi o correggi?"
- Se l'utente CONFERMA → salva nella KB con saveToKnowledgeBase
- Se l'utente CORREGGE → salva la CORREZIONE nella KB
- La KB è la tua MEMORIA PERMANENTE. Alimentala continuamente.

## CREAZIONE WIDGET / ALBERI (TOOL createWidget / superCreateWidget):
Quando l'utente chiede di creare un widget, un albero, una pipeline, una regola o di salvare un'analisi:
1. PRIMA esegui la query SQL con executeSqlQuery/superExecuteSql (se non l'hai già fatto)
2. Poi USA il tool createWidget/superCreateWidget passando TUTTI questi parametri:
   - treeName: nome descrittivo (es. "Ricavi Mensili 2025-2026")
   - chartType: tipo di grafico (bar, line, area, pie, scatter)
   - sqlQuery: la ESATTA query SQL che hai eseguito con successo (OBBLIGATORIO!)
   - connectorId: l'ID del connettore database usato (OBBLIGATORIO quando c'è sqlQuery!)
   - xAxisKey: la colonna per l'asse X
   - dataKeys: le colonne per l'asse Y (array di stringhe)
3. Il tool TESTA AUTOMATICAMENTE la query SQL e il codice Python PRIMA di creare l'albero
4. L'albero risultante avrà i nodi: SQL → Python (Plotly) → Widget con grafico
5. Se il test FALLISCE, l'albero NON viene creato e ricevi l'errore
6. In caso di errore DEVI:
   - Analizzare il messaggio di errore
   - Correggere la query con executeSqlQuery (testa finché funziona!)
   - Poi richiamare createWidget con la query corretta
7. Solo quando tutti i test passano, l'albero viene creato nella sezione Regole
8. NON dire mai all'utente che hai creato il widget se createWidget ha ritornato success:false!
9. CRITICO: Devi SEMPRE passare sqlQuery e connectorId, altrimenti l'albero avrà solo un nodo vuoto!

## CREAZIONE ALBERI DECISIONALI (TOOL createTree):
Quando l'utente chiede di creare un albero decisionale, una regola, un decision tree, o un processo decisionale:
1. Chiedi all'utente di descrivere le regole in linguaggio naturale (in italiano)
2. Usa il tool createTree passando la descrizione
3. L'AI estrarrà automaticamente le variabili e genererà l'albero con domande, opzioni e decisioni
4. L'albero verrà salvato nella sezione Regole
5. Se l'utente vuole creare un albero di tipo PIPELINE (con SQL/Python/grafici), usa type='PIPELINE'

## ESPLORAZIONE DATABASE CON CHUNKING (TOOL exploreDbSchemaChunked):
Per database con MOLTE tabelle (>50), usa exploreDbSchemaChunked invece di query dirette su INFORMATION_SCHEMA.
- Supporta paginazione con offset e limit
- Supporta ricerca per nome tabella con searchTerm
- Evita di caricare TUTTE le tabelle in una sola volta
- Esempio: chiama con offset=0, limit=30 per le prime 30, poi offset=30, limit=30 per le successive

## PROPOSTA AUTOMATICA WIDGET (OBBLIGATORIO):
OGNI VOLTA che mostri un grafico (recharts) o una tabella con dati estratti da SQL/Python, DEVI SEMPRE chiedere all'utente:
"📊 Vuoi che salvi questo come widget nelle Regole? Creerò un albero PIPELINE pronto all'uso con la query SQL e il grafico già configurati."
- Se l'utente risponde sì/ok/confermo/crea → chiama immediatamente createWidget con i dati della conversazione
- Se l'utente risponde no/non serve → prosegui normalmente
- NON saltare mai questa domanda dopo aver mostrato un grafico o una tabella con dati

## FORMATO RISPOSTE:
- Rispondi SEMPRE in italiano
- Per grafici: \`\`\`recharts {"type":"bar-chart","data":[...],"xAxisKey":"x","dataKeys":["y"],"title":"Titolo"} \`\`\`
  Tipi: bar-chart, line-chart, pie-chart, area-chart
- Per tabelle: formato markdown | ... |
- Per codice: \`\`\`sql o \`\`\`python
- Cita SEMPRE la fonte (nome albero, tabella, database)${treeSummary}`;

        // Get AI provider settings
        const providerSettings = await getAiProviderAction();
        const aiProvider: AiProvider = providerSettings.provider || 'openrouter';

        // Build messages for streamText (conversation history + current message)
        const streamMessages: { role: 'user' | 'assistant'; content: string }[] = [
            ...conversationHistory,
            { role: 'user', content: userMessage },
        ];

        if (aiProvider === 'claude-cli') {
            // ─── Claude CLI path ───────────────────────────────────────────
            const cliModel = providerSettings.claudeCliModel || 'claude-sonnet-4-6';
            const { configPath, cleanup } = await createMcpConfig({
                agentType: 'super',
                companyId,
            });

            try {
                const fullUserPrompt = streamMessages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
                const { response, sessionPromise } = streamFromClaudeCli({
                    model: cliModel,
                    systemPrompt,
                    userPrompt: fullUserPrompt,
                    mcpConfigPath: configPath,
                });

                sessionPromise.then(async (info) => {
                    try {
                        if (info.inputTokens) {
                            setAgentUsageCache('super-agent', { inputTokens: info.inputTokens || 0, outputTokens: info.outputTokens || 0 });
                        }
                        const rawHistory = existingConversation
                            ? (existingConversation.messages as any[]).filter((m: any) => m.role === 'user' || m.role === 'model').slice(-20)
                            : [];
                        const updatedHistory = [
                            ...rawHistory,
                            { role: 'user', content: [{ text: userMessage }] },
                            { role: 'model', content: [{ text: info.fullText || '(Claude CLI response)' }] },
                        ];
                        if (existingConversation) {
                            await db.superAgentConversation.update({ where: { id: existingConversation.id }, data: { messages: updatedHistory, updatedAt: new Date() } });
                        } else {
                            await db.superAgentConversation.create({ data: { messages: updatedHistory, companyId } });
                        }
                    } catch (e) {
                        console.error('[super-agent/stream] Failed to save Claude CLI conversation:', e);
                    } finally {
                        await cleanup();
                    }
                }).catch(async () => { await cleanup(); });

                return response;
            } catch (error) {
                await cleanup();
                throw error;
            }
        }

        // ─── OpenRouter path (existing) ────────────────────────────────────
        const openRouterSettings = await getOpenRouterSettingsAction();
        const apiKey = (user as any).openRouterApiKey || openRouterSettings.apiKey || '';
        const modelId = model || 'google/gemini-2.0-flash-001';

        if (!apiKey) {
            return new Response(JSON.stringify({ error: 'OpenRouter API key non configurata.' }), { status: 400 });
        }

        const aiModel = getOpenRouterModel(apiKey, modelId);
        const tools = createSuperAgentTools(companyId);

        const result = streamText({
            model: aiModel,
            system: systemPrompt,
            messages: streamMessages,
            tools,
            stopWhen: stepCountIs(30),
            maxRetries: 2,
            temperature: 0.3,
            onFinish: async ({ text, usage }) => {
                // Cache usage for client-side cost tracking
                if (usage) {
                    setAgentUsageCache('super-agent', {
                        inputTokens: usage.inputTokens || 0,
                        outputTokens: usage.outputTokens || 0,
                    });
                }
                try {
                    const rawHistory = existingConversation
                        ? (existingConversation.messages as any[]).filter((m: any) => m.role === 'user' || m.role === 'model').slice(-20)
                        : [];
                    const updatedHistory = [
                        ...rawHistory,
                        { role: 'user', content: [{ text: userMessage }] },
                        { role: 'model', content: [{ text }] },
                    ];

                    if (existingConversation) {
                        await db.superAgentConversation.update({ where: { id: existingConversation.id }, data: { messages: updatedHistory, updatedAt: new Date() } });
                    } else {
                        await db.superAgentConversation.create({ data: { messages: updatedHistory, companyId } });
                    }
                } catch (e) {
                    console.error('[super-agent/stream] Failed to save conversation:', e);
                }
            },
        });

        return result.toUIMessageStreamResponse();
    } catch (error: any) {
        console.error('[super-agent/stream] Error:', error?.message);
        return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), { status: 500 });
    }
}
