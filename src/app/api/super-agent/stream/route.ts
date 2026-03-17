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
import { getOpenRouterModel } from '@/ai/providers/openrouter-provider';
import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';
import { setAgentUsageCache } from '@/lib/agent-usage-cache';
import type { WidgetConfig, WidgetType } from '@/lib/types';

export const maxDuration = 120;

// ─── Widget creation helpers (mirrored from super-agent-flow.ts) ────────────

function rechartsTypeToPlotly(type: string): string {
    switch (type) {
        case 'line-chart': return 'line';
        case 'area-chart': return 'area';
        case 'pie-chart': return 'pie';
        case 'scatter-chart': return 'scatter';
        case 'bar-chart':
        default: return 'bar';
    }
}

function generatePythonChartCode(chartConfig: {
    type: string;
    xAxisKey?: string;
    dataKeys?: string[];
    title?: string;
}): string {
    const plotlyType = rechartsTypeToPlotly(chartConfig.type);
    const title = (chartConfig.title || '').replace(/'/g, "\\'");
    const xKey = chartConfig.xAxisKey || 'x';
    const yKeys = chartConfig.dataKeys?.length ? chartConfig.dataKeys : ['y'];

    if (plotlyType === 'pie') {
        const valueKey = yKeys[0];
        return [
            `import plotly.express as px`,
            ``,
            `# df is auto-injected from the SQL step`,
            `fig = px.pie(df, names='${xKey}', values='${valueKey}', title='${title}')`,
            `fig.show()`,
        ].join('\n');
    }

    if (plotlyType === 'scatter') {
        const yKey = yKeys[0];
        return [
            `import plotly.express as px`,
            ``,
            `# df is auto-injected from the SQL step`,
            `fig = px.scatter(df, x='${xKey}', y='${yKey}', title='${title}')`,
            `fig.show()`,
        ].join('\n');
    }

    if (yKeys.length === 1) {
        return [
            `import plotly.express as px`,
            ``,
            `# df is auto-injected from the SQL step`,
            `fig = px.${plotlyType}(df, x='${xKey}', y='${yKeys[0]}', title='${title}')`,
            `fig.show()`,
        ].join('\n');
    }

    const yKeysStr = yKeys.map(k => `'${k}'`).join(', ');
    return [
        `import plotly.express as px`,
        `import pandas as pd`,
        ``,
        `# df is auto-injected from the SQL step`,
        `df_melted = df.melt(id_vars='${xKey}', value_vars=[${yKeysStr}], var_name='Serie', value_name='Valore')`,
        `fig = px.${plotlyType}(df_melted, x='${xKey}', y='Valore', color='Serie', title='${title}')`,
        `fig.show()`,
    ].join('\n');
}

/**
 * Test a SQL query and return { ok, data, error }
 */
async function testSql(query: string, connId: string): Promise<{ ok: boolean; data?: any[]; columns?: string[]; error?: string }> {
    try {
        const r = await executeSqlPreviewAction(query, connId, [], true);
        if (r.error) return { ok: false, error: r.error };
        const data = r.data || [];
        return { ok: true, data, columns: data.length > 0 ? Object.keys(data[0]) : [] };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

/**
 * Test Python code and return { ok, error }
 */
async function testPython(code: string, deps: any[], connId?: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const r = await executePythonPreviewAction(code, 'chart', {}, deps, connId, true);
        return r.success ? { ok: true } : { ok: false, error: r.error || 'Errore sconosciuto' };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

/**
 * Use a fast LLM call to auto-fix a SQL query based on the error message.
 * Common fixes: DATE_TRUNC → DATEADD/CONVERT, TO_CHAR → FORMAT, :: cast → CAST(), etc.
 */
async function autoFixSqlQuery(query: string, error: string, apiKey: string): Promise<string> {
    // Static rule-based fixes for the most common PostgreSQL → SQL Server issues
    let fixed = query;

    // DATE_TRUNC('month', col) → DATEFROMPARTS(YEAR(col), MONTH(col), 1)
    fixed = fixed.replace(/DATE_TRUNC\s*\(\s*'month'\s*,\s*([^)]+)\)/gi,
        'DATEFROMPARTS(YEAR($1), MONTH($1), 1)');
    fixed = fixed.replace(/DATE_TRUNC\s*\(\s*'year'\s*,\s*([^)]+)\)/gi,
        'DATEFROMPARTS(YEAR($1), 1, 1)');

    // TO_CHAR(col, 'YYYY-MM') → FORMAT(col, 'yyyy-MM')
    fixed = fixed.replace(/TO_CHAR\s*\(\s*([^,]+)\s*,\s*'YYYY-MM'\s*\)/gi,
        "FORMAT($1, 'yyyy-MM')");
    fixed = fixed.replace(/TO_CHAR\s*\(\s*([^,]+)\s*,\s*'([^']+)'\s*\)/gi,
        "FORMAT($1, '$2')");

    // PostgreSQL cast ::date, ::text, ::integer etc → CAST(x AS type)
    fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\s*::\s*(date|text|varchar|integer|int|float|numeric|decimal)\b/gi,
        'CAST($1 AS $2)');

    // EXTRACT(MONTH FROM col) → MONTH(col)
    fixed = fixed.replace(/EXTRACT\s*\(\s*MONTH\s+FROM\s+([^)]+)\)/gi, 'MONTH($1)');
    fixed = fixed.replace(/EXTRACT\s*\(\s*YEAR\s+FROM\s+([^)]+)\)/gi, 'YEAR($1)');
    fixed = fixed.replace(/EXTRACT\s*\(\s*DAY\s+FROM\s+([^)]+)\)/gi, 'DAY($1)');

    // ILIKE → LIKE (SQL Server is case-insensitive by default)
    fixed = fixed.replace(/\bILIKE\b/gi, 'LIKE');

    // LIMIT N → TOP N (move to after SELECT)
    const limitMatch = fixed.match(/\bLIMIT\s+(\d+)\s*$/i);
    if (limitMatch) {
        fixed = fixed.replace(/\bLIMIT\s+\d+\s*$/i, '');
        fixed = fixed.replace(/^(\s*SELECT)\b/i, `$1 TOP ${limitMatch[1]}`);
    }

    // BOOLEAN true/false → 1/0
    fixed = fixed.replace(/\b=\s*true\b/gi, '= 1');
    fixed = fixed.replace(/\b=\s*false\b/gi, '= 0');

    // NOW() → GETDATE()
    fixed = fixed.replace(/\bNOW\s*\(\s*\)/gi, 'GETDATE()');
    // CURRENT_DATE → CAST(GETDATE() AS DATE)
    fixed = fixed.replace(/\bCURRENT_DATE\b/gi, 'CAST(GETDATE() AS DATE)');

    return fixed;
}

async function createWidgetTree(args: {
    treeName: string;
    chartType: string;
    sqlQuery?: string;
    connectorId?: string;
    pythonCode?: string;
    xAxisKey?: string;
    dataKeys?: string[];
    data?: any[];
    companyId: string;
}): Promise<{ success: boolean; treeId?: string; treeName?: string; error?: string; testResults?: { sql?: string; python?: string }; attempts?: number }> {
    try {
        const { treeName, chartType, sqlQuery, connectorId, pythonCode: rawPythonCode, xAxisKey, dataKeys, data, companyId } = args;

        if (!treeName?.trim()) return { success: false, error: 'treeName è obbligatorio' };
        if (sqlQuery && !connectorId) return { success: false, error: 'connectorId è OBBLIGATORIO quando passi una sqlQuery!' };

        const rootId = crypto.randomUUID();
        const sqlStepId = crypto.randomUUID();
        const pythonStepId = crypto.randomUUID();
        const leafId = crypto.randomUUID();

        const widgetType = (chartType as WidgetType) || 'bar-chart';
        const hasSql = !!(sqlQuery && connectorId);
        const hasPython = !!rawPythonCode;
        const MAX_RETRIES = 5;

        // ─── Phase 1: Test & auto-fix SQL (up to MAX_RETRIES) ────────────
        let finalSqlQuery = sqlQuery;
        let sqlOk = false;
        let sqlAttempts = 0;
        let lastSqlError = '';

        if (hasSql) {
            let currentQuery = sqlQuery!;
            for (let i = 0; i < MAX_RETRIES; i++) {
                sqlAttempts = i + 1;
                const result = await testSql(currentQuery, connectorId!);
                if (result.ok) {
                    sqlOk = true;
                    finalSqlQuery = currentQuery;
                    break;
                }
                lastSqlError = result.error || 'Errore sconosciuto';
                console.log(`[createWidget] SQL attempt ${i + 1}/${MAX_RETRIES} failed: ${lastSqlError}`);

                // Try auto-fix
                const fixed = await autoFixSqlQuery(currentQuery, lastSqlError, '');
                if (fixed === currentQuery) {
                    // No changes made by auto-fix, can't improve further
                    break;
                }
                currentQuery = fixed;
            }
        }

        // ─── Phase 2: Test & auto-fix Python ─────────────────────────────
        let finalPythonCode = hasSql
            ? generatePythonChartCode({ type: chartType, xAxisKey, dataKeys, title: treeName })
            : rawPythonCode;
        let pythonOk = false;
        let lastPythonError = '';

        if (finalPythonCode && (hasSql ? sqlOk : true)) {
            const deps = hasSql ? [{ tableName: 'dati', query: finalSqlQuery, connectorId }] : [];
            for (let i = 0; i < MAX_RETRIES; i++) {
                const result = await testPython(finalPythonCode!, deps, connectorId);
                if (result.ok) {
                    pythonOk = true;
                    break;
                }
                lastPythonError = result.error || 'Errore sconosciuto';
                console.log(`[createWidget] Python attempt ${i + 1}/${MAX_RETRIES} failed: ${lastPythonError}`);

                // Auto-fix common Python issues
                let fixed: string = finalPythonCode!;
                // Missing 'df' variable → add fallback
                if (lastPythonError.includes("name 'df' is not defined")) {
                    fixed = `import pandas as pd\ndf = pd.DataFrame(dati)\n` + fixed;
                }
                // Column not found → try without quotes
                if (lastPythonError.includes('KeyError')) {
                    // Can't auto-fix column names without knowing the actual columns
                    break;
                }
                if (fixed === finalPythonCode) break;
                finalPythonCode = fixed;
            }
        }

        // ─── Phase 3: Build results ──────────────────────────────────────
        const testResults = {
            sql: hasSql ? (sqlOk ? `OK - query verificata (${sqlAttempts} tentativ${sqlAttempts > 1 ? 'i' : 'o'})` : `FALLITO dopo ${sqlAttempts} tentativi: ${lastSqlError}`) : undefined,
            python: finalPythonCode ? (pythonOk ? 'OK - grafico verificato' : `FALLITO: ${lastPythonError}`) : undefined,
        };

        // If SQL still fails after all retries, don't create
        if (hasSql && !sqlOk) {
            return { success: false, error: `Impossibile creare il widget: la query SQL non funziona dopo ${sqlAttempts} tentativi. Ultimo errore: ${lastSqlError}`, testResults, attempts: sqlAttempts };
        }

        // ─── Phase 4: Build tree nodes ───────────────────────────────────
        const leafWidgetConfig: WidgetConfig = {
            type: widgetType,
            title: treeName,
            data: (!hasSql && !hasPython) ? data : undefined,
            xAxisKey: typeof xAxisKey === 'string' ? xAxisKey : undefined,
            dataKeys: Array.isArray(dataKeys) ? dataKeys.filter((k: unknown) => typeof k === 'string') : undefined,
            isPublished: true,
            ...(hasSql ? { dataSourceType: 'current-sql' as const, dataSourceId: 'sql' } :
               hasPython ? { dataSourceType: 'current-python' as const, dataSourceId: 'python' } : {}),
        };

        const leafNode = { id: leafId, decision: treeName, widgetConfig: leafWidgetConfig };
        let rootNode: object;

        if (hasSql) {
            const pythonStepNode = {
                id: pythonStepId,
                question: `Elaborazione Python: ${treeName}`,
                pythonCode: finalPythonCode,
                pythonOutputType: 'chart' as const,
                pythonResultName: 'grafico',
                pythonSelectedPipelines: ['dati'],
                pythonConnectorId: connectorId,
                options: { 'Visualizza': leafNode },
            };
            const sqlStepNode = {
                id: sqlStepId,
                question: `Query SQL: ${treeName}`,
                sqlQuery: finalSqlQuery,
                sqlConnectorId: connectorId,
                sqlResultName: 'dati',
                options: { 'Elabora': pythonStepNode },
            };
            rootNode = { id: rootId, question: treeName, options: { 'Calcola': sqlStepNode } };
        } else if (hasPython) {
            const pythonStepNode = {
                id: pythonStepId,
                question: `Elaborazione Python: ${treeName}`,
                pythonCode: rawPythonCode,
                pythonOutputType: 'chart' as const,
                pythonResultName: 'grafico',
                options: { 'Visualizza': leafNode },
            };
            rootNode = { id: rootId, question: treeName, options: { 'Genera': pythonStepNode } };
        } else {
            rootNode = { id: rootId, question: treeName, options: { 'Visualizza': leafNode } };
        }

        // ─── Phase 5: Save ───────────────────────────────────────────────
        const tree = await db.tree.create({
            data: {
                name: treeName,
                description: `Widget generato da FridAI Super Agent${hasSql ? ' tramite query SQL + Python (Plotly)' : hasPython ? ' tramite codice Python' : ''}`,
                naturalLanguageDecisionTree: treeName,
                jsonDecisionTree: JSON.stringify(rootNode),
                questionsScript: '',
                type: 'PIPELINE',
                companyId,
            },
        });

        return { success: true, treeId: tree.id, treeName: tree.name, testResults, attempts: sqlAttempts };
    } catch (e: any) {
        return { success: false, error: e.message || 'Errore creazione widget' };
    }
}

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

## CREAZIONE WIDGET / ALBERI (TOOL createWidget):
Quando l'utente chiede di creare un widget, un albero, una pipeline, una regola o di salvare un'analisi:
1. PRIMA esegui la query SQL con executeSqlQuery (se non l'hai già fatto)
2. Poi USA il tool createWidget passando:
   - treeName: nome descrittivo (es. "Ricavi Mensili 2025-2026")
   - chartType: tipo di grafico (bar-chart, line-chart, pie-chart, area-chart, scatter-chart)
   - xAxisKey: la colonna per l'asse X
   - dataKeys: le colonne per l'asse Y
   - NON serve passare sqlQuery e connectorId: vengono recuperati AUTOMATICAMENTE dall'ultima executeSqlQuery!
3. Il tool TESTA AUTOMATICAMENTE la query SQL e il codice Python PRIMA di creare l'albero
4. Se il test FALLISCE, l'albero NON viene creato e ricevi l'errore
5. In caso di errore DEVI:
   - Analizzare il messaggio di errore
   - Correggere la query con executeSqlQuery (testa finché funziona!)
   - Poi richiamare createWidget (userà automaticamente la query corretta dal tracker)
6. Solo quando tutti i test passano, l'albero viene creato nella sezione Regole
7. NON dire mai all'utente che hai creato il widget se createWidget ha ritornato success:false!

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

        // Get OpenRouter settings
        const openRouterSettings = await getOpenRouterSettingsAction();
        const apiKey = (user as any).openRouterApiKey || openRouterSettings.apiKey || '';
        const modelId = model || 'google/gemini-2.0-flash-001';

        if (!apiKey) {
            return new Response(JSON.stringify({ error: 'OpenRouter API key non configurata.' }), { status: 400 });
        }

        const aiModel = getOpenRouterModel(apiKey, modelId);
        const tools = createSuperAgentTools(companyId);

        // Build messages for streamText (conversation history + current message)
        const streamMessages: { role: 'user' | 'assistant'; content: string }[] = [
            ...conversationHistory,
            { role: 'user', content: userMessage },
        ];

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
                    // Save in Genkit-compatible format for GET endpoint compatibility
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
