#!/usr/bin/env node
/**
 * MCP Server for Like AI Said
 * 
 * Exposes decision tree functionality via Model Context Protocol
 * for use with AI assistants like Claude, Cursor, etc.
 * 
 * Usage:
 *   npx ts-node src/mcp/server.ts
 *   
 * Configure in Claude Desktop:
 *   {
 *     "mcpServers": {
 *       "likeaisaid": {
 *         "command": "npx",
 *         "args": ["ts-node", "/path/to/LikeAiSaid/src/mcp/server.ts"]
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// API Base URL - can be configured via environment variable
const API_BASE_URL = process.env.LIKEAISAID_API_URL || 'http://localhost:3000';

// Helper function to make API calls
async function apiCall(endpoint: string, options?: RequestInit) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });
    return response.json();
}

// Create MCP server
const server = new Server(
    {
        name: 'likeaisaid',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
            resources: {},
        },
    }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'create_tree',
                description: 'Crea un nuovo albero decisionale da una descrizione testuale del processo',
                inputSchema: {
                    type: 'object',
                    properties: {
                        description: {
                            type: 'string',
                            description: 'Descrizione in linguaggio naturale del processo decisionale',
                        },
                        openRouterApiKey: {
                            type: 'string',
                            description: 'API Key OpenRouter (opzionale)',
                        },
                        openRouterModel: {
                            type: 'string',
                            description: 'Modello OpenRouter da usare (opzionale, default: google/gemini-2.0-flash-001)',
                        },
                    },
                    required: ['description'],
                },
            },
            {
                name: 'list_trees',
                description: 'Elenca tutti gli alberi decisionali disponibili',
                inputSchema: {
                    type: 'object',
                    properties: {},
                },
            },
            {
                name: 'get_tree',
                description: 'Ottieni i dettagli completi di un albero decisionale specifico',
                inputSchema: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'ID dell\'albero decisionale',
                        },
                    },
                    required: ['id'],
                },
            },
            {
                name: 'query_tree',
                description: 'Interroga un albero decisionale con una domanda o situazione specifica. Usa DetAI per navigare l\'albero.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'ID dell\'albero decisionale da interrogare',
                        },
                        question: {
                            type: 'string',
                            description: 'Domanda o descrizione della situazione da analizzare',
                        },
                        history: {
                            type: 'string',
                            description: 'Storico della conversazione (opzionale)',
                        },
                        currentAnswer: {
                            type: 'string',
                            description: 'Risposta corrente dell\'utente (opzionale)',
                        },
                    },
                    required: ['id', 'question'],
                },
            },
            {
                name: 'delete_tree',
                description: 'Elimina un albero decisionale',
                inputSchema: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'ID dell\'albero da eliminare',
                        },
                    },
                    required: ['id'],
                },
            },
        ],
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case 'create_tree': {
                const result = await apiCall('/api/trees', {
                    method: 'POST',
                    body: JSON.stringify({
                        description: args?.description,
                        openRouterApiKey: args?.openRouterApiKey,
                        openRouterModel: args?.openRouterModel,
                    }),
                });
                return {
                    content: [
                        {
                            type: 'text',
                            text: result.success
                                ? `✅ Albero creato con successo!\n\nID: ${result.tree.id}\nNome: ${result.tree.name}\n\nDescrizione in linguaggio naturale:\n${result.tree.naturalLanguageDecisionTree}`
                                : `❌ Errore: ${result.error}`,
                        },
                    ],
                };
            }

            case 'list_trees': {
                const result = await apiCall('/api/trees');
                if (!result.success) {
                    return {
                        content: [{ type: 'text', text: `❌ Errore: ${result.error}` }],
                    };
                }
                const treeList = result.trees
                    .map((t: any) => `- **${t.name}** (ID: ${t.id})\n  ${t.description.substring(0, 100)}...`)
                    .join('\n\n');
                return {
                    content: [
                        {
                            type: 'text',
                            text: result.trees.length > 0
                                ? `📋 Alberi disponibili (${result.trees.length}):\n\n${treeList}`
                                : '📋 Nessun albero decisionale trovato.',
                        },
                    ],
                };
            }

            case 'get_tree': {
                const result = await apiCall(`/api/trees/${args?.id}`);
                if (!result.success) {
                    return {
                        content: [{ type: 'text', text: `❌ Errore: ${result.error}` }],
                    };
                }
                return {
                    content: [
                        {
                            type: 'text',
                            text: `🌳 **${result.tree.name}**\n\n${result.tree.naturalLanguageDecisionTree}\n\n---\n**Script Domande:**\n${result.tree.questionsScript}`,
                        },
                    ],
                };
            }

            case 'query_tree': {
                const result = await apiCall(`/api/trees/${args?.id}/query`, {
                    method: 'POST',
                    body: JSON.stringify({
                        question: args?.question,
                        history: args?.history,
                        currentAnswer: args?.currentAnswer,
                    }),
                });
                if (!result.success) {
                    return {
                        content: [{ type: 'text', text: `❌ Errore: ${result.error}` }],
                    };
                }
                const d = result.diagnosis;
                let response = `🔍 **Diagnosi:**\n\n${d.question}`;
                if (d.options && d.options.length > 0) {
                    response += `\n\n**Opzioni:**\n${d.options.map((o: string) => `- ${o}`).join('\n')}`;
                }
                if (d.isFinalDecision) {
                    response += '\n\n✅ *Questa è la decisione finale.*';
                }
                return {
                    content: [{ type: 'text', text: response }],
                };
            }

            case 'delete_tree': {
                const result = await apiCall(`/api/trees/${args?.id}`, {
                    method: 'DELETE',
                });
                return {
                    content: [
                        {
                            type: 'text',
                            text: result.success
                                ? `✅ Albero eliminato con successo.`
                                : `❌ Errore: ${result.error}`,
                        },
                    ],
                };
            }

            default:
                return {
                    content: [{ type: 'text', text: `Tool non riconosciuto: ${name}` }],
                    isError: true,
                };
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore sconosciuto';
        return {
            content: [{ type: 'text', text: `❌ Errore durante l'esecuzione: ${message}` }],
            isError: true,
        };
    }
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: 'trees://list',
                mimeType: 'application/json',
                name: 'Lista Alberi Decisionali',
                description: 'Elenco di tutti gli alberi decisionali disponibili',
            },
        ],
    };
});

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    if (uri === 'trees://list') {
        const result = await apiCall('/api/trees');
        return {
            contents: [
                {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    }

    throw new Error(`Risorsa non trovata: ${uri}`);
});

// Start server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Like AI Said MCP Server running on stdio');
}

main().catch(console.error);
