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

### ⚠️ REMINDER FINALE — ZERO CSS INLINE:
PRIMA di restituire l'HTML, CONTROLLA che:
- NON contenga MAI \`style="..."\` (eccezione: width/height % per progress-fill e mini-chart bar)
- NON contenga MAI \`<style>...</style>\`
- NON contenga MAI colori hardcoded (#hex, rgb(), hsl())
- OGNI sezione sia wrappata in \`.card\` con \`<h3>\`
- OGNI dato numerico importante sia in \`.stat-card\` dentro \`.kpi-grid\`
- OGNI tabella sia in \`.table-section\`
Se violi queste regole, la piattaforma sovrascrive tutto con !important e il risultato sara' ROTTO.
`.trim();
}
