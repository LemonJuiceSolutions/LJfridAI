/**
 * HTML Design Guide for AI agents.
 *
 * Provides professional layout templates and composition rules
 * so that Python agent / super agent produce beautiful, consistent HTML.
 * All templates use ONLY platform CSS classes — no inline styles or <style> tags.
 */

export function getHtmlDesignGuide(): string {
    return `
## !!!! GUIDA DESIGN HTML — LAYOUT PROFESSIONALI (OBBLIGATORIO) !!!!

Quando generi HTML, segui SEMPRE queste regole di design per produrre pagine PROFESSIONALI e BELLE.
NON generare MAI HTML "piatto" senza struttura. Usa SEMPRE i pattern qui sotto.

### REGOLA D'ORO DEL DESIGN:
1. **Gerarchia visiva**: Titolo H1 > Sottotitolo P > KPI cards > Tabelle > Azioni
2. **Spaziatura**: Usa SEMPRE classi margin/padding (.mt-md, .mb-md, .p-md) tra le sezioni
3. **Raggruppamento**: Avvolgi sezioni logiche in .card con titoli H3
4. **Colore semantico**: .positive/.negative per valori, .accent-* per enfasi, .badge per stati
5. **Responsive**: Usa .kpi-grid, .two-col, .three-col — MAI width fissi in pixel

---

### TEMPLATE 1: DASHBOARD KPI
Quando l'utente chiede una dashboard, panoramica, riepilogo con metriche:
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
          <td>Categoria A</td>
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
<hr>

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
      <thead><tr><th>Mese</th><th>Ricavi</th><th>Costi</th><th>Margine</th><th>Var.</th></tr></thead>
      <tbody>
        <tr>
          <td><strong>Gennaio</strong></td>
          <td>€ 750.000</td>
          <td>€ 620.000</td>
          <td class="positive">€ 130.000</td>
          <td><div class="progress-bar"><div class="progress-fill" style="width:65%"></div></div></td>
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

### TEMPLATE 4: PAGINA INFO / STATO / RIEPILOGO
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
  <div>
    <h1>Nome Entita'</h1>
    <p class="text-secondary">Codice: ABC-001 | <span class="badge bg-success">Attivo</span></p>
  </div>
</div>
<hr>

<div class="two-col mt-md">
  <div class="card">
    <h3>Informazioni Generali</h3>
    <table>
      <tbody>
        <tr><td class="font-bold" style="width:40%">Campo 1</td><td>Valore 1</td></tr>
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

### REGOLE DI COMPOSIZIONE (SEMPRE):

1. **INIZIA SEMPRE con H1 + sottotitolo**: \`<h1>Titolo</h1><p class="text-secondary">Contesto/data</p>\`
2. **SEPARA le sezioni** con \`<hr>\` o margini (\`.mt-lg\`)
3. **USA .card** per raggruppare contenuti correlati, con un \`<h3>\` come titolo della card
4. **KPI PRIMA, dettagli DOPO**: mostra sempre i numeri chiave in \`.kpi-grid\` prima delle tabelle
5. **BADGE per stati**: \`<span class="badge bg-success">Attivo</span>\`, bg-warning, bg-danger, bg-info, bg-primary
6. **STATUS DOT per indicatori**: \`<span class="status-dot active"></span>\` (active/warning/danger)
7. **PROGRESS BAR per percentuali**: usala invece di mostrare solo il numero
8. **POSITIVE/NEGATIVE per valori**: \`<td class="positive">+12%</td>\` o \`<td class="negative">-5%</td>\`
9. **FONT-BOLD per etichette**: \`<td class="font-bold">Etichetta</td><td>Valore</td>\`
10. **FLEX-ROW per azioni**: raggruppa bottoni in \`<div class="flex-row mt-md">\`
11. **TABLE-SECTION per tabelle**: avvolgi SEMPRE le tabelle in \`<div class="table-section">\`
12. **CONTATORE record**: mostra il totale in fondo \`Totale: <strong>N</strong> record\`
13. **COLONNE per confronti**: usa \`.two-col\` o \`.three-col\` per affiancare contenuti
14. **MAI testo piatto**: ogni dato deve avere contesto visivo (badge, icona, colore semantico)
15. **FORMATTA i numeri**: usa separatori migliaia (1.250.000), simbolo valuta, percentuali con segno
`.trim();
}
