import { NextRequest } from 'next/server';
import { streamText, stepCountIs } from 'ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getOpenRouterSettingsAction } from '@/actions/openrouter';
import { getAiProviderAction, type AiProvider } from '@/actions/ai-settings';
import { getOpenRouterModel } from '@/ai/providers/openrouter-provider';
import { streamFromClaudeCli } from '@/ai/providers/claude-cli-provider';
import { createMcpConfig } from '@/lib/mcp-config';
import { createSqlAgentTools, doTestSqlQuery } from '@/ai/tools/sql-agent-tools';
import { createPythonAgentTools } from '@/ai/tools/python-agent-tools';
import type { ConsultedNodeType } from '@/ai/schemas/agent-schema';
import { setAgentUsageCache } from '@/lib/agent-usage-cache';
// getHtmlDesignGuide is now loaded on-demand via the getStyleGuide tool in python-agent-tools.ts

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

    return `Sei un agente AI esperto in SQL, tenace e autonomo. Modello: ${opts.modelName}.
DATA DI OGGI: ${today}${connectorInfo}${companyInfo}

## PRINCIPI FONDAMENTALI:
1. **FAI, NON SPIEGARE** — Ogni risposta DEVE contenere tool call finché non hai la query finale. MAI testo senza azione.
2. **AUTONOMIA TOTALE** — Arrangiati: esplora DB, schema, dati prima di chiedere. Chiedi SOLO per decisioni di business.
3. **TESTA SEMPRE** — Mai proporre una query senza averla testata con testSqlQuery.
4. **TOOL PARALLELI** — Se devi esplorare più tabelle, chiama exploreTableColumns su TUTTE nella stessa risposta. Se devi cercare un concetto, lancia più ricerche INFORMATION_SCHEMA in parallelo (nome italiano + inglese + abbreviazioni).
5. **RAGIONA CON think** — Prima di task complessi, usa il tool \`think\` per pianificare. Dopo un errore, usa \`think\` per analizzare la causa prima di riprovare.

## SELF-CORRECTION (CRITICO):
Se un tool call fallisce:
1. Usa \`think\` per analizzare l'errore ESATTO — non riprovare alla cieca
2. Cambia APPROCCIO: se un nome tabella non esiste, CERCA con INFORMATION_SCHEMA (non provare varianti)
3. Se dopo 3 approcci DIVERSI non funziona, allarga la ricerca (browseOtherQueries, searchKnowledgeBase)
4. NON oscillare MAI tra varianti dello stesso nome — se fallisce, è SBAGLIATO, cerca quello giusto
5. Se sei bloccato dopo aver provato tutto, spiega cosa hai tentato e chiedi input

## TABELLE IN INPUT - ARRANGIATI (CRITICO):
- Le tabelle in ingresso e i loro dati di esempio sono forniti nel contesto (sezione "TABELLE GIA' NOTE" e "DATI DI ESEMPIO").
- LEGGI SEMPRE i nomi delle colonne dai dati di esempio e dallo schema fornito. NON chiedere MAI all'utente i nomi delle colonne o la struttura - HAI GIA' TUTTO.
- Se non sei sicuro quale colonna corrisponde, usa exploreTableColumns o testSqlQuery con "SELECT TOP 3 * FROM tabella" - NON chiedere all'utente.
- ATTENZIONE AI TIPI DI DATO: Prima di usare SUM(), AVG() o operazioni matematiche, verifica il tipo delle colonne. Se una colonna e' nvarchar/varchar, usa CAST(colonna AS DECIMAL) o TRY_CAST(colonna AS DECIMAL).

## DISCOVERY TABELLE:
testSqlQuery esegue QUALSIASI query, incluse INFORMATION_SCHEMA e sys.tables.
Se "Invalid object name": cerca con LIKE su INFORMATION_SCHEMA.TABLES, allarga a sinonimi, poi sys.tables.
Per ERP (SAP, Dynamics, Mago): cerca SEMPRE in parallelo nome IT + EN + abbreviazioni su INFORMATION_SCHEMA.COLUMNS.

## ESPLORAZIONE PROFONDA (CRITICO per ERP/Gestionali):
- I database ERP usano nomi CRIPTICI. "Commessa" potrebbe essere "Job", "JobOrder", "WO_NUM", "OrdProd", "MA_Job", "ProjectNo" ecc.
- STRATEGIA DI RICERCA PER CAMPI:
  1. Cerca il nome italiano: '%commessa%', '%fattura%', '%articolo%'
  2. Cerca la traduzione inglese: '%job%', '%order%', '%work%', '%invoice%', '%item%'
  3. Cerca abbreviazioni comuni: '%ord%', '%inv%', '%art%', '%prj%', '%wo_%'
  4. Usa exploreTableColumns su TUTTE le tabelle correlate (JOIN, FK)
  5. Leggi la DESCRIZIONE delle colonne se disponibile nel databaseMap
  6. Controlla le FOREIGN KEY per trovare tabelle collegate
- REGOLA: Se non trovi un campo, cerca su INFORMATION_SCHEMA.COLUMNS prima di dire "non trovato".

## EDITING QUERY:
Per query grandi, usa editScript (find-and-replace) invece di riscrivere tutto.
Usa readScriptLines per leggere sezioni specifiche prima di modificare.

## WORKFLOW:
1. ALL'INIZIO: chiama exploreDbSchema + leggi schema/dati dal contesto (IN PARALLELO)
2. Scrivi e TESTA la query con testSqlQuery
3. Se fallisce: \`think\` -> correggi -> ritesta (approccio diverso ogni volta)
4. Query finale in blocco \`\`\`sql nel messaggio

## REGOLE:
- Connettori e credenziali sono gestiti dalla piattaforma — NON chiedere mai di configurarli
- Se connectorId presente, usalo direttamente — NON chiedere quale connettore usare
- Verifica tipi dato prima di SUM/AVG su colonne varchar (usa CAST/TRY_CAST)
- Se "ERRORE ESECUZIONE AUTOMATICA": correggi e restituisci query corretta
- Rispondi in italiano, conciso, **grassetto** per dati importanti`;
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
    activeStyleName?: string | null;
    activeStylePalette?: {
        primary: string; secondary: string; bg: string; text: string;
        success: string; danger: string; warning: string; info: string;
        headerBg: string; headerText: string; borderColor: string;
        cardBg: string; cardBorder: string; fontFamily: string;
        borderRadius: number;
    } | null;
}) {
    const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const connectorInfo = opts.connectorId ? `\nConnettore DB attuale: ${opts.connectorId}` : '';
    const companyInfo = opts.companyId ? `\nCompany ID: ${opts.companyId}` : '';

    let documentsContext = '';
    if (opts.selectedDocuments && opts.selectedDocuments.length > 0) {
        documentsContext = `\n\nDOCUMENTI SELEZIONATI:\n${opts.selectedDocuments.map(d => `- ${d}`).join('\n')}`;
        documentsContext += `\nIMPORTANTE: Questi file SONO i dati di input. Genera il codice per leggerli DIRETTAMENTE. NON chiedere dove sono.`;
    }

    return `Sei un agente AI esperto in Python per analisi dati, tenace e autonomo. Modello: ${opts.modelName}.

DATA DI OGGI: ${today}${connectorInfo}${companyInfo}${documentsContext}

## PRINCIPI FONDAMENTALI:
1. **FAI, NON SPIEGARE** — Ogni risposta DEVE contenere tool call finché non hai il codice finale. MAI testo senza azione.
2. **AUTONOMIA TOTALE** — Arrangiati: esplora DB, schema, dati prima di chiedere. Chiedi SOLO per decisioni di business.
3. **TESTA SEMPRE** — Mai proporre codice senza averlo testato con pyTestCode.
4. **TOOL PARALLELI** — Se devi esplorare più tabelle, chiama pyExploreTableColumns su TUTTE nella stessa risposta.
5. **RAGIONA CON think** — Prima di task complessi, usa il tool \`think\` per pianificare. Dopo un errore, usa \`think\` per analizzare la causa prima di riprovare.

## SELF-CORRECTION (CRITICO):
Se un tool call fallisce:
1. Usa \`think\` per analizzare l'errore ESATTO
2. Cambia APPROCCIO ad ogni tentativo
3. Se bloccato, allarga la ricerca: pyBrowseOtherScripts, pySearchKnowledgeBase
4. Se bloccato dopo aver provato tutto, spiega cosa hai tentato e chiedi input

LIBRERIE: pandas, numpy, requests, plotly.express, plotly.graph_objects, os, json, xml.etree, openpyxl. NO tabulate.
FUNZIONI BUILT-IN: query_db(sql) -> DataFrame pandas

## WHATSAPP CHAT IMPORT:
API: fetch('/api/whatsapp/sessions?flat=true') -> {success, count, data: [{session_id, phone, role, content, timestamp, session_status}]}
Params: ?phone=393..., ?status=collecting, ?limit=100. Oppure query_db su tabella WhatsAppSession (PostgreSQL).

## LEMLIST API (se connettore Lemlist selezionato):
Env vars: LEMLIST_API_KEY, LEMLIST_BASE_URL (https://api.lemlist.com/api)
Auth: Basic con username vuoto e API key come password.
\`\`\`python
import requests, os, base64
api_key = os.environ.get('LEMLIST_API_KEY', '')
base_url = os.environ.get('LEMLIST_BASE_URL', 'https://api.lemlist.com/api')
auth = ('', api_key)  # requests gestisce Basic auth con tupla

# Lista campagne
campaigns = requests.get(f'{base_url}/campaigns', auth=auth).json()

# Statistiche campagna
stats = requests.get(f'{base_url}/campaigns/{campaign_id}/stats', auth=auth).json()

# Aggiungi lead a campagna
requests.post(f'{base_url}/campaigns/{campaign_id}/leads/{email}', auth=auth,
    json={'firstName': 'Mario', 'lastName': 'Rossi', 'companyName': 'Acme'})

# Pausa/resume lead
requests.post(f'{base_url}/campaigns/{campaign_id}/leads/{email}/pause', auth=auth)
requests.post(f'{base_url}/campaigns/{campaign_id}/leads/{email}/resume', auth=auth)

# Segna come interessato
requests.post(f'{base_url}/campaigns/{campaign_id}/leads/{email}/interested', auth=auth)

# Aggiorna variabili custom
requests.patch(f'{base_url}/campaigns/{campaign_id}/leads/{email}', auth=auth,
    json={'customField': 'valore'})

# Elimina/unsub lead
requests.delete(f'{base_url}/campaigns/{campaign_id}/leads/{email}?action=unsubscribe', auth=auth)

# Export campagna
requests.get(f'{base_url}/campaigns/{campaign_id}/export', auth=auth)
\`\`\`

## DIVIETI ASSOLUTI:
- NO query SQL raw fuori da query_db(). NO pyodbc/sqlalchemy/sqlite3.
- Se df vuoto -> USA query_db(). NON dire "collega nodo upstream".
- NO dati statici/hardcoded MAI (a meno che l'utente chieda esplicitamente "dati demo/test").

## OUTPUT TYPE (scegli SEMPRE quello giusto per pyTestCode):
- result = df (DataFrame) -> outputType='table'
- result = "<html>..." (stringa HTML) -> outputType='html'
- fig.show() (Plotly) -> outputType='chart' (convertito in Recharts)
- result = {...} (dict) -> outputType='variable'
Ordine priorita' variabili: result -> output -> df -> data. Per NaN: usa pd.isna(val).
Se l'utente chiede filtri/dashboard interattive -> e' HTML, NON table.

## HTML GENERATION — INTERFACCE REACT-LIKE:
PRIMA di generare HTML, chiama il tool \`getStyleGuide\` per ottenere template e classi CSS della piattaforma.
Pattern obbligatorio: json.dumps(data, default=str) -> inietta nel JS con \`""" + json_data + """\`.

### FILOSOFIA: Le interfacce devono sembrare app React/shadcn professionali:
- Transizioni fluide su TUTTO (hover, apertura modal, drag)
- Feedback visivo immediato (toast per salvataggi, skeleton per loading)
- Stato in oggetto JS + funzione render() che ricostruisce il DOM
- Modal con backdrop blur, slide-up animation
- Toast notifications per ogni azione (save, delete, move)
- Color picker con pallini, toggle switches, tabs, accordion
- Empty states quando non ci sono dati
- Keyboard support (ESC chiude modal)

### ERRORE COMUNE: invalid decimal literal
Il CSS contiene valori decimali come \`0.3\`, \`0.06\`, \`0.9\`.
Se la stringa HTML non e' chiusa correttamente, Python interpreta questi come numeri FUORI dalla stringa -> SYNTAX ERROR.
SOLUZIONE: Usa SEMPRE triple quotes (\`"""\`) e verifica che OGNI pezzo di HTML sia DENTRO le virgolette.
MAI concatenare stringhe HTML con + se non necessario. Preferisci una SINGOLA stringa triple-quoted.
ATTENZIONE: Se usi \`""" + variabile + """\`, assicurati che non ci siano triple quotes nel CSS/JS embedded.

NON scrivere MAI i dati direttamente nell'HTML. Usa SEMPRE json.dumps() -> inietta nel JS.

## STILI CSS:
${opts.activeStyleName
        ? `STILE ATTIVO: "${opts.activeStyleName}" — CSS iniettato automaticamente dalla piattaforma.
Palette: primary=${opts.activeStylePalette?.primary}, bg=${opts.activeStylePalette?.bg}, text=${opts.activeStylePalette?.text}, success=${opts.activeStylePalette?.success}, danger=${opts.activeStylePalette?.danger}, fontFamily=${opts.activeStylePalette?.fontFamily}.`
        : `NESSUNO STILE ATTIVO: Suggerisci di andare in /style per scegliere uno stile.`}

REGOLA ZERO (CRITICA): NIENTE tag <style>, NIENTE @keyframes custom, NIENTE classi CSS inventate.
La piattaforma STRAPPA automaticamente le regole CSS con colori hardcoded (#hex, rgb, hsl).
Se scrivi <style>.mia-classe { background: #1a1a2e; }</style> viene CANCELLATO e la pagina esce BIANCA.
Usa SOLO classi della piattaforma:
- Layout: .card, .kpi-grid, .stat-card, .table-section, .two-col, .three-col, .flex-row, .flex-col
- Bottoni: .btn, .btn-secondary
- Badge: .badge .bg-success/.bg-danger/.bg-warning/.bg-info/.bg-primary
- Status: .status-dot .active/.warning/.danger, .progress-bar
- Interattivi: .modal-overlay + .modal-dialog, .toast-container + .toast, .tabs + .tab + .tab-panel
- Kanban: .kanban-board, .kanban-column, .kanban-card, .kanban-column-header, .kanban-column-body
- Form: .toggle + .toggle-slider, .dropdown + .dropdown-menu, .accordion
- Visual: .chip, .chip-group, .stepper + .step, .color-picker + .color-dot, .fab
- Testo: .avatar, .tag, .metric-huge, .timeline, .empty-state, .skeleton
Se serve un colore inline (SVG, chart JS): usa var(--primary), var(--success), etc.
Eccezione unica per style="...": width:XX% per progress-fill, height:XX% per mini-chart, background color su color-dot.
Chiama il tool \`getStyleGuide\` per la lista completa di classi, template e pattern JS disponibili.

## DATI:

Pipeline (df): dati dal nodo upstream. query_db(sql): carica direttamente dal DB.
Se df ha dati -> usa df.copy(). Se df vuoto -> usa query_db(). Dati SEMPRE dinamici.

## GRAFICI:
- SOLO plotly (px o go). NO matplotlib. Plotly convertito in Recharts automaticamente.
- Per GANTT: go.Bar con orientation='h'. NON px.timeline().
- NON personalizzare colori/font del grafico — la piattaforma applica lo stile attivo.

## CONNETTORI E CREDENZIALI:
- I connettori forniscono automaticamente token e credenziali. NON dire all'utente di configurarli.
- Se un test fallisce per token mancanti, e' NORMALE: il codice funzionera' in produzione col connettore.

## WORKFLOW:
1. ALL'INIZIO: chiama pyExploreDbSchema + leggi schema/dati dal contesto
2. Scrivi codice e TESTA con pyTestCode
3. Se fallisce: \`think\` -> correggi -> ritesta (approccio diverso ogni volta)
4. Se fallisce per token/env vars: ignora, il codice funzionera' in produzione
5. Codice finale in blocco \`\`\`python nel messaggio (il sistema lo estrae e lo salva automaticamente)
6. Per script grandi: usa editScript (find-and-replace) invece di riscrivere tutto

PRIMA risposta DEVE contenere una tool call. MAI testo senza azione.

## !!!! CARICAMENTO DATI DAL DATABASE - query_db() (CRITICO) !!!!
Nel runtime Python e' disponibile la funzione \`query_db(sql)\` che esegue una query SQL sul database e restituisce un DataFrame pandas.

### COME USARE query_db():
\`\`\`python
import pandas as pd
# Carica dati DIRETTAMENTE dal database
df = query_db("SELECT * FROM dbo.BudgetMensile_2026")
# Ora lavora con df...
result = df
\`\`\`

### REGOLE FONDAMENTALI:
1. Se l'utente chiede di lavorare su una tabella del DB -> USA SEMPRE \`query_db()\` nel codice per caricare i dati
2. NON dire MAI "collega il nodo SQL upstream" - usa query_db() direttamente nel codice!
3. Se il nodo ha gia' un upstream collegato con df popolato, PUOI usare df.copy() direttamente
4. Se df e' vuoto (0 righe), usa query_db() per caricare i dati dalla tabella
5. query_db() funziona sia durante il test (pyTestCode) che in produzione
6. PRIORITA': se df ha dati (da upstream) -> usa df.copy(). Se df e' vuoto -> usa query_db()

### ESEMPIO COMPLETO:
\`\`\`python
import pandas as pd
import json

# Prova prima il df dal nodo upstream, se vuoto carica dal DB
if df.empty:
    df = query_db("SELECT * FROM dbo.BudgetMensile_2026")

df_data = df.copy()
# ... elabora e visualizza ...
result = df_data
\`\`\`

### QUANDO TESTI CON pyTestCode:
pyTestCode ha anche il parametro opzionale \`sqlQuery\` per pre-caricare df durante il test:
pyTestCode({ code: "...", outputType: "table", sqlQuery: "SELECT * FROM dbo.BudgetMensile" })
Ma il codice FINALE deve usare query_db() per essere autosufficiente a runtime.

## !!!! SCRITTURA DB DA HTML EDITABILE (CRITICO) !!!!
La funzione \`saveToDb()\` e' GIA' DISPONIBILE GLOBALMENTE in ogni HTML renderizzato dalla piattaforma.
NON serve fetch, NON serve URL, NON serve importarla. E' iniettata automaticamente dal sistema.

### SETUP OBBLIGATORIO (all'inizio del <script>):
\`\`\`
window.__DB_TABLE__ = 'dbo.NomeTabella';
window.__DB_PK__ = ['ColonnaPK1'];
\`\`\`

### FIRMA:
\`\`\`
saveToDb(nomeTabella, oggettoRiga, arrayColonnePK)
\`\`\`
Ritorna una Promise con \`{success: true/false, message: '...'}\`.

### PATTERN COMPLETO — TABELLA EDITABILE CON SALVATAGGIO PER RIGA:
Quando l'utente chiede un HTML per salvare, fare save, update o aggiornare celle nel DB, USA QUESTO PATTERN:
\`\`\`python
import pandas as pd
import json
df = query_db("SELECT * FROM dbo.NomeTabella")
data_records = df.to_dict('records')
json_data = json.dumps(data_records, default=str)

html = \\"\\"\\"<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Titolo - Editabile</title>
    <style>
        /* SOLO stili funzionali per editing - i colori/font vengono dal sistema stili */
        .editable-cell { cursor: text; }
        .editable-cell:focus { outline: 2px solid currentColor; outline-offset: -2px; }
        .editable-cell.modified { outline: 2px dashed orange; outline-offset: -2px; }
        .status-message { padding: 8px 12px; margin: 8px 0; border-radius: 4px; display: none; }
        .status-message.success { display: block; background: #d4edda; color: #155724; }
        .status-message.error { display: block; background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <div style="max-width: 1000px; margin: 0 auto; padding: 20px;">
    <div id="statusMessage" class="status-message"></div>
    <table><thead>...</thead><tbody id="tableBody"></tbody></table>
    </div>
    <script>
        window.__DB_TABLE__ = 'dbo.NomeTabella';
        window.__DB_PK__ = ['ColonnaPK'];
        var data = \\"\\"\\" + json_data + \\"\\"\\";
        var tableBody = document.getElementById('tableBody');

        data.forEach(function(row, index) {
            var tr = document.createElement('tr');
            tr.dataset.originalData = JSON.stringify(row);
            tr.innerHTML =
                '<td class="editable-cell" contenteditable="true" data-field="Campo1">' + (row.Campo1 || '-') + '</td>' +
                '<td class="editable-cell" contenteditable="true" data-field="Campo2">' + (row.Campo2 || '-') + '</td>' +
                '<td><button class="btn btn-primary" onclick="saveRow(this)">Salva</button></td>';
            var cells = tr.querySelectorAll('.editable-cell');
            cells.forEach(function(cell) {
                cell.addEventListener('input', function() { this.classList.add('modified'); });
            });
            tableBody.appendChild(tr);
        });

        function saveRow(button) {
            var tr = button.closest('tr');
            var rowData = JSON.parse(tr.dataset.originalData);
            tr.querySelectorAll('.editable-cell').forEach(function(cell) {
                rowData[cell.dataset.field] = cell.textContent.trim();
            });
            button.disabled = true;
            button.textContent = 'Salvataggio...';
            saveToDb('dbo.NomeTabella', rowData, ['ColonnaPK'])
                .then(function(r) {
                    if (r.success) {
                        showStatus('Salvato!', 'success');
                        tr.dataset.originalData = JSON.stringify(rowData);
                        tr.querySelectorAll('.editable-cell').forEach(function(c) { c.classList.remove('modified'); });
                    } else { showStatus('Errore: ' + r.message, 'error'); }
                })
                .catch(function(e) { showStatus('Errore: ' + e.message, 'error'); })
                .finally(function() { button.disabled = false; button.textContent = 'Salva'; });
        }
        function showStatus(msg, type) {
            var el = document.getElementById('statusMessage');
            el.textContent = msg; el.className = 'status-message ' + type;
            setTimeout(function() { el.className = 'status-message'; }, 5000);
        }
    </script>
</body></html>\\"\\"\\"
result = html
\`\`\`

### PUNTI CHIAVE saveToDb():
1. \`saveToDb()\` e' GLOBALE — non serve definirla, e' gia' iniettata dal sistema
2. SEMPRE all'inizio del \`<script>\`, scrivi: \`window.__DB_TABLE__ = 'dbo.NomeTabella'; window.__DB_PK__ = ['pk1'];\`
3. Parametro 1: nome tabella completo (es. 'dbo.BudgetMensile_2026')
4. Parametro 2: oggetto con TUTTI i campi della riga (sia valori modificati che PK)
5. Parametro 3: array con i nomi delle colonne PK per la clausola WHERE
6. Il bottone Salva DEVE cambiare aspetto durante il salvataggio (disabled + testo "Salvataggio...")
7. Le celle modificate DEVONO avere classe "modified" con bordo arancione
8. NON usare MAI fetch() diretto o URL — usa SOLO saveToDb() e insertToDb()
9. Per il JS nell'HTML: usa \`function()\` e \`var\` invece di arrow functions e const/let

### insertToDb() — PER NUOVI RECORD (INSERT):
Quando l'HTML ha un bottone "Aggiungi Record" o simile, per salvare il nuovo record nel DB usa \`insertToDb()\`:
\`\`\`
insertToDb(nomeTabella, oggettoRiga)
\`\`\`
Ritorna una Promise con \`{success: true/false, message: '...'}\`.
- Parametro 1: nome tabella completo (es. 'dbo.BudgetMensile_2026')
- Parametro 2: oggetto con TUTTI i campi della riga da inserire (le proprieta' che iniziano con _ vengono ignorate)
- NON ha bisogno delle PK come terzo parametro (e' un INSERT, non un UPDATE)

ESEMPIO nel saveRow con distinzione nuovo/esistente:
\`\`\`
function saveRow(button) {
    var tr = button.closest('tr');
    var isNew = tr.dataset.isNew === 'true';
    var rowData = {};
    tr.querySelectorAll('.editable-cell').forEach(function(cell) {
        rowData[cell.dataset.field] = cell.textContent.trim();
    });
    button.disabled = true;
    button.textContent = 'Salvataggio...';
    var promise = isNew
        ? insertToDb('dbo.NomeTabella', rowData)
        : saveToDb('dbo.NomeTabella', rowData, ['ColonnaPK']);
    promise.then(function(r) {
        if (r.success) {
            showStatus('Salvato!', 'success');
            tr.dataset.isNew = 'false';  // dopo l'insert diventa update
        } else { showStatus('Errore: ' + r.message, 'error'); }
    })
    .catch(function(e) { showStatus('Errore: ' + e.message, 'error'); })
    .finally(function() { button.disabled = false; button.textContent = 'Salva'; });
}
\`\`\`

REGOLA: Se la riga e' nuova (_isNew, appena aggiunta dall'utente) -> usa insertToDb(). Se la riga esiste gia' nel DB -> usa saveToDb().

### deleteFromDb() — PER ELIMINARE RIGHE (DELETE):
Per eliminare una riga dal DB usa \`deleteFromDb()\`:
\`\`\`
deleteFromDb(nomeTabella, oggettoRiga, arrayColonnePK)
\`\`\`
Ritorna una Promise con \`{success: true/false, message: '...'}\`.
- Parametro 1: nome tabella completo (es. 'dbo.BudgetMensile_2026')
- Parametro 2: oggetto che contiene ALMENO i campi PK della riga da eliminare
- Parametro 3: array con i nomi delle colonne PK per la clausola WHERE

ESEMPIO bottone Elimina per riga:
\`\`\`
function deleteRow(button) {
    if (!confirm('Sei sicuro di voler eliminare questa riga?')) return;
    var tr = button.closest('tr');
    var rowData = {};
    tr.querySelectorAll('.editable-cell').forEach(function(cell) {
        rowData[cell.dataset.field] = cell.textContent.trim();
    });
    button.disabled = true;
    button.textContent = 'Eliminazione...';
    deleteFromDb('dbo.NomeTabella', rowData, ['ColonnaPK'])
        .then(function(r) {
            if (r.success) {
                tr.remove();
                showStatus('Riga eliminata!', 'success');
            } else { showStatus('Errore: ' + r.message, 'error'); }
        })
        .catch(function(e) { showStatus('Errore: ' + e.message, 'error'); })
        .finally(function() { button.disabled = false; button.textContent = 'Elimina'; });
}
\`\`\`
REGOLA: Il bottone Elimina DEVE chiedere conferma con confirm() prima di procedere. Dopo l'eliminazione, la riga viene rimossa dal DOM con tr.remove().

## GESTIONE SCRIPT GRANDI (CRITICO):
Hai 3 tool per lavorare con script di qualsiasi dimensione:

1. **loadScriptFromFile(filePath)**: Carica un file .py dal disco nel nodo. Usa quando l'utente dice "carica/importa/usa il file X".
   NON ripetere il contenuto — puo' essere 200KB+. Di' solo "Script caricato da [nome] (X righe, YKB)".

2. **readScriptLines(startLine?, endLine?, searchPattern?)**: Leggi sezioni specifiche dello script corrente.
   Usa PRIMA di editScript per trovare il codice esatto da modificare.
   - Con searchPattern: cerca righe che matchano (es. "def calculate_kpi")
   - Con startLine/endLine: leggi un range specifico (es. righe 100-150)

3. **editScript(oldString, newString, replaceAll?)**: Modifica lo script con find-and-replace.
   - oldString DEVE corrispondere ESATTAMENTE al testo nello script (spazi e indentazione inclusi)
   - Usa readScriptLines prima per copiare il testo esatto
   - Per modifiche multiple, chiama editScript piu' volte (le edit si accumulano)
   - NON riscrivere mai tutto lo script — modifica solo le parti necessarie

WORKFLOW PER SCRIPT GRANDI:
- **Per modificare**: readScriptLines(searchPattern="...") -> editScript(old, new)
- NON includere lo script completo nel messaggio se lo hai modificato via editScript (la piattaforma aggiorna automaticamente)

## CLASSI CSS DELLA PIATTAFORMA (RIFERIMENTO):

### CLASSI UI:
- \`.btn\` o \`.btn-primary\` → bottone primario | \`.btn-secondary\` → bottone secondario
- \`.badge\` → badge/etichetta (pill) con bg-success/bg-warning/bg-danger/bg-info/bg-primary
- \`.card\` → contenitore card con bordo e ombra | \`.positive\` / \`.negative\` → colori valori

### CLASSI LAYOUT:
- \`.kpi-grid\` → griglia responsive per KPI cards (auto-fit, minmax 180px)
- \`.two-col\` / \`.three-col\` → grid a 2 o 3 colonne (responsive)
- \`.flex-row\` → flexbox orizzontale con gap e wrap | \`.flex-col\` → flexbox verticale
- \`.table-section\` → wrapper tabella con bordo, radius, ombra e scroll
- \`.mt-sm\` / \`.mt-md\` / \`.mt-lg\` / \`.mt-xl\` → margin-top (8/16/24/32px)
- \`.mb-sm\` / \`.mb-md\` / \`.mb-lg\` → margin-bottom | \`.p-sm\` / \`.p-md\` / \`.p-lg\` → padding
- \`.text-center\` / \`.text-right\` | \`.text-sm\` / \`.text-lg\` / \`.text-xl\` / \`.text-2xl\`
- \`.font-bold\` / \`.font-medium\` / \`.font-light\` | \`.w-full\` | \`.truncate\`

### COMPONENTI PREMIUM:
- \`.avatar\` (con .sm/.lg) → cerchio iniziali | \`.tag\` → chip grigio
- \`.metric-huge\` → numero gigante con gradiente | \`.timeline\` > \`.timeline-item\`
- \`.divider-gradient\` → hr sfumata | \`.empty-state\` → stato vuoto centrato
- \`.mini-chart\` > \`.bar\` → sparkline | \`.editable-cell\` + \`.modified\`
- \`data-tooltip="..."\` → tooltip | \`.skeleton\` → loading | \`.status-message\` (.success/.error)

### KPI / STAT CARD:
\`\`\`html
<div class="kpi-grid">
  <div class="stat-card accent-primary">
    <div class="stat-label">Fatturato</div>
    <div class="stat-value">€ 1.250.000</div>
    <div class="stat-change up">+12.4%</div>
  </div>
</div>
\`\`\`

### PROGRESS BAR / STATUS DOT:
\`\`\`html
<div class="progress-bar success"><div class="progress-fill" style="width: 90%"></div></div>
<span class="status-dot active"></span> Online
\`\`\`

### CLASSI COLORE:
- \`.text-primary\` / \`.text-secondary\` / \`.text-success\` / \`.text-danger\` / \`.text-warning\` / \`.text-info\`
- \`.bg-primary\` / \`.bg-success\` / \`.bg-danger\` / \`.bg-warning\` / \`.bg-info\` / \`.bg-card\`
- \`.accent-primary\` / \`.accent-success\` / \`.accent-danger\` / \`.accent-warning\` (bordo top card)

### CSS VARIABLES (per style inline eccezionali — SVG, chart JS):
\`var(--primary)\`, \`var(--secondary)\`, \`var(--success)\`, \`var(--danger)\`, \`var(--warning)\`, \`var(--info)\`,
\`var(--bg)\`, \`var(--bg-card)\`, \`var(--text)\`, \`var(--text-secondary)\`, \`var(--border)\`,
\`var(--radius)\`, \`var(--shadow-sm)\`, \`var(--shadow-md)\`, \`var(--shadow-lg)\`, \`var(--transition)\`, \`var(--font)\`

## CORREZIONE ERRORI AUTOMATICA (CRITICO):
- Se ricevi "ERRORE ESECUZIONE AUTOMATICA", DEVI restituire il codice corretto IN UN BLOCCO \`\`\`python nel messaggio.
- Analizza l'errore, correggi il codice, e restituisci la versione corretta COMPLETA nel blocco \`\`\`python.
- ERRORI COMUNI E SOLUZIONI RAPIDE:
  * "invalid decimal literal" -> I valori CSS decimali (0.3, 0.06) sono fuori dalle virgolette. Controlla che le triple quotes siano bilanciate.
  * "invalid syntax (<string>, line 1)" -> Hai scritto SQL raw o HTML fuori da una stringa. Tutto deve essere dentro triple quotes.
  * "name 'df' is not defined" -> Usa query_db() per caricare i dati dal DB.
- QUANDO CORREGGI: modifica SOLO la parte che causa l'errore. NON riscrivere tutto il codice da zero. NON cambiare la logica che funzionava.

## FORMATO RISPOSTE:
- Rispondi SEMPRE in italiano, usa **grassetto** per dati importanti, sii CONCISO

## COME RISPONDERE — REGOLA FONDAMENTALE (OBBLIGATORIO):
Usa i tool per esplorare i dati e testare il codice.
Alla fine, rispondi con un testo che spiega brevemente cosa hai fatto.

### !!! REGOLA CRITICA: INCLUDI SEMPRE IL CODICE NEL MESSAGGIO !!!
DEVI SEMPRE includere il codice Python COMPLETO nel tuo messaggio finale racchiuso in un blocco di codice:
\`\`\`python
# ... codice completo ...
\`\`\`
Il sistema ESTRAE AUTOMATICAMENTE il codice dal blocco \`\`\`python e lo salva nel nodo.
Se NON includi il blocco di codice, il nodo NON viene aggiornato e l'utente vede ancora il vecchio script.
NON dire MAI "incolla il codice", "riesegui il nodo manualmente", "ho aggiornato lo script" SENZA includere il blocco \`\`\`python.
NON usare MAI "updateNodeScript" — NON ESISTE come tool disponibile. L'UNICO modo per aggiornare lo script e':
1. Includere il codice in un blocco \`\`\`python nel messaggio (il sistema lo estrae automaticamente)
2. Oppure usare editScript (per modifiche parziali a script grandi)
DOPO che il codice viene estratto, il sistema lo salva nel nodo e lo ESEGUE AUTOMATICAMENTE.
Se l'esecuzione fallisce, riceverai l'errore e dovrai restituire il codice corretto (sempre in un blocco \`\`\`python).`;
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

    // For large scripts (>200 lines), send only a summary to avoid filling the context window.
    // The agent can use readScriptLines to read specific sections.
    let scriptSection = '';
    const scriptContent = opts.script || '';
    const scriptLines = scriptContent.split('\n');
    const LARGE_SCRIPT_THRESHOLD = 200;

    if (!scriptContent) {
        scriptSection = '(nessun codice definito)';
    } else if (scriptLines.length <= LARGE_SCRIPT_THRESHOLD) {
        scriptSection = scriptContent;
    } else {
        // Large script: show summary + first 30 lines + last 10 lines
        const first30 = scriptLines.slice(0, 30).join('\n');
        const last10 = scriptLines.slice(-10).join('\n');
        const sizeKB = Math.round(Buffer.byteLength(scriptContent, 'utf-8') / 1024);
        scriptSection = `[SCRIPT GRANDE: ${scriptLines.length} righe, ${sizeKB}KB — usa readScriptLines per leggere sezioni specifiche, editScript per modificare]

--- PRIME 30 RIGHE ---
${first30}

--- ... (${scriptLines.length - 40} righe omesse) ... ---

--- ULTIME 10 RIGHE ---
${last10}`;
    }

    return `=== RICHIESTA ===
${opts.userMessage}

=== CODICE PYTHON CORRENTE ===
${scriptSection}
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
            treeId, // Tree ID for Claude CLI to update node directly
            messages, // AI SDK v6 sends messages array, not a single userMessage
            model: requestModel, // Optional model override from client
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

        // 3. Get AI provider settings
        const providerSettings = await getAiProviderAction();
        const aiProvider: AiProvider = providerSettings.provider || 'openrouter';

        let apiKey: string | undefined;
        let model: string | undefined;

        if (aiProvider === 'claude-cli') {
            model = requestModel || providerSettings.claudeCliModel || 'claude-sonnet-4-6';
            console.log('[chat-stream] Using Claude CLI, model:', model);
        } else {
            const settings = await getOpenRouterSettingsAction();
            apiKey = settings.apiKey;
            model = requestModel || settings.model;
            if (!apiKey || !model) {
                console.log('[chat-stream] No API key or model configured');
                return new Response(JSON.stringify({ error: 'OpenRouter API key or model not configured' }), { status: 400 });
            }
            console.log('[chat-stream] Using OpenRouter, model:', model);
        }

        // 3b. Get active style (for Python agent prompt — name + palette)
        let activeStyleName: string | null = null;
        let activeStylePalette: Parameters<typeof buildPythonSystemPrompt>[0]['activeStylePalette'] = null;
        if (agentType === 'python' && user.company) {
            const co = user.company as any;
            if (co.activeUnifiedStyleId) {
                // Check custom presets first
                const customPresets = (co.unifiedStylePresets as any[] | null) || [];
                const customMatch = customPresets.find((p: any) => p.id === co.activeUnifiedStyleId);
                let matchedPreset: any = null;
                if (customMatch) {
                    activeStyleName = customMatch.label || customMatch.id;
                    matchedPreset = customMatch;
                } else {
                    // Check built-in presets (lazy import to avoid bundle bloat)
                    try {
                        const { BUILTIN_PRESETS } = await import('@/lib/unified-style-presets');
                        const builtinMatch = BUILTIN_PRESETS.find(p => p.id === co.activeUnifiedStyleId);
                        activeStyleName = builtinMatch?.label || co.activeUnifiedStyleId;
                        matchedPreset = builtinMatch || null;
                    } catch { activeStyleName = co.activeUnifiedStyleId; }
                }
                // Extract palette from matched preset for agent prompt
                if (matchedPreset) {
                    const html = matchedPreset.html || {};
                    const ui = matchedPreset.ui || {};
                    const plotly = matchedPreset.plotly || {};
                    activeStylePalette = {
                        primary: ui.btn_bg_color || '#2563eb',
                        secondary: ui.btn_secondary_text_color || html.caption_color || '#7987a1',
                        bg: html.page_bg_color || '#ffffff',
                        text: html.body_text_color || '#374151',
                        success: html.positive_color || '#059669',
                        danger: html.negative_color || '#dc2626',
                        warning: (plotly.colorway && plotly.colorway[3]) || '#fbbc06',
                        info: (plotly.colorway && plotly.colorway[1]) || '#66d1d1',
                        headerBg: html.header_bg_color || '#1e293b',
                        headerText: html.header_text_color || '#f1f5f9',
                        borderColor: html.border_color || ui.card_border_color || '#dee2e6',
                        cardBg: ui.card_bg_color || '#ffffff',
                        cardBorder: ui.card_border_color || '#e5e7eb',
                        fontFamily: html.font_family || 'sans-serif',
                        borderRadius: ui.btn_border_radius ?? html.table_border_radius ?? 4,
                    };
                }
            }
        }

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
            ? buildPythonSystemPrompt({ modelName: model || 'unknown', connectorId, companyId, selectedDocuments, activeStyleName, activeStylePalette })
            : buildSystemPrompt({ modelName: model || 'unknown', connectorId, companyId });

        const userPrompt = agentType === 'python'
            ? buildPythonUserPrompt({ userMessage, script, tableSchema, inputTables, nodeQueries, connectorId, conversationHistory })
            : buildUserPrompt({ userMessage, script, tableSchema, inputTables, nodeQueries, connectorId, conversationHistory, discoveryContext, siblingTableHints });

        // 7. Create tools (branched by agent type)
        const tools = agentType === 'python'
            ? createPythonAgentTools({ connectorId, companyId, currentScript: script })
            : createSqlAgentTools({ connectorId, companyId, currentScript: script });
        console.log('[chat-stream] Tools created:', Object.keys(tools), 'agentType:', agentType);

        // 8. Track consulted nodes
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

        console.log('[chat-stream] Starting streaming... provider:', aiProvider);

        // 10. Stream response (branch by provider)
        if (aiProvider === 'claude-cli') {
            // ─── Claude CLI path ───────────────────────────────────────────
            const mcpAgentType = agentType === 'python' ? 'python' as const : 'sql' as const;
            const { configPath, cleanup } = await createMcpConfig({
                agentType: mcpAgentType,
                connectorId,
                companyId,
                nodeId,
                treeId,
            });

            try {
                const { response, sessionPromise } = streamFromClaudeCli({
                    model: model!,
                    systemPrompt,
                    userPrompt,
                    mcpConfigPath: configPath,
                    sessionId: conversation?.claudeCliSessionId || undefined,
                });

                // Save conversation in background after CLI finishes
                sessionPromise.then(async (info) => {
                    try {
                        if (info.inputTokens && nodeId) {
                            setAgentUsageCache(nodeId, {
                                inputTokens: info.inputTokens || 0,
                                outputTokens: info.outputTokens || 0,
                            });
                        }
                        const updatedHistory = [
                            ...conversationHistory,
                            { role: 'user', content: userMessage, timestamp: Date.now(), scriptSnapshot: script },
                            { role: 'assistant', content: info.fullText || '(Claude CLI response)', timestamp: Date.now() },
                        ];
                        if (conversation) {
                            await db.agentConversation.update({
                                where: { id: conversation.id },
                                data: { script, tableSchema, inputTables, messages: updatedHistory, claudeCliSessionId: info.sessionId || conversation.claudeCliSessionId, updatedAt: new Date() },
                            });
                        } else {
                            await db.agentConversation.create({
                                data: { nodeId, agentType, script, tableSchema, inputTables, messages: updatedHistory, companyId, claudeCliSessionId: info.sessionId },
                            });
                        }
                        console.log('[chat-stream] Claude CLI conversation saved, sessionId:', info.sessionId);
                    } catch (e) {
                        console.error('[chat-stream] Failed to save Claude CLI conversation:', e);
                    } finally {
                        await cleanup();
                    }
                }).catch(async () => { await cleanup(); });

                return response;
            } catch (error) {
                await cleanup();
                throw error;
            }
        }

        // ─── OpenRouter path (existing) ────────────────────────────────────
        const aiModel = getOpenRouterModel(apiKey!, model!);

        const result = streamText({
            model: aiModel,
            system: systemPrompt,
            messages: [{ role: 'user' as const, content: userPrompt }],
            tools,
            // Allow up to 25 tool-call round-trips for deeper agentic exploration
            stopWhen: stepCountIs(25),
            maxRetries: 2,
            temperature: 0.3,
            onStepFinish: ({ text, toolCalls }) => {
                console.log('[chat-stream] Step finished - toolCalls:', toolCalls?.length || 0, 'textLen:', text?.length || 0);
            },
            onFinish: async ({ text, usage }) => {
                console.log('[chat-stream] === FINISHED === textLen:', text?.length, 'usage:', JSON.stringify(usage));
                // Cache usage for client-side cost tracking
                if (usage && nodeId) {
                    setAgentUsageCache(nodeId, {
                        inputTokens: usage.inputTokens || 0,
                        outputTokens: usage.outputTokens || 0,
                    });
                }
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
