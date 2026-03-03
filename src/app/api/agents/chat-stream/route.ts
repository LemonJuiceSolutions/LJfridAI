import { NextRequest } from 'next/server';
import { streamText, stepCountIs } from 'ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getOpenRouterSettingsAction } from '@/actions/openrouter';
import { getOpenRouterModel } from '@/ai/providers/openrouter-provider';
import { createSqlAgentTools, doTestSqlQuery } from '@/ai/tools/sql-agent-tools';
import { createPythonAgentTools } from '@/ai/tools/python-agent-tools';
import type { ConsultedNodeType } from '@/ai/schemas/agent-schema';

export const maxDuration = 120; // Allow up to 2 min for agent runs

// ─── System Prompt Builder ──────────────────────────────────────────────────
// Adapted for Vercel AI SDK (tool calls are handled by the SDK, not as JSON)

function buildSystemPrompt(opts: {
    modelName: string;
    connectorId?: string;
    companyId?: string;
}) {
    const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const connectorInfo = opts.connectorId ? `\nConnettore DB attuale: ${opts.connectorId}` : '';
    const companyInfo = opts.companyId ? `\nCompany ID: ${opts.companyId}` : '';

    return `Sei un agente AI esperto in SQL. Stai utilizzando il modello: ${opts.modelName}. NON MOLLARE MAI. Sei tenace e persistente.
RICORDA: Se una tabella non esiste, CERCALA con testSqlQuery su INFORMATION_SCHEMA.TABLES. NON oscillare tra varianti del nome!
DATA DI OGGI: ${today}

${connectorInfo}${companyInfo}

## RAGIONAMENTO STRUTTURATO (OBBLIGATORIO):
Prima di generare o modificare una query, segui SEMPRE questo processo:
1. **COMPRENDI**: Cosa vuole esattamente l'utente? Riformula mentalmente la richiesta
2. **ANALIZZA**: Quali tabelle e colonne servono? Controlla schema e dati di esempio
3. **SCRIVI**: Genera la query SQL ottimale
4. **TESTA**: Verifica con testSqlQuery - MAI saltare
5. **VALIDA**: I risultati rispondono alla domanda? I numeri hanno senso?
6. **RISPONDI**: Solo dopo la validazione, restituisci la query

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
- ATTENZIONE AI TIPI DI DATO: Prima di usare SUM(), AVG() o operazioni matematiche, verifica il tipo delle colonne. Se una colonna e' nvarchar/varchar, usa CAST(colonna AS DECIMAL) o TRY_CAST(colonna AS DECIMAL).

## !!!! REGOLA CRITICA: DISCOVERY TABELLE (LEGGI PRIMA DI TUTTO) !!!!
Tu HAI il tool testSqlQuery. Puoi eseguire QUALSIASI query SQL, incluse query su INFORMATION_SCHEMA.TABLES e sys.tables.
Se una tabella NON ESISTE ("Invalid object name"), NON provare varianti del nome. CERCA la tabella giusta cosi':

STEP 1 - CERCA: testSqlQuery con:
  SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Customer%'
STEP 2 - ALLARGA: Se non trovi nulla, prova piu' parole chiave
STEP 3 - FALLBACK: Se ancora nulla: SELECT name, schema_id FROM sys.tables WHERE name LIKE '%Cust%'
STEP 4 - VERIFICA: Usa exploreTableColumns sulla tabella trovata per vedere le colonne
STEP 5 - COSTRUISCI: Scrivi la query con il nome ESATTO trovato

DIVIETO ASSOLUTO: MAI oscillare tra varianti dello stesso nome. Se il nome non funziona, il nome e' SBAGLIATO. Cerca quello giusto.

## ESPLORAZIONE PROFONDA (CRITICO per ERP/Gestionali):
- I database ERP (SAP, Dynamics, JDE, Mago, etc.) usano nomi CRIPTICI per le colonne. "Commessa" potrebbe essere "Job", "JobOrder", "JOBCd", "WO_NUM", "OrdProd", "MA_Job", "ProjectNo" ecc.
- Quando l'utente chiede un concetto (es. "commessa", "fattura", "cliente", "articolo"), NON cercare solo il nome esatto. CERCA ANCHE su INFORMATION_SCHEMA.COLUMNS:
  SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME LIKE '%keyword%'
- STRATEGIA DI RICERCA PER CAMPI:
  1. Cerca il nome italiano: '%commessa%', '%fattura%', '%articolo%'
  2. Cerca la traduzione inglese: '%job%', '%order%', '%work%', '%invoice%', '%item%'
  3. Cerca abbreviazioni comuni: '%ord%', '%inv%', '%art%', '%prj%', '%wo_%'
  4. Usa exploreTableColumns su TUTTE le tabelle che potrebbero essere correlate (JOIN, FK)
  5. Leggi la DESCRIZIONE delle colonne se disponibile nel databaseMap
  6. Controlla le FOREIGN KEY per trovare tabelle collegate
- REGOLA: Se non trovi un campo, cerca su INFORMATION_SCHEMA.COLUMNS prima di dire "non trovato". ESPANDI SEMPRE la ricerca a tabelle correlate via FK.

## CONNETTORE DB (NON CHIEDERE MAI):
- Se hai un connectorId nel contesto, USALO direttamente.
- NON CHIEDERE MAI "quale connettore vuoi usare?" - MAI. Il connettore e' gestito dal sistema.

## REGOLA D'ORO: FAI, NON SPIEGARE
- Quando l'utente chiede una modifica, MODIFICA LA QUERY e restituiscila.
- NON ripetere la stessa risposta piu' volte.
- NON CHIEDERE dati che hai gia': se hai lo schema e i dati di esempio, USALI.

## IL TUO WORKFLOW:
1. ALL'INIZIO di ogni richiesta: cerca nella KB (searchKnowledgeBase) E esplora il DB se hai un connectorId.
2. LEGGI lo schema e i dati di esempio gia' forniti nel contesto.
3. Se non conosci il connettore, usa listSqlConnectors per trovarlo.
4. Se non trovi le tabelle/colonne, usa browseOtherQueries per vedere query SQL gia' scritte.
5. TESTA SEMPRE la query con testSqlQuery prima di proporla - MAI saltare.
6. Se la query fallisce, correggi e RIPROVA (fino a 3 tentativi).
7. Quando trovi la soluzione, SALVALA nella Knowledge Base con sqlSaveToKnowledgeBase.

## CORREZIONE ERRORI AUTOMATICA (CRITICO):
- Se ricevi un messaggio "ERRORE ESECUZIONE AUTOMATICA", DEVI SEMPRE restituire la query corretta.
- Analizza l'errore SQL, correggi la query, e restituisci la versione corretta.

## FORMATO RISPOSTE:
- Rispondi SEMPRE in italiano
- Usa **grassetto** per evidenziare dati importanti
- Sii CONCISO

## COME RISPONDERE (IMPORTANTE):
Usa i tool per esplorare il database e testare le query.
Alla fine, rispondi con un testo che spiega brevemente cosa hai fatto.
Se hai una query SQL da proporre all'utente, includi la query SQL finale nel tuo messaggio racchiusa in un blocco di codice:
\`\`\`sql
SELECT ...
\`\`\`
Indica chiaramente la query come "QUERY FINALE" o "Ecco la query".`;
}

// ─── Context Builder ────────────────────────────────────────────────────────

function buildUserPrompt(opts: {
    userMessage: string;
    script?: string;
    tableSchema?: Record<string, string[]>;
    inputTables?: Record<string, any[]>;
    nodeQueries?: Record<string, { query: string; isPython: boolean; connectorId?: string }>;
    connectorId?: string;
    conversationHistory?: { role: string; content: string }[];
    discoveryContext?: string;
    siblingTableHints?: string;
}) {
    let context = '';

    if (opts.tableSchema && Object.keys(opts.tableSchema).length > 0) {
        context += '\n\nTABELLE GIA\' NOTE:\n';
        for (const [tableName, columns] of Object.entries(opts.tableSchema)) {
            context += `- ${tableName}: ${Array.isArray(columns) ? columns.join(', ') : 'schema non disponibile'}\n`;
        }
    }

    if (opts.inputTables && Object.keys(opts.inputTables).length > 0) {
        context += '\nDATI DI ESEMPIO:\n';
        for (const [tableName, data] of Object.entries(opts.inputTables)) {
            if (Array.isArray(data) && data.length > 0) {
                context += `${tableName}: ${JSON.stringify(data.slice(0, 2))}\n`;
            }
        }
    }

    if (opts.nodeQueries && Object.keys(opts.nodeQueries).length > 0) {
        context += '\nQUERY SQL DA ALTRI NODI NELLO STESSO ALBERO:\n';
        for (const [nodeName, info] of Object.entries(opts.nodeQueries)) {
            const type = info.isPython ? 'Python' : 'SQL';
            const sameConn = !!(opts.connectorId && info.connectorId === opts.connectorId);
            const connNote = sameConn ? ' [STESSO CONNETTORE]' : (info.connectorId ? ' [altro connettore]' : '');
            const truncatedQuery = info.query.length > 1500 ? info.query.substring(0, 1500) + '...' : info.query;
            context += `- ${nodeName} (${type}${connNote}):\n  ${truncatedQuery}\n`;
        }
    }

    let historyContext = '';
    if (opts.conversationHistory && opts.conversationHistory.length > 0) {
        const recent = opts.conversationHistory.slice(-10);
        historyContext = '\nCRONOLOGIA:\n' + recent.map(m => `${m.role === 'user' ? 'Utente' : 'Agente'}: ${m.content}`).join('\n');
    }

    return `=== RICHIESTA ===
${opts.userMessage}
${opts.discoveryContext || ''}${opts.siblingTableHints || ''}
=== QUERY SQL CORRENTE ===
${opts.script || '(nessuna query definita)'}
${context}${historyContext}

Usa i tool a tua disposizione per esplorare il DB, testare le query, e poi rispondi con la query SQL finale.`;
}

// ─── Python System Prompt Builder ────────────────────────────────────────────

function buildPythonSystemPrompt(opts: {
    modelName: string;
    connectorId?: string;
    companyId?: string;
    selectedDocuments?: string[];
}) {
    const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const connectorInfo = opts.connectorId ? `\nConnettore DB attuale: ${opts.connectorId}` : '';
    const companyInfo = opts.companyId ? `\nCompany ID: ${opts.companyId}` : '';

    let documentsContext = '';
    if (opts.selectedDocuments && opts.selectedDocuments.length > 0) {
        documentsContext = `\n\nDOCUMENTI SELEZIONATI:\n${opts.selectedDocuments.map(d => `- ${d}`).join('\n')}`;
        documentsContext += `\nIMPORTANTE: Questi file SONO i dati di input. Genera il codice per leggerli DIRETTAMENTE. NON chiedere dove sono.`;
    }

    return `Sei un agente AI esperto in Python per analisi dati. Stai utilizzando il modello: ${opts.modelName}. NON MOLLARE MAI. Sei tenace e persistente.
DATA DI OGGI: ${today}

${connectorInfo}${companyInfo}${documentsContext}

## RAGIONAMENTO STRUTTURATO (OBBLIGATORIO):
Prima di scrivere o modificare codice, segui SEMPRE questo processo:
1. **COMPRENDI**: Cosa vuole l'utente? Riformula mentalmente la richiesta
2. **ANALIZZA**: Quali dati servono? Controlla schema, colonne e dati di esempio disponibili
3. **PROGETTA**: Pianifica la struttura del codice (import -> dati -> elaborazione -> output)
4. **SCRIVI**: Genera il codice Python ottimale e pulito
5. **TESTA**: Verifica con pyTestCode - MAI saltare
6. **VALIDA**: L'output risponde alla domanda? Il grafico mostra i dati giusti?
7. **RISPONDI**: Solo dopo la validazione, restituisci il codice

LIBRERIE DISPONIBILI: pandas (pd), numpy (np), requests, plotly.express (px), plotly.graph_objects (go), os, json, xml.etree.ElementTree (ET), openpyxl
NON USARE MAI LA LIBRERIA 'tabulate' (non e' installata).

## !!!! DIVIETI ASSOLUTI - LEGGI PRIMA DI TUTTO !!!!
1. MAI scrivere query SQL raw come codice Python. Tu sei un NODO PYTHON, non SQL. Se scrivi "SELECT * FROM tabella" come codice, dara' syntax error.
2. MAI connetterti al database direttamente (NO pyodbc, NO sqlalchemy, NO sqlite3, NO connection string). Il sandbox Python NON ha accesso al database. I dati arrivano SOLO dalle dipendenze (nodi upstream collegati via pipeline).
3. Se \`df\` ha 0 righe e 0 colonne -> il nodo upstream NON e' collegato. Dillo SUBITO all'utente: "Il nodo SQL upstream non e' collegato o non restituisce dati. Collegalo nella pipeline." NON provare a "risolvere" il problema scrivendo codice.
4. Se l'utente dice "Nessun dato da visualizzare" -> il codice ha restituito un DataFrame vuoto. Controlla: (a) l'input df e' vuoto? -> dillo all'utente (b) i filtri sono troppo restrittivi? -> allargali (c) i nomi delle colonne sono sbagliati? -> controlla con print(df.columns.tolist())

## COME FUNZIONA IL SISTEMA DI OUTPUT (CRITICO):
Il backend Python cerca il risultato nelle variabili in questo ORDINE DI PRIORITA': result -> output -> df -> data.
La variabile DEVE essere del tipo giusto per l'outputType del nodo:

### outputType='table' (TABELLA):
- Assegna un DataFrame a \`result\`: result = df
- NON usare fig.show() - NON usare print() come output principale

### outputType='chart' (GRAFICO):
- Usa plotly (px o go) e chiama fig.show() alla fine
- Il backend cattura il grafico Plotly e lo converte in Recharts

### outputType='variable' (VARIABILE):
- Assegna un dizionario a \`result\`: result = {"valore": 42}

### outputType='html' (HTML LIBERO):
- Assegna una stringa HTML a \`result\`: result = "<h1>Titolo</h1>"
- Per NaN/None: usa SEMPRE pd.isna(val) con applymap, MAI .astype(str).replace('nan',...)

## COME ARRIVANO I DATI DALLE DIPENDENZE (PIPELINE):
- I dati dal nodo precedente arrivano AUTOMATICAMENTE come \`df\` (e \`data\`)
- Se il nodo ha piu' dipendenze, ogni dipendenza e' disponibile col suo NOME
- \`df\` viene mappato all'ULTIMA dipendenza (il nodo padre diretto)
- Se \`df\` ha 0 righe/colonne, il nodo precedente NON e' collegato -> segnalalo all'utente

## REGOLE GRAFICI (CRITICO):
- Usa SEMPRE e SOLO plotly per generare grafici (plotly.express o plotly.graph_objects).
- NON usare MAI matplotlib.
- I grafici Plotly vengono automaticamente convertiti nel sistema Recharts della piattaforma.
- Per i GANTT: usa SEMPRE go.Bar con orientation='h'. NON usare px.timeline().
- PREFERISCI SEMPRE tipi semplici (bar, line, scatter, pie, area).

## CONTESTO PIATTAFORMA (IMPORTANTE):
- I CONNETTORI forniscono automaticamente token e credenziali come variabili d'ambiente
- NON DIRE MAI all'utente di "configurare manualmente i token" - sono GIA' gestiti dalla piattaforma
- Se un test con pyTestCode fallisce per mancanza di token/env vars, e' NORMALE: il codice funzionera' in produzione col connettore

## TABELLE IN INPUT - ARRANGIATI (CRITICO):
- Le tabelle in ingresso e i loro dati di esempio sono forniti nel contesto.
- LEGGI SEMPRE i nomi delle colonne dai dati di esempio. NON chiedere MAI all'utente.
- Se non sei sicuro quale colonna corrisponde, usa pyTestCode con print(df.columns.tolist()) - NON chiedere all'utente.
- ARRANGIATI: esplora i dati con pyTestCode prima di chiedere. Chiedi all'utente SOLO per decisioni di business.

## REGOLA D'ORO: FAI, NON SPIEGARE
- Quando l'utente chiede una modifica, ESEGUI ESATTAMENTE LA MODIFICA nel codice.
- NON ripetere la stessa risposta piu' volte.
- NON CHIEDERE dati che hai gia'.

## IL TUO WORKFLOW:
1. ALL'INIZIO: cerca nella KB (pySearchKnowledgeBase) E esplora il DB se hai un connectorId.
2. LEGGI schema e dati di esempio gia' forniti.
3. Scrivi codice ROBUSTO (retry per API, sleep per rate limiting, no tabulate).
4. TESTA SEMPRE con pyTestCode prima di rispondere - MAI saltare.
5. Se fallisce per Token, ignora e restituisci il codice comunque.
6. Se fallisce per logica, correggi e riprova (fino a 3 tentativi).
7. Quando trovi la soluzione, SALVALA nella Knowledge Base con pySaveToKnowledgeBase.

## CORREZIONE ERRORI AUTOMATICA (CRITICO):
- Se ricevi "ERRORE ESECUZIONE AUTOMATICA", DEVI restituire il codice corretto.
- Analizza l'errore, correggi il codice, e restituisci la versione corretta.

## FORMATO RISPOSTE:
- Rispondi SEMPRE in italiano
- Usa **grassetto** per evidenziare dati importanti
- Sii CONCISO

## COME RISPONDERE (IMPORTANTE):
Usa i tool per esplorare i dati e testare il codice.
Alla fine, rispondi con un testo che spiega brevemente cosa hai fatto.
Includi il codice Python finale nel tuo messaggio racchiuso in un blocco di codice:
\`\`\`python
# ... codice ...
\`\`\`
Indica chiaramente il codice come "CODICE FINALE" o "Ecco il codice".`;
}

// ─── Python Context Builder ─────────────────────────────────────────────────

function buildPythonUserPrompt(opts: {
    userMessage: string;
    script?: string;
    tableSchema?: Record<string, string[]>;
    inputTables?: Record<string, any[]>;
    nodeQueries?: Record<string, { query: string; isPython: boolean; connectorId?: string }>;
    connectorId?: string;
    conversationHistory?: { role: string; content: string }[];
}) {
    let context = '';

    if (opts.tableSchema && Object.keys(opts.tableSchema).length > 0) {
        context += '\n\nTABELLE GIA\' NOTE:\n';
        for (const [tableName, columns] of Object.entries(opts.tableSchema)) {
            context += `- ${tableName}: ${Array.isArray(columns) ? columns.join(', ') : 'schema non disponibile'}\n`;
        }
    }

    if (opts.inputTables && Object.keys(opts.inputTables).length > 0) {
        context += '\nDATI DI ESEMPIO:\n';
        for (const [tableName, data] of Object.entries(opts.inputTables)) {
            if (Array.isArray(data) && data.length > 0) {
                context += `${tableName}: ${JSON.stringify(data.slice(0, 2))}\n`;
            }
        }
    }

    if (opts.nodeQueries && Object.keys(opts.nodeQueries).length > 0) {
        context += '\nSCRIPT DA ALTRI NODI NELLO STESSO ALBERO:\n';
        for (const [nodeName, info] of Object.entries(opts.nodeQueries)) {
            const type = info.isPython ? 'Python' : 'SQL';
            const sameConn = !!(opts.connectorId && info.connectorId === opts.connectorId);
            const connNote = sameConn ? ' [STESSO CONNETTORE]' : (info.connectorId ? ' [altro connettore]' : '');
            const truncatedQuery = info.query.length > 1500 ? info.query.substring(0, 1500) + '...' : info.query;
            context += `- ${nodeName} (${type}${connNote}):\n  ${truncatedQuery}\n`;
        }
    }

    let historyContext = '';
    if (opts.conversationHistory && opts.conversationHistory.length > 0) {
        const recent = opts.conversationHistory.slice(-10);
        historyContext = '\nCRONOLOGIA:\n' + recent.map(m => `${m.role === 'user' ? 'Utente' : 'Agente'}: ${m.content}`).join('\n');
    }

    return `=== RICHIESTA ===
${opts.userMessage}

=== CODICE PYTHON CORRENTE ===
${opts.script || '(nessun codice definito)'}
${context}${historyContext}

Usa i tool a tua disposizione per esplorare i dati se necessario, poi rispondi con il codice Python finale.`;
}

// ─── Pre-flight Discovery ───────────────────────────────────────────────────

async function runPreflightDiscovery(userMessage: string, connectorId: string): Promise<string> {
    const invalidObjMatch = userMessage.match(/Invalid object name '([^']+)'/i);
    if (!invalidObjMatch) return '';

    const badTableName = invalidObjMatch[1];
    const bareTableName = badTableName.replace(/^(\[?[^\]]*\]?\.)*/g, '').replace(/[\[\]]/g, '');
    const searchTerms = new Set<string>([bareTableName]);
    const parts = bareTableName.replace(/^MA_/, '').split(/(?=[A-Z])/);
    for (const part of parts) {
        if (part.length >= 3) searchTerms.add(part);
    }

    const discoveryResults: string[] = [];
    for (const term of searchTerms) {
        try {
            const searchResult = await doTestSqlQuery({
                query: `SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%${term.replace(/'/g, "''")}%' ORDER BY TABLE_NAME`,
                connectorId,
            });
            const parsed = JSON.parse(searchResult);
            if (parsed.success && parsed.sampleData && parsed.sampleData.length > 0) {
                for (const row of parsed.sampleData) {
                    const fullName = row.TABLE_SCHEMA ? `[${row.TABLE_SCHEMA}].[${row.TABLE_NAME}]` : row.TABLE_NAME;
                    if (!discoveryResults.includes(fullName)) {
                        discoveryResults.push(fullName);
                    }
                }
            }
        } catch { /* ignore */ }
    }

    if (discoveryResults.length > 0) {
        return `\n\n🔍 DISCOVERY AUTOMATICA: La tabella '${badTableName}' NON ESISTE. Tabelle trovate:\n` +
            discoveryResults.slice(0, 20).map(n => `  - ${n}`).join('\n') +
            `\nISTRUZIONE: Usa UNO di questi nomi ESATTI. NON inventare nomi.\n`;
    }

    return `\n\n🔍 DISCOVERY AUTOMATICA: La tabella '${badTableName}' NON ESISTE e nessuna tabella simile trovata.\n`;
}

function extractSiblingTableHints(nodeQueries?: Record<string, { query: string; isPython: boolean; connectorId?: string }>): string {
    if (!nodeQueries) return '';
    const tableNames = new Set<string>();
    for (const [, info] of Object.entries(nodeQueries)) {
        if (info.isPython) continue;
        const fromJoinMatches = info.query.matchAll(/(?:FROM|JOIN)\s+(\[?[^\s,\(\)]+\]?(?:\.\[?[^\s,\(\)]+\]?)*)/gi);
        for (const m of fromJoinMatches) {
            tableNames.add(m[1]);
        }
    }
    if (tableNames.size === 0) return '';
    return `\nTABELLE USATE DAI NODI FRATELLI (nomi VERIFICATI funzionanti):\n${[...tableNames].map(t => `  - ${t}`).join('\n')}\n`;
}

// ─── POST Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        console.log('[chat-stream] === REQUEST START ===');

        // 1. Auth check
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            console.log('[chat-stream] Unauthorized');
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        const body = await request.json();
        const {
            nodeId,
            agentType,
            script,
            tableSchema,
            inputTables,
            nodeQueries,
            connectorId,
            selectedDocuments,
            messages, // AI SDK v6 sends messages array, not a single userMessage
        } = body;

        console.log('[chat-stream] Body keys:', Object.keys(body));
        console.log('[chat-stream] nodeId:', nodeId, 'agentType:', agentType, 'connectorId:', connectorId);
        console.log('[chat-stream] messages count:', Array.isArray(messages) ? messages.length : 'not array');
        if (Array.isArray(messages) && messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            console.log('[chat-stream] last message role:', lastMsg?.role, 'parts:', JSON.stringify(lastMsg?.parts?.slice(0, 2)));
        }

        // Extract user message: AI SDK sends `messages` array (UIMessage[])
        // The last user message contains the actual text in `parts`
        let userMessage: string = body.userMessage || ''; // fallback for direct calls
        if (!userMessage && Array.isArray(messages) && messages.length > 0) {
            const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
            if (lastUserMsg) {
                // v6 UIMessage has parts array with { type: 'text', text: '...' }
                if (Array.isArray(lastUserMsg.parts)) {
                    userMessage = lastUserMsg.parts
                        .filter((p: any) => p.type === 'text')
                        .map((p: any) => p.text)
                        .join('');
                } else if (typeof lastUserMsg.content === 'string') {
                    // Fallback for older format
                    userMessage = lastUserMsg.content;
                }
            }
        }

        console.log('[chat-stream] Extracted userMessage:', userMessage?.substring(0, 100));

        if (!nodeId || !agentType || !userMessage) {
            console.log('[chat-stream] Missing fields - nodeId:', !!nodeId, 'agentType:', !!agentType, 'userMessage:', !!userMessage);
            return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
        }

        // Check for missing connectorId on SQL agent (skip if input tables are available)
        const hasInputTables = tableSchema && Object.keys(tableSchema).length > 0;
        if (agentType === 'sql' && !connectorId && !hasInputTables) {
            return new Response(JSON.stringify({
                error: 'Connettore database mancante',
                message: 'Per poter eseguire query SQL, questo nodo deve avere un connettore database configurato. Vai nelle impostazioni del nodo e seleziona un connettore.',
            }), { status: 400 });
        }

        // 2. Get user/company
        const user = await db.user.findUnique({
            where: { email: session.user.email },
            include: { company: true },
        });
        if (!user?.company) {
            return new Response(JSON.stringify({ error: 'User not associated with a company' }), { status: 400 });
        }
        const companyId = user.company.id;

        // 3. Get OpenRouter settings
        const settings = await getOpenRouterSettingsAction();
        const apiKey = settings.apiKey;
        const model = settings.model;

        if (!apiKey || !model) {
            console.log('[chat-stream] No API key or model configured');
            return new Response(JSON.stringify({ error: 'OpenRouter API key or model not configured' }), { status: 400 });
        }

        console.log('[chat-stream] Using model:', model);

        // 4. Get conversation history
        const conversation = await db.agentConversation.findUnique({
            where: { nodeId_agentType: { nodeId, agentType } },
        });
        const conversationHistory = conversation ? (conversation.messages as any[]) : [];

        // 5. Pre-flight discovery (SQL only)
        const discoveryContext = (agentType === 'sql' && connectorId) ? await runPreflightDiscovery(userMessage, connectorId) : '';
        const siblingTableHints = agentType === 'sql' ? extractSiblingTableHints(nodeQueries) : '';

        // 6. Build prompts (branched by agent type)
        const systemPrompt = agentType === 'python'
            ? buildPythonSystemPrompt({ modelName: model, connectorId, companyId, selectedDocuments })
            : buildSystemPrompt({ modelName: model, connectorId, companyId });

        const userPrompt = agentType === 'python'
            ? buildPythonUserPrompt({ userMessage, script, tableSchema, inputTables, nodeQueries, connectorId, conversationHistory })
            : buildUserPrompt({ userMessage, script, tableSchema, inputTables, nodeQueries, connectorId, conversationHistory, discoveryContext, siblingTableHints });

        // 7. Create tools (branched by agent type)
        const tools = agentType === 'python'
            ? createPythonAgentTools({ connectorId, companyId })
            : createSqlAgentTools({ connectorId, companyId });
        console.log('[chat-stream] Tools created:', Object.keys(tools), 'agentType:', agentType);

        // 8. Get model
        const aiModel = getOpenRouterModel(apiKey, model);

        // 9. Track consulted nodes
        const consultedNodes: ConsultedNodeType[] = [];
        if (nodeQueries) {
            for (const [nodeName, info] of Object.entries(nodeQueries as Record<string, { query: string; isPython: boolean; connectorId?: string }>)) {
                const sameConn = !!(connectorId && info.connectorId === connectorId);
                consultedNodes.push({
                    source: 'Nodo fratello',
                    name: nodeName,
                    type: info.isPython ? 'python' : 'sql',
                    sameConnector: sameConn,
                    wasSolutionSource: false,
                });
            }
        }

        console.log('[chat-stream] Starting streamText...');

        // 10. Stream with Vercel AI SDK
        const result = streamText({
            model: aiModel,
            system: systemPrompt,
            messages: [{ role: 'user' as const, content: userPrompt }],
            tools,
            // Allow up to 15 tool-call round-trips (default is stepCountIs(1) = stops after 1!)
            stopWhen: stepCountIs(15),
            maxRetries: 2,
            temperature: 0.3,
            onStepFinish: ({ text, toolCalls }) => {
                console.log('[chat-stream] Step finished - toolCalls:', toolCalls?.length || 0, 'textLen:', text?.length || 0);
            },
            onFinish: async ({ text, usage }) => {
                console.log('[chat-stream] === FINISHED === textLen:', text?.length, 'usage:', JSON.stringify(usage));
                try {
                    const updatedHistory = [
                        ...conversationHistory,
                        { role: 'user', content: userMessage, timestamp: Date.now(), scriptSnapshot: script },
                        {
                            role: 'assistant',
                            content: text,
                            timestamp: Date.now(),
                            consultedNodes: consultedNodes.length > 0 ? consultedNodes : undefined,
                        },
                    ];

                    if (conversation) {
                        await db.agentConversation.update({
                            where: { id: conversation.id },
                            data: { script, tableSchema, inputTables, messages: updatedHistory, updatedAt: new Date() },
                        });
                    } else {
                        await db.agentConversation.create({
                            data: { nodeId, agentType, script, tableSchema, inputTables, messages: updatedHistory, companyId },
                        });
                    }
                    console.log('[chat-stream] Conversation saved');
                } catch (e) {
                    console.error('[chat-stream] Failed to save conversation:', e);
                }
            },
        });

        console.log('[chat-stream] Returning UIMessageStreamResponse');
        return result.toUIMessageStreamResponse();
    } catch (error: any) {
        console.error('[chat-stream] FATAL Error:', error?.message, error?.stack?.substring(0, 500));
        return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), { status: 500 });
    }
}
