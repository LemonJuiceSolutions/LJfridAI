# FLYER Report - Ordini in Consegna
# Nodo Python per FridAI - outputType: html
# Genera un report HTML con tabella ordini da dbo.FLYER con stili professionali

import pandas as pd
import json
from datetime import datetime, timedelta

# Data odierna per confronto date
today = datetime(2026, 4, 11)

# ====== CARICAMENTO DATI ======
# Usa df dall'input (upstream) oppure query_db() come fallback
data = None
try:
    if 'df' in dir() and df is not None and not df.empty:
        data = df.copy()
    else:
        data = query_db('SELECT * FROM dbo.FLYER')
except Exception as e:
    print(f"Errore caricamento dati: {e}")
    data = None

if data is None or data.empty:
    result = "<p>Nessun dato disponibile</p>"
else:
    # Colonne attese: Article, Variant, Description, Job, Qty, SaleOrders, CustomerCode, CustomerName, DeliveryDates, OrderClosed, Status

    # Funzione per parsare date "dd-MM-yyyy" e calcolare giorni trascorsi
    def parse_delivery_date(date_str):
        try:
            if pd.isna(date_str) or date_str == '':
                return None
            dt = datetime.strptime(str(date_str), '%d-%m-%Y')
            return dt
        except:
            return None

    def get_days_since_delivery(date_str):
        dt = parse_delivery_date(date_str)
        if dt is None:
            return 0
        delta = today - dt
        return delta.days

    # Calcola giorni da consegna per ogni riga
    data['days_since_delivery'] = data['DeliveryDates'].apply(get_days_since_delivery)
    data['is_aged'] = (data['days_since_delivery'] > 30) & (data['OrderClosed'] == 'No')

    # Statistiche KPI
    total_orders = len(data)
    total_qty = data['Qty'].astype(float, errors='ignore').sum() if 'Qty' in data.columns else 0
    in_progress = len(data[data.get('Status', '') != 'Closed'])
    shipped = len(data[data.get('Status', '') == 'Shipped'])

    # Prepara dati JSON per il frontend
    data_json = json.dumps(data.to_dict('records'))

    result = r"""
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FLYER - Report Ordini</title>
    <style>
        :root {
            --bg: #f0f2f5;
            --card: #ffffff;
            --primary: #2563eb;
            --primary-light: #dbeafe;
            --text: #1e293b;
            --text-muted: #64748b;
            --border: #e2e8f0;
            --shadow: 0 1px 3px rgba(0,0,0,0.1);
            --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        .header {
            background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
            color: white;
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 20px;
            box-shadow: var(--shadow-md);
        }
        .header h1 { font-size: 24px; margin-bottom: 8px; }
        .header p { font-size: 14px; opacity: 0.9; }
        .kpi-section {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 12px;
            margin-bottom: 20px;
        }
        .kpi-card {
            background: var(--card);
            padding: 16px;
            border-radius: 8px;
            box-shadow: var(--shadow);
            border-left: 4px solid var(--primary);
        }
        .kpi-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
        .kpi-value { font-size: 20px; font-weight: 700; color: var(--primary); }
        .search-section {
            margin-bottom: 20px;
        }
        .search-input {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid var(--border);
            border-radius: 8px;
            font-size: 14px;
        }
        .table-section {
            background: var(--card);
            border-radius: 8px;
            box-shadow: var(--shadow);
            overflow: hidden;
        }
        .table-wrapper {
            overflow-x: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }
        thead {
            background: #f8fafc;
            border-bottom: 2px solid var(--border);
        }
        th {
            padding: 12px;
            text-align: left;
            font-weight: 600;
            color: var(--text-muted);
            white-space: nowrap;
        }
        td {
            padding: 12px;
            border-bottom: 1px solid var(--border);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 200px;
        }
        tr:hover { background: #f8fafc; }

        /* Status badges */
        .badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
        }
        .badge-blue { background: #dbeafe; color: #1e40af; }
        .badge-green { background: #dcfce7; color: #166534; }
        .badge-orange { background: #fed7aa; color: #b45309; }

        /* Aged order styling: faded coral background */
        tr.aged-order {
            background-color: rgba(255, 127, 80, 0.3) !important;
        }
        tr.aged-order td {
            color: #8b4513;
        }
        .note-aged {
            display: inline-block;
            margin-left: 6px;
            padding: 2px 8px;
            background: rgba(255, 127, 80, 0.5);
            color: #8b4513;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
        }

        .hidden { display: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📋 FLYER - Report Ordini in Consegna</h1>
            <p>Visualizzazione dettagliata degli ordini con stato e date di consegna</p>
        </div>

        <!-- KPI Stats -->
        <div class="kpi-section">
            <div class="kpi-card">
                <div class="kpi-label">Ordini Totali</div>
                <div class="kpi-value" id="kpiTotal">0</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Quantità Totale</div>
                <div class="kpi-value" id="kpiQuantity">0</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">In Corso</div>
                <div class="kpi-value" id="kpiInProgress">0</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Spediti</div>
                <div class="kpi-value" id="kpiShipped">0</div>
            </div>
            <div class="kpi-card" style="border-left-color: #ff7f50;">
                <div class="kpi-label">⚠️ Da Chiudere</div>
                <div class="kpi-value" id="kpiAged" style="color: #ff7f50;">0</div>
            </div>
        </div>

        <!-- Search -->
        <div class="search-section">
            <input type="text" class="search-input" id="searchInput" placeholder="Cerca per articolo, variante, descrizione, cliente, ordine...">
        </div>

        <!-- Table -->
        <div class="table-section">
            <div class="table-wrapper">
                <table id="flyerTable">
                    <thead>
                        <tr>
                            <th>Articolo</th>
                            <th>Variante</th>
                            <th>Descrizione</th>
                            <th>Job</th>
                            <th>Qtà</th>
                            <th>Ordini</th>
                            <th>Cod. Cliente</th>
                            <th>Cliente</th>
                            <th>Consegna</th>
                            <th>Stato</th>
                        </tr>
                    </thead>
                    <tbody id="tableBody">
                        <!-- Populated by JavaScript -->
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        // Data rows (populated by Python)
        const rawData = """ + data_json + r""";
        let filteredData = rawData;

        function renderTable() {
            const tbody = document.getElementById('tableBody');
            tbody.innerHTML = '';

            let agedCount = 0;

            filteredData.forEach((row, idx) => {
                const tr = document.createElement('tr');

                // Check if aged (>30 days AND not closed)
                const daysSince = row.days_since_delivery || 0;
                const isClosed = row.OrderClosed === 'No' ? false : true;
                const isAged = daysSince > 30 && !isClosed;

                // DEBUG: Log first 3 rows to diagnose
                if (idx < 3) {
                    console.log(`Row ${idx}:`, {
                        delivery: row.DeliveryDates,
                        daysSince,
                        OrderClosed: row.OrderClosed,
                        isClosed,
                        isAged
                    });
                }

                if (isAged) {
                    agedCount++;
                }

                // Get status badge
                const status = row.Status || 'Pending';
                let badgeClass = 'badge-orange';
                if (status === 'Shipped') badgeClass = 'badge-blue';
                else if (status === 'Closed') badgeClass = 'badge-green';

                const article = row.Article || '';
                const variant = row.Variant || '';
                const description = row.Description || '';
                const job = row.Job || '';
                const qty = row.Qty || '';
                const orders = row.SaleOrders || '';
                const custCode = row.CustomerCode || '';
                const custName = row.CustomerName || '';
                const delivery = row.DeliveryDates || '';

                let deliveryCell = delivery;
                if (isAged) {
                    deliveryCell += '<span class="note-aged">ORDINE DA CHIUDERE?</span>';
                }

                // STRATEGIA ANTI-ALTERNANZA: wrappa il contenuto in <div> colorati.
                // La piattaforma sovrascrive background su <tr>/<td> ma NON sui <div> interni.
                var W = isAged ? 'background:#fff0e0;color:#8b2500;font-weight:500;margin:-12px -16px;padding:12px 16px;display:block;' : '';
                var w = isAged ? ('<div style="' + W + '">') : '';
                var wc = isAged ? '</div>' : '';
                tr.innerHTML =
                    '<td title="' + article + '" style="padding:' + (isAged?'0':'') + '">' + w + article + wc + '</td>' +
                    '<td title="' + variant + '" style="padding:' + (isAged?'0':'') + '">' + w + variant + wc + '</td>' +
                    '<td title="' + description + '" style="padding:' + (isAged?'0':'') + '">' + w + description + wc + '</td>' +
                    '<td title="' + job + '" style="padding:' + (isAged?'0':'') + '">' + w + job + wc + '</td>' +
                    '<td style="padding:' + (isAged?'0':'') + '">' + w + qty + wc + '</td>' +
                    '<td style="padding:' + (isAged?'0':'') + '">' + w + orders + wc + '</td>' +
                    '<td title="' + custCode + '" style="padding:' + (isAged?'0':'') + '">' + w + custCode + wc + '</td>' +
                    '<td title="' + custName + '" style="padding:' + (isAged?'0':'') + '">' + w + custName + wc + '</td>' +
                    '<td style="padding:' + (isAged?'0':'') + '">' + w + deliveryCell + wc + '</td>' +
                    '<td style="padding:' + (isAged?'0':'') + '">' + w + '<span class="badge ' + badgeClass + '">' + status + '</span>' + wc + '</td>';
                tbody.appendChild(tr);
            });

            // Update aged count
            document.getElementById('kpiAged').textContent = agedCount;
        }

        function filterTable() {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();

            filteredData = rawData.filter(row => {
                const searchableText = [
                    row.Article, row.Variant, row.Description, row.Job,
                    row.SaleOrders, row.CustomerCode, row.CustomerName,
                    row.DeliveryDates
                ].join(' ').toLowerCase();

                return searchableText.includes(searchTerm);
            });

            renderTable();
        }

        function updateKPIs() {
            document.getElementById('kpiTotal').textContent = rawData.length;

            const totalQty = rawData.reduce((sum, row) => {
                const qty = parseFloat(row.Qty) || 0;
                return sum + qty;
            }, 0);
            document.getElementById('kpiQuantity').textContent = Math.round(totalQty).toString();

            const inProgress = rawData.filter(row => row.Status !== 'Closed').length;
            document.getElementById('kpiInProgress').textContent = inProgress;

            const shipped = rawData.filter(row => row.Status === 'Shipped').length;
            document.getElementById('kpiShipped').textContent = shipped;
        }

        // Event listeners
        document.getElementById('searchInput').addEventListener('keyup', filterTable);

        // Initial render
        updateKPIs();
        renderTable();
    </script>
</body>
</html>
""" + '\n'.strip()
