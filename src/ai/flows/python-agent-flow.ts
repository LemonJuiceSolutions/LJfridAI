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

// Robust JSON parser that handles updatedScript with curly braces and unescaped newlines
function parseAgentJson(text: string): any | null {
    // 1. Try to strip markdown code blocks if present
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
        // Attempt to parse clean JSON first
        try {
            const parsed = JSON.parse(markdownMatch[1]);
            if (parsed && typeof parsed.message === 'string') return parsed;
        } catch {
            // If failed, try to sanitize newlines inside the JSON string
            // This is a common issue with LLMs putting real newlines in JSON strings
            try {
                // Heuristic: Escape newlines that look like they are inside a string value
                // We look for "updatedScript": "..." content and try to escape it
                // This is risky but often necessary for "dirty" LLM JSON
                const sanitized = markdownMatch[1].replace(/("updatedScript"\s*:\s*")([\s\S]*?)("\s*})/g, (match, p1, p2, p3) => {
                    // Escape newlines and tabs in the script body (p2)
                    const escaped = p2.replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '');
                    return p1 + escaped + p3;
                });
                const parsed = JSON.parse(sanitized);
                if (parsed && typeof parsed.message === 'string') return parsed;
            } catch { /* continue */ }
        }
    }

    // 2. Try each '{' as a potential start of the JSON response
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== '{') continue;
        let depth = 0;
        let inString = false;
        let escape = false;

        // Simple bracket counting doesn't work well if strings contain unescaped braces
        // But let's try to extract the candidate string first
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
                        // Try standard parse
                        const parsed = JSON.parse(candidate);
                        if (parsed && typeof parsed.message === 'string') return parsed;
                    } catch {
                        // Try sanitizing newlines in the candidate
                        try {
                            const candidate = text.substring(i, j + 1);
                            const sanitized = candidate.replace(/("updatedScript"\s*:\s*")([\s\S]*?)("\s*})/g, (match, p1, p2, p3) => {
                                const escaped = p2.replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '');
                                return p1 + escaped + p3;
                            });
                            const parsed = JSON.parse(sanitized);
                            if (parsed && typeof parsed.message === 'string') return parsed;
                        } catch { /* try next */ }
                    }
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

LIBRERIE DISPONIBILI: pandas (pd), numpy (np), requests, plotly.express (px), plotly.graph_objects (go)
NON USARE MAI LA LIBRERIA 'tabulate' (non e' installata). Usa SOLO plotly per le tabelle.

## CONTESTO PIATTAFORMA (IMPORTANTE):
- I CONNETTORI forniscono automaticamente token e credenziali come variabili d'ambiente (es. HUBSPOT_TOKEN, API_KEY, ecc.)
- Quando l'utente preme "Esegui anteprima", il token viene ereditato dal connettore configurato nel nodo
- NON DIRE MAI all'utente di "configurare manualmente i token" o le variabili d'ambiente - sono GIA' gestite dalla piattaforma
- Se un test con pyTestCode fallisce per mancanza di token/env vars, e' NORMALE: il codice funzionera' in produzione col connettore
- In caso di errore token: modifica comunque il codice come richiesto e spiega che funzionera' premendo "Esegui anteprima"

## CULTURA DELLA ROBUSTEZZA (OBBLIGATORIO):
1. **API CALLS**: Usa SEMPRE 'requests' con una funzione helper per il RETRY (es. 4 tentativi) e time.sleep() (backoff esponenziale).
   - Esempio helper obbligatorio:
   \`\`\`python
   def safe_get(url, params=None, timeout=30, max_retry=4):
       for attempt in range(max_retry):
           try:
               r = requests.get(url, headers=HEADERS, params=params, timeout=timeout)
               if r.status_code == 200: return r
               if r.status_code in (429, 500, 502, 503, 504):
                   time.sleep(0.5 * (attempt + 1))
                   continue
               print(f"⚠️ Errore GET {url}: {r.status_code}")
               return r
           except Exception as e:
                print(f"⚠️ Exception GET {url}: {e}")
                time.sleep(0.5 * (attempt + 1))
       return None
   \`\`\`
2. **RATE LIMITING**: Inserisci SEMPRE \`time.sleep(0.05)\` (o simile) tra le chiamate in loop.
3. **TABELLE**: Usa SOLO \`plotly.graph_objects\` per visualizzare i risultati tabellari. Esempio:
   \`\`\`python
   import plotly.graph_objects as go
   fig = go.Figure(data=[go.Table(header=dict(values=list(df.columns)), cells=dict(values=[df[col] for col in df.columns]))])
   fig.show()
   \`\`\`

## REGOLA D'ORO: FAI, NON SPIEGARE
- Quando l'utente chiede una modifica (es. "Rinomina colonna X in Y"), ESEGUI ESATTAMENTE LA RINOMINA nel codice finale.
- Se l'utente chiede di rinominare "Owner" in "PROPRIETARIO", assicurati che nel DataFrame finale ci sia SOLO "PROPRIETARIO" e non "Owner".
- NON ripetere la stessa risposta piu' volte.
- LEGGI ATTENTAMENTE il codice che l'utente incolla o suggerisce.

## IL TUO WORKFLOW:
1. Cerca PRIMA nella Knowledge Base (pySearchKnowledgeBase).
2. Esplora il DB se necessario.
3. Scrivi codice ROBUSTO (retry, sleep, no tabulate).
4. TESTA con pyTestCode.
5. Se fallisce per Token, ignora e restituisci il codice comunque.
6. Se fallisce per logica, correggi e riprova.

## AUTO-APPRENDIMENTO KB:
- Salva script funzionanti e correzioni nella KB.

## FORMATO RISPOSTE:
- Rispondi SEMPRE in italiano.
- Usa **grassetto** per evidenziare.
- Rispondi SOLO in JSON come richiesto sotto.

## PREVENZIONE ERRORI (CRITICO):
- NON Chiudere una lista [ con una graffa } o viceversa.
- Assicurati che le stringhe multilinea siano chiuse.
- Se definisci dizionari lunghi, assicurati di chiuderli correttamente con }.
- NON inserire "}}" o markdown code delimiters extra all'interno del blocco di codice Python. Il codice deve essere pulito e pronto all'uso.

## FORMATO RISPOSTA(OBBLIGATORIO):
        1. PRIMA Scrivi il codice Python completo in un blocco markdown:
        \`\`\`python
# ... tuo codice ...
\`\`\`

2. POI Rispondi con un oggetto JSON valido per i metadati (senza ripetere il codice nel JSON):
\`\`\`json
{
  "message": "spiegazione breve in italiano",
  "needsClarification": false,
  "clarificationQuestions": []
}
\`\`\``;

        const userPrompt = `=== RICHIESTA ===
${input.userMessage}

=== CODICE PYTHON CORRENTE ===
${input.script || '(nessun codice definito)'}
${context}${historyContext}

Analizza, usa i tool per esplorare i dati se necessario, poi rispondi in JSON.`;

        const { text } = await ai.generate({
            model: 'googleai/gemini-2.5-flash',
            prompt: `${systemPrompt} \n\n${userPrompt} `,
            tools: [
                ...(input.connectorId ? [exploreDbSchema, exploreTableColumns, testSqlQuery, testPythonCode] : [testPythonCode]),
                ...(input.companyId ? [searchKB, listConnectors, saveToKB] : []),
            ],
            config: { temperature: 0.7 },
        });

        // Parse the response - New Robust Logic
        // 1. Extract Python Code Block
        // We look for ANY code block that is not explicitly JSON
        const codeBlockRegex = /```(\w*)\s*([\s\S]*?)```/g;
        let match;
        let extractedScript = null;

        while ((match = codeBlockRegex.exec(text)) !== null) {
            const lang = match[1].toLowerCase().trim();
            const content = match[2].trim();
            // If it's explicitly python, or empty/unknown (but not json), and looks like code (has def or import or similar)
            // Actually, we just take the first non-json block as the script.
            if (lang !== 'json' && content.length > 10) {
                extractedScript = content;

                // Sanitize: Remove trailing }} artifacts often left by the LLM
                // e.g. if it thinks it's inside a JSON string
                if (extractedScript.trim().endsWith('}}')) {
                    extractedScript = extractedScript.replace(/}\s*}\s*$/, '').trim();
                }

                break; // Use the first valid code block
            }
        }

        // 2. Extract JSON Metadata
        // We look for the LAST JSON block or just the JSON object if no block
        let parsedMetadata: any = null;

        // Try escaping from markdown json block first
        const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
        if (jsonBlockMatch) {
            try { parsedMetadata = JSON.parse(jsonBlockMatch[1]); } catch { }
        }

        // Use the generic parser if block extract failed
        if (!parsedMetadata) {
            parsedMetadata = parseAgentJson(text);
        }

        if (parsedMetadata) {
            // Append the code to the message so it's visible in the UI
            let displayMessage = parsedMetadata.message || 'Ecco il codice aggiornato:';

            // Prefer extracted script from markdown, fallback to JSON script if provided (legacy/fallback)
            const finalScript = extractedScript || parsedMetadata.updatedScript;

            if (finalScript && !displayMessage.includes('```python')) {
                // Ensure the code is shown in the chat bubble if not already there
                // (Though typically the Chat UI renders the script separately, 
                // putting it in the message body ensures visibility history)
                // Actually, let's NOT duplicate it if the UI shows the script editor.
                // But for the "message" bubble history, it is good to have.
                displayMessage += `\n\n\`\`\`python\n${finalScript}\n\`\`\``;
            }

            return {
                message: displayMessage,
                updatedScript: finalScript, // Return the clean script!
                needsClarification: parsedMetadata.needsClarification || false,
                clarificationQuestions: parsedMetadata.clarificationQuestions || [],
            };
        }

        return { message: text, needsClarification: false };
    } catch (e: any) {
        console.error('Error in Python agent flow:', e);
        return { message: `Errore: ${e.message}. Riprova o dammi piu' dettagli.`, needsClarification: false };
    }
}
