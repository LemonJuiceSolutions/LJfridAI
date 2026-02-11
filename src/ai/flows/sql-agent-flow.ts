'use server';
/**
 * @fileOverview SQL agent with tool-based exploration - never gives up.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { db } from '@/lib/db';
import { executeSqlPreviewAction } from '@/app/actions';
import { AgentInputSchema, AgentOutputSchema, type AgentInput, type AgentOutput } from '@/ai/schemas/agent-schema';

// Tool: Explore DB schema (list tables)
const exploreDbSchema = ai.defineTool(
    {
        name: 'exploreDbSchema',
        description: 'Esplora lo schema del database: elenca tutte le tabelle disponibili. Usa questo per scoprire quali tabelle esistono.',
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
        name: 'exploreTableColumns',
        description: 'Esplora le colonne di una tabella specifica con tipo di dato. Usa per capire la struttura prima di scrivere query.',
        inputSchema: z.object({
            connectorId: z.string().describe("L'ID del connettore database."),
            tableName: z.string().describe("Il nome della tabella da esplorare."),
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

// Tool: Execute a test SQL query
const testSqlQuery = ai.defineTool(
    {
        name: 'testSqlQuery',
        description: 'Esegue una query SQL di test per verificare che funzioni e vedere i risultati. Usa per validare query prima di proporle.',
        inputSchema: z.object({
            query: z.string().describe("La query SQL da testare."),
            connectorId: z.string().describe("L'ID del connettore database."),
        }),
        outputSchema: z.string(),
    },
    async (input) => {
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
);

// Tool: Search Knowledge Base
const searchKB = ai.defineTool(
    {
        name: 'searchKnowledgeBase',
        description: 'Cerca nella Knowledge Base aziendale query SQL simili, strutture di tabelle e correzioni precedenti.',
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
        name: 'listSqlConnectors',
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

export async function sqlAgentChat(input: AgentInput): Promise<AgentOutput> {
    try {
        // Build context from table schema and input tables
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

        const systemPrompt = `Sei un agente AI esperto in SQL. NON MOLLARE MAI. Sei tenace e persistente.
DATA DI OGGI: ${today}

${connectorInfo}${companyInfo}

## CONTESTO PIATTAFORMA (IMPORTANTE):
- I CONNETTORI forniscono automaticamente token e credenziali
- Quando l'utente preme "Esegui anteprima", il connettore e' gia' configurato con le credenziali
- NON DIRE MAI all'utente di "configurare manualmente i token" - sono GIA' gestiti dalla piattaforma
- Se un test fallisce per problemi di connessione, modifica comunque la query come richiesto

## REGOLA D'ORO: FAI, NON SPIEGARE
- Quando l'utente chiede una modifica, MODIFICA LA QUERY e mettila in updatedScript
- NON ripetere la stessa risposta piu' volte - se l'utente insiste, significa che non hai capito
- LEGGI ATTENTAMENTE il codice che l'utente incolla: contiene la soluzione o degli indizi
- Se l'utente ti mostra del codice funzionante come esempio, IMPARA da quello
- NON dare risposte generiche - AGISCI sulla query

## IL TUO WORKFLOW:
1. Cerca PRIMA nella Knowledge Base (searchKnowledgeBase) query simili gia' usate
2. Se hai un connectorId, ESPLORA il database con exploreDbSchema e exploreTableColumns
3. Se non conosci il connettore, usa listSqlConnectors per trovarlo
4. TESTA la query con testSqlQuery prima di proporla
5. Se la query fallisce per ERRORE LOGICO, correggi e RIPROVA
6. Quando trovi la soluzione, SALVALA nella Knowledge Base con sqlSaveToKnowledgeBase

## REGOLE DI PERSISTENZA:
- Se una query fallisce, NON ARRENDERTI: esplora lo schema, prova nomi diversi
- Prova SINONIMI per i nomi tabelle/colonne
- Se non trovi la tabella, elenca TUTTE le tabelle con exploreDbSchema
- Se non trovi la colonna, elenca TUTTE le colonne con exploreTableColumns
- Se sei bloccato, CHIEDI all'utente il nome esatto
- NON ripetere MAI la stessa risposta - cambia approccio

## AUTO-APPRENDIMENTO KB:
- Quando trovi una query che funziona, SALVA nella KB con sqlSaveToKnowledgeBase
- Quando l'utente ti corregge, salva la correzione nella KB come "Correzione"
- Dopo ogni risposta con dati, chiedi "I dati sono corretti?"

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

        const { text } = await ai.generate({
            model: 'googleai/gemini-2.5-flash',
            prompt: `${systemPrompt}\n\n${userPrompt}`,
            tools: [
                ...(input.connectorId ? [exploreDbSchema, exploreTableColumns, testSqlQuery] : []),
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
        console.error('Error in SQL agent flow:', e);
        return { message: `Errore: ${e.message}. Riprova o dammi piu' dettagli.`, needsClarification: false };
    }
}
