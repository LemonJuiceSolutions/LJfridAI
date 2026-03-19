#!/usr/bin/env node
/**
 * MCP Server for FridAI Super Agent Tools.
 * Spawned as a child process by Claude CLI.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';

const contextPath = process.env.FRIDAI_MCP_CONTEXT;
if (!contextPath) { console.error('FRIDAI_MCP_CONTEXT env var not set'); process.exit(1); }

const context = JSON.parse(readFileSync(contextPath, 'utf-8'));
const { companyId, baseUrl, mcpSecret } = context;

// ─── SQL Tracker (mirrors OpenRouter tracker behavior) ───────────────────────
// Captures the last successful SQL execution so createWidget can auto-fill
// sqlQuery + connectorId even if the LLM forgets to pass them.
const tracker: {
    lastSql: { query: string; connectorId: string; columns: string[] } | null;
} = { lastSql: null };

async function callTool(tool: string, params: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${baseUrl}/api/internal/mcp-tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mcp-secret': mcpSecret },
        body: JSON.stringify({ tool, params }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
}

const server = new Server(
    { name: 'fridai-super-agent', version: '1.0.0' },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'superListConnectors',
            description: 'List all SQL database connectors available.',
            inputSchema: { type: 'object' as const, properties: {}, required: [] },
        },
        {
            name: 'superListTrees',
            description: 'List all decision trees and pipelines. Optionally filter by type: "RULE" or "PIPELINE".',
            inputSchema: {
                type: 'object' as const,
                properties: { type: { type: 'string', description: '"RULE" or "PIPELINE"' } },
            },
        },
        {
            name: 'superGetTreeContent',
            description: 'Read all nodes of a decision tree with their SQL queries, Python code, and configurations.',
            inputSchema: {
                type: 'object' as const,
                properties: { treeId: { type: 'string', description: 'ID of the tree to explore' } },
                required: ['treeId'],
            },
        },
        {
            name: 'superSearchNodes',
            description: 'Search all trees for nodes containing a keyword in SQL, Python code, names, or decisions.',
            inputSchema: {
                type: 'object' as const,
                properties: { keyword: { type: 'string', description: 'Search keyword' } },
                required: ['keyword'],
            },
        },
        {
            name: 'superExecuteSql',
            description: 'Execute a SQL query on a database connector. Returns up to 100 rows.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    query: { type: 'string', description: 'SQL query to execute' },
                    connectorId: { type: 'string', description: 'Database connector ID' },
                },
                required: ['query', 'connectorId'],
            },
        },
        {
            name: 'superExecutePython',
            description: 'Execute Python code (Pandas/Plotly). OutputType: "table", "variable", or "chart".',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    code: { type: 'string', description: 'Python code to execute' },
                    outputType: { type: 'string', description: '"table", "variable", or "chart"' },
                    connectorId: { type: 'string', description: 'Optional database connector ID' },
                },
                required: ['code', 'outputType'],
            },
        },
        {
            name: 'superSearchKB',
            description: 'Search the company knowledge base for saved entries.',
            inputSchema: {
                type: 'object' as const,
                properties: { query: { type: 'string', description: 'Search term' } },
                required: ['query'],
            },
        },
        {
            name: 'superCreateWidget',
            description: 'Create a widget/pipeline tree with auto-tested SQL + Python (Plotly) code. The tree will have nodes: SQL query → Python chart → Widget. Tests SQL and Python up to 5 times with auto-fix before saving. You MUST pass sqlQuery and connectorId, OR they will be auto-filled from the last successful superExecuteSql call.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    treeName: { type: 'string', description: 'Name of the widget/tree to create' },
                    chartType: { type: 'string', description: 'Chart type: "bar", "line", "area", "pie", "scatter"' },
                    sqlQuery: { type: 'string', description: 'The SQL query (auto-filled from last superExecuteSql if omitted)' },
                    connectorId: { type: 'string', description: 'The database connector ID (auto-filled from last superExecuteSql if omitted)' },
                    xAxisKey: { type: 'string', description: 'Column name for X axis (from SQL result columns)' },
                    dataKeys: { type: 'array', items: { type: 'string' }, description: 'Column names for Y axis / data series (from SQL result columns)' },
                },
                required: ['treeName', 'chartType'],
            },
        },
        {
            name: 'superSaveToKB',
            description: 'Save an entry to the knowledge base.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    question: { type: 'string' },
                    answer: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } },
                    category: { type: 'string' },
                },
                required: ['question', 'answer', 'tags'],
            },
        },
    ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        const params: Record<string, unknown> = { ...args };
        if (companyId && !params.companyId) params.companyId = companyId;

        // ─── superExecuteSql: track successful queries ───────────────────
        if (name === 'superExecuteSql') {
            const result = await callTool(name, params);
            // Parse result to check if successful and extract columns
            try {
                const parsed = JSON.parse(result);
                if (!parsed.error && parsed.columns) {
                    tracker.lastSql = {
                        query: params.query as string,
                        connectorId: params.connectorId as string,
                        columns: parsed.columns as string[],
                    };
                }
            } catch { /* ignore parse errors */ }
            return { content: [{ type: 'text', text: result }] };
        }

        // ─── superCreateWidget: auto-fill from tracker ───────────────────
        if (name === 'superCreateWidget') {
            // Auto-fill sqlQuery and connectorId from tracker if not provided
            if (!params.sqlQuery && tracker.lastSql) {
                params.sqlQuery = tracker.lastSql.query;
            }
            if (!params.connectorId && tracker.lastSql) {
                params.connectorId = tracker.lastSql.connectorId;
            }
            // Auto-fill xAxisKey and dataKeys from tracker columns if not provided
            if (tracker.lastSql?.columns && tracker.lastSql.columns.length >= 2) {
                if (!params.xAxisKey) {
                    params.xAxisKey = tracker.lastSql.columns[0];
                }
                if (!params.dataKeys) {
                    params.dataKeys = tracker.lastSql.columns.slice(1);
                }
            }
            const result = await callTool(name, params);
            return { content: [{ type: 'text', text: result }] };
        }

        // ─── All other tools: pass through ───────────────────────────────
        const result = await callTool(name, params);
        return { content: [{ type: 'text', text: result }] };
    } catch (error: any) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => { console.error('MCP server error:', err); process.exit(1); });
