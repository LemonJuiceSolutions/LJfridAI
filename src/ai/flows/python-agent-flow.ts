'use server';
/**
 * @fileOverview Python agent with tool-based exploration - never gives up.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { db } from '@/lib/db';
import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';
import { type AgentInput, type AgentOutput, type ConsultedNodeType } from '@/ai/schemas/agent-schema';
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

// --- Browse Other Scripts (cross-tree/pipeline) ---

function collectScriptNodes(node: any, results: { nodeId: string; sqlQuery?: string; pythonCode?: string; resultName?: string; connectorId?: string; type: string }[] = []): typeof results {
    if (!node || typeof node === 'string') return results;
    if (node.ref || node.subTreeRef) return results;

    if (node.sqlQuery) {
        results.push({
            nodeId: node.id || null,
            sqlQuery: node.sqlQuery,
            resultName: node.sqlResultName,
            connectorId: node.sqlConnectorId,
            type: 'sql',
        });
    }
    if (node.pythonCode) {
        results.push({
            nodeId: node.id || null,
            pythonCode: node.pythonCode,
            resultName: node.pythonResultName,
            connectorId: node.pythonConnectorId,
            type: 'python',
        });
    }

    if (node.options) {
        for (const [, child] of Object.entries(node.options)) {
            if (Array.isArray(child)) {
                for (const c of child) collectScriptNodes(c, results);
            } else {
                collectScriptNodes(child as any, results);
            }
        }
    }
    return results;
}

async function doPyBrowseOtherScripts(input: { companyId: string; connectorId?: string }) {
    try {
        const scripts: { source: string; name: string; code: string; type: string; connectorId?: string; sameConnector: boolean }[] = [];

        // 1. Script da alberi
        const trees = await db.tree.findMany({
            where: { companyId: input.companyId },
            select: { id: true, name: true, jsonDecisionTree: true },
        });

        for (const tree of trees) {
            let treeData: any;
            try { treeData = JSON.parse(tree.jsonDecisionTree); } catch { continue; }
            const nodes = collectScriptNodes(treeData);
            for (const node of nodes) {
                scripts.push({
                    source: `Albero: ${tree.name}`,
                    name: node.resultName || node.nodeId || 'script',
                    code: ((node.sqlQuery || node.pythonCode) || '').substring(0, 1500),
                    type: node.type,
                    connectorId: node.connectorId,
                    sameConnector: !!(input.connectorId && node.connectorId === input.connectorId),
                });
            }
        }

        // 2. Script da pipeline
        const pipelines = await db.pipeline.findMany({
            where: { companyId: input.companyId },
            select: { id: true, name: true, nodes: true },
        });

        for (const pipeline of pipelines) {
            const pNodes = pipeline.nodes as any;
            if (!pNodes || typeof pNodes !== 'object') continue;
            const nodeEntries = Array.isArray(pNodes) ? pNodes : Object.values(pNodes);
            for (const node of nodeEntries as any[]) {
                const script = node.script || node.sqlQuery || node.pythonCode || '';
                if (!script) continue;
                if (node.type === 'start' || node.type === 'end') continue;
                const isPython = node.isPython === true || node.type === 'python';
                const nodeConnId = node.sqlConnectorId || node.pythonConnectorId || node.connectorId;
                scripts.push({
                    source: `Pipeline: ${pipeline.name}`,
                    name: node.sqlResultName || node.pythonResultName || node.name || node.id || 'script',
                    code: script.substring(0, 1500),
                    type: isPython ? 'python' : 'sql',
                    connectorId: nodeConnId,
                    sameConnector: !!(input.connectorId && nodeConnId === input.connectorId),
                });
            }
        }

        // Ordina: script dello STESSO connettore prima
        scripts.sort((a, b) => (b.sameConnector ? 1 : 0) - (a.sameConnector ? 1 : 0));

        const limited = scripts.slice(0, 50);
        if (limited.length === 0) {
            return JSON.stringify({ results: [], message: 'Nessuno script trovato in altri alberi o pipeline.' });
        }
        const sameCount = limited.filter(s => s.sameConnector).length;
        return JSON.stringify({ totalFound: scripts.length, showing: limited.length, sameConnectorCount: sameCount, scripts: limited }, null, 2);
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

const browseOtherScripts = ai.defineTool(
    {
        name: 'pyBrowseOtherScripts',
        description: 'Sfoglia le query SQL e gli script Python scritti in ALTRI alberi e pipeline della company. Passa il connectorId per vedere prima gli script dello STESSO database.',
        inputSchema: z.object({
            companyId: z.string().describe("L'ID della company."),
            connectorId: z.string().optional().describe("L'ID del connettore attuale per prioritizzare script dello stesso DB."),
        }),
        outputSchema: z.string(),
    },
    doPyBrowseOtherScripts
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
    },
    {
        type: 'function',
        function: {
            name: 'pyBrowseOtherScripts',
            description: 'Sfoglia query SQL e script Python di altri alberi e pipeline della company. Passa connectorId per filtrare per stesso DB.',
            parameters: {
                type: 'object',
                properties: {
                    companyId: { type: 'string', description: "L'ID della company." },
                    connectorId: { type: 'string', description: "L'ID del connettore attuale per prioritizzare script dello stesso DB." }
                },
                required: ['companyId']
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
    // Track consulted nodes for visibility
    const consultedNodes: ConsultedNodeType[] = [];

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

        let documentsContext = '';
        if (input.selectedDocuments && input.selectedDocuments.length > 0) {
            documentsContext = `\n\n## DOCUMENTI DISPONIBILI (INPUT FILE — GIA' CONFIGURATI)\nI seguenti file sono DISPONIBILI sul filesystem locale. NON chiedere all'utente dove sono. Sono già configurati.\n\nCome accedere:\n\`\`\`python\nimport os\ndocs_dir = os.environ['DOCUMENTS_DIR']\nselected = os.environ['SELECTED_DOCUMENTS'].split(',')\nfor filename in selected:\n    filepath = os.path.join(docs_dir, filename)\n    # leggi il file\n\`\`\`\n\nFile selezionati:\n`;
            for (const name of input.selectedDocuments) {
                const ext = name.split('.').pop()?.toLowerCase() || '';
                let hint = '';
                if (ext === 'xbrl' || ext === 'xml') hint = ' → usa xml.etree.ElementTree per parsare';
                else if (ext === 'xlsx' || ext === 'xls') hint = ' → usa pd.read_excel(filepath)';
                else if (ext === 'csv') hint = ' → usa pd.read_csv(filepath)';
                else if (ext === 'json') hint = ' → usa json.load(open(filepath))';
                documentsContext += `- ${name}${hint}\n`;
            }
            documentsContext += `\nIMPORTANTE: Questi file SONO i dati di input. Genera il codice per leggerli DIRETTAMENTE. NON chiedere dove sono.`;
        }

        const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const systemPrompt = `Sei un agente AI esperto in Python per analisi dati. Stai utilizzando il modello: ${modelName}. NON MOLLARE MAI. Sei tenace e persistente.
DATA DI OGGI: ${today}

${connectorInfo}${companyInfo}${documentsContext}

## RAGIONAMENTO STRUTTURATO (OBBLIGATORIO):
Prima di scrivere o modificare codice, segui SEMPRE questo processo:
1. **COMPRENDI**: Cosa vuole l'utente? Riformula mentalmente la richiesta
2. **ANALIZZA**: Quali dati servono? Controlla schema, colonne e dati di esempio disponibili
3. **PROGETTA**: Pianifica la struttura del codice (import → dati → elaborazione → output)
4. **SCRIVI**: Genera il codice Python ottimale e pulito
5. **TESTA**: Verifica con pyTestCode - MAI saltare
6. **VALIDA**: L'output risponde alla domanda? Il grafico mostra i dati giusti?
7. **RISPONDI**: Solo dopo la validazione, restituisci il codice

LIBRERIE DISPONIBILI: pandas (pd), numpy (np), requests, plotly.express (px), plotly.graph_objects (go), os, json, xml.etree.ElementTree (ET), openpyxl
NON USARE MAI LA LIBRERIA 'tabulate' (non e' installata).

## !!!! DIVIETI ASSOLUTI - LEGGI PRIMA DI TUTTO !!!!
1. MAI scrivere query SQL raw FUORI da query_db(). Le SELECT vanno DENTRO query_db("SELECT ..."), MAI come codice Python diretto.
2. MAI connetterti al database con librerie esterne (NO pyodbc, NO sqlalchemy, NO sqlite3, NO connection string). Usa SOLO \`query_db()\` oppure \`df\` dalla pipeline.
3. Se \`df\` ha 0 righe e 0 colonne -> USA \`query_db("SELECT * FROM dbo.NomeTabella")\` per caricare i dati. NON dire MAI "collega il nodo SQL upstream".
4. Se l'utente dice "Nessun dato da visualizzare" → il codice ha restituito un DataFrame vuoto. Controlla: (a) l'input df e' vuoto? → usa query_db() (b) i filtri sono troppo restrittivi? → allargali (c) i nomi delle colonne sono sbagliati? → controlla con print(df.columns.tolist())
5. MAI USARE DATI STATICI/HARDCODED NEL CODICE - SENZA ECCEZIONI:
   - NON creare MAI DataFrame/dizionari/liste con dati fittizi, di esempio o di fallback
   - NON scrivere MAI "data_records = [{...}, {...}]" con valori hardcoded
   - I dati DEVONO arrivare da query_db() o dalla pipeline (df)
   - Se df e' vuoto: USA query_db() per caricare i dati. NON inventare dati.

## FUNZIONE query_db() (DISPONIBILE NEL RUNTIME):
La funzione \`query_db(sql)\` esegue una query SQL sul database e restituisce un DataFrame pandas.
Uso: \`df = query_db("SELECT * FROM dbo.NomeTabella")\`
- Funziona sia durante il test (pyTestCode) che a runtime (nel nodo)
- PRIORITA': Se df ha dati (da upstream) -> usa df.copy(). Se df e' vuoto -> usa query_db()
- Esempio:
  \`\`\`python
  if df.empty:
      df = query_db("SELECT * FROM dbo.BudgetMensile_2026")
  df_data = df.copy()
  result = df_data
  \`\`\`

## COME FUNZIONA IL SISTEMA DI OUTPUT (CRITICO - LEGGI BENE):
Il backend Python cerca il risultato nelle variabili in questo ORDINE DI PRIORITA': result → output → df → data.
La variabile DEVE essere del tipo giusto per l'outputType del nodo:

### outputType='table' (TABELLA):
- Il backend si aspetta un pandas DataFrame come risultato
- ASSEGNA il DataFrame a \`result\` (o modifica \`df\` in-place)
- NON usare fig.show() - NON usare go.Table - NON usare print() come output principale
- print() va nello stdout (utile per debug), ma NON e' il risultato
- Il DataFrame viene renderizzato automaticamente come tabella HTML dalla piattaforma
- ESEMPIO CORRETTO:
  \`\`\`python
  # df e' gia' disponibile con i dati dall'input
  result = df  # Mostra tutto il DataFrame cosi' com'e'
  # oppure con filtri/trasformazioni:
  result = df[df['importo'] > 1000].sort_values('importo', ascending=False)
  \`\`\`
- ESEMPIO SBAGLIATO (causa errore "Expected DataFrame but got NoneType"):
  \`\`\`python
  print(df)  # SBAGLIATO: print va in stdout, non restituisce nulla
  fig.show()  # SBAGLIATO: questo e' per chart, non per table
  \`\`\`

### outputType='chart' (GRAFICO):
- Usa plotly (px o go) e chiama fig.show() alla fine
- Il backend cattura il grafico Plotly e lo converte in Recharts
- ESEMPIO CORRETTO:
  \`\`\`python
  import plotly.express as px
  fig = px.bar(df, x='mese', y='vendite', title='Vendite per mese')
  fig.show()
  \`\`\`

### outputType='variable' (VARIABILE):
- Assegna un dizionario a \`result\`: result = {"valore": 42, "nome": "test"}

### outputType='html' (HTML LIBERO):
- Assegna una stringa HTML a \`result\`: result = "<h1>Titolo</h1><p>Contenuto</p>"
- Per TABELLE HTML con stile: usa df.to_html(escape=False) + CSS inline in un tag <style>

#### REGOLE GENERAZIONE HTML (CRITICO):
Quando generi codice Python che produce HTML:
- STRUTTURA OBBLIGATORIA: df.copy() -> json.dumps(records, default=str) -> HTML con json_data iniettato
- Usa SEMPRE triple quotes (\`"""\`) per l'HTML. Se usi \`""" + variabile + """\`, assicurati che le triple quotes siano bilanciate
- ERRORE COMUNE "invalid decimal literal": valori CSS decimali (0.3, 0.06, rgba) fuori dalle virgolette -> controlla che le triple quotes siano bilanciate
- Per iniettare dati nel JS dell'HTML: usa json.dumps() e concatena con \`""" + json_data + """\`. MAI scrivere dati hardcoded nell'HTML
- MAI concatenare stringhe HTML con + se non necessario. Preferisci una SINGOLA stringa triple-quoted

- Per GESTIRE NaN/None con stile visivo (es. colore diverso), usa SEMPRE questo pattern:
  \`\`\`python
  nan_span = '<span style="color:#ff8c00;font-weight:bold;">NaN</span>'
  def format_cell(val):
      if pd.isna(val):
          return nan_span
      s = str(val)
      if s.strip().lower() in ('nan', 'none', ''):
          return nan_span
      return s
  df_html = df_filtered.applymap(format_cell)
  html_table = df_html.to_html(index=False, escape=False)
  \`\`\`
- NON usare MAI \`df.astype(str).replace('nan', ...)\` per stilizzare NaN - NON FUNZIONA in modo affidabile
- Usa SEMPRE \`pd.isna(val)\` PRIMA di convertire a stringa - e' l'unico modo sicuro per catturare NaN/None/NaT

## COME ARRIVANO I DATI (DUE MODI):
1. **Pipeline (df)**: I dati dal nodo upstream arrivano come \`df\`. Se il nodo ha piu' dipendenze, ogni dipendenza e' disponibile col suo NOME.
2. **query_db()**: Puoi caricare dati DIRETTAMENTE dal database con \`df = query_db("SELECT * FROM dbo.Tabella")\`.
- PRIORITA': Se df ha dati (da upstream) -> usa df.copy(). Se df e' vuoto -> usa query_db().
- REGOLA: I dati sono SEMPRE DINAMICI. MAI dati fittizi o di fallback.

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

## REGOLA D'ORO: FAI, NON SPIEGARE
- Quando l'utente chiede una modifica (es. "Rinomina colonna X in Y"), ESEGUI ESATTAMENTE LA RINOMINA nel codice finale.
- Se l'utente chiede di rinominare "Owner" in "PROPRIETARIO", assicurati che nel DataFrame finale ci sia SOLO "PROPRIETARIO" e non "Owner".
- NON ripetere la stessa risposta piu' volte.
- LEGGI ATTENTAMENTE il codice che l'utente incolla o suggerisce.
- NON CHIEDERE dati che hai gia': se hai lo schema e i dati di esempio, USALI. L'utente si aspetta che tu ti arrangi leggendo i dati disponibili.

## IL TUO WORKFLOW:
1. ALL'INIZIO di ogni richiesta: cerca nella KB (pySearchKnowledgeBase) E esplora il DB se hai un connectorId (pyExploreDbSchema + pyExploreTableColumns sulle tabelle rilevanti).
2. LEGGI lo schema e i dati di esempio gia' forniti nel contesto. NON chiedere mai dati che sono gia' visibili.
3. Se non trovi le tabelle/colonne che ti servono, usa pyBrowseOtherScripts per vedere query SQL e script Python gia' scritti in altri alberi e pipeline della stessa company.
4. Scrivi codice ROBUSTO (retry, sleep, no tabulate).
5. TESTA SEMPRE con pyTestCode prima di rispondere - MAI saltare questo passaggio.
6. Se fallisce per Token, ignora e restituisci il codice comunque.
7. Se fallisce per logica, correggi e riprova (fino a 3 tentativi).

## !!!! CARICAMENTO DATI DINAMICO - sqlQuery in pyTestCode (CRITICO) !!!!
Il codice Python DEVE usare \`query_db()\` per caricare dati dal DB quando df e' vuoto.
pyTestCode ha anche il parametro opzionale \`sqlQuery\` per pre-caricare df durante il test.
Ma il codice FINALE deve usare query_db() per essere autosufficiente a runtime.

### ESEMPIO CODICE CON query_db():
\`\`\`python
import pandas as pd
# Se df e' vuoto (nessun upstream collegato), carica dal DB
if df.empty:
    df = query_db("SELECT * FROM dbo.NomeTabella")
df_data = df.copy()
result = df_data
\`\`\`

## CORREZIONE ERRORI AUTOMATICA (CRITICO):
- Se ricevi un messaggio "ERRORE ESECUZIONE AUTOMATICA", significa che il codice che hai generato e' stato eseguito automaticamente ma ha fallito.
- DEVI SEMPRE restituire il codice corretto completo in updatedScript. Questo e' OBBLIGATORIO - senza updatedScript il sistema non puo' riprovare.
- Analizza l'errore, correggi il codice, e restituisci la versione corretta in updatedScript.
- Concentrati sull'errore specifico: spesso e' un nome colonna sbagliato, un tipo di dato non gestito, o un import mancante.
- NON ripetere spiegazioni lunghe - vai dritto alla correzione con il codice corretto.
- Rispondi con una breve spiegazione di cosa hai corretto + il codice completo corretto.
- QUANDO CORREGGI: modifica SOLO la parte che causa l'errore. NON riscrivere tutto il codice da zero.
- ERRORI COMUNI RAPIDI:
  * "invalid decimal literal" -> CSS decimali (0.3, rgba) fuori dalle triple quotes. Bilancia le virgolette.
  * "invalid syntax (<string>, line 1)" -> SQL raw o HTML fuori da stringa. Tutto dentro triple quotes.
  * "name 'df' is not defined" -> Usa query_db() per caricare i dati dal DB.

### ERRORE COMUNE: "Expected DataFrame result for output type table, but got NoneType":
- Significa che il codice NON ha assegnato un DataFrame a result/output/df/data
- CAUSA TIPICA: hai usato print(df) o fig.show() invece di assegnare result = df
- SOLUZIONE: aggiungi \`result = df\` (o \`result = df_trasformato\`) come ultima riga significativa
- Se stdout dice "0 righe, 0 colonne": il DataFrame in input e' vuoto → il nodo precedente non e' collegato, dillo all'utente

### ERRORE COMUNE: DataFrame vuoto (0 righe):
- Se df ha 0 righe e 0 colonne durante il test, USA il parametro sqlQuery di pyTestCode per pre-caricare i dati dal DB
- Se non sai quale tabella serve, chiedi all'utente il nome della tabella
- NON provare soluzioni alternative come connetterti al DB direttamente o scrivere query SQL nel codice Python
- NON iterare 4+ volte con approcci diversi
- NON usare MAI dati statici/fittizi come fallback

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

## AUTO-REVIEW CODICE (CONTROLLA PRIMA DI RISPONDERE):
Prima di restituire il codice, verifica mentalmente:
- Il codice restituisce il TIPO GIUSTO per l'outputType? (table→DataFrame in result, chart→fig.show(), variable→dict, html→stringa)
- Per outputType='table': c'e' \`result = ...\` con un DataFrame? (NON print, NON fig.show)
- Per outputType='chart': c'e' \`fig.show()\` alla fine?
- Tutti gli import sono presenti all'inizio del file?
- I nomi delle colonne corrispondono ESATTAMENTE ai dati di esempio/schema?
- Le conversioni di tipo sono gestite? (stringhe → numeri, date, formati italiani)
- Il codice gestisce valori null/NaN senza crashare?
- Per outputType='html': se devo stilizzare NaN, sto usando pd.isna() con applymap? (MAI .astype(str).replace('nan',...))
- Per outputType='html': ho messo escape=False in to_html() se uso HTML inline nelle celle?
- Il grafico ha titolo, etichette assi e legenda comprensibili?
- Il codice e' autocontenuto e pronto da eseguire senza modifiche?
- Se qualcosa non torna, correggi PRIMA di rispondere.

## PREVENZIONE ERRORI (CRITICO):
- NON Chiudere una lista [ con una graffa } o viceversa.
- Assicurati che le stringhe multilinea siano chiuse.
- Se definisci dizionari lunghi, assicurati di chiuderli correttamente con }.
- NON inserire "}}" o markdown code delimiters extra all'interno del blocco di codice Python. Il codice deve essere pulito e pronto all'uso.

## STRATEGIA DI FALLBACK PROGRESSIVA:
Quando il codice fallisce, segui questa scala:
1. Correggi l'errore specifico (nome colonna, import mancante, tipo sbagliato)
2. Esplora i dati con pyTestCode: print(df.columns.tolist()), print(df.dtypes)
3. Riscrivi la parte problematica con approccio diverso
4. Se e' un problema di dati (NaN, formati), aggiungi pulizia dati robusta
5. Sfoglia gli script di altri alberi/pipeline con pyBrowseOtherScripts per trovare nomi tabelle e pattern corretti
6. Solo come ULTIMO passo, chiedi all'utente
- NON ripetere MAI lo stesso errore - cambia approccio ad ogni tentativo

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
  "clarificationQuestions": [],
  "solutionSourceNode": "nome del nodo che ha ispirato la soluzione, oppure null se nessuno"
}
\`\`\`

## SOLUTIONSOURCENODE:
- Se la tua soluzione e' stata ispirata o basata su uno script trovato in un altro nodo (tramite pyBrowseOtherScripts), indica il NOME di quel nodo in solutionSourceNode.
- Se hai risolto senza ispirazione da altri nodi, metti null.`;

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
                    ...(input.companyId ? [searchKB, listConnectors, saveToKB, browseOtherScripts] : []),
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
                    openRouterTools.find(t => t.function.name === 'pySaveToKnowledgeBase'),
                    openRouterTools.find(t => t.function.name === 'pyBrowseOtherScripts')
                ] : [])
            ].filter(Boolean) as OpenRouterTool[];

            const dispatcher = async (name: string, args: any) => {
                let result: string;
                switch (name) {
                    case 'pyExploreDbSchema': result = await doPyExploreDbSchema(args); break;
                    case 'pyExploreTableColumns': result = await doPyExploreTableColumns(args); break;
                    case 'pyTestSqlQuery': result = await doPyTestSqlQuery(args); break;
                    case 'pyTestCode': result = await doPyTestCode(args); break;
                    case 'pySearchKnowledgeBase': result = await doPySearchKB(args); break;
                    case 'pyListSqlConnectors': result = await doPyListConnectors(args); break;
                    case 'pySaveToKnowledgeBase': result = await doPySaveToKB(args); break;
                    case 'pyBrowseOtherScripts': result = await doPyBrowseOtherScripts(args); break;
                    default: result = JSON.stringify({ error: `Tool sconosciuto: ${name}` });
                }

                // Track consulted nodes from pyBrowseOtherScripts
                if (name === 'pyBrowseOtherScripts') {
                    try {
                        const parsed = JSON.parse(result);
                        if (parsed.scripts && Array.isArray(parsed.scripts)) {
                            for (const s of parsed.scripts) {
                                const exists = consultedNodes.some(n => n.source === s.source && n.name === s.name);
                                if (!exists) {
                                    consultedNodes.push({
                                        source: s.source,
                                        name: s.name,
                                        type: s.type === 'python' ? 'python' : 'sql',
                                        sameConnector: s.sameConnector || false,
                                        wasSolutionSource: false,
                                    });
                                }
                            }
                        }
                    } catch { /* ignore parse errors */ }
                }

                return result;
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

            // Mark the solution source node based on LLM's indication
            if (parsedMetadata.solutionSourceNode && typeof parsedMetadata.solutionSourceNode === 'string') {
                const srcLower = parsedMetadata.solutionSourceNode.toLowerCase();
                const sourceNode = consultedNodes.find(n =>
                    n.name.toLowerCase().includes(srcLower) ||
                    srcLower.includes(n.name.toLowerCase())
                );
                if (sourceNode) {
                    sourceNode.wasSolutionSource = true;
                }
            }

            return {
                message: displayMessage,
                updatedScript: finalScript,
                needsClarification: parsedMetadata.needsClarification || false,
                clarificationQuestions: parsedMetadata.clarificationQuestions || [],
                consultedNodes: consultedNodes.length > 0 ? consultedNodes : undefined,
                usage,
            };
        }

        return { message: resultText, needsClarification: false, consultedNodes: consultedNodes.length > 0 ? consultedNodes : undefined, usage };
    } catch (e: any) {
        console.error('Error in Python agent flow:', e);
        return { message: `Errore: ${e.message}. Riprova o dammi piu' dettagli.`, needsClarification: false };
    }
}
