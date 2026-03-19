#!/usr/bin/env node
/**
 * MCP Server for FridAI SQL Agent Tools.
 * Spawned as a child process by Claude CLI.
 * Calls back to the Next.js app via HTTP for tool execution.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';

// Read context from file
const contextPath = process.env.FRIDAI_MCP_CONTEXT;
if (!contextPath) {
    console.error('FRIDAI_MCP_CONTEXT env var not set');
    process.exit(1);
}

const context = JSON.parse(readFileSync(contextPath, 'utf-8'));
const { connectorId, companyId, baseUrl, mcpSecret } = context;

async function callTool(tool: string, params: Record<string, unknown>): Promise<string> {
    const res = await fetch(`${baseUrl}/api/internal/mcp-tool`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-mcp-secret': mcpSecret,
        },
        body: JSON.stringify({ tool, params }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
}

const server = new Server(
    { name: 'fridai-sql-agent', version: '1.0.0' },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'exploreDbSchema',
            description: 'List all tables in the database with their row counts and descriptions. Use this first to understand the available data.',
            inputSchema: { type: 'object' as const, properties: {}, required: [] },
        },
        {
            name: 'exploreTableColumns',
            description: 'Get detailed column information for a specific table including data types, nullable, primary keys.',
            inputSchema: {
                type: 'object' as const,
                properties: { tableName: { type: 'string', description: 'Exact table name to explore' } },
                required: ['tableName'],
            },
        },
        {
            name: 'testSqlQuery',
            description: 'Execute a SQL query and return up to 50 rows of results. Use this to test queries before finalizing.',
            inputSchema: {
                type: 'object' as const,
                properties: { query: { type: 'string', description: 'SQL SELECT query to execute' } },
                required: ['query'],
            },
        },
        {
            name: 'searchKnowledgeBase',
            description: 'Search the company knowledge base for previously saved SQL queries and answers.',
            inputSchema: {
                type: 'object' as const,
                properties: { query: { type: 'string', description: 'Search query' } },
                required: ['query'],
            },
        },
        {
            name: 'listSqlConnectors',
            description: 'List all database connectors available to the company.',
            inputSchema: { type: 'object' as const, properties: {}, required: [] },
        },
        {
            name: 'sqlSaveToKnowledgeBase',
            description: 'Save a useful query/answer pair to the knowledge base for future reference.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    question: { type: 'string' },
                    answer: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } },
                    category: { type: 'string' },
                },
                required: ['question', 'answer', 'tags', 'category'],
            },
        },
        {
            name: 'browseOtherQueries',
            description: 'Browse SQL queries from other nodes in the same pipeline for context.',
            inputSchema: { type: 'object' as const, properties: {}, required: [] },
        },
    ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        // Inject context (connectorId / companyId) into params
        const params: Record<string, unknown> = { ...args };
        if (connectorId && !params.connectorId) params.connectorId = connectorId;
        if (companyId && !params.companyId) params.companyId = companyId;

        const result = await callTool(name, params);
        return { content: [{ type: 'text', text: result }] };
    } catch (error: any) {
        return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    console.error('MCP server error:', err);
    process.exit(1);
});
