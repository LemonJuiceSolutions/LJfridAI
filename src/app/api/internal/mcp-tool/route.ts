/**
 * Internal API for MCP tool execution.
 * Called by MCP server child processes spawned by Claude CLI.
 * Protected by a shared secret passed via env var.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
    doExploreDbSchema, doExploreTableColumns, doTestSqlQuery,
    doSearchKB, doListConnectors, doSaveToKB, doBrowseOtherQueries,
} from '@/ai/tools/sql-agent-tools';
import { getCachedParsedMap } from '@/lib/database-map-cache';
import {
    doPyExploreDbSchema, doPyExploreTableColumns, doPyTestSqlQuery,
    doPyTestCode, doPySearchKB, doPyListConnectors, doPySaveToKB, doPyBrowseOtherScripts,
    doLoadScriptFromFile, doEditScript, doReadScriptLines,
} from '@/ai/tools/python-agent-tools';
import { db } from '@/lib/db';
import { executeSqlPreviewAction, executePythonPreviewAction, processDescriptionAction } from '@/app/actions';
import { createWidgetTree } from '@/lib/create-widget';

export const maxDuration = 120;

// ─── Super-agent tool implementations (inline, call Prisma / server actions) ──

async function doSuperListConnectors(params: { companyId: string }) {
    const connectors = await db.connector.findMany({
        where: { companyId: params.companyId, type: 'SQL' },
        select: { id: true, name: true },
    });
    return JSON.stringify({ connectors }, null, 2);
}

async function doSuperListTrees(params: { companyId: string; type?: string }) {
    const where: any = { companyId: params.companyId };
    if (params.type) where.type = params.type;
    const trees = await db.tree.findMany({
        where,
        select: { id: true, name: true, description: true, type: true },
    });
    return JSON.stringify({ count: trees.length, trees }, null, 2);
}

async function doSuperGetTreeContent(params: { treeId: string }) {
    const tree = await db.tree.findUnique({
        where: { id: params.treeId },
        select: { id: true, name: true, description: true, type: true, jsonDecisionTree: true },
    });
    if (!tree) return JSON.stringify({ error: 'Albero non trovato' });
    const treeData = JSON.parse(tree.jsonDecisionTree);
    function collectNodes(node: any, results: any[] = []): any[] {
        if (!node) return results;
        results.push({
            id: node.id, question: node.question, decision: node.decision,
            sqlQuery: node.sqlQuery, pythonCode: node.pythonCode,
        });
        if (node.options) {
            for (const opt of node.options) {
                if (opt.nextNode) collectNodes(opt.nextNode, results);
            }
        }
        return results;
    }
    const nodes = collectNodes(treeData);
    return JSON.stringify({ treeName: tree.name, treeType: tree.type, totalNodes: nodes.length, nodes: nodes.slice(0, 50) }, null, 2);
}

async function doSuperSearchNodes(params: { keyword: string; companyId: string }) {
    const trees = await db.tree.findMany({
        where: { companyId: params.companyId },
        select: { id: true, name: true, jsonDecisionTree: true },
    });
    const term = params.keyword.toLowerCase();
    const results: any[] = [];
    for (const tree of trees) {
        try {
            const data = JSON.parse(tree.jsonDecisionTree);
            function search(node: any) {
                if (!node) return;
                const text = JSON.stringify(node).toLowerCase();
                if (text.includes(term)) {
                    results.push({ treeId: tree.id, treeName: tree.name, nodeId: node.id, question: node.question, decision: node.decision });
                }
                if (node.options) for (const opt of node.options) if (opt.nextNode) search(opt.nextNode);
            }
            search(data);
        } catch { /* skip malformed trees */ }
    }
    return JSON.stringify({ matchCount: results.length, results: results.slice(0, 20) }, null, 2);
}

async function doSuperExecuteSql(params: { query: string; connectorId: string }) {
    const result = await executeSqlPreviewAction(params.query, params.connectorId, [], true);
    if (result.error) return JSON.stringify({ error: result.error });
    const data = result.data || [];
    const columns = data.length > 0 ? Object.keys(data[0]) : [];
    return JSON.stringify({ rowCount: data.length, data: data.slice(0, 100), truncated: data.length > 100, columns }, null, 2);
}

async function doSuperExecutePython(params: { code: string; outputType: string; connectorId?: string }) {
    const result = await executePythonPreviewAction(params.code, params.outputType as any, {}, [], params.connectorId, true);
    if (!result.success) return JSON.stringify({ error: result.error || 'Errore esecuzione Python' });
    return JSON.stringify({ data: result.data?.slice(0, 100), variables: result.variables, columns: result.columns, rowCount: result.rowCount, html: result.html ? `(HTML output, ${result.html.length} chars)` : undefined, stdout: result.stdout }, null, 2);
}

async function doSuperSearchKB(params: { query: string; companyId: string }) {
    const term = params.query.toLowerCase();
    const entries = await db.knowledgeBaseEntry.findMany({
        where: {
            companyId: params.companyId,
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
    return JSON.stringify({ results: entries.map(e => ({ id: e.id, question: e.question, answer: e.answer, tags: e.tags, category: e.category })) }, null, 2);
}

async function doSuperSaveToKB(params: { question: string; answer: string; tags: string[]; category?: string; companyId: string }) {
    const entry = await db.knowledgeBaseEntry.create({ data: { question: params.question, answer: params.answer, tags: params.tags, category: params.category || 'Generale', companyId: params.companyId } });
    return JSON.stringify({ success: true, id: entry.id });
}

async function doSuperCreateWidget(params: {
    treeName: string; chartType: string; sqlQuery?: string; connectorId?: string;
    pythonCode?: string; xAxisKey?: string; dataKeys?: string[]; data?: any[]; companyId: string;
}) {
    const result = await createWidgetTree(params);
    return JSON.stringify(result, null, 2);
}

async function doSuperCreateTree(params: {
    description: string; companyId: string; type?: 'RULE' | 'PIPELINE';
}) {
    // Fetch an OpenRouter API key: try all users in the company
    const companyUsers = await db.user.findMany({
        where: { companyId: params.companyId },
        select: { openRouterApiKey: true, openRouterModel: true },
    });
    // Find first user with a non-empty API key
    const companyUser = companyUsers.find(u => u.openRouterApiKey && u.openRouterApiKey.trim() !== '');
    const openRouterConfig = companyUser?.openRouterApiKey
        ? { apiKey: companyUser.openRouterApiKey, model: companyUser.openRouterModel || 'google/gemini-2.0-flash-001' }
        : undefined;

    if (!openRouterConfig) {
        return JSON.stringify({ error: 'Nessuna API key OpenRouter configurata. Configura una API key nelle impostazioni utente.' });
    }

    const result = await processDescriptionAction(
        params.description,
        '', // name will be auto-generated
        params.type || 'RULE',
        openRouterConfig,
        params.companyId, // bypass auth
    );

    if (result.error) return JSON.stringify({ error: result.error });
    return JSON.stringify({
        success: true,
        treeId: result.data?.id,
        treeName: result.data?.name,
        treeType: result.data?.type,
        message: `Albero "${result.data?.name}" creato con successo!`,
    }, null, 2);
}

async function doSuperCreateTreeDirect(params: {
    name: string;
    description: string;
    jsonDecisionTree: string;
    naturalLanguageDecisionTree: string;
    questionsScript?: string;
    companyId: string;
    type?: 'RULE' | 'PIPELINE';
}) {
    // Validate that jsonDecisionTree is valid JSON
    try {
        const parsed = typeof params.jsonDecisionTree === 'string'
            ? JSON.parse(params.jsonDecisionTree)
            : params.jsonDecisionTree;
        // Re-stringify to ensure it's clean
        const jsonStr = typeof params.jsonDecisionTree === 'string'
            ? params.jsonDecisionTree
            : JSON.stringify(params.jsonDecisionTree);

        const createdTree = await db.tree.create({
            data: {
                name: params.name,
                description: params.description,
                jsonDecisionTree: jsonStr,
                naturalLanguageDecisionTree: params.naturalLanguageDecisionTree || '',
                questionsScript: params.questionsScript || '',
                type: params.type || 'RULE',
                companyId: params.companyId,
            },
        });

        return JSON.stringify({
            success: true,
            treeId: createdTree.id,
            treeName: createdTree.name,
            treeType: createdTree.type,
            message: `Albero "${createdTree.name}" creato con successo!`,
        }, null, 2);
    } catch (e: any) {
        if (e instanceof SyntaxError) {
            return JSON.stringify({ error: `JSON dell'albero non valido: ${e.message}` });
        }
        return JSON.stringify({ error: `Errore creazione albero: ${e.message}` });
    }
}

async function doSuperExploreDbSchemaChunked(params: {
    connectorId: string; offset?: number; limit?: number; searchTerm?: string;
}) {
    const fullResult = await doExploreDbSchema({ connectorId: params.connectorId });
    const parsed = JSON.parse(fullResult);
    if (parsed.error) return fullResult;

    let tables = parsed.tables || [];
    const totalTables = tables.length;
    const offset = params.offset || 0;
    const limit = Math.min(params.limit || 50, 100);

    if (params.searchTerm) {
        const term = params.searchTerm.toLowerCase();
        tables = tables.filter((t: any) =>
            (t.table_name || '').toLowerCase().includes(term) ||
            (t.description || '').toLowerCase().includes(term)
        );
    }

    const filteredTotal = tables.length;
    const chunk = tables.slice(offset, offset + limit);
    const hasMore = offset + limit < filteredTotal;

    return JSON.stringify({
        tables: chunk,
        pagination: { totalTables, filteredTotal: params.searchTerm ? filteredTotal : totalTables, offset, limit, returned: chunk.length, hasMore, nextOffset: hasMore ? offset + limit : null },
        source: parsed.source || 'unknown',
    }, null, 2);
}

// ─── Tool map ────────────────────────────────────────────────────────────────

const TOOL_MAP: Record<string, (params: any) => Promise<string>> = {
    // SQL agent tools
    exploreDbSchema: doExploreDbSchema,
    exploreTableColumns: doExploreTableColumns,
    testSqlQuery: doTestSqlQuery,
    searchKnowledgeBase: doSearchKB,
    listSqlConnectors: doListConnectors,
    sqlSaveToKnowledgeBase: doSaveToKB,
    browseOtherQueries: doBrowseOtherQueries,
    // Python agent tools
    pyExploreDbSchema: doPyExploreDbSchema,
    pyExploreTableColumns: doPyExploreTableColumns,
    pyTestSqlQuery: doPyTestSqlQuery,
    pyTestCode: doPyTestCode,
    pySearchKnowledgeBase: doPySearchKB,
    pyListSqlConnectors: doPyListConnectors,
    pySaveToKnowledgeBase: doPySaveToKB,
    pyBrowseOtherScripts: doPyBrowseOtherScripts,
    // Python agent — updateNodeScript (writes script directly to the node in the tree)
    updateNodeScript: async (params: { script: string; outputType?: string; nodeId?: string; treeId?: string }) => {
        // This tool is called by Claude CLI to sync edited code back to the node's pythonCode field.
        // It needs nodeId and treeId from the MCP context (injected by CallToolRequestSchema handler).
        const { script, outputType, nodeId, treeId } = params;
        if (!nodeId || !treeId) {
            return JSON.stringify({ error: 'nodeId e treeId richiesti per aggiornare il nodo.' });
        }
        try {
            const tree = await db.tree.findUnique({ where: { id: treeId }, select: { jsonDecisionTree: true } });
            if (!tree) return JSON.stringify({ error: 'Albero non trovato.' });

            const json = JSON.parse(tree.jsonDecisionTree);
            // Navigate to the node using the nodeId path (e.g. "root.options['xls']")
            const _ = await import('lodash');
            const node = _.default.get(json, nodeId.replace('root.', ''));
            if (!node || typeof node !== 'object') {
                return JSON.stringify({ error: `Nodo "${nodeId}" non trovato nell'albero.` });
            }

            node.pythonCode = script;
            if (outputType) node.pythonOutputType = outputType;

            await db.tree.update({
                where: { id: treeId },
                data: { jsonDecisionTree: JSON.stringify(json) },
            });

            // Also update the AgentConversation script
            const conv = await db.agentConversation.findFirst({
                where: { nodeId, agentType: 'python' },
            });
            if (conv) {
                await db.agentConversation.update({
                    where: { id: conv.id },
                    data: { script },
                });
            }

            const lineCount = script.split('\n').length;
            const sizeKB = Math.round(Buffer.byteLength(script, 'utf-8') / 1024);
            return JSON.stringify({ success: true, lineCount, sizeKB, message: `Script aggiornato nel nodo (${lineCount} righe, ${sizeKB}KB).` });
        } catch (e: any) {
            return JSON.stringify({ error: e.message });
        }
    },
    loadScriptFromFile: async (params: { filePath: string; nodeId?: string; treeId?: string }) => {
        const { filePath, nodeId, treeId } = params;
        const result = await doLoadScriptFromFile({ filePath });
        // If successful, also update the node's pythonCode
        try {
            const parsed = JSON.parse(result);
            if (parsed.success && parsed.content && nodeId && treeId) {
                const tree = await db.tree.findUnique({ where: { id: treeId }, select: { jsonDecisionTree: true } });
                if (tree) {
                    const json = JSON.parse(tree.jsonDecisionTree);
                    const _ = await import('lodash');
                    const node = _.default.get(json, nodeId.replace('root.', ''));
                    if (node && typeof node === 'object') {
                        node.pythonCode = parsed.content;
                        await db.tree.update({ where: { id: treeId }, data: { jsonDecisionTree: JSON.stringify(json) } });
                        const conv = await db.agentConversation.findFirst({ where: { nodeId, agentType: 'python' } });
                        if (conv) await db.agentConversation.update({ where: { id: conv.id }, data: { script: parsed.content } });
                    }
                }
            }
        } catch { /* ignore DB errors — the file content is still returned */ }
        return result;
    },
    editScript: async (params: { oldString: string; newString: string; replaceAll?: boolean; nodeId?: string; treeId?: string }) => {
        const { oldString, newString, replaceAll, nodeId, treeId } = params;
        // Get current script from the node
        let currentScript = '';
        if (nodeId && treeId) {
            const tree = await db.tree.findUnique({ where: { id: treeId }, select: { jsonDecisionTree: true } });
            if (tree) {
                const json = JSON.parse(tree.jsonDecisionTree);
                const _ = await import('lodash');
                const node = _.default.get(json, nodeId.replace('root.', ''));
                if (node) currentScript = node.pythonCode || '';
            }
        }
        const result = await doEditScript({ oldString, newString, currentScript, replaceAll });
        // If successful, update the node
        try {
            const parsed = JSON.parse(result);
            if (parsed.success && parsed.updatedScript && nodeId && treeId) {
                const tree = await db.tree.findUnique({ where: { id: treeId }, select: { jsonDecisionTree: true } });
                if (tree) {
                    const json = JSON.parse(tree.jsonDecisionTree);
                    const _ = await import('lodash');
                    const node = _.default.get(json, nodeId.replace('root.', ''));
                    if (node && typeof node === 'object') {
                        node.pythonCode = parsed.updatedScript;
                        await db.tree.update({ where: { id: treeId }, data: { jsonDecisionTree: JSON.stringify(json) } });
                        const conv = await db.agentConversation.findFirst({ where: { nodeId, agentType: 'python' } });
                        if (conv) await db.agentConversation.update({ where: { id: conv.id }, data: { script: parsed.updatedScript } });
                    }
                }
            }
        } catch { /* ignore */ }
        return result;
    },
    readScriptLines: async (params: { startLine?: number; endLine?: number; searchPattern?: string; nodeId?: string; treeId?: string }) => {
        const { startLine, endLine, searchPattern, nodeId, treeId } = params;
        let currentScript = '';
        if (nodeId && treeId) {
            const tree = await db.tree.findUnique({ where: { id: treeId }, select: { jsonDecisionTree: true } });
            if (tree) {
                const json = JSON.parse(tree.jsonDecisionTree);
                const _ = await import('lodash');
                const node = _.default.get(json, nodeId.replace('root.', ''));
                if (node) currentScript = node.pythonCode || '';
            }
        }
        return doReadScriptLines({ currentScript, startLine, endLine, searchPattern });
    },
    // Super-agent tools
    superListConnectors: doSuperListConnectors,
    superListTrees: doSuperListTrees,
    superGetTreeContent: doSuperGetTreeContent,
    superSearchNodes: doSuperSearchNodes,
    superExecuteSql: doSuperExecuteSql,
    superExecutePython: doSuperExecutePython,
    superSearchKB: doSuperSearchKB,
    superSaveToKB: doSuperSaveToKB,
    superCreateWidget: doSuperCreateWidget,
    superCreateTree: doSuperCreateTree,
    superCreateTreeDirect: doSuperCreateTreeDirect,
    superExploreDbSchemaChunked: doSuperExploreDbSchemaChunked,
};

export async function POST(req: NextRequest) {
    // Verify shared secret
    const secret = req.headers.get('x-mcp-secret');
    const expectedSecret = process.env.MCP_INTERNAL_SECRET || 'fridai-mcp-local';
    if (secret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { tool, params } = await req.json();

        const handler = TOOL_MAP[tool];
        if (!handler) {
            return NextResponse.json({ error: `Unknown tool: ${tool}` }, { status: 400 });
        }

        const result = await handler(params);
        return NextResponse.json({ result });
    } catch (error: any) {
        console.error('[mcp-tool] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
