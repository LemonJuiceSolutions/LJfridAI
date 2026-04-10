# VeronaLibri - Calcolo Spedizioni
# Nodo Python per FridAI - outputType: html
# Incolla questo codice nel nodo Python e imposta outputType = "html"

result = r"""
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VeronaLibri - Calcolo Spedizioni</title>
<style>
:root {
  --bg: #f0f2f5;
  --card: #ffffff;
  --primary: #2563eb;
  --primary-light: #dbeafe;
  --accent: #059669;
  --accent-light: #d1fae5;
  --danger: #dc2626;
  --danger-light: #fee2e2;
  --warning: #d97706;
  --warning-light: #fef3c7;
  --text: #1e293b;
  --text-muted: #64748b;
  --border: #e2e8f0;
  --input-bg: #f8fafc;
  --input-border: #cbd5e1;
  --input-focus: #2563eb;
  --shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
  --radius: 8px;
  --radius-lg: 12px;
  --header-green: #2d5016;
  --header-green-bg: #e8f5e9;
  /* Excel cell colors - soft/transparent */
  --excel-gray: rgba(192,192,192,0.25);
  --excel-green: rgba(140,220,140,0.22);
  --excel-cyan: rgba(140,220,255,0.22);
  --excel-amber: rgba(255,192,0,0.22);
  /* Softer versions for modern UI sections */
  --calc-yellow: #fffde7;
  --calc-blue: #e3f2fd;
  --calc-green: #e8f5e9;
  --calc-orange: #fff3e0;
  --calc-pink: #fce4ec;
  --calc-gray: #f5f5f5;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

/* Header */
.app-header { background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; padding: 16px 24px; display: flex; align-items: center; gap: 0; box-shadow: var(--shadow-md); border-bottom: 4px solid #fbbf24; position: relative; }
.header-items { display: flex; align-items: center; gap: 0; flex: 1; }
.header-item { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 24px; position: relative; cursor: default; }
.header-item:not(:last-child)::after { content: ''; position: absolute; right: 0; top: 20%; height: 60%; width: 1px; background: rgba(255,255,255,0.25); }
.header-item .hi-icon { font-size: 28px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); }
.header-item .hi-label { font-size: 18px; font-weight: 800; letter-spacing: 0.5px; text-shadow: 0 2px 8px rgba(0,0,0,0.3); text-transform: uppercase; }
.header-item .hi-sublabel { font-size: 11px; opacity: 0.75; font-weight: 500; }
.header-item.clickable { cursor: pointer; border-radius: var(--radius); transition: background 0.2s; }
.header-item.clickable:hover { background: rgba(255,255,255,0.12); }
.app-header .subtitle { font-size: 13px; opacity: 0.8; }
.title-display { margin-left: auto; font-size: 14px; font-weight: 600; background: rgba(255,255,255,0.15); padding: 6px 16px; border-radius: var(--radius); min-width: 180px; text-align: center; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Tabs */
.tabs-container { background: var(--card); border-bottom: 1px solid var(--border); padding: 0 16px; display: flex; overflow-x: auto; box-shadow: var(--shadow); position: sticky; top: 0; z-index: 100; }
.tab-btn { padding: 12px 18px; border: none; background: none; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--text-muted); white-space: nowrap; border-bottom: 3px solid transparent; transition: all 0.2s; }
.tab-btn:hover { color: var(--primary); background: var(--primary-light); }
.tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }

/* Main content */
.main-content { padding: 20px; max-width: 1400px; margin: 0 auto; }
.tab-panel { display: none; }
.tab-panel.active { display: block; }

/* Section cards */
.section { background: var(--card); border-radius: var(--radius-lg); box-shadow: var(--shadow); margin-bottom: 20px; overflow: hidden; min-width: 0; }
.section-header { padding: 14px 20px; font-weight: 600; font-size: 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
.section-header.green { background: var(--header-green-bg); color: var(--header-green); }
.section-header.blue { background: var(--calc-blue); color: #1565c0; }
.section-header.orange { background: var(--calc-orange); color: #e65100; }
.section-header.pink { background: var(--calc-pink); color: #880e4f; }
.section-body { padding: 16px 20px; min-width: 0; overflow: hidden; }

/* Form layout */
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.form-group { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.form-group label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.form-group input, .form-group select {
  padding: 8px 12px; border: 1px solid var(--input-border); border-radius: var(--radius);
  font-size: 14px; background: var(--input-bg); color: var(--text); transition: all 0.2s;
  min-width: 0; width: 100%; box-sizing: border-box;
}
.form-group input:focus, .form-group select:focus { outline: none; border-color: var(--input-focus); box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }
.form-group input[readonly] { background: var(--excel-gray); cursor: default; font-weight: 600; color: #1e293b; }
.form-group input[readonly].computed { background: var(--excel-amber); border-color: rgba(255,192,0,0.35); font-weight: 600; color: #1e293b; }
.form-group input[readonly].computed-blue { background: #ffffff; border: 2px solid #1565c0; font-weight: 600; color: #1565c0; }
.form-group .input-green { background: var(--excel-green); border-color: rgba(140,220,140,0.4); }
.form-group .input-cyan { background: var(--excel-cyan); border-color: rgba(140,220,255,0.4); }
.form-group .input-highlight { background: var(--excel-green); border-color: rgba(140,220,140,0.4); }

/* Result cards */
.result-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.result-card { background: var(--input-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 16px; text-align: center; }
.result-card .label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
.result-card .value { font-size: 20px; font-weight: 700; color: var(--primary); }
.result-card.highlight { background: var(--primary-light); border-color: var(--primary); }
.result-card.highlight .value { color: var(--primary); }
.result-card.green { background: var(--accent-light); border-color: var(--accent); }
.result-card.green .value { color: var(--accent); }

/* Text block rows */
.text-block-row { display: grid; grid-template-columns: 120px repeat(4, 1fr) auto; gap: 8px; align-items: end; padding: 8px 0; border-bottom: 1px solid var(--border); }
.text-block-row:last-child { border-bottom: none; }
.text-block-row .block-label { font-weight: 600; font-size: 13px; color: var(--text); padding-bottom: 8px; }
.text-block-row .block-result { font-weight: 600; color: var(--accent); padding: 8px 12px; background: var(--accent-light); border-radius: var(--radius); text-align: center; min-width: 60px; }

/* Diagram styles for layout sheets */
.diagram-container { display: flex; flex-direction: column; align-items: center; padding: 20px; }
.diagram { position: relative; border: 2px dashed #90a4ae; display: flex; }
.diagram-panel { border: 2px solid #1565c0; display: flex; align-items: center; justify-content: center; min-height: 100px; padding: 10px; text-align: center; font-weight: 600; font-size: 13px; color: #1565c0; background: rgba(21,101,192,0.05); }
.diagram-panel.spine { background: rgba(37,99,235,0.15); border-color: #2563eb; min-width: 30px; }
.diagram-panel.flap { background: rgba(255,152,0,0.1); border-color: #ff9800; color: #e65100; }
.diagram-panel.hinge { background: rgba(156,39,176,0.1); border-color: #9c27b0; color: #7b1fa2; min-width: 20px; font-size: 11px; }
.diagram-label { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.diagram-dim { font-size: 12px; font-weight: 700; color: var(--primary); margin-top: 2px; }
.diagram-total { font-size: 16px; font-weight: 700; color: var(--primary); margin-top: 12px; padding: 8px 24px; background: var(--primary-light); border-radius: var(--radius); }
.diagram-height { position: absolute; left: -50px; top: 50%; transform: translateY(-50%) rotate(-90deg); font-size: 14px; font-weight: 700; color: var(--primary); white-space: nowrap; }
.diagram-note { margin-top: 16px; font-style: italic; color: var(--text-muted); font-size: 13px; }
.diagram-notes-area { margin-top: 12px; width: 100%; }
.diagram-notes-area textarea { width: 100%; min-height: 60px; border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 12px; font-size: 13px; font-family: inherit; resize: vertical; }

/* Two column layout for Cop1/Cop2 */
.dual-diagram { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
@media (max-width: 900px) { .dual-diagram { grid-template-columns: 1fr; } }

/* Footer */
.app-footer { text-align: center; padding: 16px; color: var(--text-muted); font-size: 12px; }

/* Inline form */
.inline-form { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.inline-form label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
.inline-form input, .inline-form select { padding: 6px 10px; border: 1px solid var(--input-border); border-radius: var(--radius); font-size: 13px; width: 80px; }

/* Separator */
.separator { height: 1px; background: var(--border); margin: 12px 0; }

/* CALC table */
.calc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.calc-table th, .calc-table td { padding: 6px 10px; border: 1px solid var(--border); text-align: center; }
.calc-table th { background: var(--calc-blue); font-weight: 600; font-size: 11px; text-transform: uppercase; }
.calc-table td.label-cell { text-align: right; font-weight: 600; background: var(--excel-gray); }
.calc-table td input { width: 100%; border: none; background: var(--excel-green); text-align: center; font-size: 13px; padding: 4px; }
.calc-table td input:focus { background: var(--excel-green); outline: 2px solid rgba(100,180,100,0.4); border-radius: 2px; }
.calc-table td.result { font-weight: 600; background: var(--excel-amber); color: #1e293b; }
.calc-table td.result-blue { font-weight: 600; background: #ffffff; color: #1565c0; border: 2px solid #1565c0; }

/* Pallet diagram */
.pallet-diagrams { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 20px; }
@media (max-width: 900px) { .pallet-diagrams { grid-template-columns: 1fr; } }
.pallet-view { text-align: center; }
.pallet-view h4 { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 12px; }
.pallet-canvas { position: relative; margin: 0 auto; }
.pallet-base { border: 3px solid #8d6e63; border-radius: 4px; position: relative; background: repeating-linear-gradient(90deg, #d7ccc8 0px, #d7ccc8 8px, #bcaaa4 8px, #bcaaa4 10px); overflow: hidden; }
.pallet-base-top { border: 3px solid #8d6e63; border-radius: 4px; position: relative; background: #efebe9; }
.pallet-box { position: absolute; border: 1.5px solid #1565c0; background: rgba(21,101,192,0.12); border-radius: 2px; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 600; color: #1565c0; transition: background 0.2s; }
.pallet-box:hover { background: rgba(21,101,192,0.3); }
.pallet-layer { position: absolute; left: 0; right: 0; border: 1.5px solid #1565c0; background: rgba(21,101,192,0.12); border-radius: 2px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; color: #1565c0; }
.pallet-layer:nth-child(even) { background: rgba(37,99,235,0.15); }
.pallet-base-side { position: absolute; bottom: 0; left: 0; right: 0; height: 16px; background: repeating-linear-gradient(90deg, #d7ccc8 0px, #d7ccc8 12px, #bcaaa4 12px, #bcaaa4 14px); border: 2px solid #8d6e63; border-radius: 0 0 4px 4px; }
.pallet-dim { font-size: 11px; color: var(--text-muted); margin-top: 6px; }
.pallet-dim-side { position: absolute; font-size: 10px; color: var(--text-muted); font-weight: 600; }
.pallet-arrow-h { display: flex; align-items: center; justify-content: center; margin-top: 6px; }
.pallet-arrow-h::before, .pallet-arrow-h::after { content: ''; flex: 1; height: 1px; background: #90a4ae; }
.pallet-arrow-h span { padding: 0 6px; font-size: 11px; color: var(--text-muted); font-weight: 600; white-space: nowrap; }
.pallet-arrow-v { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.pallet-arrow-v::before, .pallet-arrow-v::after { content: ''; flex: 1; width: 1px; background: #90a4ae; }
.pallet-arrow-v span { padding: 4px 0; font-size: 10px; color: var(--text-muted); font-weight: 600; writing-mode: vertical-rl; text-orientation: mixed; white-space: nowrap; }
.pallet-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px; }
.pallet-summary-item { background: var(--calc-gray); border-radius: var(--radius); padding: 8px; text-align: center; }
.pallet-summary-item .ps-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }
.pallet-summary-item .ps-value { font-size: 16px; font-weight: 700; color: var(--primary); }
.pallet-info-row { display: flex; gap: 16px; justify-content: center; margin-top: 12px; flex-wrap: wrap; }
.pallet-info-badge { background: var(--primary-light); color: var(--primary); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
.pallet-info-badge.green { background: var(--accent-light); color: var(--accent); }
.pallet-info-badge.orange { background: var(--warning-light); color: var(--warning); }

/* Testo sidebar */
.testo-sidebar {
  width: 180px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sidebar-legend-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sidebar-legend-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}
.sidebar-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
}
.sidebar-badge.blue {
  background: var(--calc-blue);
  color: #1565c0;
  border: 1px solid #1565c0;
}
.sidebar-field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sidebar-field label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}
.sidebar-field input {
  width: 70px;
  padding: 4px 8px;
  border: 1px solid var(--input-border);
  border-radius: var(--radius);
  font-size: 13px;
  text-align: center;
  background: var(--input-bg);
}
.sidebar-field input:focus {
  outline: none;
  border-color: var(--input-focus);
  box-shadow: 0 0 0 3px rgba(37,99,235,0.15);
}
.blocco-testo-box {
  border: 2px solid #1565c0;
  border-radius: var(--radius);
  overflow: hidden;
}
.blocco-testo-header {
  background: var(--calc-blue);
  color: #1565c0;
  font-weight: 700;
  font-size: 13px;
  padding: 6px 10px;
  text-align: center;
  border-bottom: 2px solid #1565c0;
}
.blocco-testo-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
}
.blocco-testo-row:last-child {
  border-bottom: none;
}
.blocco-testo-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.blocco-testo-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--primary);
}
.color-legend {
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 10px;
}
.color-legend-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: 6px;
}
.color-legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text);
  margin-bottom: 4px;
}
.color-legend-item:last-child {
  margin-bottom: 0;
}
.color-swatch {
  display: inline-block;
  width: 18px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid rgba(0,0,0,0.15);
  flex-shrink: 0;
}
.color-swatch.green {
  background: var(--excel-green);
}
.color-swatch.cyan {
  background: var(--excel-cyan);
}

/* Section row: main section + lateral side panel */
.section-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 20px;
  min-width: 0;
}
.section-row > .section {
  margin-bottom: 0;
  min-width: 0;
  flex: 1;
}
.section-side {
  width: 190px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Section sidebar (lateral boxes) */
.section-sidebar {
  width: 180px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sidebar-box {
  border: 2px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.sidebar-box-header {
  font-weight: 700;
  font-size: 13px;
  padding: 6px 10px;
  text-align: center;
  border-bottom: 2px solid var(--border);
}
.sidebar-box-header.orange {
  background: var(--calc-orange);
  color: #e65100;
  border-color: #e65100;
}
.sidebar-box-header.pink {
  background: var(--calc-pink);
  color: #880e4f;
  border-color: #880e4f;
}
.sidebar-box-header.purple {
  background: #ede7f6;
  color: #4527a0;
  border-color: #4527a0;
}
.sidebar-box-body {
  padding: 10px;
}
.sidebar-box .form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sidebar-box .form-group label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
}
.sidebar-box .form-group input {
  padding: 6px 8px;
  border: 1px solid var(--input-border);
  border-radius: var(--radius);
  font-size: 13px;
  text-align: center;
}

/* Sidebar compact rows (label + value) */
.sidebar-compact-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}
.sidebar-compact-row:last-child {
  border-bottom: none;
}
.sidebar-compact-row label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
}
.sidebar-compact-row .sidebar-computed {
  font-size: 13px;
  font-weight: 700;
  color: var(--primary);
  background: var(--excel-amber);
  padding: 2px 8px;
  border-radius: 4px;
  min-width: 50px;
  text-align: center;
}
.sidebar-compact-row input {
  width: 70px;
  padding: 4px 6px;
  border: 1px solid var(--input-border);
  border-radius: var(--radius);
  font-size: 13px;
  text-align: center;
  min-width: 0;
}
.sidebar-compact-row input.input-green {
  background: var(--excel-green);
  border-color: rgba(140,220,140,0.4);
}

/* Header logo & buttons */
.header-logo { height: 40px; width: auto; border-radius: 6px; background: white; padding: 2px; }
.header-actions { display: flex; gap: 8px; margin-left: auto; }
.btn-header { background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.3); padding: 7px 14px; border-radius: var(--radius); cursor: pointer; font-size: 13px; font-weight: 600; transition: background 0.2s; white-space: nowrap; display: flex; align-items: center; gap: 6px; }
.btn-header:hover { background: rgba(255,255,255,0.28); }

/* Item sidebar */
.item-sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: 320px; background: var(--card); box-shadow: 4px 0 16px rgba(0,0,0,0.18); z-index: 200; display: flex; flex-direction: column; transform: translateX(-100%); transition: transform 0.3s cubic-bezier(.4,0,.2,1); }
.item-sidebar.open { transform: translateX(0); }
.item-sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 199; }
.item-sidebar.open ~ .item-sidebar-overlay { display: block; }
.item-sidebar-header { background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; }
.item-sidebar-header h3 { font-size: 16px; font-weight: 600; }
.item-sidebar-close { background: none; border: none; color: white; font-size: 22px; cursor: pointer; padding: 0 4px; opacity: 0.8; }
.item-sidebar-close:hover { opacity: 1; }
.item-sidebar-actions { display: flex; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.btn-sidebar { flex: 1; padding: 8px 12px; border-radius: var(--radius); font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s; }
.btn-sidebar.primary { background: var(--primary); color: white; }
.btn-sidebar.primary:hover { background: #1d4ed8; }
.btn-sidebar.secondary { background: var(--input-bg); color: var(--text); border: 1px solid var(--border); }
.btn-sidebar.secondary:hover { background: var(--border); }
.item-list { flex: 1; overflow-y: auto; padding: 8px; }
.item-entry { padding: 10px 12px; border-radius: var(--radius); cursor: pointer; transition: all 0.15s; border: 2px solid transparent; margin-bottom: 4px; position: relative; }
.item-entry:hover { background: var(--input-bg); }
.item-entry.selected { background: var(--primary-light); border-color: var(--primary); }
.item-entry-title { font-weight: 600; font-size: 14px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 28px; }
.item-entry-meta { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.item-entry-del { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 2px 4px; border-radius: 4px; opacity: 0; transition: opacity 0.15s; }
.item-entry:hover .item-entry-del { opacity: 1; }
.item-entry-del:hover { color: var(--danger); background: var(--danger-light); }
.item-list-empty { text-align: center; padding: 30px 16px; color: var(--text-muted); font-size: 13px; }

/* Responsive */
@media (max-width: 768px) {
  .form-grid { grid-template-columns: 1fr 1fr; }
  .text-block-row { grid-template-columns: 100px repeat(4, 1fr) auto; font-size: 12px; }
  .tab-btn { padding: 10px 12px; font-size: 12px; }
  .section-body[style*="display:flex"] { flex-direction: column; }
  .testo-sidebar, .section-sidebar { width: 100%; flex-direction: row; flex-wrap: wrap; }
  .section-row { flex-direction: column; }
  .section-side { width: 100%; flex-direction: row; flex-wrap: wrap; }
  .item-sidebar { width: 85vw; max-width: 320px; }
}
</style>
</head>
<body>

<!-- HEADER -->
<header class="app-header">
  <div class="header-items">
    <div class="header-item">
      <span class="hi-icon">&#128218;</span>
      <div><div class="hi-label">VeronaLibri</div></div>
    </div>
    <div class="header-item">
      <span class="hi-icon">&#128230;</span>
      <div><div class="hi-label">Calcolo Spedizioni</div></div>
    </div>
    <div class="header-item clickable" onclick="fillRandomData()" title="Genera dati casuali">
      <span class="hi-icon">&#127922;</span>
      <div><div class="hi-label">Random</div><div class="hi-sublabel">Dati casuali</div></div>
    </div>
  </div>
  <div class="header-actions">
    <button class="btn-header" onclick="toggleSidebar()" title="Configurazioni salvate">&#9776; Lista</button>
  </div>
  <div class="title-display" id="titleDisplay">Inserisci titolo...</div>
</header>

<!-- SIDEBAR -->
<div class="item-sidebar" id="itemSidebar">
  <div class="item-sidebar-header">
    <h3>Configurazioni</h3>
    <button class="item-sidebar-close" onclick="toggleSidebar()">&times;</button>
  </div>
  <div class="item-sidebar-actions">
    <button class="btn-sidebar secondary" onclick="createNewItem()">+ Nuovo</button>
    <button class="btn-sidebar primary" onclick="saveCurrentItem()">&#128190; Salva</button>
  </div>
  <div class="item-list" id="itemList"></div>
</div>
<div class="item-sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar()"></div>

<!-- TABS (hidden, CALC always active) -->
<nav class="tabs-container" style="display:none">
  <button class="tab-btn active" data-tab="calc">CALC</button>
  <button class="tab-btn" data-tab="layout">LAYOUT</button>
  <button class="tab-btn" data-tab="cop1">Cop1</button>
  <button class="tab-btn" data-tab="cop2">Cop2</button>
  <button class="tab-btn" data-tab="cop3">Cop3</button>
  <button class="tab-btn" data-tab="cop4">Cop4</button>
  <button class="tab-btn" data-tab="cus1">Cus1</button>
  <button class="tab-btn" data-tab="cus2">Cus2</button>
  <button class="tab-btn" data-tab="cus3">Cus3</button>
  <button class="tab-btn" data-tab="brossA">BrossA</button>
  <button class="tab-btn" data-tab="brossN">BrossN</button>
  <button class="tab-btn" data-tab="sop1">Sop1</button>
  <button class="tab-btn" data-tab="sop2">Sop2</button>
</nav>

<!-- MAIN CONTENT -->
<div class="main-content">

<!-- ======================== CALC TAB ======================== -->
<div class="tab-panel active" id="tab-calc">

  <!-- Titolo -->
  <div class="section">
    <div class="section-header green">Titolo Libro</div>
    <div class="section-body">
      <div class="form-group">
        <label>Titolo</label>
        <input type="text" id="H3" class="input-green" placeholder="Inserisci il titolo del libro..." oninput="recalcAll()">
      </div>
    </div>
  </div>

  <!-- Formato Rifilato + Testo -->
  <div class="section-row">
    <div class="section">
      <div class="section-header blue" id="section_testo_header">Testo CUCITO</div>
      <div class="section-body">
        <div class="form-grid" style="margin-bottom:16px">
          <div class="form-group">
            <label>Base (mm)</label>
            <input type="number" id="E9" class="input-highlight" placeholder="es. 170" oninput="recalcAll()">
          </div>
          <div class="form-group">
            <label>Altezza (mm)</label>
            <input type="number" id="F9" class="input-highlight" placeholder="es. 240" oninput="recalcAll()">
          </div>
          <div class="form-group">
            <label>Tipo Legatura</label>
            <select id="B12" onchange="recalcAll()">
              <option value="2">Cucito</option>
              <option value="1">Fresato</option>
            </select>
          </div>
        </div>
        <div style="overflow-x:auto">
          <table class="calc-table">
            <thead>
              <tr>
                <th></th>
                <th>Pagine</th>
                <th>gr/m2</th>
                <th>VSA</th>
                <th>N. Segnature</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="label-cell">Testo 1</td>
                <td><input type="number" id="I7" oninput="recalcAll()"></td>
                <td><input type="number" id="J7" oninput="recalcAll()"></td>
                <td><input type="number" id="K7" step="0.1" oninput="recalcAll()"></td>
                <td><input type="number" id="L7" oninput="recalcAll()"></td>
              </tr>
              <tr>
                <td class="label-cell">Testo 2</td>
                <td><input type="number" id="I9" oninput="recalcAll()"></td>
                <td><input type="number" id="J9" oninput="recalcAll()"></td>
                <td><input type="number" id="K9" step="0.1" oninput="recalcAll()"></td>
                <td><input type="number" id="L9" oninput="recalcAll()"></td>
              </tr>
              <tr>
                <td class="label-cell">Testo 3</td>
                <td><input type="number" id="I11" oninput="recalcAll()"></td>
                <td><input type="number" id="J11" oninput="recalcAll()"></td>
                <td><input type="number" id="K11" step="0.1" oninput="recalcAll()"></td>
                <td><input type="number" id="L11" oninput="recalcAll()"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div class="section-side">
      <div class="sidebar-legend-section">
        <div class="sidebar-legend-item">
          <span>Dati solo di</span>
          <span class="sidebar-badge blue">INPUT</span>
        </div>
        <div class="sidebar-legend-item">
          <span>Dati ST o di</span>
          <span class="sidebar-badge blue">INPUT</span>
        </div>
      </div>
      <div class="sidebar-field">
        <label>CORR Seg.</label>
        <input type="number" id="P11" value="0.15" step="0.01" oninput="recalcAll()">
      </div>
      <div class="blocco-testo-box">
        <div class="blocco-testo-header">Blocco Testo</div>
        <div class="blocco-testo-row">
          <span class="blocco-testo-label">Fresato</span>
          <span class="blocco-testo-value" id="P16_d">-</span>
        </div>
        <div class="blocco-testo-row">
          <span class="blocco-testo-label">Cucito</span>
          <span class="blocco-testo-value" id="P18_d">-</span>
        </div>
      </div>
      <div class="color-legend">
        <div class="color-legend-title">Legenda colori</div>
        <div class="color-legend-item">
          <span class="color-swatch green"></span>
          <span>Dato inseribile</span>
        </div>
        <div class="color-legend-item">
          <span class="color-swatch cyan"></span>
          <span>Parametro tecnico</span>
        </div>
      </div>
    </div>
  </div>

  <!-- COP. Brossurata -->
  <div class="section-row">
    <div class="section">
      <div class="section-header orange">COP. Brossurata</div>
      <div class="section-body">
        <div class="form-grid" style="grid-template-columns:repeat(3,1fr)">
          <div class="form-group">
            <label>Spessore Copertina (mm)</label>
            <input type="number" id="C18" class="input-cyan" value="1" step="0.1" oninput="recalcAll()">
          </div>
          <div class="form-group">
            <label>Alette (mm)</label>
            <input type="number" id="F17" class="input-green" placeholder="0" oninput="recalcAll()">
          </div>
          <div class="form-group">
            <label>Unghia (mm)</label>
            <input type="number" id="F18" class="input-cyan" value="2" step="0.5" oninput="recalcAll()">
          </div>
        </div>
        <div class="separator"></div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr">
          <div class="form-group">
            <label>Dorso</label>
            <input type="text" id="H16_d" readonly class="computed">
          </div>
          <div class="form-group">
            <label>F.to Aperto Rifilato (Base)</label>
            <input type="text" id="K16_d" readonly class="computed">
          </div>
          <div class="form-group">
            <label>F.to Aperto Rifilato (Alt.)</label>
            <input type="text" id="L16_d" readonly class="computed">
          </div>
        </div>
        <div class="separator"></div>
        <h4 style="font-size:13px;color:var(--text-muted);margin-bottom:8px">F.to Rilegato</h4>
        <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
          <div class="form-group">
            <label>Dorso</label>
            <input type="text" id="I18_d" readonly class="computed-blue">
          </div>
          <div class="form-group">
            <label>Controdorso</label>
            <input type="text" id="J18_d" readonly class="computed-blue">
          </div>
          <div class="form-group">
            <label>Base</label>
            <input type="text" id="K18_d" readonly class="computed-blue">
          </div>
          <div class="form-group">
            <label>Altezza</label>
            <input type="text" id="L18_d" readonly class="computed-blue">
          </div>
        </div>
      </div>
    </div>
    <div class="section-side">
      <div class="sidebar-box">
        <div class="sidebar-box-header orange">Cover brossura</div>
        <div class="sidebar-box-body">
          <div class="form-group">
            <label>Grammatura</label>
            <input type="number" id="U17" class="input-green" placeholder="g/m2" oninput="recalcAll()">
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- COP. Cartonata -->
  <div class="section-row">
    <div class="section">
      <div class="section-header pink">COP. Cartonata</div>
      <div class="section-body">
        <div class="form-grid" style="grid-template-columns:1fr auto auto">
          <div class="form-group">
            <label>Tipo Cartonato</label>
            <select id="B26" onchange="recalcAll()">
              <option value="3">Dorso QUADRO</option>
              <option value="2">Dorso TONDO</option>
              <option value="1">OLANDESE</option>
            </select>
          </div>
          <div class="form-group">
            <label>Cartoni (mm)</label>
            <input type="number" id="F23" class="input-green" step="0.1" placeholder="es. 2" oninput="recalcAll()" style="width:90px">
          </div>
          <div class="form-group">
            <label>Cop. + Risg. (mm)</label>
            <input type="number" id="F24" class="input-cyan" value="1.5" step="0.1" oninput="recalcAll()" style="width:90px">
          </div>
        </div>
        <div class="separator"></div>
        <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
          <div class="form-group">
            <label>Dorso</label>
            <input type="text" id="H23_d" readonly class="computed">
          </div>
          <div class="form-group">
            <label>Canalini</label>
            <input type="text" id="I23_d" readonly class="computed">
          </div>
          <div class="form-group">
            <label>Piatto Base</label>
            <input type="text" id="J23_d" readonly class="computed">
          </div>
          <div class="form-group">
            <label>Risvolto</label>
            <input type="number" id="K23" class="input-cyan" value="16" oninput="recalcAll()">
          </div>
        </div>
        <div class="form-grid" style="margin-top:8px;grid-template-columns:repeat(2,1fr)">
          <div class="form-group">
            <label>Canalini Custom (mm)</label>
            <input type="number" id="I25" class="input-cyan" placeholder="auto" oninput="recalcAll()">
          </div>
          <div class="form-group">
            <label>Alette Olandese (mm)</label>
            <input type="number" id="F25" class="input-green" placeholder="0" oninput="recalcAll()">
          </div>
        </div>
        <div class="separator"></div>
        <h4 style="font-size:13px;color:var(--text-muted);margin-bottom:8px">F.to Rilegato</h4>
        <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
          <div class="form-group">
            <label>Dorso</label>
            <input type="text" id="L25_d" readonly class="computed-blue">
          </div>
          <div class="form-group">
            <label>Controdorso</label>
            <input type="text" id="M25_d" readonly class="computed-blue">
          </div>
          <div class="form-group">
            <label>Base</label>
            <input type="text" id="O25_d" readonly class="computed-blue">
          </div>
          <div class="form-group">
            <label>Altezza</label>
            <input type="text" id="P25_d" readonly class="computed-blue">
          </div>
        </div>
      </div>
    </div>
    <div class="section-side">
      <div class="sidebar-box">
        <div class="sidebar-box-header pink">F.to Rivestimento</div>
        <div class="sidebar-box-body">
          <div style="display:flex;gap:8px">
            <div class="form-group" style="flex:1;min-width:0">
              <label>Base</label>
              <input type="text" id="O23_d" readonly class="computed">
            </div>
            <div class="form-group" style="flex:1;min-width:0">
              <label>Altezza</label>
              <input type="text" id="P23_d" readonly class="computed">
            </div>
          </div>
        </div>
      </div>
      <div class="sidebar-box">
        <div class="sidebar-box-header pink">Piatti</div>
        <div class="sidebar-box-body">
          <div class="sidebar-compact-row">
            <label>Base</label>
            <span class="sidebar-computed" id="D34_d">-</span>
          </div>
          <div class="sidebar-compact-row">
            <label>Altezza</label>
            <span class="sidebar-computed" id="D35_d">-</span>
          </div>
          <div class="sidebar-compact-row">
            <label>Grammatura</label>
            <span class="sidebar-computed" id="D36_d">-</span>
          </div>
        </div>
      </div>
      <div class="sidebar-box">
        <div class="sidebar-box-header pink">Risguardi</div>
        <div class="sidebar-box-body">
          <div class="sidebar-compact-row">
            <label>Base</label>
            <span class="sidebar-computed" id="D43_d">-</span>
          </div>
          <div class="sidebar-compact-row">
            <label>Altezza</label>
            <span class="sidebar-computed" id="D44_d">-</span>
          </div>
          <div class="sidebar-compact-row">
            <label>Grammatura</label>
            <input type="number" id="D45" class="input-green" placeholder="g/m2" oninput="recalcAll()">
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Sovracoperta -->
  <div class="section-row">
    <div class="section">
      <div class="section-header" style="background:#ede7f6;color:#4527a0">Sovracoperta</div>
      <div class="section-body">
        <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr">
          <div class="form-group">
            <label>Tipo Sovracoperta</label>
            <select id="B30" onchange="recalcAll()">
              <option value="2">Normale</option>
              <option value="1">Antistrappo</option>
            </select>
          </div>
        </div>
        <div class="separator"></div>
        <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
          <div class="form-group">
            <label>Dorso</label>
            <input type="text" id="H29_d" readonly class="computed">
          </div>
          <div class="form-group">
            <label>Piatto</label>
            <input type="text" id="I29_d" readonly class="computed">
          </div>
          <div class="form-group">
            <label>Alette (mm)</label>
            <input type="number" id="J29" class="input-green" placeholder="0" oninput="recalcAll()">
          </div>
          <div class="form-group">
            <label>Risvolto (mm)</label>
            <input type="number" id="K29" class="input-cyan" value="50" oninput="recalcAll()">
          </div>
        </div>
        <div class="separator"></div>
        <h4 style="font-size:13px;color:var(--text-muted);margin-bottom:8px">F.to Aperto</h4>
        <div class="form-grid" style="grid-template-columns:1fr 1fr">
          <div class="form-group">
            <label>Base</label>
            <input type="text" id="O29_d" readonly class="computed">
          </div>
          <div class="form-group">
            <label>Altezza</label>
            <input type="text" id="P29_d" readonly class="computed">
          </div>
        </div>
      </div>
    </div>
    <div class="section-side">
      <div class="sidebar-box">
        <div class="sidebar-box-header purple">Sopracoperta</div>
        <div class="sidebar-box-body">
          <div class="form-group">
            <label>Grammatura</label>
            <input type="number" id="U29" class="input-green" placeholder="g/m2" oninput="recalcAll()">
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Bancale / Spedizione -->
  <div class="section">
    <div class="section-header green">Bancale &amp; Spedizione</div>
    <div class="section-body">
      <div class="form-grid">
        <div class="form-group">
          <label>Tipo Bancale</label>
          <select id="F50" onchange="recalcAll()">
            <option value="1">100 x 120 cm</option>
            <option value="2">80 x 120 cm</option>
          </select>
        </div>
        <div class="form-group">
          <label>Max h Bancale (cm)</label>
          <input type="number" id="I50" class="input-green" placeholder="es. 120" oninput="recalcAll()">
        </div>
        <div class="form-group">
          <label>Cartonato/Brossura</label>
          <select id="D51" onchange="recalcAll()">
            <option value="true">Cartonato</option>
            <option value="false">Brossura</option>
          </select>
        </div>
        <div class="form-group">
          <label>Copie da Spedire</label>
          <input type="number" id="M51" class="input-green" placeholder="es. 1000" oninput="recalcAll()">
        </div>
      </div>
      <div class="form-grid" style="margin-top:8px">
        <div class="form-group">
          <label>Peso Max Bancale (kg)</label>
          <input type="number" id="D55" class="input-green" placeholder="es. 800" oninput="recalcAll()">
        </div>
        <div class="form-group">
          <label>Max h Scatola (cm)</label>
          <input type="number" id="D60" class="input-green" placeholder="es. 40" oninput="recalcAll()">
        </div>
        <div class="form-group">
          <label>Max Peso Scatola (kg)</label>
          <input type="number" id="D61" class="input-green" placeholder="es. 25" oninput="recalcAll()">
        </div>
      </div>
      <div class="separator"></div>
      <div class="result-grid">
        <div class="result-card"><div class="label">Copie/Scatola</div><div class="value" id="r_copie_scat">-</div></div>
        <div class="result-card"><div class="label">Scatole/Piano</div><div class="value" id="r_scat_piano">-</div></div>
        <div class="result-card"><div class="label">Piani/Bancale</div><div class="value" id="r_piani">-</div></div>
        <div class="result-card highlight"><div class="label">Libri/Bancale</div><div class="value" id="r_libri_banc">-</div></div>
        <div class="result-card"><div class="label">Scatole/Bancale</div><div class="value" id="r_scat_banc">-</div></div>
        <div class="result-card"><div class="label">Peso Scatola (kg)</div><div class="value" id="r_peso_scat">-</div></div>
        <div class="result-card green"><div class="label">Peso Bancale (kg)</div><div class="value" id="r_peso_banc">-</div></div>
        <div class="result-card"><div class="label">Altezza Banc. (cm)</div><div class="value" id="r_alt_banc">-</div></div>
        <div class="result-card"><div class="label">Bancali Interi</div><div class="value" id="r_banc_interi">-</div></div>
        <div class="result-card"><div class="label">Banc. Parziale (kg)</div><div class="value" id="r_banc_parz">-</div></div>
      </div>
      <div class="separator"></div>
      <h4 style="font-size:13px;color:var(--text-muted);margin-bottom:8px">Dimensioni Scatola</h4>
      <div class="form-grid">
        <div class="form-group">
          <label>Interna (LxPxH cm)</label>
          <input type="text" id="r_scat_int" readonly class="computed">
        </div>
        <div class="form-group">
          <label>Esterna (LxPxH cm)</label>
          <input type="text" id="r_scat_ext" readonly class="computed-blue">
        </div>
      </div>
    </div>
  </div>

  <!-- Anteprima Copertina + Bancale -->
  <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:8px">

    <!-- Anteprima Copertina -->
    <div class="section" style="flex:1;min-width:320px">
      <div class="section-header blue" id="calc_cover_title">Anteprima Copertina</div>
      <div class="section-body">
        <div style="display:flex;align-items:stretch;justify-content:center;gap:0;padding:16px 16px 0 16px">
          <div style="flex:1;min-width:0">
            <div class="diagram" id="calc_cover_diagram" style="margin:0"></div>
            <div class="pallet-arrow-h" id="calc_cover_total" style="margin-top:8px"><span>-</span></div>
          </div>
          <div id="calc_cover_height_wrap" style="position:relative;width:30px;min-height:40px"></div>
        </div>
      </div>
    </div>

    <!-- Anteprima Bancale -->
    <div class="section" style="flex:1;min-width:320px">
      <div class="section-header green">Anteprima Bancale</div>
      <div class="section-body">
        <div class="pallet-info-row" id="calc_pallet_badges"></div>
        <div class="pallet-diagrams" style="margin-top:8px">
          <div class="pallet-view">
            <h4>Vista dall'alto</h4>
            <div style="display:flex;align-items:stretch;justify-content:center;gap:0">
              <div style="flex:0 0 auto">
                <div class="pallet-canvas" id="calc_pallet_top"></div>
                <div class="pallet-arrow-h" id="calc_pallet_top_w"><span>-</span></div>
              </div>
              <div id="calc_pallet_top_d" style="position:relative;width:55px;min-height:40px"></div>
            </div>
          </div>
          <div class="pallet-view">
            <h4>Vista laterale</h4>
            <div style="display:flex;align-items:stretch;justify-content:center;gap:0">
              <div style="flex:0 0 auto">
                <div class="pallet-canvas" id="calc_pallet_side"></div>
              </div>
              <div id="calc_pallet_side_h" style="position:relative;width:30px;min-height:40px"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>

</div>

<!-- ======================== LAYOUT TAB ======================== -->
<div class="tab-panel" id="tab-layout">
  <div class="section">
    <div class="section-header green">Riepilogo Spedizione</div>
    <div class="section-body">
      <div class="result-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
        <div class="result-card"><div class="label">Dimensioni Bancale</div><div class="value" id="lay_dim_banc">-</div></div>
        <div class="result-card"><div class="label">Dimensioni Libro</div><div class="value" id="lay_dim_libro">-</div></div>
        <div class="result-card"><div class="label">Peso Libro</div><div class="value" id="lay_peso_libro">-</div></div>
        <div class="result-card"><div class="label">Dimensioni Scatola</div><div class="value" id="lay_dim_scat">-</div></div>
        <div class="result-card"><div class="label">Peso Scatola</div><div class="value" id="lay_peso_scat">-</div></div>
        <div class="result-card highlight"><div class="label">Copie per Scatola</div><div class="value" id="lay_copie_scat">-</div></div>
        <div class="result-card"><div class="label">Scatole per Piano</div><div class="value" id="lay_scat_piano">-</div></div>
        <div class="result-card"><div class="label">Piani Bancale</div><div class="value" id="lay_piani">-</div></div>
        <div class="result-card green"><div class="label">Libri per Bancale</div><div class="value" id="lay_libri_banc">-</div></div>
        <div class="result-card"><div class="label">Altezza Bancale</div><div class="value" id="lay_alt_banc">-</div></div>
        <div class="result-card"><div class="label">Peso Bancale</div><div class="value" id="lay_peso_banc">-</div></div>
      </div>

      <!-- Pallet info badges -->
      <div class="pallet-info-row" id="lay_badges"></div>

      <!-- Pallet Diagrams -->
      <div class="pallet-diagrams">
        <div class="pallet-view">
          <h4>Vista dall'alto - Disposizione Scatole</h4>
          <div class="pallet-canvas" id="pallet_top_view"></div>
          <div class="pallet-arrow-h" id="pallet_top_w"><span>-</span></div>
        </div>
        <div class="pallet-view">
          <h4>Vista laterale - Piani Impilati</h4>
          <div class="pallet-canvas" id="pallet_side_view"></div>
          <div class="pallet-arrow-h" id="pallet_side_w"><span>-</span></div>
        </div>
      </div>

      <!-- Pallet summary -->
      <div class="pallet-summary" id="pallet_summary_grid"></div>
    </div>
  </div>
</div>

<!-- ======================== COP1 TAB ======================== -->
<div class="tab-panel" id="tab-cop1">
  <div class="section">
    <div class="section-header blue">Cop. Cartonata - Rivestimento &amp; Quadranti (usa C125)</div>
    <div class="section-body">
      <div id="cop1_subtitle" style="font-size:13px;color:var(--text-muted);margin-bottom:16px"></div>
      <div class="dual-diagram">
        <div>
          <h4 style="text-align:center;margin-bottom:12px;color:#1565c0">Rivestimento</h4>
          <div class="diagram-container">
            <div style="position:relative">
              <div class="diagram-height" id="cop1_height">-</div>
              <div class="diagram" id="cop1_riv_diagram"></div>
            </div>
            <div class="diagram-total" id="cop1_riv_total">Totale: -</div>
          </div>
        </div>
        <div>
          <h4 style="text-align:center;margin-bottom:12px;color:#1565c0">Quadranti</h4>
          <div class="diagram-container">
            <div class="diagram" id="cop1_quad_diagram"></div>
            <div class="diagram-total" id="cop1_quad_total">Totale: -</div>
            <div style="margin-top:8px;font-size:13px;color:var(--text-muted)" id="cop1_spessore"></div>
          </div>
        </div>
      </div>
      <div class="diagram-note">Lasciare 4 mm di abbondanza sui 4 lati</div>
      <div class="diagram-notes-area"><label style="font-size:12px;font-weight:600;color:var(--text-muted)">Note:</label><textarea id="cop1_notes"></textarea></div>
    </div>
  </div>
</div>

<!-- ======================== COP2 TAB ======================== -->
<div class="tab-panel" id="tab-cop2">
  <div class="section">
    <div class="section-header blue">Cop. Cartonata - Rivestimento &amp; Quadranti (usa B26)</div>
    <div class="section-body">
      <div id="cop2_subtitle" style="font-size:13px;color:var(--text-muted);margin-bottom:16px"></div>
      <div class="dual-diagram">
        <div>
          <h4 style="text-align:center;margin-bottom:12px;color:#1565c0">Rivestimento</h4>
          <div class="diagram-container">
            <div style="position:relative">
              <div class="diagram-height" id="cop2_height">-</div>
              <div class="diagram" id="cop2_riv_diagram"></div>
            </div>
            <div class="diagram-total" id="cop2_riv_total">Totale: -</div>
          </div>
        </div>
        <div>
          <h4 style="text-align:center;margin-bottom:12px;color:#1565c0">Quadranti</h4>
          <div class="diagram-container">
            <div class="diagram" id="cop2_quad_diagram"></div>
            <div class="diagram-total" id="cop2_quad_total">Totale: -</div>
            <div style="margin-top:8px;font-size:13px;color:var(--text-muted)" id="cop2_spessore"></div>
          </div>
        </div>
      </div>
      <div class="diagram-note">Lasciare 4 mm di abbondanza sui 4 lati</div>
      <div class="diagram-notes-area"><label style="font-size:12px;font-weight:600;color:var(--text-muted)">Note:</label><textarea id="cop2_notes"></textarea></div>
    </div>
  </div>
</div>

<!-- ======================== COP3 TAB ======================== -->
<div class="tab-panel" id="tab-cop3">
  <div class="section">
    <div class="section-header blue">Cop. Olandese</div>
    <div class="section-body">
      <div id="cop3_subtitle" style="font-size:13px;color:var(--text-muted);margin-bottom:16px"></div>
      <div class="diagram-container">
        <div style="position:relative">
          <div class="diagram-height" id="cop3_height">-</div>
          <div class="diagram" id="cop3_diagram"></div>
        </div>
        <div class="diagram-total" id="cop3_total">Totale: -</div>
      </div>
      <div class="diagram-note">Lasciare 4 mm di abbondanza sui 4 lati</div>
      <div class="diagram-notes-area"><label style="font-size:12px;font-weight:600;color:var(--text-muted)">Note:</label><textarea id="cop3_notes"></textarea></div>
    </div>
  </div>
</div>

<!-- ======================== COP4 TAB ======================== -->
<div class="tab-panel" id="tab-cop4">
  <div class="section">
    <div class="section-header blue">Cop. Olandese con Alette</div>
    <div class="section-body">
      <div id="cop4_subtitle" style="font-size:13px;color:var(--text-muted);margin-bottom:16px"></div>
      <div class="diagram-container">
        <div style="position:relative">
          <div class="diagram-height" id="cop4_height">-</div>
          <div class="diagram" id="cop4_diagram"></div>
        </div>
        <div class="diagram-total" id="cop4_total">Totale: -</div>
      </div>
      <div class="diagram-note">Lasciare 4 mm di abbondanza sui 4 lati</div>
      <div class="diagram-notes-area"><label style="font-size:12px;font-weight:600;color:var(--text-muted)">Note:</label><textarea id="cop4_notes"></textarea></div>
    </div>
  </div>
</div>

<!-- ======================== CUS1 TAB ======================== -->
<div class="tab-panel" id="tab-cus1">
  <div class="section">
    <div class="section-header orange">Rivestimento Custodia Rigida</div>
    <div class="section-body">
      <div class="diagram-container">
        <div style="position:relative">
          <div class="diagram-height" id="cus1_height">-</div>
          <div class="diagram" id="cus1_diagram"></div>
        </div>
        <div class="diagram-total" id="cus1_total">Totale: -</div>
        <div style="margin-top:16px;text-align:center">
          <h4 style="color:#e65100;margin-bottom:8px">Fondello</h4>
          <div class="diagram" id="cus1_fondello" style="margin:0 auto"></div>
          <div class="diagram-total" id="cus1_fond_total" style="font-size:14px">-</div>
        </div>
      </div>
      <div class="diagram-note">Lasciare 4 mm di abbondanza sui 4 lati</div>
      <div class="diagram-notes-area"><label style="font-size:12px;font-weight:600;color:var(--text-muted)">Note:</label><textarea id="cus1_notes"></textarea></div>
    </div>
  </div>
</div>

<!-- ======================== CUS2 TAB ======================== -->
<div class="tab-panel" id="tab-cus2">
  <div class="section">
    <div class="section-header orange">Riv. Custodia Rigida Doppio Spessore</div>
    <div class="section-body">
      <div class="diagram-container">
        <div style="position:relative">
          <div class="diagram-height" id="cus2_height">-</div>
          <div class="diagram" id="cus2_diagram"></div>
        </div>
        <div class="diagram-total" id="cus2_total">Totale: -</div>
        <div style="margin-top:16px;text-align:center">
          <h4 style="color:#e65100;margin-bottom:8px">Fondello</h4>
          <div class="diagram" id="cus2_fondello" style="margin:0 auto"></div>
          <div class="diagram-total" id="cus2_fond_total" style="font-size:14px">-</div>
        </div>
      </div>
      <div class="diagram-note">Lasciare 4 mm di abbondanza sui 4 lati</div>
      <div class="diagram-notes-area"><label style="font-size:12px;font-weight:600;color:var(--text-muted)">Note:</label><textarea id="cus2_notes"></textarea></div>
    </div>
  </div>
</div>

<!-- ======================== CUS3 TAB ======================== -->
<div class="tab-panel" id="tab-cus3">
  <div class="section">
    <div class="section-header orange">Custodia Morbida</div>
    <div class="section-body">
      <div class="diagram-container">
        <div style="position:relative">
          <div class="diagram-height" id="cus3_height_total">-</div>
          <div style="display:flex;flex-direction:column;align-items:center">
            <div class="diagram" id="cus3_top" style="margin-bottom:0"></div>
            <div class="diagram" id="cus3_main"></div>
            <div class="diagram" id="cus3_bottom" style="margin-top:0"></div>
          </div>
        </div>
        <div class="diagram-total" id="cus3_total_w">Larghezza: -</div>
        <div class="diagram-total" id="cus3_total_h" style="font-size:14px">Altezza: -</div>
      </div>
      <div class="diagram-note">Lasciare 4 mm di abbondanza sui 4 lati</div>
      <div class="diagram-notes-area"><label style="font-size:12px;font-weight:600;color:var(--text-muted)">Note:</label><textarea id="cus3_notes"></textarea></div>
    </div>
  </div>
</div>

<!-- ======================== BROSSA TAB ======================== -->
<div class="tab-panel" id="tab-brossA">
  <div class="section">
    <div class="section-header" style="background:#e8eaf6;color:#283593">Brossura con Alette - F.to Rifilato Aperto</div>
    <div class="section-body">
      <div id="brossA_subtitle" style="font-size:13px;color:var(--text-muted);margin-bottom:16px"></div>
      <div class="diagram-container">
        <div style="position:relative">
          <div class="diagram-height" id="brossA_height">-</div>
          <div class="diagram" id="brossA_diagram"></div>
        </div>
        <div class="diagram-total" id="brossA_total">Totale: -</div>
      </div>
      <div class="diagram-note">Lasciare 4 mm di abbondanza sui 4 lati</div>
      <div class="diagram-notes-area"><label style="font-size:12px;font-weight:600;color:var(--text-muted)">Note:</label><textarea id="brossA_notes"></textarea></div>
    </div>
  </div>
</div>

<!-- ======================== BROSSN TAB ======================== -->
<div class="tab-panel" id="tab-brossN">
  <div class="section">
    <div class="section-header" style="background:#e8eaf6;color:#283593">Brossura Normale - F.to Rifilato Aperto</div>
    <div class="section-body">
      <div id="brossN_subtitle" style="font-size:13px;color:var(--text-muted);margin-bottom:16px"></div>
      <div class="diagram-container">
        <div style="position:relative">
          <div class="diagram-height" id="brossN_height">-</div>
          <div class="diagram" id="brossN_diagram"></div>
        </div>
        <div class="diagram-total" id="brossN_total">Totale: -</div>
      </div>
      <div class="diagram-note">Lasciare 4 mm di abbondanza sui 4 lati</div>
      <div class="diagram-notes-area"><label style="font-size:12px;font-weight:600;color:var(--text-muted)">Note:</label><textarea id="brossN_notes"></textarea></div>
    </div>
  </div>
</div>

<!-- ======================== SOP1 TAB ======================== -->
<div class="tab-panel" id="tab-sop1">
  <div class="section">
    <div class="section-header" style="background:#ede7f6;color:#4527a0">Sopraccoperta</div>
    <div class="section-body">
      <div class="diagram-container">
        <div style="position:relative">
          <div class="diagram-height" id="sop1_height">-</div>
          <div class="diagram" id="sop1_diagram"></div>
        </div>
        <div class="diagram-total" id="sop1_total">Totale: -</div>
        <div class="diagram-note">(mm.) Abbondanze / Smarginature</div>
      </div>
      <div class="diagram-notes-area"><label style="font-size:12px;font-weight:600;color:var(--text-muted)">Note:</label><textarea id="sop1_notes"></textarea></div>
    </div>
  </div>
</div>

<!-- ======================== SOP2 TAB ======================== -->
<div class="tab-panel" id="tab-sop2">
  <div class="section">
    <div class="section-header" style="background:#ede7f6;color:#4527a0">Sopraccoperta Antistrappo</div>
    <div class="section-body">
      <div class="diagram-container">
        <div style="position:relative">
          <div class="diagram-height" id="sop2_height">-</div>
          <div style="display:flex;flex-direction:column;align-items:center">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px" id="sop2_risvolto_label"></div>
            <div class="diagram" id="sop2_diagram"></div>
          </div>
        </div>
        <div class="diagram-total" id="sop2_total">Totale: -</div>
        <div class="diagram-note">(mm.) Abbondanze / Smarginature</div>
      </div>
      <div class="diagram-notes-area"><label style="font-size:12px;font-weight:600;color:var(--text-muted)">Note:</label><textarea id="sop2_notes"></textarea></div>
    </div>
  </div>
</div>

</div>

<footer class="app-footer">VeronaLibri - Calcolo Spedizioni &copy; 2024</footer>

<script>
// =====================================================================
// CALC ENGINE - Replicates all Excel formulas
// =====================================================================

function n(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const v = parseFloat(el.value);
  return isNaN(v) ? 0 : v;
}
function s(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}
function setD(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName === 'INPUT' || el.tagName === 'SELECT') el.value = val;
  else el.textContent = val;
}
function setT(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setH(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = val;
}

function ceil05(v) {
  // CEILING(v, 0.5)
  return Math.ceil(v / 0.5) * 0.5;
}
function ceil1(v) {
  return Math.ceil(v);
}

// =====================================================================
// ITEM LIST — Saveable fields, persistence, CRUD, random, sidebar
// =====================================================================
const SAVEABLE_FIELDS = [
  'H3','E9','F9',
  'I7','J7','K7','L7','I9','J9','K9','L9','I11','J11','K11','L11',
  'B12','P11','C18','F17','F18','U17','D45',
  'F23','F24','F25','K23','I25',
  'B26','B30','J29','K29','U29',
  'F50','D51','I50','M51','D55','D60','D61'
];
const DEFAULT_VALUES = {
  B12:'2', P11:'0.15', C18:'1', F18:'2', F24:'1.5', K23:'16', K29:'50',
  B26:'3', B30:'2', F50:'1', D51:'true'
};

let items = [];
let currentItemId = null;

function loadItemsFromStorage() {
  try { items = JSON.parse(localStorage.getItem('veronalibri_items') || '[]'); } catch(e) { items = []; }
}
function saveItemsToStorage() {
  localStorage.setItem('veronalibri_items', JSON.stringify(items));
}

function captureCurrentFields() {
  const fields = {};
  SAVEABLE_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) fields[id] = el.value;
  });
  return fields;
}

function loadFieldsToForm(fields) {
  SAVEABLE_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = fields[id] !== undefined ? fields[id] : (DEFAULT_VALUES[id] || '');
  });
  recalcAll();
}

function clearForm() {
  SAVEABLE_FIELDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = DEFAULT_VALUES[id] || '';
  });
  currentItemId = null;
  recalcAll();
  renderItemList();
}

function createNewItem() {
  clearForm();
  toggleSidebar();
}

function saveCurrentItem() {
  const fields = captureCurrentFields();
  if (currentItemId) {
    const item = items.find(i => i.id === currentItemId);
    if (item) { item.fields = fields; item.updatedAt = Date.now(); }
  } else {
    const newItem = { id: 'item_' + Date.now(), fields: fields, createdAt: Date.now(), updatedAt: Date.now() };
    items.unshift(newItem);
    currentItemId = newItem.id;
  }
  saveItemsToStorage();
  renderItemList();
}

function deleteItem(id) {
  const item = items.find(i => i.id === id);
  const title = item && item.fields.H3 ? item.fields.H3 : 'Senza titolo';
  if (!confirm('Eliminare "' + title + '"?')) return;
  items = items.filter(i => i.id !== id);
  if (currentItemId === id) currentItemId = null;
  saveItemsToStorage();
  renderItemList();
}

function selectItem(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  currentItemId = id;
  loadFieldsToForm(item.fields);
  renderItemList();
  toggleSidebar();
}

function renderItemList() {
  const el = document.getElementById('itemList');
  if (!el) return;
  if (items.length === 0) {
    el.innerHTML = '<div class="item-list-empty">Nessuna configurazione salvata.<br>Usa <b>Salva</b> per memorizzare la configurazione attuale.</div>';
    return;
  }
  el.innerHTML = items.map(item => {
    const f = item.fields;
    const title = f.H3 || 'Senza titolo';
    const dims = (f.E9 || '?') + ' \u00d7 ' + (f.F9 || '?') + ' mm';
    const tipo = f.D51 === 'true' ? 'Cartonato' : 'Brossura';
    const sel = item.id === currentItemId ? ' selected' : '';
    return `<div class="item-entry${sel}" onclick="selectItem('${item.id}')">
      <div class="item-entry-title">${title}</div>
      <div class="item-entry-meta">${dims} \u2014 ${tipo}</div>
      <button class="item-entry-del" onclick="event.stopPropagation();deleteItem('${item.id}')" title="Elimina">\ud83d\uddd1</button>
    </div>`;
  }).join('');
}

function toggleSidebar() {
  const sb = document.getElementById('itemSidebar');
  const ov = document.getElementById('sidebarOverlay');
  if (sb) sb.classList.toggle('open');
}

// ── RANDOM DATA GENERATOR ──
function fillRandomData() {
  function ri(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function rf(min, max) { return parseFloat((min + Math.random() * (max - min)).toFixed(1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function sv(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

  // Book dimensions
  const base = ri(120, 250);
  const altezza = ri(Math.max(170, base + 20), 320);
  sv('H3', pick(['Romanzo di Prova','Il Libro delle Meraviglie','Storie dal Mondo','Guida Pratica','Manuale Tecnico','Racconti Italiani','La Grande Avventura','Poesie Scelte','Arte e Design','Catalogo Generale','Biografie Celebri','Ricette Tradizionali']));
  sv('E9', base);
  sv('F9', altezza);

  // Testo 1
  sv('I7', ri(48, 800));
  sv('J7', pick([60,70,80,90,100,115,130,150]));
  sv('K7', 1);
  sv('L7', 1);
  // Testo 2/3 usually empty
  sv('I9', ''); sv('J9', ''); sv('K9', ''); sv('L9', '');
  sv('I11', ''); sv('J11', ''); sv('K11', ''); sv('L11', '');
  if (Math.random() < 0.15) { sv('I9', ri(16,64)); sv('J9', pick([80,100,115,130])); sv('K9',1); sv('L9',1); }

  // Legatura, params
  sv('B12', pick(['1','2']));
  sv('P11', '0.15');
  sv('C18', rf(0.5, 3.0));
  sv('F18', '2');

  // Cartonato or Brossura
  const isCar = Math.random() < 0.5;
  sv('D51', isCar ? 'true' : 'false');

  // Alette brossura
  const hasAlette = Math.random() < 0.3;
  sv('F17', hasAlette ? ri(60, 120) : 0);

  if (isCar) {
    sv('F23', rf(1.5, 3.0));
    sv('F24', rf(1.0, 2.5));
    const tipoCart = pick(['1','2','3']);
    sv('B26', tipoCart);
    sv('K23', ri(12, 20));
    sv('I25', '');
    sv('F25', tipoCart === '1' && Math.random() < 0.3 ? ri(60, 100) : 0);
    sv('D45', pick([100,120,140,160,180]));
    sv('U17', '');
  } else {
    sv('F23', '');
    sv('F24', '1.5');
    sv('B26', '3');
    sv('K23', '16');
    sv('I25', '');
    sv('F25', '0');
    sv('U17', pick([100,150,200,250,300,350]));
    sv('D45', '');
  }

  // Sovracoperta
  if (isCar && Math.random() < 0.4) {
    sv('B30', pick(['1','2']));
    sv('J29', ri(60, 120));
    sv('K29', ri(30, 60));
    sv('U29', pick([100,115,130,150]));
  } else {
    sv('B30', '2'); sv('J29', '0'); sv('K29', '50'); sv('U29', '');
  }

  // Bancale / Spedizione
  sv('F50', pick(['1','2']));
  sv('I50', ri(120, 180));
  sv('M51', ri(200, 5000));
  sv('D55', ri(600, 1000));
  sv('D60', ri(30, 50));
  sv('D61', ri(15, 30));

  currentItemId = null;
  recalcAll();
  renderItemList();
  window.scrollTo(0, 0);
}

// Main recalculation
function recalcAll() {
  const C = {}; // All computed CALC values

  // === INPUTS ===
  C.H3 = s('H3');
  C.E9 = n('E9'); C.F9 = n('F9');
  C.I7 = n('I7'); C.J7 = n('J7'); C.K7 = n('K7'); C.L7 = n('L7');
  C.I9 = n('I9'); C.J9 = n('J9'); C.K9 = n('K9'); C.L9 = n('L9');
  C.I11 = n('I11'); C.J11 = n('J11'); C.K11 = n('K11'); C.L11 = n('L11');
  C.B12 = n('B12'); C.P11 = n('P11');
  C.C18 = n('C18'); C.F17 = n('F17'); C.F18 = n('F18');
  C.U9 = n('U9'); C.U17 = n('U17');
  C.F23 = n('F23'); C.F24 = n('F24'); C.F25 = n('F25');
  C.I25_input = n('I25'); C.K23 = n('K23');
  C.B26 = n('B26'); C.B30 = n('B30');
  C.J29_input = n('J29'); C.K29 = n('K29'); C.U29 = n('U29');
  C.D45 = n('D45');
  C.F50 = n('F50'); C.I50 = n('I50');
  C.D51 = s('D51') === 'true';
  C.M51 = n('M51'); C.D55 = n('D55'); C.D60 = n('D60'); C.D61 = n('D61');

  // === MAPPINGS (rows 125-130) ===
  // C125: B26=1->3, B26=3->1, else B26
  C.C125 = C.B26 === 1 ? 3 : (C.B26 === 3 ? 1 : C.B26);
  // C126: B12=1->2, B12=2->1, else B12
  C.C126 = C.B12 === 1 ? 2 : (C.B12 === 2 ? 1 : C.B12);
  // C127: B30=1->2, B30=2->1, else B30
  C.C127 = C.B30 === 1 ? 2 : (C.B30 === 2 ? 1 : C.B30);
  // Pallet dims
  C.C130 = C.F50 === 1 ? 100 : 80;
  C.D130 = 120;

  // === C5: display text ===
  C.C5 = "Testo" + (C.C126 === 1 ? " CUCITO" : (C.C126 === 2 ? " FRESATO" : ""));
  setT('section_testo_header', C.C5);

  // === SPINE THICKNESS ===
  // M7 = (I7/2)*J7*K7/1000
  C.M7 = (C.I7 / 2) * C.J7 * C.K7 / 1000;
  C.M8 = C.K7 > 1 ? 0.75 : 1;
  C.M9 = (C.I9 / 2) * C.J9 * C.K9 / 1000;
  C.M10 = C.K9 > 1 ? 0.75 : 1;
  C.M11 = (C.I11 / 2) * C.J11 * C.K11 / 1000;
  C.M12 = C.K11 > 1 ? 0.75 : 1;

  // P16 = Fresato total spine
  C.P16 = C.M7 + C.M9 + C.M11;
  // P18 = Cucito total spine (includes signature correction)
  C.P18 = (C.M7 + (C.L7 * C.P11 * C.M8) + C.M9 + (C.L9 * C.P11 * C.M10) + C.M11 + (C.L11 * C.P11 * C.M12));

  // B19 flag
  C.B19 = C.C125 ? 0 : 1;

  // === COVER CALCULATIONS ===
  // H16: Dorso copertina
  const spineThickness = C.C126 === 1 ? C.P18 : C.P16;
  if (C.C126 < 1 || (C.P16 + C.P18 < 1) || C.C18 < 0.1) {
    C.H16 = '';
  } else {
    C.H16 = ceil05(C.C18 + (C.C126 === 1 ? C.P18 : C.P16) - 0.24);
  }

  // K16: F.to Aperto Rifilato base
  if (C.E9 < 1 || C.C18 < 0.1 || C.H16 === '') {
    C.K16 = '';
  } else {
    C.K16 = C.E9 * 2 + C.H16 + (C.F17 > 0 ? (C.F18 + C.F17) * 2 : 0);
  }

  // L16: F.to Aperto Rifilato altezza
  C.L16 = (C.H16 !== '' && C.C18 > 0) ? C.F9 : '';

  // === BOUND FORMAT (Rilegato) ===
  C.I18 = C.H16 !== '' ? C.H16 : '';
  C.J18 = C.H16 !== '' ? ceil05(C.P16 + C.C18 + (C.F17 > 0 ? C.C18 * 0.75 : 0) - 0.24) : '';
  C.K18 = C.H16 !== '' ? C.E9 + (C.F17 > 0 ? C.F18 : 0) : '';
  C.L18 = C.H16 !== '' ? C.F9 : '';

  // === HARDCOVER (Cartonato) H23 ===
  if (C.H16 === '' || C.K23 === 0 || C.C125 === 0 || C.F24 < 0.1) {
    C.H23 = '';
  } else if (C.C125 !== 3 && C.F23 < 0.1) {
    C.H23 = '';
  } else {
    if (C.C125 === 3) {
      // Olandese
      const raw = ((C.C126 === 1 ? C.P18 : C.P16) + C.F24 * 1.5) * 1.1;
      C.H23 = ceil05(raw - 0.248);
    } else if (C.F24 > 0 && C.C125 >= 0.9 && C.C125 < 3) {
      const cucitoDiff = (C.C126 === 1 && C.P18 - C.P16 - C.F23 > 0) ? C.P18 - C.P16 - C.F23 : 0;
      const raw = (C.P16 + C.F23 * 2 + C.F24 + cucitoDiff) * (C.C125 === 2 ? 1.1 : 1);
      C.H23 = ceil05(raw - 0.248);
    } else {
      C.H23 = '';
    }
  }

  // I23: Canalini
  if (C.H23 !== '' && C.H23 > 0) {
    const customI25 = C.I25_input || 0;
    if (customI25 > 0) {
      C.I23 = customI25;
    } else {
      C.I23 = C.C125 === 1 ? 8 + C.F23 : (C.C125 === 3 ? 0 : 8);
    }
  } else {
    C.I23 = '';
  }

  // J23: Piatto base
  if (C.H23 === '') {
    C.J23 = '';
  } else {
    let base = C.C125 === 1 ? C.E9 - 3 : (C.C125 === 2 ? C.E9 - 4 : (C.C125 === 3 ? C.E9 + 5 : ''));
    const customI25 = C.I25_input || 0;
    if (customI25 > 0 && C.I23 !== '') {
      const defaultCanalini = C.C125 === 1 ? 8 + C.F23 : (C.C125 === 3 ? 0 : 8);
      base += defaultCanalini - customI25;
    }
    C.J23 = base;
  }

  // O23: Rivestimento base (total open width)
  if (C.H23 !== '' && C.H23 > 0) {
    C.O23 = C.H23 + (C.I23 + C.J23 + C.K23) * 2 + (C.C125 === 3 && C.F25 > 0 ? C.F25 * 2 - C.K23 * 2 : 0);
  } else {
    C.O23 = '';
  }

  // P23: Rivestimento altezza
  if (C.H23 !== '' && C.H23 > 0) {
    C.P23 = C.F9 + 7 + C.K23 * 2;
  } else {
    C.P23 = '';
  }

  // C26
  C.C26 = C.C125 + (C.F25 > 0 ? 1 : 0);

  // === BOUND FORMAT (Rilegato cartonato) ===
  // L25: Dorso rilegato
  if (C.H23 === '') {
    C.L25 = '';
  } else {
    const base = (C.C125 === 2 || C.C125 === 3) ? Math.floor(C.H23 * 0.91) : C.H23;
    C.L25 = base + (C.H29_val !== undefined && C.H29_val !== '' ? 0.5 : 0);
  }

  // First compute H29 for jacket (needed by L25)
  // H29: Jacket spine
  if (C.C127 === '' || C.C127 === 0) {
    C.H29 = '';
  } else if (C.C127 === 2 && C.K29 < 10) {
    C.H29 = '';
  } else if (C.H23 !== '' && C.J29_input > 0) {
    C.H29 = C.H23 + 1;
  } else {
    C.H29 = '';
  }

  // Recompute L25 with H29
  if (C.H23 === '') {
    C.L25 = '';
  } else {
    const base25 = (C.C125 === 2 || C.C125 === 3) ? Math.floor(C.H23 * 0.91) : C.H23;
    C.L25 = base25 + (C.H29 !== '' ? 0.5 : 0);
  }

  // M25: Controdorso rilegato
  if (C.H23 === '') {
    C.M25 = '';
  } else {
    const raw = C.P16 + (C.C125 < 3 ? C.F23 * 2 + C.F24 : C.F24 * 1.5 + (C.F25 > 0 ? C.F24 / 3 : 0)) + (C.H29 !== '' ? 0.5 : 0);
    C.M25 = ceil05(raw - 0.248);
  }

  // O25: Base rilegato
  if (C.H23 !== '') {
    const roundAdj = (C.C125 === 2 || C.C125 === 3) ? Math.round(C.H23 / 10 * 2) / 2 : 0;
    C.O25 = C.J23 + C.I23 + roundAdj + (C.H29 !== '' ? 0.5 : 0);
  } else {
    C.O25 = '';
  }

  // P25
  C.P25 = C.H23 !== '' ? C.F9 + 8 : '';

  // === JACKET (Sovracoperta) ===
  // I29: Piatto jacket
  C.I29 = C.H29 !== '' ? C.J23 + C.I23 : '';

  // O29: F.to Aperto base jacket
  C.O29 = C.H29 !== '' ? C.J29_input * 2 + C.H29 + (C.I29 || 0) * 2 : '';

  // P29: Jacket height
  if (C.H29 !== '') {
    C.P29 = C.F9 + 7 + (C.C127 === 2 ? C.K29 * 2 : 0);
  } else {
    C.P29 = '';
  }

  // === WEIGHT CALCULATIONS ===
  // Board weight components
  C.D34 = C.E9 > 0 ? (C.E9 / 1000) * 2 : 0;
  C.D35 = C.F9 > 0 ? C.F9 / 1000 : 0;
  // D36: board grammage from thickness
  const thickMap = {1: 756, 1.5: 945, 2: 1260, 2.4: 1512, 2.5: 1512, 3: 1890, 3.5: 2205, 4: 2520};
  C.D36 = thickMap[C.F23] || 0;

  // Text weight (J35/N35)
  let textW = 0;
  if (C.E9 > 0) {
    textW = (C.E9 * C.F9 * C.J7 / 1000000) * C.I7 / 2;
    if (C.J9 && C.I9) textW += (C.E9 * C.F9 * C.J9 / 1000000) * C.I9 / 2;
    if (C.J11 && C.I11) textW += (C.E9 * C.F9 * C.J11 / 1000000) * C.I11 / 2;
  }
  C.J35 = textW; C.N35 = textW;

  // Jacket weight (J36)
  C.J36 = (C.U29 && C.O29 && C.P29) ? ((C.U29 + 20) * C.O29 * C.P29) / 1000000 : 0;
  // Cover weight (N36)
  C.N36 = (C.U17 && C.K16 !== '' && C.L16 !== '') ? (C.U17 * C.K16 * C.L16) / 1000000 : 0;
  // Endpapers (J37)
  C.D43 = C.E9 || 0;
  C.D44 = C.F9 || 0;
  C.J37 = (C.D43 && C.D44 && C.D45) ? (C.D43 * C.D44 * C.D45 / 1000000) * 4 : 0;
  // Boards (J38)
  C.J38 = C.D36 * C.D35 * C.D34;
  // Rivestimento (J40)
  C.J40 = (C.O23 && C.P23) ? (C.O23 * C.P23 * 200) / 1000000 : 0;

  // Totals
  C.J43 = C.J35 + C.J36 + C.J37 + C.J38 + C.J40; // + rivestimento
  C.N43 = C.N36 + C.N35;

  // Unit weight in grams
  const unitWeight = C.D51 ? C.J43 : C.N43;

  // === BANCALE / SHIPPING ===
  // Book dimensions for packing (in mm for books)
  const bookBase = C.D51 ? (C.O25 || C.K18 || C.E9) : (C.K18 || C.E9);
  const bookHeight = C.D51 ? (C.P25 || C.L18 || C.F9) : (C.L18 || C.F9);
  const bookSpine = C.D51 ? (C.M25 || C.J18 || C.H16 || spineThickness) : (C.J18 || C.H16 || spineThickness);

  // Box internal dimensions
  const threshold = C.U9 || 165;
  let copiesPerBox = 0;
  let boxIntW, boxIntD, boxIntH;

  if (C.E9 < threshold && C.F9 < threshold) {
    // 4 FILE - both small
    copiesPerBox = Math.max(1, Math.floor(Math.min(C.D60 > 0 ? C.D60 * 10 : 999, 400) / (bookSpine || 1)) * 4);
    boxIntW = (bookBase || 0) * 2;
    boxIntD = (bookHeight || 0) * 2;
    boxIntH = copiesPerBox > 0 ? (copiesPerBox / 4) * (bookSpine || 0) : 0;
  } else if (C.E9 < threshold || C.F9 < threshold) {
    // 2 FILE - one small
    copiesPerBox = Math.max(1, Math.floor(Math.min(C.D60 > 0 ? C.D60 * 10 : 999, 400) / (bookSpine || 1)) * 2);
    boxIntW = bookBase || 0;
    boxIntD = (bookHeight || 0) * 2;
    boxIntH = copiesPerBox > 0 ? (copiesPerBox / 2) * (bookSpine || 0) : 0;
  } else {
    // Single row - both large
    copiesPerBox = Math.max(1, Math.floor(Math.min(C.D60 > 0 ? C.D60 * 10 : 999, 400) / (bookSpine || 1)));
    boxIntW = bookBase || 0;
    boxIntD = bookHeight || 0;
    boxIntH = copiesPerBox * (bookSpine || 0);
  }

  // Weight limit on copies per box
  if (C.D61 > 0 && unitWeight > 0) {
    const maxByWeight = Math.floor((C.D61 * 1000 - 500) / unitWeight);
    if (maxByWeight > 0 && maxByWeight < copiesPerBox) copiesPerBox = maxByWeight;
  }
  if (copiesPerBox < 1) copiesPerBox = 1;

  C.D52 = copiesPerBox; // actual copies per box used

  // External box dims (mm -> cm for display)
  C.D58 = boxIntW;
  C.F58 = boxIntD;
  C.H58 = boxIntH;
  C.D59 = (boxIntW + 15) / 10; // +1.5cm, convert to cm
  C.F59 = (boxIntD + 15) / 10;
  C.H59 = (boxIntH + 10) / 10; // +1cm

  // Box weight
  C.M54 = (copiesPerBox * unitWeight / 1000) + 0.5; // 0.5kg cardboard

  // Boxes per layer
  const palletW = C.C130; // cm
  const palletD = C.D130; // cm
  const boxExtW = C.D59; // cm
  const boxExtD = C.F59; // cm
  if (boxExtW > 0 && boxExtD > 0) {
    C.D53 = Math.floor(palletW / boxExtW) * Math.floor(palletD / boxExtD);
  } else {
    C.D53 = 0;
  }

  // Layers per pallet
  const boxExtH = C.H59; // cm
  let maxLayersByHeight = boxExtH > 0 ? Math.floor((C.I50 - 20) / boxExtH) : 0;
  if (maxLayersByHeight < 0) maxLayersByHeight = 0;

  // Weight-limited layers
  let maxLayersByWeight = 99;
  if (C.D55 > 0 && C.D53 > 0 && C.M54 > 0) {
    maxLayersByWeight = Math.floor((C.D55 - 35) / (C.D53 * C.M54));
  }
  C.D54 = Math.max(0, Math.min(maxLayersByHeight, maxLayersByWeight));

  // Books per pallet
  C.M52 = C.D54 * C.D53 * copiesPerBox;
  // Boxes per pallet
  C.M53 = C.D54 * C.D53;
  // Pallet weight
  C.M55 = C.M53 > 0 ? ceil1(C.M54 * C.M53 + 35) : 0;
  // Pallet height
  C.M56 = C.H59 > 0 ? Math.round((C.H59 * C.D54 + 20) * 10) / 10 : 0;
  // Full pallets
  C.M58 = C.M52 > 0 ? Math.floor(C.M51 / C.M52) : 0;
  // Partial pallet
  const remainder = C.M52 > 0 ? C.M51 % C.M52 : 0;
  C.M59 = remainder > 0 ? Math.round((remainder / copiesPerBox) * C.M54 + 35) : 0;

  // === CUSTODIA calculations (Row 33 - inferred from Cus sheets) ===
  // These map from the hardcover calcs
  C.H33 = C.H23 || 0; // spine
  C.I33 = C.J23 || 0; // panel width
  C.J33 = C.P23 || 0; // height
  C.K33 = C.K23 || 0; // flap/risvolto
  C.P33 = C.P23 || 0; // overall height

  // === UPDATE DISPLAY ===
  document.getElementById('titleDisplay').textContent = C.H3 || 'Inserisci titolo...';

  // Text blocks
  setT('M7_d', C.M7 ? C.M7.toFixed(2) : '-');
  setT('M8_d', C.M8.toFixed(2));
  setT('M9_d', C.M9 ? C.M9.toFixed(2) : '-');
  setT('M10_d', C.M10.toFixed(2));
  setT('M11_d', C.M11 ? C.M11.toFixed(2) : '-');
  setT('M12_d', C.M12.toFixed(2));

  setD('P16_d', C.P16 ? C.P16.toFixed(1) : '-');
  setD('P18_d', C.P18 ? C.P18.toFixed(1) : '-');

  // Cover
  setD('H16_d', C.H16 !== '' ? C.H16 : '-');
  setD('K16_d', C.K16 !== '' ? C.K16 : '-');
  setD('L16_d', C.L16 !== '' ? C.L16 : '-');
  setD('I18_d', C.I18 !== '' ? C.I18 : '-');
  setD('J18_d', C.J18 !== '' ? C.J18 : '-');
  setD('K18_d', C.K18 !== '' ? C.K18 : '-');
  setD('L18_d', C.L18 !== '' ? C.L18 : '-');

  // Cartonato
  setD('H23_d', C.H23 !== '' ? C.H23 : '-');
  setD('I23_d', C.I23 !== '' ? C.I23 : '-');
  setD('J23_d', C.J23 !== '' ? C.J23 : '-');
  setD('O23_d', C.O23 !== '' ? C.O23 : '-');
  setD('P23_d', C.P23 !== '' ? C.P23 : '-');
  // Piatti
  setD('D34_d', C.D34 ? C.D34.toFixed(3) : '-');
  setD('D35_d', C.D35 ? C.D35.toFixed(3) : '-');
  setD('D36_d', C.D36 || '-');
  // Risguardi
  setD('D43_d', C.D43 ? C.D43.toFixed(1) : '-');
  setD('D44_d', C.D44 ? C.D44.toFixed(1) : '-');
  setD('L25_d', C.L25 !== '' ? C.L25 : '-');
  setD('M25_d', C.M25 !== '' ? C.M25 : '-');
  setD('O25_d', C.O25 !== '' ? C.O25 : '-');
  setD('P25_d', C.P25 !== '' ? C.P25 : '-');

  // Jacket
  setD('H29_d', C.H29 !== '' ? C.H29 : '-');
  setD('I29_d', C.I29 !== '' ? C.I29 : '-');
  setD('O29_d', C.O29 !== '' ? C.O29 : '-');
  setD('P29_d', C.P29 !== '' ? C.P29 : '-');

  // Weights
  setT('w_testo', C.J35 ? C.J35.toFixed(1) + ' g' : '-');
  setT('w_cover', (C.J36 || C.N36) ? ((C.D51 ? C.J36 : C.N36).toFixed(1) + ' g') : '-');
  setT('w_riguardi', C.J37 ? C.J37.toFixed(1) + ' g' : '-');
  setT('w_cartoni', C.J38 ? C.J38.toFixed(1) + ' g' : '-');
  setT('w_rivestimento', C.J40 ? C.J40.toFixed(1) + ' g' : '-');
  setT('w_tot_cart', C.J43 ? C.J43.toFixed(1) + ' g' : '-');
  setT('w_tot_bross', C.N43 ? C.N43.toFixed(1) + ' g' : '-');

  // Shipping
  setT('r_copie_scat', copiesPerBox || '-');
  setT('r_scat_piano', C.D53 || '-');
  setT('r_piani', C.D54 || '-');
  setT('r_libri_banc', C.M52 || '-');
  setT('r_scat_banc', C.M53 || '-');
  setT('r_peso_scat', C.M54 ? C.M54.toFixed(2) : '-');
  setT('r_peso_banc', C.M55 || '-');
  setT('r_alt_banc', C.M56 ? C.M56.toFixed(1) : '-');
  setT('r_banc_interi', C.M58 || '-');
  setT('r_banc_parz', C.M59 ? C.M59.toFixed(1) : '-');
  setD('r_scat_int', (C.D58/10).toFixed(1) + ' x ' + (C.F58/10).toFixed(1) + ' x ' + (C.H58/10).toFixed(1));
  setD('r_scat_ext', C.D59.toFixed(1) + ' x ' + C.F59.toFixed(1) + ' x ' + C.H59.toFixed(1));

  // === LAYOUT TAB ===
  setT('lay_dim_banc', C.F50 === 1 ? '100 cm x 120 cm' : '80 cm x 120 cm');
  if (C.D51) {
    setT('lay_dim_libro', (C.O25 ? (C.O25/10).toFixed(1) : '-') + ' x ' + (C.P25 ? (C.P25/10).toFixed(1) : '-') + ' x ' + (C.H23 ? (C.H23/10).toFixed(1) : '-') + ' cm');
    setT('lay_peso_libro', C.J43 ? (C.J43/1000).toFixed(2) + ' Kg' : '-');
  } else {
    setT('lay_dim_libro', (C.K18 ? (C.K18/10).toFixed(1) : '-') + ' x ' + (C.L18 ? (C.L18/10).toFixed(1) : '-') + ' x ' + (C.I18 ? (C.I18/10).toFixed(1) : '-') + ' cm');
    setT('lay_peso_libro', C.N43 ? (C.N43/1000).toFixed(2) + ' Kg' : '-');
  }
  setT('lay_dim_scat', C.D59.toFixed(1) + ' x ' + C.F59.toFixed(1) + ' x ' + C.H59.toFixed(1) + ' cm');
  setT('lay_peso_scat', C.M54 ? C.M54.toFixed(2) + ' Kg' : '-');
  setT('lay_copie_scat', copiesPerBox || '-');
  setT('lay_scat_piano', C.D53 || '-');
  setT('lay_piani', C.D54 || '-');
  setT('lay_libri_banc', C.M52 || '-');
  setT('lay_alt_banc', C.M56 ? C.M56.toFixed(1) + ' cm' : '-');
  setT('lay_peso_banc', C.M55 ? C.M55 + ' Kg' : '-');

  // === RENDER DIAGRAMS ===
  renderCop1(C);
  renderCop2(C);
  renderCop3(C);
  renderCop4(C);
  renderCus1(C);
  renderCus2(C);
  renderCus3(C);
  renderBrossA(C);
  renderBrossN(C);
  renderSop1(C);
  renderSop2(C);
  renderPallet(C, copiesPerBox);
  renderCalcCover(C);
  renderCalcPallet(C, copiesPerBox);
}

// =====================================================================
// DIAGRAM RENDERERS
// =====================================================================

function makePanel(label, dim, cls) {
  const w = Math.max(30, Math.min(dim ? dim / 2 : 30, 200));
  return `<div class="diagram-panel ${cls || ''}" style="width:${w}px">
    <div><div class="diagram-label">${label}</div><div class="diagram-dim">${dim || '-'}</div></div>
  </div>`;
}

function renderCoverDiagram(containerId, C, useC125) {
  const ref = useC125 ? C.C125 : C.B26;
  const active = ref === 1 || ref === 2;
  const el = document.getElementById(containerId);
  if (!active || C.H23 === '') {
    el.innerHTML = '<div style="padding:40px;color:var(--text-muted);text-align:center">Non applicabile per il tipo selezionato</div>';
    return;
  }
  const risv = active ? C.K23 : 0;
  const piatto = active ? C.J23 : 0;
  const canal = C.I23 || 0;
  const dorso = active ? C.H23 : 0;
  el.innerHTML =
    makePanel('Risvolto', risv, 'flap') +
    makePanel('Piatto', piatto) +
    makePanel('Canalino', canal, 'hinge') +
    makePanel('Dorso', dorso, 'spine') +
    makePanel('Canalino', canal, 'hinge') +
    makePanel('Piatto', piatto) +
    makePanel('Risvolto', risv, 'flap');
}

function renderCop1(C) {
  renderCoverDiagram('cop1_riv_diagram', C, true);
  setT('cop1_height', C.P23 ? C.P23 + ' mm' : '-');
  setT('cop1_riv_total', 'Totale: ' + (C.O23 || '-') + ' mm');

  // Quadranti
  const el = document.getElementById('cop1_quad_diagram');
  if (C.C125 === 1 || C.C125 === 2) {
    const piatto = C.J23 || 0;
    const dorso = C.H23 ? C.H23 - 1 : 0;
    el.innerHTML = makePanel('Piatto', piatto) + makePanel('Dorso', dorso, 'spine') + makePanel('Piatto', piatto);
    setT('cop1_quad_total', 'Totale: ' + (piatto * 2 + dorso || '-') + ' mm');
  } else {
    el.innerHTML = '<div style="padding:40px;color:var(--text-muted)">-</div>';
    setT('cop1_quad_total', '-');
  }
  setT('cop1_spessore', (C.B26 === 1 ? 'Spessore Cartoni: ' : 'Spessore Quadranti: ') + (C.F23 || '-') + ' mm');

  const typeLabel = C.C125 === 1 ? 'Dorso QUADRO' : (C.C125 === 2 ? 'Dorso TONDO' : 'Olandese');
  setT('cop1_subtitle', 'Cop. Cartonata - ' + typeLabel + ' - ' + C.C5 + ' - F.to Rif. ' + (C.E9||'-') + ' x ' + (C.F9||'-'));
}

function renderCop2(C) {
  renderCoverDiagram('cop2_riv_diagram', C, false);
  setT('cop2_height', C.P23 ? C.P23 + ' mm' : '-');
  setT('cop2_riv_total', 'Totale: ' + (C.O23 || '-') + ' mm');

  const el = document.getElementById('cop2_quad_diagram');
  const active = C.B26 === 1 || C.B26 === 2;
  if (active && C.H23 !== '') {
    const piatto = C.J23 || 0;
    const dorso = C.H23 ? C.H23 - 1 : 0;
    el.innerHTML = makePanel('Piatto', piatto) + makePanel('Dorso', dorso, 'spine') + makePanel('Piatto', piatto);
    setT('cop2_quad_total', 'Totale: ' + (piatto * 2 + dorso || '-') + ' mm');
  } else {
    el.innerHTML = '<div style="padding:40px;color:var(--text-muted)">-</div>';
    setT('cop2_quad_total', '-');
  }
  setT('cop2_spessore', (C.B26 === 1 ? 'Spessore Cartoni: ' : 'Spessore Quadranti: ') + (C.F23 || '-') + ' mm');

  const typeLabels = {1: 'Dorso QUADRO', 2: 'Dorso TONDO', 3: ''};
  setT('cop2_subtitle', (typeLabels[C.B26] ? 'Cop. Cartonata - ' + typeLabels[C.B26] : '') + ' - ' + C.C5 + ' - F.to Rif. ' + (C.E9||'-') + ' x ' + (C.F9||'-'));
}

function renderCop3(C) {
  const el = document.getElementById('cop3_diagram');
  if (C.C125 === 3 && C.H23 !== '') {
    const risv = C.K23 || 0;
    const piatto = C.J23 || 0;
    const dorso = C.H23 || 0;
    el.innerHTML =
      makePanel('Risvolto', risv, 'flap') +
      makePanel('Piatto', piatto) +
      makePanel('Dorso', dorso, 'spine') +
      makePanel('Piatto', piatto) +
      makePanel('Risvolto', risv, 'flap');
    setT('cop3_total', 'Totale: ' + (C.O23 || '-') + ' mm');
  } else {
    el.innerHTML = '<div style="padding:40px;color:var(--text-muted)">Attivo solo per tipo Olandese (C125=3)</div>';
    setT('cop3_total', '-');
  }
  setT('cop3_height', C.P23 ? C.P23 + ' mm' : '-');
}

function renderCop4(C) {
  const el = document.getElementById('cop4_diagram');
  if (C.C26 === 4 && C.H23 !== '') {
    const aletta = C.F25 || 0;
    const piatto = C.J23 || 0;
    const dorso = C.H23 || 0;
    const total = aletta * 2 + piatto * 2 + dorso;
    el.innerHTML =
      makePanel('Aletta', aletta, 'flap') +
      makePanel('Piatto', piatto) +
      makePanel('Dorso', dorso, 'spine') +
      makePanel('Piatto', piatto) +
      makePanel('Aletta', aletta, 'flap');
    setT('cop4_total', 'Totale: ' + total + ' mm');
  } else {
    el.innerHTML = '<div style="padding:40px;color:var(--text-muted)">Attivo solo per Olandese con Alette (C26=4)</div>';
    setT('cop4_total', '-');
  }
  setT('cop4_height', C.P23 ? C.P23 + ' mm' : '-');
}

function renderCus(prefix, C) {
  const el = document.getElementById(prefix + '_diagram');
  const fondEl = document.getElementById(prefix + '_fondello');
  const dorso = C.H33; const piatto = C.I33; const risv = C.K33; const h = C.P33;
  if (dorso > 0 && piatto > 0) {
    el.innerHTML =
      makePanel('Risvolto', risv, 'flap') +
      makePanel('Piatto', piatto) +
      makePanel('Dorso', dorso, 'spine') +
      makePanel('Piatto', piatto) +
      makePanel('Risvolto', risv, 'flap');
    const total = risv * 2 + piatto * 2 + dorso;
    setT(prefix + '_total', 'Totale: ' + total + ' mm');
    // Fondello
    const fondBase = risv * 2 + dorso;
    const fondH = piatto + risv * 2;
    fondEl.innerHTML = makePanel(fondBase + ' mm', fondBase) + makePanel(fondH + ' mm', fondH);
    setT(prefix + '_fond_total', fondBase + ' x ' + fondH + ' mm');
  } else {
    el.innerHTML = '<div style="padding:40px;color:var(--text-muted)">Inserisci i dati nel foglio CALC</div>';
    fondEl.innerHTML = '';
    setT(prefix + '_total', '-');
    setT(prefix + '_fond_total', '-');
  }
  setT(prefix + '_height', h ? h + ' mm' : '-');
}

function renderCus1(C) { renderCus('cus1', C); }
function renderCus2(C) { renderCus('cus2', C); }

function renderCus3(C) {
  const dorso = C.H33; const piatto = C.I33; const h = C.J33;
  const topEl = document.getElementById('cus3_top');
  const mainEl = document.getElementById('cus3_main');
  const botEl = document.getElementById('cus3_bottom');

  if (dorso > 0 && piatto > 0) {
    const panelW = Math.max(30, Math.min(piatto / 2, 200));
    topEl.innerHTML = `<div class="diagram-panel flap" style="width:${panelW}px;min-height:30px"><div class="diagram-dim">${dorso}</div></div><div style="width:10px"></div><div class="diagram-panel flap" style="width:${panelW}px;min-height:30px"><div class="diagram-dim">${dorso}</div></div>`;
    mainEl.innerHTML = `<div class="diagram-panel" style="width:${panelW}px"><div class="diagram-dim">${piatto}</div></div><div class="diagram-panel spine" style="width:${Math.max(20,dorso/3)}px"><div class="diagram-dim">${dorso}</div></div><div class="diagram-panel" style="width:${panelW}px"><div class="diagram-dim">${piatto}</div></div>`;
    botEl.innerHTML = topEl.innerHTML;
    const totalW = piatto * 2 + dorso;
    const totalH = h + dorso * 2;
    setT('cus3_total_w', 'Larghezza: ' + totalW + ' mm');
    setT('cus3_total_h', 'Altezza totale: ' + totalH + ' mm');
  } else {
    topEl.innerHTML = ''; mainEl.innerHTML = '<div style="padding:40px;color:var(--text-muted)">Inserisci i dati nel foglio CALC</div>'; botEl.innerHTML = '';
    setT('cus3_total_w', '-'); setT('cus3_total_h', '-');
  }
  setT('cus3_height_total', (dorso * 2 + (C.J33||0)) + ' mm');
}

function renderBrossA(C) {
  const el = document.getElementById('brossA_diagram');
  const dorso = C.H16; const base = C.E9; const f18 = C.F18; const f17 = C.F17;
  if (dorso !== '' && base > 0) {
    const panelW = base + f18;
    el.innerHTML =
      makePanel('Aletta', f17 || 0, 'flap') +
      makePanel('Piatto', panelW) +
      makePanel('Dorso', dorso, 'spine') +
      makePanel('Piatto', panelW) +
      makePanel('Aletta', f17 || 0, 'flap');
    const total = (f17 || 0) * 2 + panelW * 2 + dorso;
    setT('brossA_total', 'Totale: ' + total + ' mm');
  } else {
    el.innerHTML = '<div style="padding:40px;color:var(--text-muted)">Inserisci i dati nel foglio CALC</div>';
    setT('brossA_total', '-');
  }
  setT('brossA_height', C.F9 ? C.F9 + ' mm' : '-');
  setT('brossA_subtitle', (dorso !== '' ? 'Cop. BROSSURATA con ALETTE' : '') + ' - ' + C.C5 + ' - F.to Rifilato ' + (C.E9||'-') + ' x ' + (C.F9||'-'));
}

function renderBrossN(C) {
  const el = document.getElementById('brossN_diagram');
  const dorso = C.H16; const base = C.E9;
  if (dorso !== '' && base > 0) {
    el.innerHTML =
      makePanel('Piatto', base) +
      makePanel('Dorso', dorso, 'spine') +
      makePanel('Piatto', base);
    const total = base * 2 + dorso;
    setT('brossN_total', 'Totale: ' + total + ' mm');
  } else {
    el.innerHTML = '<div style="padding:40px;color:var(--text-muted)">Inserisci i dati nel foglio CALC</div>';
    setT('brossN_total', '-');
  }
  setT('brossN_height', C.F9 ? C.F9 + ' mm' : '-');
  setT('brossN_subtitle', (dorso !== '' ? 'Cop. BROSSURATA' : '') + ' - ' + C.C5 + ' - F.to Rifilato ' + (C.E9||'-') + ' x ' + (C.F9||'-'));
}

function renderSop1(C) {
  const el = document.getElementById('sop1_diagram');
  if (C.H29 !== '' && C.H29 > 0) {
    const aletta = C.J29_input || 0;
    const piatto = C.I29 || 0;
    const dorso = C.H29;
    el.innerHTML =
      makePanel('Aletta', aletta, 'flap') +
      makePanel('Piatto', piatto) +
      makePanel('Dorso', dorso, 'spine') +
      makePanel('Piatto', piatto) +
      makePanel('Aletta', aletta, 'flap');
    setT('sop1_total', 'Totale: ' + (C.O29 || '-') + ' mm');
  } else {
    el.innerHTML = '<div style="padding:40px;color:var(--text-muted)">Inserisci dati jacket nel CALC</div>';
    setT('sop1_total', '-');
  }
  setT('sop1_height', C.P29 ? C.P29 + ' mm' : '-');
}

function renderSop2(C) {
  const el = document.getElementById('sop2_diagram');
  setT('sop2_risvolto_label', 'Risvolto: ' + (C.K29 || '-') + ' mm');
  if (C.H29 !== '' && C.H29 > 0) {
    const aletta = C.J29_input || 0;
    const piatto = C.I29 || 0;
    const dorso = C.H29;
    el.innerHTML =
      makePanel('Aletta', aletta, 'flap') +
      makePanel('Piatto', piatto) +
      makePanel('Dorso', dorso, 'spine') +
      makePanel('Piatto', piatto) +
      makePanel('Aletta', aletta, 'flap') +
      makePanel('Extra', aletta, 'flap');
    setT('sop2_total', 'Totale: ' + (C.O29 || '-') + ' mm');
  } else {
    el.innerHTML = '<div style="padding:40px;color:var(--text-muted)">Inserisci dati jacket nel CALC</div>';
    setT('sop2_total', '-');
  }
  setT('sop2_height', C.P29 ? C.P29 + ' mm' : '-');
}

// =====================================================================
// CALC TAB - ANTEPRIMA COPERTINA
// =====================================================================
function renderCalcCover(C) {
  const el = document.getElementById('calc_cover_diagram');
  const titleEl = document.getElementById('calc_cover_title');
  const totalArrow = document.getElementById('calc_cover_total');
  const heightWrap = document.getElementById('calc_cover_height_wrap');
  if (!el) return;

  function setCoverQuote(totalMm, heightMm) {
    if (totalArrow) totalArrow.querySelector('span').textContent = totalMm ? totalMm + ' mm' : '-';
    // Height arrow — sync to diagram height after render
    if (heightWrap) {
      if (heightMm) {
        requestAnimationFrame(() => {
          const diag = el.querySelector('div');
          const h = diag ? diag.offsetHeight : 80;
          heightWrap.innerHTML = `<div class="pallet-arrow-v" style="position:absolute;left:8px;top:0;height:${h}px"><span>${heightMm} mm</span></div>`;
        });
      } else {
        heightWrap.innerHTML = '';
      }
    }
  }

  // Flex panel that fills proportionally (no fixed height — set by container aspect-ratio)
  function fp(label, dim, cls) {
    const flex = Math.max(dim || 1, 1);
    const bg = cls === 'spine' ? 'rgba(37,99,235,0.15)' : (cls === 'flap' ? 'rgba(255,152,0,0.1)' : (cls === 'hinge' ? 'rgba(156,39,176,0.1)' : 'rgba(21,101,192,0.05)'));
    const border = cls === 'spine' ? '#2563eb' : (cls === 'flap' ? '#ff9800' : (cls === 'hinge' ? '#9c27b0' : '#1565c0'));
    const color = cls === 'flap' ? '#e65100' : (cls === 'hinge' ? '#7b1fa2' : '#1565c0');
    return `<div style="flex:${flex};min-width:0;border:2px solid ${border};background:${bg};display:flex;align-items:center;justify-content:center;padding:2px;text-align:center;font-weight:600;font-size:12px;color:${color};overflow:hidden">
      <div><div style="font-size:10px;text-transform:uppercase;opacity:0.7;margin-bottom:2px">${label}</div><div>${dim || '-'}</div></div>
    </div>`;
  }

  const isCartonato = C.D51;
  let panels = '';
  let totalMm = null, heightMm = null;

  if (isCartonato) {
    const typeLabel = C.C125 === 1 ? 'Dorso QUADRO' : (C.C125 === 2 ? 'Dorso TONDO' : 'OLANDESE');
    titleEl.textContent = 'Anteprima Copertina — COP. Cartonata (' + typeLabel + ')';

    if (C.C125 === 3) {
      // OLANDESE
      if (C.H23 !== '' && C.H23 > 0) {
        const piatto = C.J23 || 0, dorso = C.H23 || 0, aletta = C.F25 || 0;
        if (aletta > 0) panels += fp('Aletta', aletta, 'flap');
        panels += fp('Piatto', piatto) + fp('Dorso', dorso, 'spine') + fp('Piatto', piatto);
        if (aletta > 0) panels += fp('Aletta', aletta, 'flap');
        totalMm = C.O23; heightMm = C.P23;
      }
    } else {
      // QUADRO / TONDO
      if (C.H23 !== '' && C.H23 > 0) {
        const risv = C.K23 || 0, piatto = C.J23 || 0, canal = C.I23 || 0, dorso = C.H23 || 0;
        panels = fp('Risvolto', risv, 'flap') + fp('Piatto', piatto) + fp('Canalino', canal, 'hinge') +
                 fp('Dorso', dorso, 'spine') +
                 fp('Canalino', canal, 'hinge') + fp('Piatto', piatto) + fp('Risvolto', risv, 'flap');
        totalMm = C.O23; heightMm = C.P23;
      }
    }
  } else {
    const hasAlette = C.F17 > 0;
    titleEl.textContent = 'Anteprima Copertina — COP. Brossurata' + (hasAlette ? ' con Alette' : '');

    const dorso = C.H16, base = C.E9;
    if (dorso !== '' && base > 0) {
      const f18 = C.F18 || 0, panelW = base + f18;
      if (hasAlette) {
        panels = fp('Aletta', C.F17, 'flap') + fp('Piatto', panelW) + fp('Dorso', dorso, 'spine') +
                 fp('Piatto', panelW) + fp('Aletta', C.F17, 'flap');
        totalMm = C.F17 * 2 + panelW * 2 + dorso;
      } else {
        panels = fp('Piatto', base) + fp('Dorso', dorso, 'spine') + fp('Piatto', base);
        totalMm = base * 2 + dorso;
      }
      heightMm = C.F9;
    }
  }

  if (panels && totalMm && heightMm) {
    const ratio = totalMm / heightMm;
    el.innerHTML = `<div style="display:flex;width:100%;gap:0;aspect-ratio:${ratio.toFixed(3)}">${panels}</div>`;
    setCoverQuote(totalMm, heightMm);
  } else if (panels) {
    el.innerHTML = `<div style="display:flex;width:100%;gap:0;min-height:80px">${panels}</div>`;
    setCoverQuote(totalMm, heightMm);
  } else {
    // Build detailed missing-data diagnostic
    let miss = [];
    if (C.E9 < 1) miss.push('Base formato (E9)');
    if (C.F9 < 1) miss.push('Altezza formato (F9)');
    const hasTexto = (C.P16 || 0) + (C.P18 || 0) >= 1;
    if (!hasTexto) miss.push('Dati Testo (pagine + grammatura)');
    if (C.C18 < 0.1) miss.push('Spessore blocco libro (C18)');
    if (C.C126 < 1) miss.push('Legatura (Cucito/Fresato)');
    if (C.H16 === '' || C.H16 <= 0) miss.push('\u2192 Dorso brossura non calcolabile');
    if (isCartonato) {
      if (C.C125 === 0) miss.push('Tipo copertina (QUADRO/TONDO/OLANDESE)');
      if (C.F24 < 0.1) miss.push('Spessore Cop.+Risg. (F24)');
      if (!C.F23 || C.F23 <= 0) miss.push('Cartoni mm (F23)');
      if (!C.K23 || C.K23 === 0) miss.push('Risvolto mm (K23)');
      if (C.H23 === '' || C.H23 <= 0) miss.push('\u2192 Dorso cartonato non calcolabile');
    }
    // Filter out items that are actually OK
    miss = miss.filter(m => m);
    let html = '<div style="padding:16px;color:var(--text-muted);text-align:left;font-size:13px">';
    html += '<div style="font-weight:600;margin-bottom:8px;color:#d97706">\u26A0 Dati mancanti per la copertina:</div>';
    html += '<ul style="margin:0;padding-left:18px;list-style:none">';
    miss.forEach(m => {
      const isResult = m.startsWith('\u2192');
      html += `<li style="margin:3px 0;${isResult ? 'color:#dc2626;font-weight:600' : ''}">${isResult ? '' : '\u2022 '}${m}</li>`;
    });
    if (miss.length === 0) html += '<li>\u2022 Verifica i parametri inseriti</li>';
    html += '</ul></div>';
    el.innerHTML = html;
    setCoverQuote(null, null);
  }
}

// =====================================================================
// CALC TAB - ANTEPRIMA BANCALE
// =====================================================================
function renderCalcPallet(C, copiesPerBox) {
  const topEl = document.getElementById('calc_pallet_top');
  const sideEl = document.getElementById('calc_pallet_side');
  const badgesEl = document.getElementById('calc_pallet_badges');
  const topArrow = document.getElementById('calc_pallet_top_w');
  const topDepthEl = document.getElementById('calc_pallet_top_d');
  const sideHeightEl = document.getElementById('calc_pallet_side_h');
  if (!topEl) return;

  const palletW = C.C130 || 0;
  const palletD = C.D130 || 0;
  const boxW = C.D59 || 0;
  const boxD = C.F59 || 0;
  const boxH = C.H59 || 0;
  const boxesPerLayer = C.D53 || 0;
  const layers = C.D54 || 0;
  const booksPerPallet = C.M52 || 0;
  const totalBooks = C.M51 || 0;
  const fullPallets = C.M58 || 0;
  const palletHeight = C.M56 || 0;

  if (!boxW || !boxD || !boxesPerLayer || !layers) {
    // Build detailed missing-data diagnostic (same style as cover)
    let miss = [];
    if (C.E9 < 1) miss.push('Base formato (E9)');
    if (C.F9 < 1) miss.push('Altezza formato (F9)');
    const hasTexto = (C.P16 || 0) + (C.P18 || 0) >= 1;
    if (!hasTexto) miss.push('Dati Testo (pagine + grammatura)');
    if (C.H16 === '' || C.H16 <= 0) miss.push('\u2192 Dorso non calcolabile');
    if (!C.I50 || C.I50 <= 0) miss.push('Max h Bancale (I50)');
    if (!C.D55 || C.D55 <= 0) miss.push('Peso Max Bancale (D55)');
    if (!C.M51 || C.M51 <= 0) miss.push('Copie da Spedire (M51)');
    if (boxH <= 0 && C.E9 >= 1 && C.F9 >= 1) miss.push('\u2192 Altezza scatola = 0 (serve dorso libro)');
    if (boxesPerLayer <= 0 && boxW > 0 && boxD > 0) miss.push('\u2192 Scatola troppo grande per il bancale');
    if (layers <= 0 && boxesPerLayer > 0) miss.push('\u2192 Piani = 0 (verifica altezza/peso max)');
    miss = miss.filter(m => m);
    let html = '<div style="padding:16px;color:var(--text-muted);text-align:left;font-size:13px">';
    html += '<div style="font-weight:600;margin-bottom:8px;color:#d97706">\u26A0 Dati mancanti per il bancale:</div>';
    html += '<ul style="margin:0;padding-left:18px;list-style:none">';
    miss.forEach(m => {
      const isResult = m.startsWith('\u2192');
      html += `<li style="margin:3px 0;${isResult ? 'color:#dc2626;font-weight:600' : ''}">${isResult ? '' : '\u2022 '}${m}</li>`;
    });
    if (miss.length === 0) html += '<li>\u2022 Verifica i parametri inseriti</li>';
    html += '</ul></div>';
    topEl.innerHTML = html;
    sideEl.innerHTML = '';
    badgesEl.innerHTML = '';
    topArrow.querySelector('span').textContent = '-';
    topDepthEl.innerHTML = '';
    sideHeightEl.innerHTML = '';
    return;
  }

  // TOP VIEW - boxes precisely centered on pallet
  const cols = Math.floor(palletW / boxW);
  const rows = Math.floor(palletD / boxD);
  const CANVAS_W = 210;
  const scaleTop = CANVAS_W / Math.max(palletW, palletD, 1);
  const topW = Math.round(palletW * scaleTop);
  const topH = Math.round(palletD * scaleTop);
  const bw = boxW * scaleTop;
  const bd = boxD * scaleTop;
  const blockPxW = Math.round(cols * bw);
  const blockPxH = Math.round(rows * bd);
  const offsetX = Math.round((topW - blockPxW) / 2);
  const offsetY = Math.round((topH - blockPxH) / 2);
  // Real block dimensions in cm
  const blockRealW = (cols * boxW).toFixed(1);
  const blockRealD = (rows * boxD).toFixed(1);

  let topHtml = `<div class="pallet-base-top" style="width:${topW}px;height:${topH}px;margin:0 auto;position:relative">`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offsetX + Math.round(c * bw);
      const y = offsetY + Math.round(r * bd);
      const w = Math.round(bw) - 1;
      const h = Math.round(bd) - 1;
      topHtml += `<div class="pallet-box" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${copiesPerBox}</div>`;
    }
  }
  topHtml += '</div>';
  // Orange block width arrow below pallet, aligned with block position
  topHtml += `<div style="width:${topW}px;margin:3px auto 0;height:18px;position:relative">`;
  topHtml += `<div style="position:absolute;left:${offsetX}px;width:${blockPxW}px;top:0;display:flex;align-items:center;justify-content:center">`;
  topHtml += `<div style="flex:1;height:1px;background:#e65100"></div>`;
  topHtml += `<span style="padding:0 4px;font-size:11px;color:#e65100;font-weight:700;white-space:nowrap">${blockRealW} cm</span>`;
  topHtml += `<div style="flex:1;height:1px;background:#e65100"></div>`;
  topHtml += `</div></div>`;
  topEl.innerHTML = topHtml;
  topArrow.querySelector('span').textContent = palletW + ' cm';
  // Vertical arrows: orange block depth + blue pallet depth
  topDepthEl.innerHTML =
    `<div style="position:absolute;left:2px;top:${offsetY}px;height:${blockPxH}px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="flex:1;width:1px;background:#e65100"></div><span style="padding:2px 0;font-size:11px;color:#e65100;font-weight:700;writing-mode:vertical-rl;white-space:nowrap">${blockRealD} cm</span><div style="flex:1;width:1px;background:#e65100"></div></div>` +
    `<div class="pallet-arrow-v" style="position:absolute;left:30px;top:0;height:${topH}px"><span>${palletD} cm</span></div>`;

  // SIDE VIEW — block centered on pallet base
  const palletBaseH = 14;
  const sideMaxH = 220;
  const availH = sideMaxH - palletBaseH;
  const sideW = Math.round(palletW * (CANVAS_W / Math.max(palletW, 1)));
  const layerPxH = Math.max(2, Math.floor(availH / Math.max(layers, 1)));
  const sideContentH = layerPxH * layers;
  const sideTotalH = Math.min(sideContentH + palletBaseH, sideMaxH);
  const showLabel = layerPxH >= 16;
  const boxHLabel = boxH.toFixed ? boxH.toFixed(1) : boxH;
  // Block width in px (centered on pallet)
  const sideBlockPxW = Math.round(cols * bw * (sideW / topW));
  const sideBlockOffX = Math.round((sideW - sideBlockPxW) / 2);
  // Real block dimensions
  const blockWcm = (cols * boxW).toFixed(1);
  const blockHcm = (layers * boxH).toFixed(1);

  let sideHtml = `<div style="position:relative;width:${sideW}px;height:${sideTotalH}px;margin:0 auto 0 38px">`;
  for (let i = 0; i < layers; i++) {
    const bottom = palletBaseH + i * layerPxH;
    if (bottom + layerPxH > sideTotalH) break;
    const label = showLabel ? `Piano ${i+1}` : '';
    sideHtml += `<div class="pallet-layer" style="left:${sideBlockOffX}px;right:auto;width:${sideBlockPxW}px;bottom:${bottom}px;height:${Math.max(layerPxH-2,1)}px;font-size:${showLabel?10:0}px">${label}</div>`;
  }
  sideHtml += `<div class="pallet-base-side"></div>`;
  // Block width dimension below layers
  const blockBottomY = sideTotalH - palletBaseH + 1;
  sideHtml += `<div style="position:absolute;left:${sideBlockOffX}px;bottom:0;width:${sideBlockPxW}px;display:flex;align-items:center;justify-content:center">`;
  sideHtml += `<div style="flex:1;height:1px;background:#e65100"></div>`;
  sideHtml += `<span style="padding:0 4px;font-size:11px;color:#e65100;font-weight:700;white-space:nowrap">${blockWcm} cm</span>`;
  sideHtml += `<div style="flex:1;height:1px;background:#e65100"></div></div>`;
  // Single box height arrow on left
  if (layerPxH > 8) {
    sideHtml += `<div style="position:absolute;left:-36px;bottom:${palletBaseH}px;height:${layerPxH}px;display:flex;flex-direction:column;align-items:center;justify-content:center">`;
    sideHtml += `<div style="flex:1;width:1px;background:#e65100"></div>`;
    sideHtml += `<div style="padding:1px 0;font-size:11px;color:#e65100;font-weight:700;white-space:nowrap;writing-mode:vertical-rl">${boxHLabel} cm</div>`;
    sideHtml += `<div style="flex:1;width:1px;background:#e65100"></div></div>`;
  }
  sideHtml += '</div>';
  sideHtml += `<div class="pallet-dim" style="text-align:center;margin-top:4px;font-size:11px;font-weight:600;color:var(--primary)">${layers} piani × ${boxesPerLayer} scat./piano</div>`;
  sideEl.innerHTML = sideHtml;
  // Total height arrow on the right — exact diagram height
  const hLabel = palletHeight.toFixed ? palletHeight.toFixed(1) : palletHeight;
  sideHeightEl.innerHTML = `<div class="pallet-arrow-v" style="position:absolute;left:8px;top:0;height:${sideTotalH}px"><span>${hLabel} cm</span></div>`;

  // BADGES
  const remainder = totalBooks > 0 && booksPerPallet > 0 ? totalBooks % booksPerPallet : 0;
  let bHtml = `<span class="pallet-info-badge">${cols}×${rows} = ${boxesPerLayer} scat./piano</span>`;
  bHtml += `<span class="pallet-info-badge green">${layers} piani</span>`;
  bHtml += `<span class="pallet-info-badge">${booksPerPallet} libri/bancale</span>`;
  bHtml += `<span class="pallet-info-badge orange">Scatola: ${boxW.toFixed(1)}×${boxD.toFixed(1)}×${boxH.toFixed(1)} cm</span>`;
  if (fullPallets > 0) bHtml += `<span class="pallet-info-badge green">${fullPallets} bancale/i</span>`;
  if (remainder > 0) bHtml += `<span class="pallet-info-badge orange">+ ${remainder} libri sfusi</span>`;
  badgesEl.innerHTML = bHtml;
}

// =====================================================================
// PALLET DIAGRAM RENDERER
// =====================================================================
function renderPallet(C, copiesPerBox) {
  const topEl = document.getElementById('pallet_top_view');
  const sideEl = document.getElementById('pallet_side_view');
  const badgesEl = document.getElementById('lay_badges');
  const summaryEl = document.getElementById('pallet_summary_grid');
  const topArrow = document.getElementById('pallet_top_w');
  const sideArrow = document.getElementById('pallet_side_w');

  const palletW = C.C130 || 0;  // cm (100 or 80)
  const palletD = C.D130 || 0;  // cm (120)
  const boxW = C.D59 || 0;      // cm external
  const boxD = C.F59 || 0;      // cm external
  const boxH = C.H59 || 0;      // cm external
  const boxesPerLayer = C.D53 || 0;
  const layers = C.D54 || 0;
  const booksPerPallet = C.M52 || 0;
  const boxesPerPallet = C.M53 || 0;
  const palletWeight = C.M55 || 0;
  const palletHeight = C.M56 || 0;
  const fullPallets = C.M58 || 0;
  const partialWeight = C.M59 || 0;
  const totalBooks = C.M51 || 0;

  // Guard: if no data, show placeholder
  if (!boxW || !boxD || !boxesPerLayer || !layers) {
    topEl.innerHTML = '<div style="padding:40px;color:var(--text-muted);text-align:center">Inserisci dati nel CALC per visualizzare il bancale</div>';
    sideEl.innerHTML = '';
    badgesEl.innerHTML = '';
    summaryEl.innerHTML = '';
    topArrow.querySelector('span').textContent = '-';
    sideArrow.querySelector('span').textContent = '-';
    return;
  }

  // ── TOP VIEW (looking down on one layer) ──
  const cols = palletW > 0 && boxW > 0 ? Math.floor(palletW / boxW) : 0;
  const rows = palletD > 0 && boxD > 0 ? Math.floor(palletD / boxD) : 0;
  const CANVAS_W = 280;
  const scaleTop = CANVAS_W / Math.max(palletW, palletD, 1);
  const topW = Math.round(palletW * scaleTop);
  const topH = Math.round(palletD * scaleTop);
  const bw = boxW * scaleTop;
  const bd = boxD * scaleTop;

  let topHtml = `<div class="pallet-base-top" style="width:${topW}px;height:${topH}px;margin:0 auto">`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.round(c * bw);
      const y = Math.round(r * bd);
      const w = Math.round(bw - 1);
      const h = Math.round(bd - 1);
      topHtml += `<div class="pallet-box" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${copiesPerBox}</div>`;
    }
  }
  topHtml += '</div>';
  topEl.innerHTML = topHtml;
  topArrow.querySelector('span').textContent = palletW + ' cm';

  // ── SIDE VIEW (layers stacked) ──
  const palletBaseH = 16; // px for pallet base drawing
  const sideMaxH = 280;   // max pixel height for the whole side view
  const availH = sideMaxH - palletBaseH;
  const sideW = Math.round(palletW * (CANVAS_W / Math.max(palletW, 1)));
  const layerPxH = Math.max(2, Math.floor(availH / Math.max(layers, 1)));
  const sideContentH = layerPxH * layers;
  const sideTotalH = Math.min(sideContentH + palletBaseH, sideMaxH);
  const showLabel = layerPxH >= 16; // only show text if layer is tall enough

  let sideHtml = `<div style="position:relative;width:${sideW}px;height:${sideTotalH}px;margin:0 auto">`;
  // Draw layers from bottom to top
  for (let i = 0; i < layers; i++) {
    const bottom = palletBaseH + i * layerPxH;
    if (bottom + layerPxH > sideTotalH) break; // safety clip
    const label = showLabel ? `Piano ${i + 1} (${boxesPerLayer} scat.)` : '';
    sideHtml += `<div class="pallet-layer" style="bottom:${bottom}px;height:${Math.max(layerPxH - 2, 1)}px;font-size:${showLabel ? 10 : 0}px">${label}</div>`;
  }
  // Pallet base
  sideHtml += `<div class="pallet-base-side"></div>`;
  // Height arrow on the right
  const hLabel = palletHeight.toFixed ? palletHeight.toFixed(1) : palletHeight;
  sideHtml += `<div class="pallet-arrow-v" style="right:-36px;top:0;bottom:0"><span>${hLabel} cm</span></div>`;
  sideHtml += '</div>';
  if (!showLabel) {
    sideHtml += `<div class="pallet-dim" style="text-align:center">${layers} piani × ${boxesPerLayer} scatole</div>`;
  }
  sideEl.innerHTML = sideHtml;
  sideArrow.querySelector('span').textContent = palletW + ' cm';

  // ── BADGES ──
  const remainder = totalBooks > 0 && booksPerPallet > 0 ? totalBooks % booksPerPallet : 0;
  let badgesHtml = `<span class="pallet-info-badge">Bancale: ${palletW}×${palletD} cm</span>`;
  badgesHtml += `<span class="pallet-info-badge">${cols}×${rows} = ${boxesPerLayer} scatole/piano</span>`;
  badgesHtml += `<span class="pallet-info-badge green">${layers} piani</span>`;
  if (fullPallets > 0) {
    badgesHtml += `<span class="pallet-info-badge green">${fullPallets} bancale/i intero/i</span>`;
  }
  if (remainder > 0) {
    badgesHtml += `<span class="pallet-info-badge orange">+ ${remainder} libri sfusi (${partialWeight} Kg)</span>`;
  }
  badgesEl.innerHTML = badgesHtml;

  // ── SUMMARY GRID ──
  const items = [
    ['Libri/Bancale', booksPerPallet],
    ['Scatole/Bancale', boxesPerPallet],
    ['Peso Bancale', palletWeight + ' Kg'],
    ['Altezza Bancale', (palletHeight.toFixed ? palletHeight.toFixed(1) : palletHeight) + ' cm'],
    ['Bancali Interi', fullPallets],
    ['Tiratura', totalBooks],
  ];
  summaryEl.innerHTML = items.map(([lbl, val]) =>
    `<div class="pallet-summary-item"><div class="ps-label">${lbl}</div><div class="ps-value">${val || '-'}</div></div>`
  ).join('');
}

// =====================================================================
// TAB SWITCHING
// =====================================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// Initial calculation
recalcAll();

// ==========================================
// PRE-FILL WITH DEMO DATA (Sistema compilato)
// ==========================================
setTimeout(function() {
  function sv(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
  // Libro
  sv('C3', 'La Divina Commedia');
  sv('C4', '978-8804703502');

  // Copie per scatola
  sv('D51', 25);
  sv('M51', 1000);  // Total copies

  // Carta
  sv('D45', 80);  // g/m2
  sv('F50', 'offset');

  // Dimensioni scatola (cm)
  sv('D59', 20);  // Larghezza
  sv('F59', 15);  // Profondità
  sv('H59', 25);  // Altezza

  // Dimensioni bancale e limiti
  sv('C130', 100);  // Larghezza cm
  sv('D130', 120);  // Profondità cm
  sv('D55', 800);   // Peso max bancale kg
  sv('D60', 40);    // Max altezza scatola cm
  sv('D61', 25);    // Max peso scatola kg

  // Trigger automatic calculation
  recalcAll();
}, 100);

// Load saved items
loadItemsFromStorage();
renderItemList();
</script>
</body>
</html>
"""
