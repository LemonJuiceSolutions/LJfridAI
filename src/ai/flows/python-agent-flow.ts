'use server';
/**
 * @fileOverview Python agent with tool-based exploration - never gives up.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { db } from '@/lib/db';
import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';
import { type AgentInput, type AgentOutput } from '@/ai/schemas/agent-schema';

// Tool: Explore DB schema (list tables)
const exploreDbSchema = ai.defineTool(
    {
        name: 'pyExploreDbSchema',
        description: 'Esplora lo schema del database: elenca tutte le tabelle disponibili.',
        inputSchema: z.object({
            connectorId: z.string().describe("L'ID del connettore database."),
        }),
        outputSchema: z.string(),
    },
    async (input) => {
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
);

// Tool: Explore table columns
const exploreTableColumns = ai.defineTool(
    {
        name: 'pyExploreTableColumns',
        description: 'Esplora le colonne di una tabella specifica con tipo di dato.',
        inputSchema: z.object({
            connectorId: z.string().describe("L'ID del connettore database."),
            tableName: z.string().describe("Il nome della tabella."),
        }),
        outputSchema: z.string(),
    },
    async (input) => {
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
);

// Tool: Execute a test SQL query to understand input data
const testSqlQuery = ai.defineTool(
    {
        name: 'pyTestSqlQuery',
        description: 'Esegue una query SQL di test per capire la struttura dei dati che il codice Python ricevera\' in input.',
        inputSchema: z.object({
            query: z.string().describe("La query SQL da testare."),
            connectorId: z.string().describe("L'ID del connettore database."),
        }),
        outputSchema: z.string(),
    },
    async (input) => {
        try {
            const result = await executeSqlPreviewAction(input.query, input.connectorId, [], true);
            if (result.error) return JSON.stringify({ error: result.error });
            const data = result.data || [];
            return JSON.stringify({
                success: true,
                rowCount: data.length,
                columns: data.length > 0 ? Object.keys(data[0]) : [],
                sampleData: data.slice(0, 5),
            }, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: e.message });
        }
    }
);

// Tool: Test Python code
const testPythonCode = ai.defineTool(
    {
        name: 'pyTestCode',
        description: 'Esegue codice Python di test per verificare che funzioni correttamente.',
        inputSchema: z.object({
            code: z.string().describe("Il codice Python da testare."),
            outputType: z.enum(['table', 'variable', 'chart']).describe("Tipo output."),
            connectorId: z.string().optional().describe("Connettore opzionale."),
        }),
        outputSchema: z.string(),
    },
    async (input) => {
        try {
            const result = await executePythonPreviewAction(input.code, input.outputType, {}, [], input.connectorId, true);
            if (!result.success) return JSON.stringify({ error: result.error || 'Errore esecuzione' });
            return JSON.stringify({
                success: true,
                data: result.data?.slice(0, 5),
                variables: result.variables,
                columns: result.columns,
                rowCount: result.rowCount,
                stdout: result.stdout,
            }, null, 2);
        } catch (e: any) {
            return JSON.stringify({ error: e.message });
        }
    }
);

// Tool: Search Knowledge Base
const searchKB = ai.defineTool(
    {
        name: 'pySearchKnowledgeBase',
        description: 'Cerca nella Knowledge Base aziendale script Python simili e correzioni precedenti.',
        inputSchema: z.object({
            query: z.string().describe('Termine di ricerca.'),
            companyId: z.string().describe("L'ID della company."),
        }),
        outputSchema: z.string(),
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
);

// Tool: List SQL connectors
const listConnectors = ai.defineTool(
    {
        name: 'pyListSqlConnectors',
        description: 'Elenca tutti i connettori SQL (database) disponibili.',
        inputSchema: z.object({
            companyId: z.string().describe("L'ID della company."),
        }),
        outputSchema: z.string(),
    },
    async (input) => {
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
);

// Tool: Save to Knowledge Base
const saveToKB = ai.defineTool(
    {
        name: 'pySaveToKnowledgeBase',
        description: 'Salva una informazione nella Knowledge Base aziendale. Usa dopo aver trovato uno script corretto o quando l\'utente conferma un risultato.',
        inputSchema: z.object({
            question: z.string().describe('La domanda o descrizione (es. "Script per analisi vendite").'),
            answer: z.string().describe('La risposta: il codice Python, l\'output trovato, o la correzione.'),
            tags: z.array(z.string()).describe('Tag per la ricerca futura (es. ["python", "analisi", "vendite"]).'),
            category: z.string().describe('Categoria: "Python", "Analisi", "Correzione", "Best Practice".'),
            companyId: z.string().describe("L'ID della company."),
        }),
        outputSchema: z.string(),
    },
    async (input) => {
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
);

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

export async function pythonAgentChat(input: AgentInput): Promise<AgentOutput> {
    try {
        // Build context
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

        const systemPrompt = `Sei un agente AI esperto in Python per analisi dati. NON MOLLARE MAI. Sei tenace e persistente.
DATA DI OGGI: ${today}

${connectorInfo}${companyInfo}

LIBRERIE DISPONIBILI: pandas (pd), numpy (np), matplotlib.pyplot (plt), plotly.express (px), plotly.graph_objects (go)

## CONTESTO PIATTAFORMA (IMPORTANTE):
- I CONNETTORI forniscono automaticamente token e credenziali come variabili d'ambiente (es. HUBSPOT_TOKEN, API_KEY, ecc.)
- Quando l'utente preme "Esegui anteprima", il token viene ereditato dal connettore configurato nel nodo
- NON DIRE MAI all'utente di "configurare manualmente i token" o le variabili d'ambiente - sono GIA' gestite dalla piattaforma
- Se un test con pyTestCode fallisce per mancanza di token/env vars, e' NORMALE: il codice funzionera' in produzione col connettore
- In caso di errore token: modifica comunque il codice come richiesto e spiega che funzionera' premendo "Esegui anteprima"

## REGOLA D'ORO: FAI, NON SPIEGARE
- Quando l'utente chiede una modifica al codice, MODIFICA IL CODICE e mettilo in updatedScript
- NON ripetere la stessa risposta piu' volte - se l'utente insiste, significa che non hai capito cosa vuole
- LEGGI ATTENTAMENTE il codice che l'utente incolla: contiene la soluzione o degli indizi importanti
- Se l'utente ti mostra del codice funzionante come esempio, IMPARA da quello e applicalo allo script corrente
- NON dare risposte generiche tipo "assicurati che il token sia configurato" - AGISCI sul codice

## IL TUO WORKFLOW:
1. Cerca PRIMA nella Knowledge Base (pySearchKnowledgeBase) script simili gia' usati
2. Se hai un connectorId, esplora il DB con pyExploreDbSchema e pyExploreTableColumns
3. Usa pyTestSqlQuery per vedere i dati reali (se il connettore e' disponibile)
4. Scrivi/modifica il codice Python e TESTALO con pyTestCode
5. Se il test fallisce per TOKEN/AUTH, fornisci comunque il codice aggiornato - funzionera' col connettore
6. Se il test fallisce per ERRORE LOGICO, correggi e RIPROVA
7. Quando trovi la soluzione, SALVALA nella Knowledge Base con pySaveToKnowledgeBase

## REGOLE DI PERSISTENZA:
- Se il codice fallisce per logica, NON ARRENDERTI: analizza l'errore, correggi e riprova
- Se non conosci la struttura dati, ESPLORALA prima con i tool
- Se mancano colonne, usa pyExploreTableColumns per trovare quelle giuste
- Se sei bloccato, CHIEDI all'utente cosa vuole esattamente
- NON ripetere MAI la stessa risposta - se non ha funzionato la prima volta, cambia approccio

## AUTO-APPRENDIMENTO KB:
- Quando trovi uno script che funziona, SALVA nella KB con pySaveToKnowledgeBase
- Quando l'utente ti corregge, salva la correzione nella KB come "Correzione"
- Dopo ogni risposta con dati/output, chiedi "I dati sono corretti?"

## FORMATO RISPOSTE:
- Rispondi SEMPRE in italiano
- Usa **grassetto** per evidenziare dati importanti
- Usa tabelle markdown per i risultati
- Usa blocchi di codice per il codice
- Spiega BREVEMENTE cosa hai fatto

## FORMATO RISPOSTA (OBBLIGATORIO):
Rispondi SOLO con un oggetto JSON valido, senza testo prima o dopo:
{"message": "spiegazione breve in italiano", "updatedScript": "codice completo aggiornato", "needsClarification": false, "clarificationQuestions": []}`;

        const userPrompt = `=== RICHIESTA ===
${input.userMessage}

=== CODICE PYTHON CORRENTE ===
${input.script || '(nessun codice definito)'}
${context}${historyContext}

Analizza, usa i tool per esplorare i dati se necessario, poi rispondi in JSON.`;

        const { text } = await ai.generate({
            model: 'googleai/gemini-2.5-flash',
            prompt: `${systemPrompt}\n\n${userPrompt}`,
            tools: [
                ...(input.connectorId ? [exploreDbSchema, exploreTableColumns, testSqlQuery, testPythonCode] : [testPythonCode]),
                ...(input.companyId ? [searchKB, listConnectors, saveToKB] : []),
            ],
            config: { temperature: 0.7 },
        });

        // Parse the response - robust bracket-counting parser
        const parsed = parseAgentJson(text);
        if (parsed) {
            return {
                message: parsed.message || text,
                updatedScript: parsed.updatedScript,
                needsClarification: parsed.needsClarification || false,
                clarificationQuestions: parsed.clarificationQuestions || [],
            };
        }

        return { message: text, needsClarification: false };
    } catch (e: any) {
        console.error('Error in Python agent flow:', e);
        return { message: `Errore: ${e.message}. Riprova o dammi piu' dettagli.`, needsClarification: false };
    }
}
