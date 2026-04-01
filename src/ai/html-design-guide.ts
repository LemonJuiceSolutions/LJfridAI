/**
 * HTML Design Guide for AI agents.
 *
 * Provides PREMIUM layout templates and composition rules
 * so that Python agent / super agent produce beautiful, professional HTML.
 * All templates use ONLY platform CSS classes — no inline styles or <style> tags.
 */

export function getHtmlDesignGuide(): string {
    return `
## !!!! GUIDA DESIGN HTML — INTERFACCE PREMIUM (OBBLIGATORIO) !!!!

Quando generi HTML, segui SEMPRE queste regole di design per produrre pagine PREMIUM, PROFESSIONALI e BELLE.
NON generare MAI HTML "piatto" senza struttura. Usa SEMPRE i pattern qui sotto.
L'obiettivo e' creare interfacce che sembrino progettate da un designer professionista.

### FILOSOFIA DESIGN PREMIUM:
- **Gerarchia visiva chiara**: Grande > Medio > Piccolo. I dati importanti devono "saltare all'occhio"
- **Spaziatura generosa**: MAI elementi schiacciati. Usa mt-md/mt-lg TRA ogni sezione
- **Raggruppamento logico**: Ogni sezione in .card con titolo H3. Mai dati "liberi" nel vuoto
- **Colori semantici**: .positive/.negative per valori, .badge per stati, .accent-* per enfasi
- **Responsive**: Usa .kpi-grid, .two-col, .three-col — MAI width fissi
- **Micro-dettagli**: Badge per stati, progress-bar per %, status-dot per indicatori live
- **Numeri formattati**: Separatori migliaia (1.250.000), simbolo valuta, percentuali con segno

### REGOLA D'ORO — STRUTTURA PAGINA:
1. \`<h1>\` + sottotitolo \`<p class="text-secondary">\` (SEMPRE)
2. KPI cards in \`.kpi-grid\` (i numeri chiave PRIMA di tutto)
3. Sezioni logiche in \`.card\` con \`<h3>\` come titolo
4. Tabelle in \`.table-section\` (SEMPRE wrappate)
5. Azioni in \`.flex-row\` in fondo

---

### TEMPLATE 1: DASHBOARD KPI (Executive Summary)
Quando l'utente chiede dashboard, panoramica, riepilogo con metriche:
\`\`\`html
<h1>Titolo Dashboard</h1>
<p class="text-secondary">Aggiornamento al DD/MM/YYYY</p>

<div class="kpi-grid mt-md">
  <div class="stat-card accent-primary">
    <div class="stat-label">Metrica Principale</div>
    <div class="stat-value">€ 1.250.000</div>
    <div class="stat-change up">+12.4%</div>
  </div>
  <div class="stat-card accent-success">
    <div class="stat-label">Obiettivo Raggiunto</div>
    <div class="stat-value">87%</div>
    <div class="progress-bar success mt-sm"><div class="progress-fill" style="width:87%"></div></div>
  </div>
  <div class="stat-card accent-warning">
    <div class="stat-label">In Attesa</div>
    <div class="stat-value">23</div>
    <div class="stat-change down">-5.1%</div>
  </div>
  <div class="stat-card accent-danger">
    <div class="stat-label">Criticita'</div>
    <div class="stat-value">4</div>
    <span class="badge bg-danger">Urgente</span>
  </div>
</div>

<div class="card mt-lg">
  <h3>Dettaglio per Categoria</h3>
  <div class="table-section mt-sm">
    <table>
      <thead><tr><th>Categoria</th><th>Valore</th><th>Var. %</th><th>Stato</th></tr></thead>
      <tbody>
        <tr>
          <td><strong>Categoria A</strong></td>
          <td>€ 450.000</td>
          <td class="positive">+8.2%</td>
          <td><span class="badge bg-success">OK</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<div class="flex-row mt-md">
  <button class="btn" onclick="...">Aggiorna Dati</button>
  <button class="btn-secondary" onclick="...">Esporta CSV</button>
</div>
\`\`\`

---

### TEMPLATE 2: REPORT / ANALISI DATI
Quando l'utente chiede un report, un'analisi, un confronto:
\`\`\`html
<h1>Report Titolo</h1>
<p class="text-secondary">Periodo: Gen-Mar 2026 | Generato il DD/MM/YYYY</p>
<hr class="divider-gradient">

<div class="two-col mt-md">
  <div class="card">
    <h3>Riepilogo Periodo Corrente</h3>
    <div class="kpi-grid">
      <div class="stat-card">
        <div class="stat-label">Totale</div>
        <div class="stat-value">€ 2.300.000</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Media Mensile</div>
        <div class="stat-value">€ 766.667</div>
      </div>
    </div>
  </div>
  <div class="card">
    <h3>Confronto Periodo Precedente</h3>
    <div class="kpi-grid">
      <div class="stat-card">
        <div class="stat-label">Variazione</div>
        <div class="stat-value text-success">+15.3%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Trend</div>
        <div class="stat-value"><span class="status-dot active"></span> In crescita</div>
      </div>
    </div>
  </div>
</div>

<div class="card mt-lg">
  <h3>Dettaglio Mensile</h3>
  <div class="table-section mt-sm">
    <table>
      <thead><tr><th>Mese</th><th>Ricavi</th><th>Costi</th><th>Margine</th><th>Avanzamento</th></tr></thead>
      <tbody>
        <tr>
          <td><strong>Gennaio</strong></td>
          <td>€ 750.000</td>
          <td>€ 620.000</td>
          <td class="positive">€ 130.000</td>
          <td><div class="progress-bar success"><div class="progress-fill" style="width:65%"></div></div></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<div class="card mt-md">
  <h3>Note e Osservazioni</h3>
  <ul>
    <li><strong>Performance:</strong> Obiettivi superati del 12%</li>
    <li><strong>Rischi:</strong> <span class="badge bg-warning">2 aree critiche</span> da monitorare</li>
  </ul>
</div>
\`\`\`

---

### TEMPLATE 3: FORM EDITABILE / CRUD
Quando l'utente chiede una tabella editabile, form di inserimento, gestione dati:
\`\`\`html
<h1>Gestione [Entita']</h1>
<p class="text-secondary">Modifica i valori nelle celle e clicca Salva per aggiornare il database</p>

<div class="flex-row mt-md mb-md">
  <button class="btn" onclick="addRow()">+ Aggiungi Riga</button>
  <input type="text" placeholder="Cerca..." oninput="filterTable(this.value)">
</div>

<div id="statusMessage" class="status-message"></div>

<div class="table-section">
  <table>
    <thead>
      <tr>
        <th>Campo 1</th>
        <th>Campo 2</th>
        <th>Stato</th>
        <th class="text-center">Azioni</th>
      </tr>
    </thead>
    <tbody id="tableBody">
      <!-- Righe generate da JS -->
    </tbody>
  </table>
</div>

<div class="flex-row mt-md">
  <p class="text-sm text-secondary">Totale: <strong id="rowCount">0</strong> record</p>
</div>
\`\`\`
NOTA: Per le celle editabili usa contenteditable="true" con classe .editable-cell.
Per lo stato usa badge: <span class="badge bg-success">Attivo</span>

---

### TEMPLATE 4: STATO PROGETTO / OVERVIEW
Quando l'utente chiede stato progetto, overview, sommario informativo:
\`\`\`html
<h1>Stato Progetto</h1>
<p class="text-secondary">Ultimo aggiornamento: DD/MM/YYYY HH:mm</p>

<div class="kpi-grid mt-md">
  <div class="stat-card accent-success">
    <div class="stat-label">Completamento</div>
    <div class="stat-value">73%</div>
    <div class="progress-bar success mt-sm"><div class="progress-fill" style="width:73%"></div></div>
  </div>
  <div class="stat-card accent-primary">
    <div class="stat-label">Task Completati</div>
    <div class="stat-value">42 / 58</div>
  </div>
  <div class="stat-card accent-warning">
    <div class="stat-label">Scadenze Prossime</div>
    <div class="stat-value">5</div>
  </div>
</div>

<div class="three-col mt-lg">
  <div class="card">
    <h3><span class="status-dot active"></span> Completati</h3>
    <ul>
      <li>Task Alpha <span class="badge bg-success">Done</span></li>
      <li>Task Beta <span class="badge bg-success">Done</span></li>
    </ul>
  </div>
  <div class="card">
    <h3><span class="status-dot warning"></span> In Corso</h3>
    <ul>
      <li>Task Gamma <span class="badge bg-warning">WIP</span></li>
      <li>Task Delta <span class="badge bg-info">Review</span></li>
    </ul>
  </div>
  <div class="card">
    <h3><span class="status-dot"></span> Da Fare</h3>
    <ul>
      <li>Task Epsilon</li>
      <li>Task Zeta</li>
    </ul>
  </div>
</div>

<div class="card mt-lg">
  <h3>Timeline / Milestone</h3>
  <div class="table-section mt-sm">
    <table>
      <thead><tr><th>Milestone</th><th>Scadenza</th><th>Avanzamento</th><th>Stato</th></tr></thead>
      <tbody>
        <tr>
          <td><strong>Fase 1</strong></td>
          <td>15/03/2026</td>
          <td><div class="progress-bar success"><div class="progress-fill" style="width:100%"></div></div></td>
          <td><span class="badge bg-success">Completato</span></td>
        </tr>
        <tr>
          <td><strong>Fase 2</strong></td>
          <td>30/04/2026</td>
          <td><div class="progress-bar"><div class="progress-fill" style="width:45%"></div></div></td>
          <td><span class="badge bg-warning">In Corso</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
\`\`\`

---

### TEMPLATE 5: SCHEDA DETTAGLIO / PROFILO
Quando l'utente chiede dettaglio di un elemento, profilo cliente, scheda prodotto:
\`\`\`html
<div class="flex-row">
  <div class="avatar">AB</div>
  <div>
    <h1>Nome Entita'</h1>
    <p class="text-secondary">Codice: ABC-001 | <span class="badge bg-success">Attivo</span></p>
  </div>
</div>
<hr class="divider-gradient">

<div class="two-col mt-md">
  <div class="card">
    <h3>Informazioni Generali</h3>
    <table>
      <tbody>
        <tr><td class="font-bold">Campo 1</td><td>Valore 1</td></tr>
        <tr><td class="font-bold">Campo 2</td><td>Valore 2</td></tr>
        <tr><td class="font-bold">Stato</td><td><span class="status-dot active"></span> Operativo</td></tr>
      </tbody>
    </table>
  </div>
  <div class="card">
    <h3>Metriche</h3>
    <div class="kpi-grid">
      <div class="stat-card">
        <div class="stat-label">Valore Totale</div>
        <div class="stat-value">€ 85.000</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Ultimo Ordine</div>
        <div class="stat-value">12/03/2026</div>
      </div>
    </div>
  </div>
</div>

<div class="card mt-lg">
  <h3>Storico Attivita'</h3>
  <div class="table-section mt-sm">
    <table>
      <thead><tr><th>Data</th><th>Attivita'</th><th>Risultato</th></tr></thead>
      <tbody>
        <tr><td>10/03/2026</td><td>Ordine #1234</td><td class="positive">€ 12.500</td></tr>
      </tbody>
    </table>
  </div>
</div>
\`\`\`

---

### TEMPLATE 6: TIMELINE / STORICO EVENTI
Quando l'utente chiede uno storico, cronologia, log eventi:
\`\`\`html
<h1>Storico Attivita'</h1>
<p class="text-secondary">Ultimi eventi registrati</p>

<div class="card mt-md">
  <div class="timeline">
    <div class="timeline-item completed">
      <div class="flex-row">
        <strong>Ordine Completato</strong>
        <span class="badge bg-success">Completato</span>
      </div>
      <p class="text-sm text-secondary mt-sm">15/03/2026 - Ordine #1234 consegnato con successo</p>
    </div>
    <div class="timeline-item warning">
      <div class="flex-row">
        <strong>Revisione Richiesta</strong>
        <span class="badge bg-warning">In Attesa</span>
      </div>
      <p class="text-sm text-secondary mt-sm">14/03/2026 - Il cliente ha richiesto modifiche al preventivo</p>
    </div>
    <div class="timeline-item">
      <div class="flex-row">
        <strong>Preventivo Inviato</strong>
        <span class="badge bg-info">Info</span>
      </div>
      <p class="text-sm text-secondary mt-sm">12/03/2026 - Preventivo #567 inviato al cliente</p>
    </div>
  </div>
</div>
\`\`\`

---

### COMPONENTI PREMIUM DISPONIBILI:

#### Avatar (iniziali o icona):
\`<div class="avatar">MZ</div>\` — cerchio colorato con iniziali
\`<div class="avatar sm">A</div>\` — piccolo
\`<div class="avatar lg">AB</div>\` — grande

#### Tag / Chip:
\`<span class="tag">Categoria</span>\` — tag grigio neutro

#### Metrica Enorme (hero number):
\`<div class="metric-huge">€ 12.5M</div>\` — numero gigante con gradiente

#### Tooltip:
\`<span data-tooltip="Dettaglio aggiuntivo">Testo con info</span>\`

#### Divider Gradiente:
\`<hr class="divider-gradient">\` — linea sfumata elegante

#### Empty State:
\`\`\`html
<div class="empty-state">
  <div class="icon">📊</div>
  <h3>Nessun dato disponibile</h3>
  <p>I dati verranno mostrati quando saranno disponibili</p>
</div>
\`\`\`

#### Mini Chart (sparkline manuale):
\`\`\`html
<div class="mini-chart">
  <div class="bar" style="height:40%"></div>
  <div class="bar" style="height:60%"></div>
  <div class="bar" style="height:30%"></div>
  <div class="bar" style="height:80%"></div>
  <div class="bar" style="height:55%"></div>
</div>
\`\`\`

#### Chat Bubble (bot):
\`\`\`html
<div class="chat-row">
  <div class="avatar sm">AI</div>
  <div class="chat-bubble bot">
    <span class="chat-sender">Assistente</span>
    Testo risposta...
    <span class="chat-time">14:30</span>
  </div>
</div>
\`\`\`

#### Chat Bubble (utente):
\`<div class="chat-row user"><div class="chat-bubble user">Testo<span class="chat-time">14:31</span></div></div>\`

#### Typing Indicator (3 pallini animati):
\`<div class="typing-dots"><span></span><span></span><span></span></div>\`

#### Chat Input Bar (premium):
\`<div class="chat-input-bar"><input type="text" placeholder="Scrivi..." /><button class="btn">Invia</button></div>\`

---

### TEMPLATE 7: FORM INTERATTIVO / SIMULAZIONE / WHAT-IF
Quando l'utente chiede un form di simulazione, analisi what-if, calcolatore, configuratore:
\`\`\`html
<h1>Analisi What-If</h1>
<p class="text-secondary">Inserisci lo scenario da analizzare</p>

<div class="card mt-md">
  <h3>Parametri Scenario</h3>
  <div class="flex-col gap-md">
    <div>
      <label class="font-bold text-sm">Descrizione scenario</label>
      <textarea id="scenarioInput" rows="3" placeholder="Es. Aumenta ricavi del 10% da aprile a giugno..."></textarea>
    </div>
    <div class="flex-row">
      <div class="flex-col">
        <label class="font-bold text-sm">Variazione %</label>
        <input type="number" id="varInput" placeholder="+10" />
      </div>
      <div class="flex-col">
        <label class="font-bold text-sm">Periodo</label>
        <select id="periodSelect">
          <option>Q1 2026</option>
          <option>Q2 2026</option>
        </select>
      </div>
    </div>
  </div>
  <div class="flex-row mt-md">
    <button class="btn" onclick="runAnalysis()">Analizza</button>
    <button class="btn-secondary" onclick="resetForm()">Reset</button>
  </div>
</div>

<div id="statusMessage" class="status-message mt-md"></div>

<div id="resultsSection" class="mt-lg">
  <!-- Risultati dinamici inseriti qui da JS -->
</div>
\`\`\`
NOTA IMPORTANTE: Per i risultati dell'analisi, genera HTML con le classi .kpi-grid, .stat-card, .table-section etc.
NON usare MAI style="..." nel form o nei risultati. La piattaforma stila TUTTO automaticamente.

---

### TEMPLATE 8: CHAT / CONVERSAZIONE INTERATTIVA
Quando l'utente chiede un'interfaccia chat, assistente, Q&A interattivo.
La piattaforma fornisce classi chat dedicate — usale SEMPRE:
\`\`\`html
<h1>Assistente AI</h1>
<p class="text-secondary"><span class="status-dot active"></span> Online</p>
<hr class="divider-gradient">

<!-- Container messaggi (scrollabile automaticamente) -->
<div class="chat-container mt-md" id="chatMessages">

  <!-- Welcome screen (rimosso dopo primo messaggio) -->
  <div class="chat-welcome" id="welcomeScreen">
    <div class="icon">AI</div>
    <h3>Benvenuto!</h3>
    <p>Descrivi cosa vuoi analizzare e ti aiutero'.</p>
    <div class="chat-suggestions">
      <button class="btn-secondary" onclick="useSuggestion('Esempio 1')">Suggerimento 1</button>
      <button class="btn-secondary" onclick="useSuggestion('Esempio 2')">Suggerimento 2</button>
      <button class="btn-secondary" onclick="useSuggestion('Esempio 3')">Suggerimento 3</button>
    </div>
  </div>

  <!-- Esempio messaggio bot (con avatar) -->
  <div class="chat-row">
    <div class="avatar sm">AI</div>
    <div class="chat-bubble bot">
      <span class="chat-sender">Assistente</span>
      Ciao! Come posso aiutarti oggi?
      <span class="chat-time">14:30</span>
    </div>
  </div>

  <!-- Esempio messaggio utente -->
  <div class="chat-row user">
    <div class="chat-bubble user">
      +10% ricavi da aprile
      <span class="chat-time">14:31</span>
    </div>
  </div>

  <!-- Typing indicator -->
  <div class="typing-dots" id="typingIndicator" hidden>
    <span></span><span></span><span></span>
  </div>
</div>

<!-- Barra input premium -->
<div class="chat-input-bar mt-md">
  <input type="text" id="chatInput" placeholder="Scrivi un messaggio..." />
  <button class="btn" onclick="sendMessage()">Invia</button>
</div>
\`\`\`
CLASSI CHAT DISPONIBILI:
- \`.chat-container\`: wrapper scrollabile per i messaggi (max-height automatico)
- \`.chat-row\` / \`.chat-row.user\`: riga messaggio (bot a sx, user a dx)
- \`.chat-bubble.bot\`: bolla AI (sfondo card, bordo, ombra)
- \`.chat-bubble.user\`: bolla utente (sfondo gradiente primary, testo bianco)
- \`.chat-sender\`: etichetta nome nel bubble bot
- \`.chat-time\`: orario piccolo
- \`.typing-dots\`: indicatore "sta scrivendo" con 3 pallini animati (\`<span>\` x3)
- \`.chat-welcome\`: schermata iniziale centrata con \`.icon\` e \`.chat-suggestions\`
- \`.chat-input-bar\`: wrapper input + bottone con focus ring
- \`.avatar.sm\`: per l'icona dell'AI accanto alla bolla bot
NON creare CSS custom per le bolle. Usa QUESTE classi.

---

### TEMPLATE 9: KANBAN BOARD / TASK BOARD
Quando l'utente chiede una kanban board, task board, board Trello, gestione task visuale:
\`\`\`html
<h1>Kanban Board</h1>
<p class="text-secondary">Trascina le card tra le colonne per aggiornare lo stato</p>

<div class="flex-row mt-md mb-md">
  <button class="btn" onclick="addCard()">+ Card</button>
  <button class="btn-secondary" onclick="addColumn()">+ Colonna</button>
</div>

<div class="kanban-board mt-md" id="board">
  <div class="kanban-column" data-color="warning" data-col="todo">
    <div class="kanban-column-header">
      Da Fare <span class="count" id="count-todo">3</span>
    </div>
    <div class="kanban-column-body"
         ondragover="event.preventDefault(); this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="dropCard(event, this)">
      <div class="kanban-card" draggable="true" ondragstart="dragCard(event, this)">
        <button class="kanban-card-delete" onclick="this.parentElement.remove(); updateCounts()">&times;</button>
        <div class="kanban-card-title">Titolo Task</div>
        <div class="kanban-card-desc">Descrizione breve del task</div>
        <div class="kanban-card-footer">
          <span class="badge bg-warning">Media</span>
          <span class="tag">Feature</span>
        </div>
      </div>
    </div>
  </div>

  <div class="kanban-column" data-color="info" data-col="doing">
    <div class="kanban-column-header">
      In Corso <span class="count" id="count-doing">2</span>
    </div>
    <div class="kanban-column-body"
         ondragover="event.preventDefault(); this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="dropCard(event, this)">
      <!-- cards qui -->
    </div>
  </div>

  <div class="kanban-column" data-color="success" data-col="done">
    <div class="kanban-column-header">
      Completato <span class="count" id="count-done">1</span>
    </div>
    <div class="kanban-column-body"
         ondragover="event.preventDefault(); this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="dropCard(event, this)">
      <!-- cards qui -->
    </div>
  </div>
</div>
\`\`\`
CLASSI KANBAN DISPONIBILI:
- \`.kanban-board\`: container flex orizzontale scrollabile, mette le colonne affiancate
- \`.kanban-column\`: colonna singola (280px, flex, sfondo tenue). Usa \`data-color="primary|success|warning|danger|info"\` per il colore header
- \`.kanban-column-header\`: header colonna con titolo + \`.count\` per il badge conteggio
- \`.kanban-column-body\`: area scrollabile dove vanno le card. Aggiungi ondragover/ondragleave/ondrop per drag&drop
- \`.kanban-card\`: card singola con grab cursor, hover shadow, drag rotation. Usa \`draggable="true"\` + \`ondragstart\`
- \`.kanban-card-title\`: titolo card (bold)
- \`.kanban-card-desc\`: descrizione card (grigio, piccola)
- \`.kanban-card-footer\`: footer con badge/tag affiancati
- \`.kanban-card-delete\`: bottone x che appare al hover (metti \`&times;\` come contenuto)
- \`.drag-over\`: classe aggiunta automaticamente al body colonna durante il drag
DRAG & DROP: Usa HTML5 native (draggable, ondragstart, ondragover, ondrop). Salva l'elemento dragged in una variabile globale.
NON usare localStorage — non e' affidabile nell'iframe. Tieni lo stato in variabili JS.
Per dati iniziali: inietta con json.dumps() -> JSON.parse() nel JS.

---

### REGOLE DI COMPOSIZIONE PREMIUM (SEMPRE):

1. **INIZIA SEMPRE con H1 + sottotitolo**: \`<h1>Titolo</h1><p class="text-secondary">Contesto/data</p>\`
2. **SEPARA le sezioni** con margini generosi (\`.mt-lg\`, \`.mt-xl\`) o \`<hr class="divider-gradient">\`
3. **USA .card** per raggruppare contenuti correlati, con un \`<h3>\` come titolo della card
4. **KPI PRIMA, dettagli DOPO**: mostra sempre i numeri chiave in \`.kpi-grid\` prima delle tabelle
5. **BADGE per stati**: \`<span class="badge bg-success">Attivo</span>\`, bg-warning, bg-danger, bg-info, bg-primary
6. **STATUS DOT per indicatori live**: \`<span class="status-dot active"></span>\` (active/warning/danger)
7. **PROGRESS BAR per percentuali**: usala SEMPRE invece di mostrare solo il numero
8. **POSITIVE/NEGATIVE per valori**: \`<td class="positive">+12%</td>\` o \`<td class="negative">-5%</td>\`
9. **STAT-CHANGE per variazioni**: \`<div class="stat-change up">+12.4%</div>\` con freccia automatica
10. **FONT-BOLD per etichette**: \`<td class="font-bold">Etichetta</td><td>Valore</td>\`
11. **FLEX-ROW per azioni**: raggruppa bottoni in \`<div class="flex-row mt-md">\`
12. **TABLE-SECTION per tabelle**: avvolgi SEMPRE le tabelle in \`<div class="table-section">\`
13. **CONTATORE record**: mostra il totale in fondo
14. **COLONNE per confronti**: usa \`.two-col\` o \`.three-col\` per affiancare contenuti
15. **MAI testo piatto**: ogni dato deve avere contesto visivo (badge, colore, progress bar)
16. **FORMATTA i numeri**: separatori migliaia (1.250.000), simbolo valuta, percentuali con segno
17. **AVATAR per entita'**: usa \`.avatar\` per mostrare iniziali di persone/aziende
18. **TOOLTIP per contesto**: aggiungi \`data-tooltip="..."\` dove servono informazioni extra
19. **TIMELINE per cronologie**: usa \`.timeline\` > \`.timeline-item\` per eventi ordinati
20. **METRIC-HUGE per il numero piu' importante**: un singolo dato hero con classe \`.metric-huge\`

### COMPONENTI INTERATTIVI AVANZATI (stile React/shadcn):

#### Modal / Dialog:
\`\`\`html
<div class="modal-overlay" id="myModal">
  <div class="modal-dialog">
    <h3>Titolo Dialog</h3>
    <label class="font-bold text-sm">Campo</label>
    <input type="text" placeholder="...">
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeModal()">Annulla</button>
      <button class="btn" onclick="saveModal()">Salva</button>
    </div>
  </div>
</div>
\`\`\`
Per aprire: \`document.getElementById('myModal').classList.add('open')\`
Per chiudere: \`document.getElementById('myModal').classList.remove('open')\`
Click su overlay per chiudere: \`modal.addEventListener('click', e => { if (e.target === modal) closeModal(); })\`

#### Toast / Notifica:
\`\`\`html
<div class="toast-container" id="toasts"></div>
<script>
function showToast(msg, type) {
  var t = document.createElement('div');
  t.className = 'toast ' + (type || 'info');
  t.textContent = msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(function() { t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 200); }, 3000);
}
</script>
\`\`\`
Tipi: \`success\`, \`error\`, \`warning\`, \`info\`

#### Tabs (navigazione a schede):
\`\`\`html
<div class="tabs">
  <button class="tab active" onclick="switchTab('tab1')">Tab 1</button>
  <button class="tab" onclick="switchTab('tab2')">Tab 2</button>
  <button class="tab" onclick="switchTab('tab3')">Tab 3</button>
</div>
<div class="tab-panel active" id="tab1">Contenuto tab 1</div>
<div class="tab-panel" id="tab2">Contenuto tab 2</div>
<div class="tab-panel" id="tab3">Contenuto tab 3</div>
<script>
function switchTab(id) {
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  event.target.classList.add('active');
  document.getElementById(id).classList.add('active');
}
</script>
\`\`\`

#### Toggle Switch:
\`<label class="toggle"><input type="checkbox" onchange="..."><span class="toggle-slider"></span></label>\`

#### Dropdown Menu:
\`\`\`html
<div class="dropdown">
  <button class="btn-secondary" onclick="this.nextElementSibling.classList.toggle('open')">Opzioni ▾</button>
  <div class="dropdown-menu">
    <button class="dropdown-item" onclick="...">Modifica</button>
    <button class="dropdown-item" onclick="...">Duplica</button>
    <div class="dropdown-divider"></div>
    <button class="dropdown-item" onclick="...">Elimina</button>
  </div>
</div>
\`\`\`

#### Accordion / Collapsible:
\`\`\`html
<div class="accordion">
  <div class="accordion-item">
    <button class="accordion-trigger" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
      Sezione 1
    </button>
    <div class="accordion-content">Contenuto espandibile...</div>
  </div>
</div>
\`\`\`

#### Stepper / Wizard:
\`\`\`html
<div class="stepper">
  <div class="step completed"><span class="step-circle">1</span><span class="step-label">Dati</span></div>
  <div class="step active"><span class="step-circle">2</span><span class="step-label">Revisione</span></div>
  <div class="step"><span class="step-circle">3</span><span class="step-label">Conferma</span></div>
</div>
\`\`\`

#### Chip Group (tag rimuovibili):
\`\`\`html
<div class="chip-group">
  <span class="chip">Tag 1 <span class="chip-remove" onclick="this.parentElement.remove()">&times;</span></span>
  <span class="chip">Tag 2 <span class="chip-remove" onclick="this.parentElement.remove()">&times;</span></span>
</div>
\`\`\`

#### Color Picker (pallini):
\`\`\`html
<div class="color-picker">
  <span class="color-dot active" style="background:#3b82f6" onclick="selectColor(this)"></span>
  <span class="color-dot" style="background:#22c55e" onclick="selectColor(this)"></span>
  <span class="color-dot" style="background:#ef4444" onclick="selectColor(this)"></span>
</div>
\`\`\`

#### FAB (Floating Action Button):
\`<button class="fab" onclick="...">+</button>\`

---

### FILOSOFIA "REACT-LIKE":
Quando crei interfacce interattive (board, form complessi, app-like), segui questi principi:
1. **State in variabili JS**: usa un oggetto STATE globale, poi una funzione \`render()\` che ricostruisce il DOM
2. **Template via createElement**: per liste dinamiche usa \`document.createElement\` + \`.innerHTML\`, non string concatenation
3. **Event delegation**: per elementi dinamici, attacca gli handler dopo il render o usa delegazione sull'elemento parent
4. **Animazioni CSS**: usa le classi piattaforma (\`animation: modalSlideUp\`, \`tabFadeIn\`, etc.) — MAI \`@keyframes\` custom
5. **Feedback visivo**: ogni azione utente deve avere feedback — toast per salvataggi, hover states, transition su tutto
6. **Loading states**: mostra .skeleton o spinner durante caricamenti
7. **Empty states**: usa \`.empty-state\` quando non ci sono dati
8. **Keyboard support**: ESC per chiudere modal/dropdown, Enter per confermare

### ⚠️ REMINDER FINALE — ZERO CSS CUSTOM:
ATTENZIONE: La piattaforma STRAPPA automaticamente le regole CSS con colori hardcoded (#hex, rgb, hsl).
Se scrivi \`<style>.mia-classe { background: #1a1a2e; }</style>\` viene CANCELLATO e la pagina esce BIANCA.

PRIMA di restituire l'HTML, CONTROLLA che:
- NON contenga MAI \`<style>...</style>\` — TUTTO il CSS necessario e' gia' iniettato dalla piattaforma
- NON contenga MAI \`style="..."\` (eccezione: width/height % per progress-fill, mini-chart bar, e background color sui color-dot)
- NON contenga MAI colori hardcoded (#hex, rgb(), hsl()) — usa SOLO var(--primary), var(--success), etc.
- NON contenga MAI \`@keyframes\` custom — la piattaforma ha gia' tutte le animazioni necessarie
- NON inventare classi CSS (es. .board-container, .my-card-item) — usa SOLO le classi documentate sopra
- OGNI sezione sia wrappata in \`.card\` con \`<h3>\`
- OGNI dato numerico importante sia in \`.stat-card\` dentro \`.kpi-grid\`
- OGNI tabella sia in \`.table-section\`
- OGNI modal usi \`.modal-overlay\` + \`.modal-dialog\` (NON creare CSS custom per modal)
- OGNI notifica usi \`.toast-container\` + \`.toast\` (NON creare CSS custom per toast)
- OGNI board/kanban usi le classi \`.kanban-*\` (NON creare CSS custom per board)
Se violi queste regole, il CSS viene strippato e il risultato sara' una PAGINA BIANCA.
`.trim();
}
