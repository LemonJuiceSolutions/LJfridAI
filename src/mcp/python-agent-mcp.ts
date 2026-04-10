#!/usr/bin/env node
/**
 * MCP Server for FridAI Python Agent Tools.
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
const { connectorId, companyId, baseUrl, mcpSecret, nodeId, treeId } = context;

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
    { name: 'fridai-python-agent', version: '1.0.0' },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: 'pyTestCode',
            description: 'Execute Python code (Pandas/Plotly) and return the output. Use outputType "html" for charts and tables, "text" for raw text.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    code: { type: 'string', description: 'Python code to execute' },
                    outputType: { type: 'string', description: '"html" or "text"', default: 'html' },
                    sqlQuery: { type: 'string', description: 'Optional SQL query whose results become the `df` DataFrame' },
                },
                required: ['code', 'outputType'],
            },
        },
        {
            name: 'pyExploreDbSchema',
            description: 'List all tables in the database with row counts and descriptions.',
            inputSchema: { type: 'object' as const, properties: {}, required: [] },
        },
        {
            name: 'pyExploreTableColumns',
            description: 'Get column details for a specific table.',
            inputSchema: {
                type: 'object' as const,
                properties: { tableName: { type: 'string', description: 'Table name' } },
                required: ['tableName'],
            },
        },
        {
            name: 'pyTestSqlQuery',
            description: 'Execute a SQL query and return results as JSON.',
            inputSchema: {
                type: 'object' as const,
                properties: { query: { type: 'string', description: 'SQL SELECT query' } },
                required: ['query'],
            },
        },
        {
            name: 'pySearchKnowledgeBase',
            description: 'Search the knowledge base for saved Python scripts and answers.',
            inputSchema: {
                type: 'object' as const,
                properties: { query: { type: 'string', description: 'Search query' } },
                required: ['query'],
            },
        },
        {
            name: 'pyListSqlConnectors',
            description: 'List all database connectors available.',
            inputSchema: { type: 'object' as const, properties: {}, required: [] },
        },
        {
            name: 'pySaveToKnowledgeBase',
            description: 'Save a useful script/answer pair to the knowledge base.',
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
            name: 'pyBrowseOtherScripts',
            description: 'Browse Python/SQL scripts from other nodes in the pipeline.',
            inputSchema: { type: 'object' as const, properties: {}, required: [] },
        },
        {
            name: 'updateNodeScript',
            description: 'Aggiorna il codice Python nel nodo corrente. Usa QUESTO tool per sincronizzare il codice con il box editor dell\'app. Dopo aver letto/modificato un file .py con Read/Edit, chiama questo tool per mettere il contenuto nel nodo. Il codice apparirà direttamente nel box Python dell\'editor.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    script: { type: 'string', description: 'Il codice Python completo da inserire nel nodo.' },
                    outputType: { type: 'string', description: 'Tipo di output: "html", "table", "chart", "variable". Default: "html".', default: 'html' },
                },
                required: ['script'],
            },
        },
        {
            name: 'loadScriptFromFile',
            description: 'Carica un file Python (.py) dal disco nel nodo corrente. Il contenuto viene automaticamente impostato come codice del nodo. NON ripetere il contenuto nel messaggio. Dì solo "Script caricato da [nome] (X righe, YKB)".',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    filePath: { type: 'string', description: 'Il percorso assoluto del file da caricare.' },
                },
                required: ['filePath'],
            },
        },
        {
            name: 'editScript',
            description: 'Modifica lo script corrente nel nodo con find-and-replace. Fornisci la stringa esatta da trovare (oldString) e la sostituzione (newString). Lo script viene aggiornato automaticamente nel nodo.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    oldString: { type: 'string', description: 'La stringa ESATTA da trovare nello script corrente.' },
                    newString: { type: 'string', description: 'La stringa sostitutiva.' },
                    replaceAll: { type: 'boolean', description: 'Se true, sostituisce TUTTE le occorrenze. Default: false.' },
                },
                required: ['oldString', 'newString'],
            },
        },
        {
            name: 'readScriptLines',
            description: 'Leggi righe specifiche o cerca pattern nello script corrente del nodo. Utile per script grandi.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    startLine: { type: 'number', description: 'Riga iniziale (1-based). Default: 1.' },
                    endLine: { type: 'number', description: 'Riga finale. Default: startLine + 99.' },
                    searchPattern: { type: 'string', description: 'Pattern regex da cercare.' },
                },
                required: [],
            },
        },
    ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        const params: Record<string, unknown> = { ...args };
        if (connectorId && !params.connectorId) params.connectorId = connectorId;
        if (companyId && !params.companyId) params.companyId = companyId;
        // Inject nodeId and treeId for node-related tools
        if (['updateNodeScript', 'loadScriptFromFile', 'editScript', 'readScriptLines'].includes(name)) {
            if (nodeId && !params.nodeId) params.nodeId = nodeId;
            if (treeId && !params.treeId) params.treeId = treeId;
        }
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
