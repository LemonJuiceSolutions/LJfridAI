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
import {
    doPyExploreDbSchema, doPyExploreTableColumns, doPyTestSqlQuery,
    doPyTestCode, doPySearchKB, doPyListConnectors, doPySaveToKB, doPyBrowseOtherScripts,
} from '@/ai/tools/python-agent-tools';
import { db } from '@/lib/db';
import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';
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
    return JSON.stringify({ data: result.data?.slice(0, 100), variables: result.variables, columns: result.columns, rowCount: result.rowCount, stdout: result.stdout }, null, 2);
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
