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

export const maxDuration = 120;

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
                    return JSON.stringify({ rowCount: data.length, data: data.slice(0, 100), truncated: data.length > 100, columns: data.length > 0 ? Object.keys(data[0]) : [] }, null, 2);
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
            onFinish: async ({ text }) => {
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
