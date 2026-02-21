'use server';
/**
 * @fileOverview Python agent with tool-based exploration - never gives up.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { db } from '@/lib/db';
import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';
import { type AgentInput, type AgentOutput } from '@/ai/schemas/agent-schema';
import { getOpenRouterSettingsAction } from '@/actions/openrouter';
import { resolveModel, runOpenRouterAgentLoop, type OpenRouterTool, type OpenRouterUsage } from '@/ai/openrouter-utils';

// --- Tool Implementations (Shared) ---

async function doPyExploreDbSchema(input: { connectorId: string }) {
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

async function doPyExploreTableColumns(input: { connectorId: string, tableName: string }) {
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

async function doPyTestSqlQuery(input: { query: string, connectorId: string }) {
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

async function doPyTestCode(input: { code: string, outputType: 'table' | 'variable' | 'chart', connectorId?: string }) {
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

async function doPySearchKB(input: { query: string, companyId: string }) {
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

async function doPyListConnectors(input: { companyId: string }) {
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

async function doPySaveToKB(input: { question: string, answer: string, tags: string[], category: string, companyId: string }) {
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
        name: 'pyExploreDbSchema',
        description: 'Esplora lo schema del database: elenca tutte le tabelle disponibili.',
        inputSchema: z.object({ connectorId: z.string().describe("L'ID del connettore database.") }),
        outputSchema: z.string(),
    },
    doPyExploreDbSchema
);

const exploreTableColumns = ai.defineTool(
    {
        name: 'pyExploreTableColumns',
        description: 'Esplora le colonne di una tabella specifica con tipo di dato.',
        inputSchema: z.object({ connectorId: z.string().describe("L'ID del connettore database."), tableName: z.string().describe("Il nome della tabella.") }),
        outputSchema: z.string(),
    },
    doPyExploreTableColumns
);

const testSqlQuery = ai.defineTool(
    {
        name: 'pyTestSqlQuery',
        description: 'Esegue una query SQL di test per capire la struttura dei dati che il codice Python ricevera\' in input.',
        inputSchema: z.object({ query: z.string().describe("La query SQL da testare."), connectorId: z.string().describe("L'ID del connettore database.") }),
        outputSchema: z.string(),
    },
    doPyTestSqlQuery
);

const testPythonCode = ai.defineTool(
    {
        name: 'pyTestCode',
        description: 'Esegue codice Python di test per verificare che funzioni correttamente.',
        inputSchema: z.object({ code: z.string().describe("Il codice Python da testare."), outputType: z.enum(['table', 'variable', 'chart']).describe("Tipo output."), connectorId: z.string().optional().describe("Connettore opzionale.") }),
        outputSchema: z.string(),
    },
    doPyTestCode
);

const searchKB = ai.defineTool(
    {
        name: 'pySearchKnowledgeBase',
        description: 'Cerca nella Knowledge Base aziendale script Python simili e correzioni precedenti.',
        inputSchema: z.object({ query: z.string().describe('Termine di ricerca.'), companyId: z.string().describe("L'ID della company.") }),
        outputSchema: z.string(),
    },
    doPySearchKB
);

const listConnectors = ai.defineTool(
    {
        name: 'pyListSqlConnectors',
        description: 'Elenca tutti i connettori SQL (database) disponibili.',
        inputSchema: z.object({ companyId: z.string().describe("L'ID della company.") }),
        outputSchema: z.string(),
    },
    doPyListConnectors
);

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
    doPySaveToKB
);

// --- OpenRouter Tools Definitions ---

const openRouterTools: OpenRouterTool[] = [
    {
        type: 'function',
        function: {
            name: 'pyExploreDbSchema',
            description: 'Esplora lo schema del database: elenca tutte le tabelle disponibili.',
            parameters: {
                type: 'object',
                properties: { connectorId: { type: 'string', description: "L'ID del connettore database." } },
                required: ['connectorId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'pyExploreTableColumns',
            description: 'Esplora le colonne di una tabella specifica.',
            parameters: {
                type: 'object',
                properties: { connectorId: { type: 'string', description: "L'ID del connettore database." }, tableName: { type: 'string', description: "Il nome della tabella." } },
                required: ['connectorId', 'tableName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'pyTestSqlQuery',
            description: 'Esegue una query SQL di test per capire la struttura dei dati.',
            parameters: {
                type: 'object',
                properties: { query: { type: 'string', description: "La query SQL da testare." }, connectorId: { type: 'string', description: "L'ID del connettore database." } },
                required: ['query', 'connectorId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'pyTestCode',
            description: 'Esegue codice Python di test per verificare che funzioni.',
            parameters: {
                type: 'object',
                properties: {
                    code: { type: 'string', description: "Il codice Python da testare." },
                    outputType: { type: 'string', enum: ['table', 'variable', 'chart'], description: "Tipo output." },
                    connectorId: { type: 'string', description: "Connettore opzionale." }
                },
                required: ['code', 'outputType']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'pySearchKnowledgeBase',
            description: 'Cerca nella Knowledge Base aziendale.',
            parameters: {
                type: 'object',
                properties: { query: { type: 'string', description: 'Termine di ricerca.' }, companyId: { type: 'string', description: "L'ID della company." } },
                required: ['query', 'companyId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'pyListSqlConnectors',
            description: 'Elenca tutti i connettori SQL disponibili.',
            parameters: {
                type: 'object',
                properties: { companyId: { type: 'string', description: "L'ID della company." } },
                required: ['companyId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'pySaveToKnowledgeBase',
            description: 'Salva una informazione nella Knowledge Base aziendale.',
            parameters: {
                type: 'object',
                properties: {
                    question: { type: 'string', description: 'La domanda o descrizione.' },
                    answer: { type: 'string', description: 'La risposta o codice.' },
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

// Robust JSON parser that handles updatedScript with curly braces and unescaped newlines
function parseAgentJson(text: string): any | null {
    // 1. Try to strip markdown code blocks if present
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
        try {
            const parsed = JSON.parse(markdownMatch[1]);
            if (parsed && typeof parsed.message === 'string') return parsed;
        } catch {
            try {
                const sanitized = markdownMatch[1].replace(/("updatedScript"\s*:\s*")([\s\S]*?)("\s*})/g, (match, p1, p2, p3) => {
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
                    } catch {
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
        // 1. Get User/Model Settings
        let apiKey = input.openRouterConfig?.apiKey;
        let model = input.openRouterConfig?.model;

        // If not provided in input, fetch from DB
        if (!apiKey || !model) {
            const settings = await getOpenRouterSettingsAction();
            if (settings.apiKey) apiKey = settings.apiKey;
            if (settings.model) model = settings.model;
            console.log('[PythonFlow] Fetched settings from DB:', { model: settings.model, hasApiKey: !!settings.apiKey });
        }

        console.log('[PythonFlow] Final config:', { model, hasApiKey: !!apiKey });

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

        const systemPrompt = `Sei un agente AI esperto in Python per analisi dati. Stai utilizzando il modello: ${modelName}. NON MOLLARE MAI. Sei tenace e persistente.
DATA DI OGGI: ${today}

${connectorInfo}${companyInfo}

LIBRERIE DISPONIBILI: pandas (pd), numpy (np), requests, plotly.express (px), plotly.graph_objects (go)
NON USARE MAI LA LIBRERIA 'tabulate' (non e' installata). Usa SOLO plotly per le tabelle.

## REGOLE GRAFICI (CRITICO):
- Usa SEMPRE e SOLO plotly per generare grafici (plotly.express o plotly.graph_objects).
- NON usare MAI matplotlib.
- I grafici Plotly vengono automaticamente convertiti nel sistema Recharts della piattaforma, che supporta: bar, scatter, pie, area, line.
- Per i GANTT o timeline: usa SEMPRE go.Bar con orientation='h' (barre orizzontali). NON usare px.timeline() o go.Figure con shapes/annotations manuali, perche' non vengono convertiti.
- IMPORTANTE NOMI TRACCE: Quando crei tracce raggruppate per categoria (es. stato, monte, tipo), crea UNA traccia per categoria con name= esplicito. NON creare una traccia per ogni task singolo. I nomi delle tracce appaiono nell'editor stile della piattaforma.
- Esempio Gantt con barre orizzontali raggruppate per categoria:
  \`\`\`python
  import plotly.graph_objects as go
  fig = go.Figure()
  # Raggruppa i task per categoria e crea una traccia per ogni gruppo
  for categoria, colore in [('anticipo', '#059669'), ('in tempo', '#3b82f6'), ('ritardo', '#f59e0b')]:
      mask = df['stato'] == categoria
      subset = df[mask]
      if len(subset) > 0:
          fig.add_trace(go.Bar(y=subset['task'], x=subset['durata'], orientation='h', name=categoria, marker=dict(color=colore)))
  fig.update_layout(title='Gantt', barmode='stack')
  fig.show()
  \`\`\`
- Per visualizzare dati tabellari: usa go.Table (come da esempio sotto).
- PREFERISCI SEMPRE tipi di grafico semplici (bar, line, scatter, pie, area) che la piattaforma puo' stilizzare.

## CONTESTO PIATTAFORMA (IMPORTANTE):
- I CONNETTORI forniscono automaticamente token e credenziali come variabili d'ambiente (es. HUBSPOT_TOKEN, API_KEY, ecc.)
- Quando l'utente preme "Esegui anteprima", il token viene ereditato dal connettore configurato nel nodo
- NON DIRE MAI all'utente di "configurare manualmente i token" o le variabili d'ambiente - sono GIA' gestite dalla piattaforma
- Se un test con pyTestCode fallisce per mancanza di token/env vars, e' NORMALE: il codice funzionera' in produzione col connettore
- In caso di errore token: modifica comunque il codice come richiesto e spiega che funzionera' premendo "Esegui anteprima"

## TABELLE IN INPUT - ARRANGIATI (CRITICO):
- Le tabelle in ingresso e i loro dati di esempio sono forniti nel contesto (sezione "TABELLE GIA' NOTE" e "DATI DI ESEMPIO").
- LEGGI SEMPRE i nomi delle colonne dai dati di esempio e dallo schema fornito. NON chiedere MAI all'utente i nomi delle colonne o un sample JSON - HAI GIA' TUTTO.
- Se l'utente menziona un concetto (es. "metti il %GM Budget"), cerca nei dati di esempio la colonna che corrisponde (es. "Gross Margin % (Budget)"). Usa i nomi ESATTI che trovi nei dati.
- Se non sei sicuro quale colonna corrisponde, usa pyTestCode con un codice tipo \`print(df.columns.tolist())\` o \`print(df.dtypes)\` per scoprirlo - NON chiedere all'utente.
- Se i dati hanno formati particolari (virgole decimali italiane, percentuali come stringhe, valori 'null'), gestiscili nel codice con funzioni di pulizia robuste.
- ARRANGIATI: se qualcosa non e' chiaro, esplora i dati con pyTestCode prima di chiedere. Chiedi all'utente SOLO per decisioni di business (es. "quale metrica preferisci?"), MAI per cose tecniche che puoi scoprire da solo.

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
- NON CHIEDERE dati che hai gia': se hai lo schema e i dati di esempio, USALI. L'utente si aspetta che tu ti arrangi leggendo i dati disponibili.

## IL TUO WORKFLOW:
1. ALL'INIZIO di ogni richiesta: cerca nella KB (pySearchKnowledgeBase) E esplora il DB se hai un connectorId (pyExploreDbSchema + pyExploreTableColumns sulle tabelle rilevanti).
2. LEGGI lo schema e i dati di esempio gia' forniti nel contesto. NON chiedere mai dati che sono gia' visibili.
3. Scrivi codice ROBUSTO (retry, sleep, no tabulate).
4. TESTA SEMPRE con pyTestCode prima di rispondere - MAI saltare questo passaggio.
5. Se fallisce per Token, ignora e restituisci il codice comunque.
6. Se fallisce per logica, correggi e riprova (fino a 3 tentativi).

## CORREZIONE ERRORI AUTOMATICA (CRITICO):
- Se ricevi un messaggio "ERRORE ESECUZIONE AUTOMATICA", significa che il codice che hai generato e' stato eseguito automaticamente ma ha fallito.
- DEVI SEMPRE restituire il codice corretto completo in updatedScript. Questo e' OBBLIGATORIO - senza updatedScript il sistema non puo' riprovare.
- Analizza l'errore, correggi il codice, e restituisci la versione corretta in updatedScript.
- Concentrati sull'errore specifico: spesso e' un nome colonna sbagliato, un tipo di dato non gestito, o un import mancante.
- NON ripetere spiegazioni lunghe - vai dritto alla correzione con il codice corretto.
- Rispondi con una breve spiegazione di cosa hai corretto + il codice completo corretto.

## AUTO-APPRENDIMENTO KB (OBBLIGATORIO):
Devi imparare dai tuoi errori AUTOMATICAMENTE. Segui queste regole:

### QUANDO SALVARE (usa pySaveToKnowledgeBase):
1. **Dopo ogni correzione dell'utente**: Se l'utente ti corregge (es. "non funziona", "errore", "sbagliato", "CORREZIONE:", "correggi", "errorone/i"), e tu trovi la soluzione corretta, salva IMMEDIATAMENTE nella KB con pySaveToKnowledgeBase.
2. **Dopo un test fallito che correggi**: Se pyTestCode fallisce per un errore logico e tu lo risolvi, salva cosa hai imparato.
3. **Dopo aver scoperto strutture dati inaspettate**: Se un'API o un DB restituisce dati in un formato diverso da quello atteso (es. separatori decimali italiani come "1.250,46"), salva il formato corretto.

### COSA SALVARE:
- **question**: Descrivi il problema in modo cercabile (es. "Errore conversione float con separatore migliaia italiano" oppure "Plotly cornerradius non funziona su barre overlay")
- **answer**: Scrivi COSA era sbagliato e COME si risolve. Formato: "ERRORE: [cosa facevo di sbagliato]. SOLUZIONE: [approccio corretto]. ESEMPIO: [snippet di codice corretto]"
- **tags**: Includi SEMPRE "errore", "correzione", piu' tag specifici del dominio (es. ["errore", "correzione", "pandas", "float", "locale"])
- **category**: Usa "Correzione" per errori corretti, "Best Practice" per pattern appresi

### QUANDO CERCARE (usa pySearchKnowledgeBase):
- ALL'INIZIO di ogni nuova richiesta, cerca nella KB parole chiave relative alla richiesta dell'utente.
- Prima di scrivere codice che tocca un'area dove hai gia' sbagliato in passato.

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

        let resultText = '';
        let usage: OpenRouterUsage | undefined;

        if (provider === 'google') {
            // --- Legacy Genkit ---
            const result = await ai.generate({
                model: modelName,
                prompt: `${systemPrompt} \n\n${userPrompt} `,
                tools: [
                    ...(input.connectorId ? [exploreDbSchema, exploreTableColumns, testSqlQuery, testPythonCode] : [testPythonCode]),
                    ...(input.companyId ? [searchKB, listConnectors, saveToKB] : []),
                ],
                config: { temperature: 0.7 },
            });
            resultText = result.text;
        } else {
            // --- OpenRouter ---
            if (!apiKey) {
                return { message: "Errore: Chiave API OpenRouter mancante.", needsClarification: false };
            }

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            const activeTools = [
                openRouterTools.find(t => t.function.name === 'pyTestCode'), // Always available
                ...(input.connectorId ? [
                    openRouterTools.find(t => t.function.name === 'pyExploreDbSchema'),
                    openRouterTools.find(t => t.function.name === 'pyExploreTableColumns'),
                    openRouterTools.find(t => t.function.name === 'pyTestSqlQuery')
                ] : []),
                ...(input.companyId ? [
                    openRouterTools.find(t => t.function.name === 'pySearchKnowledgeBase'),
                    openRouterTools.find(t => t.function.name === 'pyListSqlConnectors'),
                    openRouterTools.find(t => t.function.name === 'pySaveToKnowledgeBase')
                ] : [])
            ].filter(Boolean) as OpenRouterTool[];

            const dispatcher = async (name: string, args: any) => {
                switch (name) {
                    case 'pyExploreDbSchema': return doPyExploreDbSchema(args);
                    case 'pyExploreTableColumns': return doPyExploreTableColumns(args);
                    case 'pyTestSqlQuery': return doPyTestSqlQuery(args);
                    case 'pyTestCode': return doPyTestCode(args);
                    case 'pySearchKnowledgeBase': return doPySearchKB(args);
                    case 'pyListSqlConnectors': return doPyListConnectors(args);
                    case 'pySaveToKnowledgeBase': return doPySaveToKB(args);
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

        // Parse the response - New Robust Logic
        // 1. Extract Python Code Block
        // We look for ANY code block that is not explicitly JSON
        const codeBlockRegex = /```(\w*)\s*([\s\S]*?)```/g;
        let match;
        let extractedScript = null;

        while ((match = codeBlockRegex.exec(resultText)) !== null) {
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
        const jsonBlockMatch = resultText.match(/```json\s*([\s\S]*?)```/);
        if (jsonBlockMatch) {
            try { parsedMetadata = JSON.parse(jsonBlockMatch[1]); } catch { }
        }

        // Use the generic parser if block extract failed
        if (!parsedMetadata) {
            parsedMetadata = parseAgentJson(resultText);
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
                usage,
            };
        }

        return { message: resultText, needsClarification: false, usage };
    } catch (e: any) {
        console.error('Error in Python agent flow:', e);
        return { message: `Errore: ${e.message}. Riprova o dammi piu' dettagli.`, needsClarification: false };
    }
}
