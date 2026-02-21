'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { db } from '@/lib/db';
import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';

// Helper: recursively collect all nodes from a tree
function collectNodes(node: any, treeName: string, treeId: string, results: any[] = []): any[] {
    if (!node || typeof node === 'string') return results;
    if (node.ref || node.subTreeRef) return results;

    const nodeInfo: any = {
        treeId,
        treeName,
        nodeId: node.id || null,
    };

    if (node.question) nodeInfo.question = node.question;
    if (node.decision) nodeInfo.decision = node.decision;
    if (node.sqlQuery) nodeInfo.sqlQuery = node.sqlQuery;
    if (node.sqlResultName) nodeInfo.sqlResultName = node.sqlResultName;
    if (node.sqlConnectorId) nodeInfo.sqlConnectorId = node.sqlConnectorId;
    if (node.pythonCode) nodeInfo.pythonCode = node.pythonCode;
    if (node.pythonResultName) nodeInfo.pythonResultName = node.pythonResultName;
    if (node.pythonOutputType) nodeInfo.pythonOutputType = node.pythonOutputType;
    if (node.pythonConnectorId) nodeInfo.pythonConnectorId = node.pythonConnectorId;
    if (node.widgetConfig) nodeInfo.widgetConfig = node.widgetConfig;
    if (node.sqlSelectedPipelines) nodeInfo.sqlSelectedPipelines = node.sqlSelectedPipelines;
    if (node.pythonSelectedPipelines) nodeInfo.pythonSelectedPipelines = node.pythonSelectedPipelines;

    if (nodeInfo.sqlQuery || nodeInfo.pythonCode || nodeInfo.question || nodeInfo.decision) {
        results.push(nodeInfo);
    }

    if (node.options) {
        for (const [_optionName, child] of Object.entries(node.options)) {
            if (Array.isArray(child)) {
                for (const c of child) {
                    collectNodes(c, treeName, treeId, results);
                }
            } else {
                collectNodes(child, treeName, treeId, results);
            }
        }
    }

    return results;
}

// Helper: fetch all trees for a company directly from DB (no auth needed)
async function fetchTreesForCompany(companyId: string, type?: string) {
    const where: any = { companyId };
    if (type) where.type = type;

    return db.tree.findMany({
        where,
        select: {
            id: true,
            name: true,
            description: true,
            type: true,
            jsonDecisionTree: true,
        },
    });
}

// Helper: fetch a single tree directly from DB
async function fetchTreeById(treeId: string) {
    return db.tree.findUnique({
        where: { id: treeId },
        select: {
            id: true,
            name: true,
            description: true,
            type: true,
            jsonDecisionTree: true,
        },
    });
}

// Tool 0: List all SQL connectors for the company
const listSqlConnectors = ai.defineTool(
    {
        name: 'listSqlConnectors',
        description: 'Elenca tutti i connettori SQL (database) disponibili nella company. Usa questo tool per scoprire quali database sono disponibili e i loro ID, prima di eseguire query SQL.',
        inputSchema: z.object({
            companyId: z.string().describe("L'ID della company. Lo trovi nel system prompt."),
        }),
        outputSchema: z.string().describe('Lista JSON dei connettori SQL con id e nome.'),
    },
    async (input) => {
        try {
            const connectors = await db.connector.findMany({
                where: { companyId: input.companyId, type: 'SQL' },
                select: { id: true, name: true },
            });
            if (connectors.length === 0) return JSON.stringify({ connectors: [], message: 'Nessun connettore SQL trovato.' });
            return JSON.stringify({ connectors }, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: `Errore: ${e.message}` });
        }
    }
);

// Tool 1: List all trees and pipelines
const listTreesAndPipelines = ai.defineTool(
    {
        name: 'listTreesAndPipelines',
        description: 'Elenca tutti gli alberi decisionali e le pipeline disponibili nella company. Usa questo tool per scoprire quali dati e query sono disponibili.',
        inputSchema: z.object({
            companyId: z.string().describe("L'ID della company. Lo trovi nel system prompt."),
            type: z.string().optional().describe('Filtra per tipo: "RULE" o "PIPELINE". Ometti per vedere tutti.'),
        }),
        outputSchema: z.string().describe('Lista JSON degli alberi/pipeline disponibili con id, nome, descrizione e tipo.'),
    },
    async (input) => {
        try {
            const trees = await fetchTreesForCompany(input.companyId, input.type);
            if (trees.length === 0) return JSON.stringify({ error: 'Nessun albero trovato' });

            const summary = trees.map(t => {
                let nodeCount = 0;
                let nodesWithSQL = 0;
                let nodesWithPython = 0;
                try {
                    const tree = JSON.parse(t.jsonDecisionTree);
                    const nodes = collectNodes(tree, t.name, t.id);
                    nodeCount = nodes.length;
                    nodesWithSQL = nodes.filter(n => n.sqlQuery).length;
                    nodesWithPython = nodes.filter(n => n.pythonCode).length;
                } catch { /* ignore */ }

                return {
                    id: t.id,
                    name: t.name,
                    description: t.description,
                    type: t.type || 'RULE',
                    nodeCount,
                    nodesWithSQL,
                    nodesWithPython,
                };
            });

            return JSON.stringify(summary, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: `Errore: ${e.message}` });
        }
    }
);

// Tool 2: Get all nodes with their content from a tree
const getTreeContent = ai.defineTool(
    {
        name: 'getTreeContent',
        description: "Legge TUTTI i nodi di un albero con le loro query SQL, codice Python, widget e dipendenze. Usa questo per esplorare il contenuto completo di un albero.",
        inputSchema: z.object({
            treeId: z.string().describe("L'ID dell'albero da esplorare."),
        }),
        outputSchema: z.string().describe('Tutti i nodi con i dettagli in formato JSON.'),
    },
    async (input) => {
        try {
            const tree = await fetchTreeById(input.treeId);
            if (!tree) return JSON.stringify({ error: 'Albero non trovato' });

            const treeData = JSON.parse(tree.jsonDecisionTree);
            const nodes = collectNodes(treeData, tree.name, tree.id);

            return JSON.stringify({
                treeName: tree.name,
                treeDescription: tree.description,
                treeType: tree.type,
                totalNodes: nodes.length,
                nodes: nodes.slice(0, 50), // Limita per token
            }, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: `Errore: ${e.message}` });
        }
    }
);

// Tool 3: Search nodes across all trees
const searchNodesForQuery = ai.defineTool(
    {
        name: 'searchNodesForQuery',
        description: 'Cerca in TUTTI gli alberi della company i nodi che contengono una keyword specifica nelle query SQL, codice Python, nomi dei risultati, domande o decisioni.',
        inputSchema: z.object({
            companyId: z.string().describe("L'ID della company. Lo trovi nel system prompt."),
            searchTerm: z.string().describe('Il termine di ricerca (es. "fatturato", "vendite", "ordini", "capacita", "ore", "HR").'),
        }),
        outputSchema: z.string().describe('Lista dei nodi trovati con il contesto rilevante.'),
    },
    async (input) => {
        try {
            const trees = await fetchTreesForCompany(input.companyId);
            if (trees.length === 0) return JSON.stringify({ results: [], message: 'Nessun albero trovato' });

            const term = input.searchTerm.toLowerCase();
            const matches: any[] = [];

            for (const tree of trees) {
                try {
                    const treeData = JSON.parse(tree.jsonDecisionTree);
                    const nodes = collectNodes(treeData, tree.name, tree.id);

                    for (const node of nodes) {
                        const searchableText = [
                            node.sqlQuery,
                            node.pythonCode,
                            node.sqlResultName,
                            node.pythonResultName,
                            node.question,
                            node.decision,
                        ].filter(Boolean).join(' ').toLowerCase();

                        if (searchableText.includes(term)) {
                            matches.push(node);
                        }
                    }
                } catch { /* ignore malformed trees */ }
            }

            if (matches.length === 0) {
                return JSON.stringify({ results: [], message: `Nessun nodo trovato per "${input.searchTerm}". Prova con termini diversi o usa listTreesAndPipelines per vedere tutti gli alberi disponibili.` });
            }

            return JSON.stringify({ resultCount: matches.length, results: matches.slice(0, 20) }, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: `Errore: ${e.message}` });
        }
    }
);

// Tool 4: Execute SQL query (uses _bypassAuth)
const executeSqlQuery = ai.defineTool(
    {
        name: 'executeSqlQuery',
        description: 'Esegue una query SQL su un connettore database. Puoi eseguire sia query esistenti trovate nei nodi, sia query nuove scritte da te.',
        inputSchema: z.object({
            query: z.string().describe('La query SQL da eseguire.'),
            connectorId: z.string().describe("L'ID del connettore database da usare. Trovalo nei dettagli dei nodi (sqlConnectorId)."),
        }),
        outputSchema: z.string().describe('Risultati della query in formato JSON. Massimo 100 righe.'),
    },
    async (input) => {
        try {
            // Use _bypassAuth=true since we're calling from within Genkit (no HTTP session)
            const result = await executeSqlPreviewAction(input.query, input.connectorId, [], true);
            if (result.error) return JSON.stringify({ error: result.error });
            const data = result.data || [];
            const truncated = data.length > 100;
            return JSON.stringify({
                rowCount: data.length,
                data: data.slice(0, 100),
                truncated,
                columns: data.length > 0 ? Object.keys(data[0]) : [],
            }, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: `Errore esecuzione SQL: ${e.message}` });
        }
    }
);

// Tool 5: Execute Python code (uses _bypassAuth)
const executePythonCode = ai.defineTool(
    {
        name: 'executePythonCode',
        description: "Esegue codice Python. Puoi usarlo per analisi dati, calcoli o generazione di variabili.",
        inputSchema: z.object({
            code: z.string().describe('Il codice Python da eseguire.'),
            outputType: z.enum(['table', 'variable', 'chart']).describe("Tipo di output: 'table' per dati tabellari, 'variable' per valori singoli, 'chart' per grafici."),
            connectorId: z.string().optional().describe('ID del connettore (opzionale).'),
        }),
        outputSchema: z.string().describe('Risultati Python in formato JSON.'),
    },
    async (input) => {
        try {
            // Use _bypassAuth=true
            const result = await executePythonPreviewAction(
                input.code,
                input.outputType,
                {},
                [],
                input.connectorId,
                true
            );
            if (!result.success) return JSON.stringify({ error: result.error || 'Errore esecuzione Python' });

            return JSON.stringify({
                data: result.data?.slice(0, 100),
                variables: result.variables,
                columns: result.columns,
                rowCount: result.rowCount,
                stdout: result.stdout,
            }, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: `Errore esecuzione Python: ${e.message}` });
        }
    }
);

// Tool 6: Search Knowledge Base
const searchKnowledgeBase = ai.defineTool(
    {
        name: 'searchKnowledgeBase',
        description: 'Cerca nella Knowledge Base aziendale. Contiene correzioni e risposte validate dagli utenti.',
        inputSchema: z.object({
            query: z.string().describe('Termine di ricerca per trovare entry nella KB.'),
            companyId: z.string().describe("L'ID della company. Lo trovi nel system prompt."),
        }),
        outputSchema: z.string().describe('Entry della Knowledge Base trovate.'),
    },
    async (input) => {
        try {
            const term = input.query.toLowerCase();
            const entries = await db.knowledgeBaseEntry.findMany({
                where: {
                    companyId: input.companyId,
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

            if (entries.length === 0) {
                return JSON.stringify({ results: [], message: 'Nessuna entry trovata nella Knowledge Base.' });
            }

            return JSON.stringify({
                results: entries.map(e => ({
                    id: e.id,
                    question: e.question,
                    answer: e.answer,
                    tags: e.tags,
                    category: e.category,
                })),
            }, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: `Errore ricerca KB: ${e.message}` });
        }
    }
);

// Tool 7: Save to Knowledge Base
const saveToKnowledgeBase = ai.defineTool(
    {
        name: 'saveToKnowledgeBase',
        description: "Salva una nuova entry nella Knowledge Base. Usa quando l'utente ti corregge o per memorizzare risposte importanti.",
        inputSchema: z.object({
            question: z.string().describe('La domanda o il contesto originale.'),
            answer: z.string().describe('La risposta corretta o la correzione.'),
            tags: z.array(z.string()).describe('Tag per categorizzare (es. ["vendite", "fatturato", "SQL"]).'),
            category: z.string().optional().describe('Categoria (es. "SQL", "Python", "Procedure", "Dati").'),
            companyId: z.string().describe("L'ID della company. Lo trovi nel system prompt."),
        }),
        outputSchema: z.string().describe('Conferma del salvataggio.'),
    },
    async (input) => {
        try {
            const entry = await db.knowledgeBaseEntry.create({
                data: {
                    question: input.question,
                    answer: input.answer,
                    tags: input.tags,
                    category: input.category || 'Generale',
                    companyId: input.companyId,
                },
            });
            return JSON.stringify({ success: true, id: entry.id, message: 'Entry salvata nella Knowledge Base.' });
        } catch (e: any) {
            return JSON.stringify({ error: `Errore salvataggio KB: ${e.message}` });
        }
    }
);

// Helper: Map OpenRouter model IDs to Genkit Google AI model IDs
function mapToGenkitModel(openRouterModel?: string): string {
    if (!openRouterModel) return 'googleai/gemini-2.5-flash';

    // Map OpenRouter Google model IDs to Genkit format
    if (openRouterModel.startsWith('google/')) {
        const modelName = openRouterModel.replace('google/', '');
        // Remove version suffixes like -001, -002 etc.
        const cleanName = modelName.replace(/-\d{3}$/, '');
        return `googleai/${cleanName}`;
    }

    // For non-Google models, we'll use OpenRouter API directly (see below)
    return openRouterModel;
}

// Input/Output schemas
const SuperAgentInputSchema = z.object({
    messages: z.array(z.object({
        role: z.enum(['user', 'model', 'tool', 'system']),
        content: z.array(z.object({
            text: z.string().optional(),
            media: z.any().optional(),
            toolRequest: z.any().optional(),
            toolResponse: z.any().optional(),
        })),
    })).describe('La cronologia della conversazione.'),
    companyId: z.string().describe("L'ID della company dell'utente."),
    model: z.string().optional().describe('Il modello OpenRouter selezionato.'),
    apiKey: z.string().optional().describe("L'API key OpenRouter dell'utente."),
});
export type SuperAgentInput = z.infer<typeof SuperAgentInputSchema>;

const SuperAgentOutputSchema = z.string().describe("La risposta dell'agente.");
export type SuperAgentOutput = z.infer<typeof SuperAgentOutputSchema>;

export async function superAgentFlow(input: SuperAgentInput): Promise<SuperAgentOutput> {
    // Pre-load LIGHTWEIGHT tree summary (names only, no content - use tools for details)
    let treeSummary = '';
    try {
        const trees = await fetchTreesForCompany(input.companyId);
        if (trees.length > 0) {
            const summaries = trees.map(t => {
                let nodeCount = 0;
                let sqlCount = 0;
                let pythonCount = 0;
                try {
                    const treeData = JSON.parse(t.jsonDecisionTree);
                    const nodes = collectNodes(treeData, t.name, t.id);
                    nodeCount = nodes.length;
                    sqlCount = nodes.filter(n => n.sqlQuery).length;
                    pythonCount = nodes.filter(n => n.pythonCode).length;
                } catch { /* ignore */ }
                return `- ${t.name} (ID: ${t.id}, tipo: ${t.type || 'RULE'}, ${nodeCount} nodi, ${sqlCount} SQL, ${pythonCount} Python)`;
            });
            treeSummary = `\n\nALBERI DISPONIBILI:\n${summaries.join('\n')}`;
        }
    } catch { /* ignore */ }

    const systemMessage = {
        role: 'system' as const,
        content: [{
            text: `Sei FridAI, un super agente IA esperto nell'analisi dati aziendali. NON MOLLARE MAI. Sei tenace, persistente e creativo nel trovare i dati.

DATA DI OGGI: ${new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Company ID: ${input.companyId}

## RAGIONAMENTO STRUTTURATO (OBBLIGATORIO):
Prima di OGNI risposta finale, segui questo processo mentale:
1. **COMPRENDI**: Riformula internamente la richiesta dell'utente per assicurarti di averla capita
2. **PIANIFICA**: Identifica quali tool usare e in quale ordine
3. **ESEGUI**: Usa i tool uno alla volta, analizzando ogni risultato
4. **VERIFICA**: Prima di rispondere, controlla che i dati siano coerenti e completi
5. **RISPONDI**: Solo dopo aver verificato, presenta la risposta finale

## WORKFLOW (segui SEMPRE questi passi in ordine):
1. CERCA nella Knowledge Base (searchKnowledgeBase) - contiene query, script e info gia' validate
2. Se la KB non basta, cerca negli alberi (searchNodesForQuery) con DIVERSE keyword (sinonimi, varianti)
3. Se non trovi, usa listTreesAndPipelines per vedere TUTTI gli alberi, poi esplora quelli rilevanti con getTreeContent
4. Se non conosci il connettore DB, usa listSqlConnectors per vedere tutti i database disponibili
5. Quando trovi una query SQL, ESEGUILA con executeSqlQuery
6. Se la query fallisce, PROVA a correggerla o a scriverne una nuova basandoti sullo schema

## REGOLE DI PERSISTENZA (CRITICHE):
- NON ARRENDERTI MAI. Se un tool fallisce, prova un approccio diverso.
- Se una ricerca non trova nulla, prova con SINONIMI (es: "fatturato" → "vendite" → "ricavi" → "importo" → "imponibile" → "totale")
- Se un connettore non funziona, usa listSqlConnectors per trovare quello giusto
- Se una query SQL fallisce, analizza l'errore, correggi la query e riprova
- Se non trovi la tabella, prova a esplorare lo schema: SELECT table_name FROM information_schema.tables WHERE table_schema='public'
- Se non trovi le colonne, prova: SELECT column_name, data_type FROM information_schema.columns WHERE table_name='NOME_TABELLA'
- HAI fino a 30 tentativi con i tool. USALI TUTTI se necessario. Non dire mai "ho raggiunto il limite".
- Guarda query SIMILI in altri alberi per capire nomi tabelle e colonne corretti
- Se trovi una query che usa una tabella, usa quella come riferimento per costruire nuove query sulla stessa tabella

## AUTO-REVIEW (CONTROLLA PRIMA DI RISPONDERE):
Prima di presentare qualsiasi dato all'utente, fai questo controllo interno:
- I numeri hanno senso? (es: un fatturato negativo, una quantita' impossibile = probabilmente errore)
- La query ha restituito i dati corretti per la domanda? (non confondere colonne)
- Hai risposto ESATTAMENTE a cio' che l'utente ha chiesto? (non divagare)
- Le unita' di misura e i formati sono corretti? (euro, percentuali, date)
- Se qualcosa non torna, correggi PRIMA di rispondere. NON presentare dati che sai essere sbagliati.

## QUANDO SEI BLOCCATO - CHIEDI AIUTO ALL'UTENTE:
- Se non trovi la tabella giusta, chiedi: "Come si chiama la tabella? Hai qualche esempio di nome?"
- Se non sai quale connettore usare, elenca quelli disponibili e chiedi: "Quale di questi database contiene i dati che cerchi?"
- Se la query da' errore, mostra l'errore e chiedi: "Conosci il nome esatto delle colonne?"
- Se non trovi nulla negli alberi, chiedi: "In quale albero o contesto si trovano questi dati?"
- NON RESTARE IN SILENZIO. Piuttosto che fallire, fai una domanda specifica e utile.
- Quando chiedi, sii CONCRETO: mostra cosa hai provato e cosa ti serve per andare avanti

## DECOMPOSIZIONE PROBLEMI COMPLESSI:
Se l'utente chiede qualcosa di complesso (es: "confronta le vendite di quest'anno con l'anno scorso per regione"):
1. Scomponi in sotto-problemi: (a) trova vendite anno corrente, (b) trova vendite anno scorso, (c) raggruppa per regione, (d) calcola differenze
2. Risolvi ogni sotto-problema separatamente usando i tool
3. Combina i risultati in una risposta unica e coerente
4. Se un sotto-problema fallisce, continua con gli altri e segnala cosa manca

## AUTO-APPRENDIMENTO KNOWLEDGE BASE (FONDAMENTALE):
- Dopo OGNI risposta con dati, chiedi all'utente: "I dati sono corretti? Confermi o correggi?"
- Se l'utente CONFERMA che e' giusto → salva nella KB con saveToKnowledgeBase (domanda originale + risposta + query usata + connettore)
- Se l'utente CORREGGE → salva la CORREZIONE nella KB per non ripetere lo stesso errore
- Se scopri una nuova tabella, connettore o query funzionante → SALVALA nella KB automaticamente
- La KB e' la tua MEMORIA PERMANENTE. Alimentala continuamente.

## FORMATO RISPOSTE:
- Rispondi SEMPRE in italiano
- Per grafici: \`\`\`recharts {"type":"bar-chart","data":[...],"xAxisKey":"x","dataKeys":["y"],"title":"Titolo"} \`\`\`
  Tipi: bar-chart, line-chart, pie-chart, area-chart
- Per tabelle: formato markdown | ... |
- Per codice: \`\`\`sql o \`\`\`python
- Cita SEMPRE la fonte (nome albero, tabella, database)
- Se hai dubbi, FAI DOMANDE specifiche all'utente invece di inventare
- Sii CONCISO: vai dritto al punto, evita ripetizioni e spiegazioni inutili${treeSummary}`
        }],
    };

    // Truncate conversation history to avoid token overflow (keep last 20 messages)
    const MAX_HISTORY_MESSAGES = 20;
    const truncatedMessages = input.messages.length > MAX_HISTORY_MESSAGES
        ? input.messages.slice(-MAX_HISTORY_MESSAGES)
        : input.messages;

    // Sanitize message history
    const cleanHistory = truncatedMessages.map(m => {
        const cleanContent = m.content.map(c => {
            const part: any = {};
            if (c.text !== undefined && c.text !== null) part.text = c.text;
            if (c.media) part.media = c.media;

            if (c.toolRequest) {
                if (c.toolRequest.function && c.toolRequest.function.name) {
                    let args = {};
                    try {
                        args = typeof c.toolRequest.function.arguments === 'string'
                            ? JSON.parse(c.toolRequest.function.arguments)
                            : c.toolRequest.function.arguments;
                    } catch { /* ignore */ }

                    part.toolRequest = {
                        name: c.toolRequest.function.name,
                        input: args,
                        ref: c.toolRequest.id,
                    };
                } else {
                    part.toolRequest = c.toolRequest;
                }
            }

            if (c.toolResponse) {
                if (c.toolResponse.id && c.toolResponse.result) {
                    part.toolResponse = {
                        name: c.toolResponse.name || 'unknown',
                        output: c.toolResponse.result,
                        ref: c.toolResponse.id,
                    };
                } else {
                    part.toolResponse = c.toolResponse;
                }
            }

            if (Object.keys(part).length === 0) {
                return { text: '' };
            }
            return part;
        });
        return { role: m.role, content: cleanContent };
    });

    const fullHistory = [systemMessage, ...cleanHistory];

    const genkitModel = mapToGenkitModel(input.model);
    const isGoogleModel = genkitModel.startsWith('googleai/');

    if (isGoogleModel) {
        // Use Genkit directly for Google models (with tool support)
        const { text } = await ai.generate({
            model: genkitModel,
            messages: fullHistory,
            tools: [
                listSqlConnectors,
                listTreesAndPipelines,
                getTreeContent,
                searchNodesForQuery,
                executeSqlQuery,
                executePythonCode,
                searchKnowledgeBase,
                saveToKnowledgeBase,
            ],
        });
        return text;
    }

    // For non-Google models, use OpenRouter API with function calling
    return await callOpenRouterWithTools(input, fullHistory);
}

// OpenRouter tool definitions (OpenAI function calling format)
const openRouterTools = [
    {
        type: 'function' as const,
        function: {
            name: 'listSqlConnectors',
            description: 'Elenca tutti i connettori SQL (database) disponibili nella company. Usa per scoprire i database e i loro ID.',
            parameters: {
                type: 'object',
                properties: {
                    companyId: { type: 'string', description: "L'ID della company." },
                },
                required: ['companyId'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'listTreesAndPipelines',
            description: 'Elenca tutti gli alberi decisionali e le pipeline disponibili nella company.',
            parameters: {
                type: 'object',
                properties: {
                    companyId: { type: 'string', description: "L'ID della company." },
                    type: { type: 'string', description: 'Filtra per tipo: "RULE" o "PIPELINE".' },
                },
                required: ['companyId'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'getTreeContent',
            description: "Legge TUTTI i nodi di un albero con le loro query SQL, codice Python, widget e dipendenze.",
            parameters: {
                type: 'object',
                properties: {
                    treeId: { type: 'string', description: "L'ID dell'albero da esplorare." },
                },
                required: ['treeId'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'searchNodesForQuery',
            description: 'Cerca in TUTTI gli alberi della company i nodi che contengono una keyword specifica.',
            parameters: {
                type: 'object',
                properties: {
                    companyId: { type: 'string', description: "L'ID della company." },
                    searchTerm: { type: 'string', description: 'Il termine di ricerca.' },
                },
                required: ['companyId', 'searchTerm'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'executeSqlQuery',
            description: 'Esegue una query SQL su un connettore database.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'La query SQL da eseguire.' },
                    connectorId: { type: 'string', description: "L'ID del connettore database." },
                },
                required: ['query', 'connectorId'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'executePythonCode',
            description: 'Esegue codice Python per analisi dati, calcoli o generazione di variabili.',
            parameters: {
                type: 'object',
                properties: {
                    code: { type: 'string', description: 'Il codice Python da eseguire.' },
                    outputType: { type: 'string', enum: ['table', 'variable', 'chart'], description: 'Tipo di output.' },
                    connectorId: { type: 'string', description: 'ID del connettore (opzionale).' },
                },
                required: ['code', 'outputType'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'searchKnowledgeBase',
            description: 'Cerca nella Knowledge Base aziendale.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Termine di ricerca.' },
                    companyId: { type: 'string', description: "L'ID della company." },
                },
                required: ['query', 'companyId'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'saveToKnowledgeBase',
            description: "Salva una nuova entry nella Knowledge Base.",
            parameters: {
                type: 'object',
                properties: {
                    question: { type: 'string', description: 'La domanda o contesto.' },
                    answer: { type: 'string', description: 'La risposta corretta.' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Tag per categorizzare.' },
                    category: { type: 'string', description: 'Categoria.' },
                    companyId: { type: 'string', description: "L'ID della company." },
                },
                required: ['question', 'answer', 'tags', 'companyId'],
            },
        },
    },
];

// Tool execution dispatcher for OpenRouter function calls
async function executeToolCall(name: string, args: any): Promise<string> {
    switch (name) {
        case 'listSqlConnectors': {
            const connectors = await db.connector.findMany({
                where: { companyId: args.companyId, type: 'SQL' },
                select: { id: true, name: true },
            });
            if (connectors.length === 0) return JSON.stringify({ connectors: [], message: 'Nessun connettore SQL trovato.' });
            return JSON.stringify({ connectors }, null, 2);
        }
        case 'listTreesAndPipelines': {
            const trees = await fetchTreesForCompany(args.companyId, args.type);
            if (trees.length === 0) return JSON.stringify({ error: 'Nessun albero trovato' });
            const summary = trees.map(t => {
                let nodeCount = 0, nodesWithSQL = 0, nodesWithPython = 0;
                try {
                    const treeData = JSON.parse(t.jsonDecisionTree);
                    const nodes = collectNodes(treeData, t.name, t.id);
                    nodeCount = nodes.length;
                    nodesWithSQL = nodes.filter(n => n.sqlQuery).length;
                    nodesWithPython = nodes.filter(n => n.pythonCode).length;
                } catch { /* ignore */ }
                return { id: t.id, name: t.name, description: t.description, type: t.type || 'RULE', nodeCount, nodesWithSQL, nodesWithPython };
            });
            return JSON.stringify(summary, null, 2);
        }
        case 'getTreeContent': {
            const tree = await fetchTreeById(args.treeId);
            if (!tree) return JSON.stringify({ error: 'Albero non trovato' });
            const treeData = JSON.parse(tree.jsonDecisionTree);
            const nodes = collectNodes(treeData, tree.name, tree.id);
            return JSON.stringify({ treeName: tree.name, treeDescription: tree.description, treeType: tree.type, totalNodes: nodes.length, nodes: nodes.slice(0, 50) }, null, 2);
        }
        case 'searchNodesForQuery': {
            const trees = await fetchTreesForCompany(args.companyId);
            const term = args.searchTerm.toLowerCase();
            const matches: any[] = [];
            for (const tree of trees) {
                try {
                    const treeData = JSON.parse(tree.jsonDecisionTree);
                    const nodes = collectNodes(treeData, tree.name, tree.id);
                    for (const node of nodes) {
                        const searchableText = [node.sqlQuery, node.pythonCode, node.sqlResultName, node.pythonResultName, node.question, node.decision].filter(Boolean).join(' ').toLowerCase();
                        if (searchableText.includes(term)) matches.push(node);
                    }
                } catch { /* ignore */ }
            }
            if (matches.length === 0) return JSON.stringify({ results: [], message: `Nessun nodo trovato per "${args.searchTerm}".` });
            return JSON.stringify({ resultCount: matches.length, results: matches.slice(0, 20) }, null, 2);
        }
        case 'executeSqlQuery': {
            const result = await executeSqlPreviewAction(args.query, args.connectorId, [], true);
            if (result.error) return JSON.stringify({ error: result.error });
            const data = result.data || [];
            return JSON.stringify({ rowCount: data.length, data: data.slice(0, 100), columns: data.length > 0 ? Object.keys(data[0]) : [] }, null, 2);
        }
        case 'executePythonCode': {
            const result = await executePythonPreviewAction(args.code, args.outputType, {}, [], args.connectorId, true);
            if (!result.success) return JSON.stringify({ error: result.error || 'Errore esecuzione Python' });
            return JSON.stringify({ data: result.data?.slice(0, 100), variables: result.variables, columns: result.columns, rowCount: result.rowCount, stdout: result.stdout }, null, 2);
        }
        case 'searchKnowledgeBase': {
            const term = args.query.toLowerCase();
            const entries = await db.knowledgeBaseEntry.findMany({
                where: { companyId: args.companyId, OR: [{ question: { contains: term, mode: 'insensitive' } }, { answer: { contains: term, mode: 'insensitive' } }, { tags: { hasSome: [term] } }] },
                take: 10, orderBy: { updatedAt: 'desc' },
            });
            if (entries.length === 0) return JSON.stringify({ results: [], message: 'Nessuna entry nella KB.' });
            return JSON.stringify({ results: entries.map(e => ({ id: e.id, question: e.question, answer: e.answer, tags: e.tags, category: e.category })) }, null, 2);
        }
        case 'saveToKnowledgeBase': {
            const entry = await db.knowledgeBaseEntry.create({
                data: { question: args.question, answer: args.answer, tags: args.tags || [], category: args.category || 'Generale', companyId: args.companyId },
            });
            return JSON.stringify({ success: true, id: entry.id });
        }
        default:
            return JSON.stringify({ error: `Tool sconosciuto: ${name}` });
    }
}

// Call OpenRouter API with function calling (OpenAI-compatible)
async function callOpenRouterWithTools(input: SuperAgentInput, fullHistory: any[]): Promise<string> {
    if (!input.apiKey) {
        throw new Error('API key OpenRouter mancante. Configura la chiave nelle Impostazioni.');
    }

    // Convert Genkit message format to OpenAI format
    const openaiMessages = fullHistory.map(m => {
        const text = m.content?.map((c: any) => c.text).filter(Boolean).join('\n') || '';
        const role = m.role === 'model' ? 'assistant' : m.role;
        return { role, content: text };
    });

    const MAX_TOOL_ROUNDS = 30;
    let lastError = '';
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${input.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: input.model,
                    messages: openaiMessages,
                    tools: openRouterTools,
                    tool_choice: 'auto',
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                lastError = errorData?.error?.message || `HTTP ${response.status}`;
                // If rate limited, wait and retry
                if (response.status === 429) {
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                throw new Error(lastError);
            }

            const data = await response.json();
            const choice = data.choices?.[0];
            if (!choice) {
                lastError = 'Nessuna risposta dal modello';
                continue;
            }

            const message = choice.message;

            // If the model made tool calls, execute them and continue
            if (message.tool_calls && message.tool_calls.length > 0) {
                // Add assistant message with tool calls
                openaiMessages.push(message);

                // Execute each tool call
                for (const toolCall of message.tool_calls) {
                    const fnName = toolCall.function.name;
                    let fnArgs: any = {};
                    try { fnArgs = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }

                    let result: string;
                    try {
                        result = await executeToolCall(fnName, fnArgs);
                    } catch (e: any) {
                        result = JSON.stringify({ error: e.message, suggestion: 'Prova un approccio diverso o usa listSqlConnectors per verificare i connettori disponibili.' });
                    }

                    openaiMessages.push({
                        role: 'tool',
                        content: result,
                        tool_call_id: toolCall.id,
                    } as any);
                }
                continue; // Next round
            }

            // No tool calls - return the final text response
            return message.content || 'Nessuna risposta.';
        } catch (e: any) {
            lastError = e.message;
            // Don't crash on individual round errors - let the model try again
            if (round < MAX_TOOL_ROUNDS - 1) {
                openaiMessages.push({
                    role: 'assistant',
                    content: `[Errore interno round ${round + 1}: ${e.message}. Riprovo con approccio diverso...]`,
                } as any);
                continue;
            }
        }
    }

    return `Non sono riuscito a completare la ricerca dopo ${MAX_TOOL_ROUNDS} tentativi. Ultimo errore: ${lastError}. Puoi darmi piu' dettagli? Ad esempio il nome esatto della tabella, del database o del connettore da usare.`;
}
