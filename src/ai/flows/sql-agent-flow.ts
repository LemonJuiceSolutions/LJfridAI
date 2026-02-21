'use server';
/**
 * @fileOverview SQL agent with tool-based exploration - never gives up.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { db } from '@/lib/db';
import { executeSqlPreviewAction } from '@/app/actions';
import { type AgentInput, type AgentOutput } from '@/ai/schemas/agent-schema';
import { getOpenRouterSettingsAction } from '@/actions/openrouter';
import { resolveModel, runOpenRouterAgentLoop, type OpenRouterTool, type OpenRouterUsage } from '@/ai/openrouter-utils';

// --- Tool Implementations (Shared) ---

async function doExploreDbSchema(input: { connectorId: string }) {
    try {
        const result = await executeSqlPreviewAction(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
            input.connectorId, [], true
        );
        if (result.error) return JSON.stringify({ error: result.error });
        return JSON.stringify({ tables: result.data || [] }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

async function doExploreTableColumns(input: { connectorId: string, tableName: string }) {
    try {
        const result = await executeSqlPreviewAction(
            `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${input.tableName.replace(/'/g, "''")}' ORDER BY ordinal_position`,
            input.connectorId, [], true
        );
        if (result.error) return JSON.stringify({ error: result.error });
        return JSON.stringify({ table: input.tableName, columns: result.data || [] }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

async function doTestSqlQuery(input: { query: string, connectorId: string }) {
    try {
        const result = await executeSqlPreviewAction(input.query, input.connectorId, [], true);
        if (result.error) return JSON.stringify({ error: result.error, suggestion: 'Controlla nomi tabella e colonne. Usa exploreDbSchema e exploreTableColumns per verificare.' });
        const data = result.data || [];
        return JSON.stringify({
            success: true,
            rowCount: data.length,
            columns: data.length > 0 ? Object.keys(data[0]) : [],
            sampleData: data.slice(0, 5),
        }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message, suggestion: 'Verifica la sintassi SQL e i nomi delle tabelle/colonne.' });
    }
}

async function doSearchKB(input: { query: string, companyId: string }) {
    try {
        const term = input.query.toLowerCase();
        const entries = await db.knowledgeBaseEntry.findMany({
            where: {
                companyId: input.companyId,
                OR: [
                    { question: { contains: term, mode: 'insensitive' } },
                    { answer: { contains: term, mode: 'insensitive' } },
                    { tags: { hasSome: [term] } },
                ],
            },
            take: 5,
            orderBy: { updatedAt: 'desc' },
        });
        if (entries.length === 0) return JSON.stringify({ results: [], message: 'Nessuna entry trovata.' });
        return JSON.stringify({ results: entries.map(e => ({ question: e.question, answer: e.answer, category: e.category })) }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

async function doListConnectors(input: { companyId: string }) {
    try {
        const connectors = await db.connector.findMany({
            where: { companyId: input.companyId, type: 'SQL' },
            select: { id: true, name: true },
        });
        return JSON.stringify({ connectors }, null, 2);
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

async function doSaveToKB(input: { question: string, answer: string, tags: string[], category: string, companyId: string }) {
    try {
        await db.knowledgeBaseEntry.create({
            data: {
                question: input.question,
                answer: input.answer,
                tags: input.tags,
                category: input.category,
                companyId: input.companyId,
            },
        });
        return JSON.stringify({ success: true, message: 'Salvato nella Knowledge Base!' });
    } catch (e: any) {
        return JSON.stringify({ error: e.message });
    }
}

// --- Genkit Tools Definitions (Legacy / Google) ---

const exploreDbSchema = ai.defineTool(
    {
        name: 'exploreDbSchema',
        description: 'Esplora lo schema del database: elenca tutte le tabelle disponibili. Usa questo per scoprire quali tabelle esistono.',
        inputSchema: z.object({ connectorId: z.string().describe("L'ID del connettore database.") }),
        outputSchema: z.string(),
    },
    doExploreDbSchema
);

const exploreTableColumns = ai.defineTool(
    {
        name: 'exploreTableColumns',
        description: 'Esplora le colonne di una tabella specifica con tipo di dato. Usa per capire la struttura prima di scrivere query.',
        inputSchema: z.object({ connectorId: z.string().describe("L'ID del connettore database."), tableName: z.string().describe("Il nome della tabella da esplorare.") }),
        outputSchema: z.string(),
    },
    doExploreTableColumns
);

const testSqlQuery = ai.defineTool(
    {
        name: 'testSqlQuery',
        description: 'Esegue una query SQL di test per verificare che funzioni e vedere i risultati. Usa per validare query prima di proporle.',
        inputSchema: z.object({ query: z.string().describe("La query SQL da testare."), connectorId: z.string().describe("L'ID del connettore database.") }),
        outputSchema: z.string(),
    },
    doTestSqlQuery
);

const searchKB = ai.defineTool(
    {
        name: 'searchKnowledgeBase',
        description: 'Cerca nella Knowledge Base aziendale query SQL simili, strutture di tabelle e correzioni precedenti.',
        inputSchema: z.object({ query: z.string().describe('Termine di ricerca.'), companyId: z.string().describe("L'ID della company.") }),
        outputSchema: z.string(),
    },
    doSearchKB
);

const listConnectors = ai.defineTool(
    {
        name: 'listSqlConnectors',
        description: 'Elenca tutti i connettori SQL (database) disponibili.',
        inputSchema: z.object({ companyId: z.string().describe("L'ID della company.") }),
        outputSchema: z.string(),
    },
    doListConnectors
);

const saveToKB = ai.defineTool(
    {
        name: 'sqlSaveToKnowledgeBase',
        description: 'Salva una informazione nella Knowledge Base aziendale. Usa dopo aver trovato una query corretta o quando l\'utente conferma un risultato.',
        inputSchema: z.object({
            question: z.string().describe('La domanda o descrizione (es. "Query per fatturato mensile").'),
            answer: z.string().describe('La risposta: la query SQL, lo schema trovato, o la correzione.'),
            tags: z.array(z.string()).describe('Tag per la ricerca futura (es. ["fatturato", "vendite", "sql"]).'),
            category: z.string().describe('Categoria: "SQL", "Schema", "Correzione", "Best Practice".'),
            companyId: z.string().describe("L'ID della company."),
        }),
        outputSchema: z.string(),
    },
    doSaveToKB
);

// --- OpenRouter Tools Definitions ---

const openRouterTools: OpenRouterTool[] = [
    {
        type: 'function',
        function: {
            name: 'exploreDbSchema',
            description: 'Esplora lo schema del database: elenca tutte le tabelle disponibili.',
            parameters: {
                type: 'object',
                properties: {
                    connectorId: { type: 'string', description: "L'ID del connettore database." }
                },
                required: ['connectorId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'exploreTableColumns',
            description: 'Esplora le colonne di una tabella specifica.',
            parameters: {
                type: 'object',
                properties: {
                    connectorId: { type: 'string', description: "L'ID del connettore database." },
                    tableName: { type: 'string', description: "Il nome della tabella da esplorare." }
                },
                required: ['connectorId', 'tableName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'testSqlQuery',
            description: 'Esegue una query SQL di test per verificare che funzioni.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: "La query SQL da testare." },
                    connectorId: { type: 'string', description: "L'ID del connettore database." }
                },
                required: ['query', 'connectorId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'searchKnowledgeBase',
            description: 'Cerca nella Knowledge Base aziendale.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Termine di ricerca.' },
                    companyId: { type: 'string', description: "L'ID della company." }
                },
                required: ['query', 'companyId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'listSqlConnectors',
            description: 'Elenca tutti i connettori SQL disponibili.',
            parameters: {
                type: 'object',
                properties: {
                    companyId: { type: 'string', description: "L'ID della company." }
                },
                required: ['companyId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'sqlSaveToKnowledgeBase',
            description: 'Salva una informazione nella Knowledge Base aziendale.',
            parameters: {
                type: 'object',
                properties: {
                    question: { type: 'string', description: 'La domanda o descrizione.' },
                    answer: { type: 'string', description: 'La risposta o query.' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Tag per la ricerca.' },
                    category: { type: 'string', description: 'Categoria.' },
                    companyId: { type: 'string', description: "L'ID della company." }
                },
                required: ['question', 'answer', 'tags', 'category', 'companyId']
            }
        }
    }
];

// --- Main Agent Flow ---

// Robust JSON parser that handles updatedScript with curly braces
function parseAgentJson(text: string): any | null {
    // Try each '{' as a potential start of the JSON response
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== '{') continue;
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let j = i; j < text.length; j++) {
            const ch = text[j];
            if (escape) { escape = false; continue; }
            if (ch === '\\' && inString) { escape = true; continue; }
            if (ch === '"' && !escape) { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    try {
                        const candidate = text.substring(i, j + 1);
                        const parsed = JSON.parse(candidate);
                        if (parsed && typeof parsed.message === 'string') return parsed;
                    } catch { /* try next '{' */ }
                    break;
                }
            }
        }
    }
    return null;
}

export async function sqlAgentChat(input: AgentInput): Promise<AgentOutput> {
    try {
        // 1. Get User/Model Settings
        let apiKey = input.openRouterConfig?.apiKey;
        let model = input.openRouterConfig?.model;

        // If not provided in input, fetch from DB
        if (!apiKey || !model) {
            const settings = await getOpenRouterSettingsAction();
            if (settings.apiKey) apiKey = settings.apiKey;
            if (settings.model) model = settings.model;
        }

        // 2. Resolve Model Provider
        const { provider, modelName } = resolveModel(model);

        // 3. Build Context & Prompts
        let context = '';

        if (input.tableSchema && Object.keys(input.tableSchema).length > 0) {
            context += '\n\nTABELLE GIA\' NOTE:\n';
            for (const [tableName, columns] of Object.entries(input.tableSchema)) {
                context += `- ${tableName}: ${Array.isArray(columns) ? (columns as string[]).join(', ') : 'schema non disponibile'}\n`;
            }
        }

        if (input.inputTables && Object.keys(input.inputTables).length > 0) {
            context += '\nDATI DI ESEMPIO:\n';
            for (const [tableName, data] of Object.entries(input.inputTables)) {
                if (Array.isArray(data) && data.length > 0) {
                    context += `${tableName}: ${JSON.stringify((data as any[]).slice(0, 2))}\n`;
                }
            }
        }

        let historyContext = '';
        if (input.conversationHistory && input.conversationHistory.length > 0) {
            const recent = input.conversationHistory.slice(-10);
            historyContext = '\nCRONOLOGIA:\n' + recent.map(m => `${m.role === 'user' ? 'Utente' : 'Agente'}: ${m.content}`).join('\n');
        }

        const connectorInfo = input.connectorId ? `\nConnettore DB attuale: ${input.connectorId}` : '';
        const companyInfo = input.companyId ? `\nCompany ID: ${input.companyId}` : '';

        const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const systemPrompt = `Sei un agente AI esperto in SQL. Stai utilizzando il modello: ${modelName}. NON MOLLARE MAI. Sei tenace e persistente.
DATA DI OGGI: ${today}

${connectorInfo}${companyInfo}

## CONTESTO PIATTAFORMA (IMPORTANTE):
- I CONNETTORI forniscono automaticamente token e credenziali
- Quando l'utente preme "Esegui anteprima", il connettore e' gia' configurato con le credenziali
- NON DIRE MAI all'utente di "configurare manualmente i token" - sono GIA' gestiti dalla piattaforma
- Se un test fallisce per problemi di connessione, modifica comunque la query come richiesto

## TABELLE IN INPUT - ARRANGIATI (CRITICO):
- Le tabelle in ingresso e i loro dati di esempio sono forniti nel contesto (sezione "TABELLE GIA' NOTE" e "DATI DI ESEMPIO").
- LEGGI SEMPRE i nomi delle colonne dai dati di esempio e dallo schema fornito. NON chiedere MAI all'utente i nomi delle colonne o la struttura - HAI GIA' TUTTO.
- Se l'utente menziona un concetto (es. "fatturato mensile"), cerca nei dati di esempio e nello schema la colonna che corrisponde. Usa i nomi ESATTI che trovi nei dati.
- Se non sei sicuro quale colonna corrisponde, usa exploreTableColumns per scoprirlo o testSqlQuery con "SELECT TOP 3 * FROM tabella" - NON chiedere all'utente.
- ARRANGIATI: se qualcosa non e' chiaro, esplora il DB con exploreDbSchema e exploreTableColumns prima di chiedere. Chiedi all'utente SOLO per decisioni di business (es. "quale metrica preferisci?"), MAI per cose tecniche che puoi scoprire da solo.
- ALL'INIZIO di ogni richiesta, se hai un connectorId, esplora PROATTIVAMENTE il database: prima exploreDbSchema per vedere le tabelle, poi exploreTableColumns sulle tabelle rilevanti. NON aspettare che l'utente te lo chieda.
- ATTENZIONE AI TIPI DI DATO: Prima di usare SUM(), AVG() o operazioni matematiche, verifica il tipo delle colonne. Se una colonna e' nvarchar/varchar, usa CAST(colonna AS DECIMAL) o TRY_CAST(colonna AS DECIMAL). Errori come "Operand data type nvarchar is invalid for sum operator" si risolvono SEMPRE con il CAST.

## CONNETTORE DB (NON CHIEDERE MAI):
- Se hai un connectorId nel contesto, USALO direttamente.
- Se NON hai un connectorId, scrivi comunque la query SQL corretta in updatedScript e aggiungi nel messaggio: "Il connettore verra' ereditato automaticamente dalle tabelle in input."
- NON impostare MAI needsClarification: true per chiedere il connettore. Il sistema gestisce i connettori automaticamente (eredita dalle dipendenze o usa il primo disponibile).
- NON CHIEDERE MAI "quale connettore vuoi usare?" - MAI. Il connettore e' gestito dal sistema, non dall'utente nella chat.
- Se hai tabelle in input, il connettore viene ereditato da quelle. SCRIVI la query e basta.

## REGOLA D'ORO: FAI, NON SPIEGARE
- Quando l'utente chiede una modifica, MODIFICA LA QUERY e mettila in updatedScript
- NON ripetere la stessa risposta piu' volte - se l'utente insiste, significa che non hai capito
- LEGGI ATTENTAMENTE il codice che l'utente incolla: contiene la soluzione o degli indizi
- Se l'utente ti mostra del codice funzionante come esempio, IMPARA da quello
- NON dare risposte generiche - AGISCI sulla query
- NON CHIEDERE dati che hai gia': se hai lo schema e i dati di esempio, USALI. L'utente si aspetta che tu ti arrangi.

## IL TUO WORKFLOW:
1. ALL'INIZIO di ogni richiesta: cerca nella KB (searchKnowledgeBase) E esplora il DB se hai un connectorId (exploreDbSchema + exploreTableColumns sulle tabelle rilevanti).
2. LEGGI lo schema e i dati di esempio gia' forniti nel contesto. NON chiedere mai dati che sono gia' visibili.
3. Se non conosci il connettore, usa listSqlConnectors per trovarlo.
4. TESTA SEMPRE la query con testSqlQuery prima di proporla - MAI saltare questo passaggio.
5. Se la query fallisce per ERRORE LOGICO, correggi e RIPROVA (fino a 3 tentativi).
6. Quando trovi la soluzione, SALVALA nella Knowledge Base con sqlSaveToKnowledgeBase.

## CORREZIONE ERRORI AUTOMATICA (CRITICO):
- Se ricevi un messaggio "ERRORE ESECUZIONE AUTOMATICA", significa che la query che hai generato e' stata eseguita automaticamente ma ha fallito.
- DEVI SEMPRE restituire la query corretta completa in updatedScript. Questo e' OBBLIGATORIO - senza updatedScript il sistema non puo' riprovare.
- Analizza l'errore SQL, correggi la query, e restituisci la versione corretta in updatedScript.
- Concentrati sull'errore specifico: spesso e' un nome tabella/colonna sbagliato, una funzione non supportata, o un errore di sintassi.
- NON ripetere spiegazioni lunghe - vai dritto alla correzione con la query corretta.
- Rispondi con una breve spiegazione di cosa hai corretto + la query completa corretta.

## REGOLE DI PERSISTENZA:
- Se una query fallisce, NON ARRENDERTI: esplora lo schema, prova nomi diversi
- Prova SINONIMI per i nomi tabelle/colonne
- Se non trovi la tabella, elenca TUTTE le tabelle con exploreDbSchema
- Se non trovi la colonna, elenca TUTTE le colonne con exploreTableColumns
- Se sei bloccato, CHIEDI all'utente il nome esatto
- NON ripetere MAI la stessa risposta - cambia approccio

## AUTO-APPRENDIMENTO KB (OBBLIGATORIO):
Devi imparare dai tuoi errori AUTOMATICAMENTE:

### QUANDO SALVARE (usa sqlSaveToKnowledgeBase):
1. **Dopo ogni correzione dell'utente**: Se l'utente ti corregge (es. "non funziona", "errore", "sbagliato", "CORREZIONE:"), e tu trovi la soluzione corretta, salva IMMEDIATAMENTE.
2. **Dopo un test fallito che correggi**: Se testSqlQuery fallisce e tu lo risolvi, salva cosa hai imparato.
3. **Dopo aver scoperto strutture dati inaspettate**: Se una tabella ha colonne con nomi diversi da quelli attesi, salva i nomi corretti.

### COSA SALVARE:
- **question**: Descrivi il problema in modo cercabile (es. "Errore colonna orders non trovata - usare order_items")
- **answer**: "ERRORE: [cosa facevo di sbagliato]. SOLUZIONE: [approccio corretto]. ESEMPIO: [query corretta]"
- **tags**: Includi "errore", "correzione", piu' tag specifici (es. ["errore", "correzione", "join", "orders"])
- **category**: "Correzione" per errori corretti, "Best Practice" per pattern appresi

### QUANDO CERCARE (usa searchKnowledgeBase):
- ALL'INIZIO di ogni nuova richiesta, cerca nella KB parole chiave relative alla richiesta.
- Prima di scrivere query che toccano un'area dove hai gia' sbagliato in passato.

## FORMATO RISPOSTE:
- Rispondi SEMPRE in italiano
- Usa **grassetto** per evidenziare dati importanti
- Usa tabelle markdown per i risultati
- Usa blocchi di codice per le query
- Spiega BREVEMENTE cosa hai fatto

## FORMATO RISPOSTA (OBBLIGATORIO):
Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{"message": "spiegazione breve in italiano", "updatedScript": "query SQL aggiornata", "needsClarification": false, "clarificationQuestions": []}`;

        const userPrompt = `=== RICHIESTA ===
${input.userMessage}

=== QUERY SQL CORRENTE ===
${input.script || '(nessuna query definita)'}
${context}${historyContext}

Analizza, usa i tool per esplorare il DB se necessario, poi rispondi in JSON.`;

        let resultText = '';
        let usage: OpenRouterUsage | undefined;

        if (provider === 'google') {
            // --- Legacy Generation (Genkit) ---
            const result = await ai.generate({
                model: modelName,
                prompt: `${systemPrompt}\n\n${userPrompt}`,
                tools: [
                    ...(input.connectorId ? [exploreDbSchema, exploreTableColumns, testSqlQuery] : []),
                    ...(input.companyId ? [searchKB, listConnectors, saveToKB] : []),
                ],
                config: { temperature: 0.7 },
            });
            resultText = result.text;
            // Genkit doesn't provide cost info
        } else {
            // --- OpenRouter Generation ---
            if (!apiKey) {
                return { message: "Errore: Chiave API OpenRouter mancante. Configura la chiave nelle impostazioni.", needsClarification: false };
            }

            // Prepare messages in OpenAI format (since we are doing single-turn agent logic here normally, 
            // but we might want to respect conversationHistory passed in input?
            // Actually input.conversationHistory is just strings for context. 
            // The AI Agent treats each turn as a fresh prompt with context.
            // So we just send [system, user] messages.

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            // Filter tools based on context similar to Genkit logic
            const activeTools = [
                ...(input.connectorId ? [
                    openRouterTools.find(t => t.function.name === 'exploreDbSchema'),
                    openRouterTools.find(t => t.function.name === 'exploreTableColumns'),
                    openRouterTools.find(t => t.function.name === 'testSqlQuery')
                ] : []),
                ...(input.companyId ? [
                    openRouterTools.find(t => t.function.name === 'searchKnowledgeBase'),
                    openRouterTools.find(t => t.function.name === 'listSqlConnectors'),
                    openRouterTools.find(t => t.function.name === 'sqlSaveToKnowledgeBase')
                ] : [])
            ].filter(Boolean) as OpenRouterTool[];

            // Dispatcher for OpenRouter tool calls
            const dispatcher = async (name: string, args: any) => {
                switch (name) {
                    case 'exploreDbSchema': return doExploreDbSchema(args);
                    case 'exploreTableColumns': return doExploreTableColumns(args);
                    case 'testSqlQuery': return doTestSqlQuery(args);
                    case 'searchKnowledgeBase': return doSearchKB(args);
                    case 'listSqlConnectors': return doListConnectors(args);
                    case 'sqlSaveToKnowledgeBase': return doSaveToKB(args);
                    default: return JSON.stringify({ error: `Tool sconosciuto: ${name}` });
                }
            };

            const result = await runOpenRouterAgentLoop(
                apiKey,
                modelName,
                messages,
                activeTools,
                dispatcher,
                true
            );
            resultText = result.text;
            usage = result.usage;
        }

        // Parse the response
        const parsed = parseAgentJson(resultText);
        if (parsed) {
            return {
                message: parsed.message || resultText,
                updatedScript: parsed.updatedScript,
                needsClarification: parsed.needsClarification || false,
                clarificationQuestions: parsed.clarificationQuestions || [],
                usage,
            };
        }

        return { message: resultText, needsClarification: false, usage };
    } catch (e: any) {
        console.error('Error in SQL agent flow:', e);
        return { message: `Errore: ${e.message}. Riprova o dammi piu' dettagli.`, needsClarification: false };
    }
}
