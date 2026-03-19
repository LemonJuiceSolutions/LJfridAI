import type { UiElementsOverrides, UnifiedStylePreset } from '@/lib/unified-style-types';
import { UI_ELEMENTS_DEFAULTS } from '@/lib/unified-style-types';
import { generateHtmlStyleCss, generatePlatformLayoutCss } from '@/lib/html-style-utils';

function v<K extends keyof UiElementsOverrides>(ui: Partial<UiElementsOverrides>, key: K): UiElementsOverrides[K] {
    return (ui[key] ?? UI_ELEMENTS_DEFAULTS[key]) as UiElementsOverrides[K];
}

const SHADOW_CSS: Record<string, string> = {
    none: 'none',
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px rgba(0,0,0,0.07)',
    lg: '0 10px 15px rgba(0,0,0,0.10)',
};

/**
 * Generates CSS for UI elements (buttons, inputs, badges, cards, etc.)
 * from a UiElementsOverrides partial config.
 */
export function generateUiElementsCss(ui: Partial<UiElementsOverrides>): string {
    const btnShadow = SHADOW_CSS[v(ui, 'btn_shadow') as string] ?? 'none';
    const cardShadow = SHADOW_CSS[v(ui, 'card_shadow') as string] ?? 'none';

    return `
/* ── Primary Button ── */
button.btn, .btn, button[type="submit"], input[type="submit"] {
  background-color: ${v(ui, 'btn_bg_color')};
  color: ${v(ui, 'btn_text_color')};
  border-radius: ${v(ui, 'btn_border_radius')}px;
  padding: ${v(ui, 'btn_padding_v')}px ${v(ui, 'btn_padding_h')}px;
  font-size: ${v(ui, 'btn_font_size')}px;
  font-weight: ${v(ui, 'btn_font_weight')};
  border: ${v(ui, 'btn_border_width')}px solid ${v(ui, 'btn_border_color')};
  box-shadow: ${btnShadow};
  text-transform: ${v(ui, 'btn_text_transform')};
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}
button.btn:hover, .btn:hover, button[type="submit"]:hover, input[type="submit"]:hover {
  background-color: ${v(ui, 'btn_hover_bg_color')};
  color: ${v(ui, 'btn_hover_text_color')};
}
/* ── Secondary Button ── */
button.btn-secondary, .btn-secondary {
  background-color: ${v(ui, 'btn_secondary_bg_color')};
  color: ${v(ui, 'btn_secondary_text_color')};
  border: 1px solid ${v(ui, 'btn_secondary_border_color')};
  border-radius: ${v(ui, 'btn_border_radius')}px;
  padding: ${v(ui, 'btn_padding_v')}px ${v(ui, 'btn_padding_h')}px;
  font-size: ${v(ui, 'btn_font_size')}px;
  cursor: pointer;
  transition: background-color 0.15s;
}
button.btn-secondary:hover, .btn-secondary:hover {
  background-color: ${v(ui, 'btn_secondary_hover_bg_color')};
}
/* ── Input & Textarea ── */
input:not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]),
textarea,
select {
  background-color: ${v(ui, 'input_bg_color')};
  color: ${v(ui, 'input_text_color')};
  border: ${v(ui, 'input_border_width')}px solid ${v(ui, 'input_border_color')};
  border-radius: ${v(ui, 'input_border_radius')}px;
  padding: ${v(ui, 'input_padding_v')}px ${v(ui, 'input_padding_h')}px;
  font-size: ${v(ui, 'input_font_size')}px;
  outline: none;
}
input:not([type="submit"]):not([type="button"]):focus,
textarea:focus {
  border-color: ${v(ui, 'input_focus_border_color')};
  box-shadow: 0 0 0 3px ${v(ui, 'input_focus_ring_color')};
}
input::placeholder, textarea::placeholder {
  color: ${v(ui, 'input_placeholder_color')};
}
/* ── Select ── */
select {
  background-color: ${v(ui, 'select_bg_color')};
  color: ${v(ui, 'select_text_color')};
  border-color: ${v(ui, 'select_border_color')};
  border-radius: ${v(ui, 'select_border_radius')}px;
}
/* ── Badge ── */
.badge, [class*="badge"] {
  background-color: ${v(ui, 'badge_bg_color')};
  color: ${v(ui, 'badge_text_color')};
  border-radius: ${v(ui, 'badge_border_radius')}px;
  font-size: ${v(ui, 'badge_font_size')}px;
  font-weight: ${v(ui, 'badge_font_weight')};
  padding: ${v(ui, 'badge_padding_v')}px ${v(ui, 'badge_padding_h')}px;
  display: inline-block;
}
/* ── Card ── */
.card, [class*="card"] {
  background-color: ${v(ui, 'card_bg_color')};
  border: 1px solid ${v(ui, 'card_border_color')};
  border-radius: ${v(ui, 'card_border_radius')}px;
  box-shadow: ${cardShadow};
  padding: ${v(ui, 'card_padding')}px;
}
.card-header, [class*="card-header"], [class*="card"] h2, [class*="card"] h3 {
  font-size: ${v(ui, 'card_header_font_size')}px;
  font-weight: ${v(ui, 'card_header_font_weight')};
  color: ${v(ui, 'card_header_color')};
}
/* ── Divider ── */
hr, .divider {
  border: none;
  border-top: ${v(ui, 'divider_width')}px ${v(ui, 'divider_style')} ${v(ui, 'divider_color')};
  margin: 8px 0;
}
/* ── Lists ── */
ul li::marker, ol li::marker {
  color: ${v(ui, 'list_marker_color')};
}
ul li, ol li {
  margin-bottom: ${v(ui, 'list_item_spacing')}px;
}
/* ── Slider / Range ── */
input[type="range"] {
  accent-color: ${v(ui, 'slider_thumb_color')};
  height: ${v(ui, 'slider_track_height')}px;
}
${v(ui, 'ui_custom_css') || ''}
`.trim();
}

/**
 * Generates a full self-contained HTML preview page for a UnifiedStylePreset.
 */
export function generateUnifiedPreviewHtml(preset: UnifiedStylePreset): string {
    const htmlCss = generateHtmlStyleCss(preset.html as Parameters<typeof generateHtmlStyleCss>[0]);
    const layoutCss = generatePlatformLayoutCss(preset.html as Parameters<typeof generateHtmlStyleCss>[0]);
    const uiCss = generateUiElementsCss(preset.ui);

    return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; }
${htmlCss}
${layoutCss}
${uiCss}
</style>
</head>
<body>
<div class="__cw" style="position:relative;">
  <h2>Anteprima Stile</h2>
  <p class="text-secondary">Esempio completo di tutti i componenti</p>
  <hr class="divider-gradient">

  <div class="kpi-grid mt-md">
    <div class="stat-card accent-primary">
      <div class="stat-label">Fatturato</div>
      <div class="stat-value">&euro; 1.250.000</div>
      <div class="stat-change up">+12.4%</div>
    </div>
    <div class="stat-card accent-success">
      <div class="stat-label">Obiettivo</div>
      <div class="stat-value">87%</div>
      <div class="progress-bar success" style="margin-top:6px"><div class="progress-fill" style="width:87%"></div></div>
    </div>
    <div class="stat-card accent-danger">
      <div class="stat-label">Criticita</div>
      <div class="stat-value">3</div>
      <span class="badge bg-danger">Urgente</span>
    </div>
  </div>

  <div class="table-section mt-lg">
    <table>
      <thead><tr><th>Colonna A</th><th>Colonna B</th><th>Delta</th><th>Stato</th></tr></thead>
      <tbody>
        <tr><td>Valore 1</td><td>1.234</td><td class="positive">+5.2%</td><td><span class="badge bg-success">OK</span></td></tr>
        <tr><td>Valore 2</td><td>5.678</td><td class="negative">-2.1%</td><td><span class="badge bg-warning">Attenzione</span></td></tr>
      </tbody>
    </table>
  </div>

  <div class="flex-row mt-md">
    <button class="btn">Pulsante Primario</button>
    <button class="btn-secondary">Secondario</button>
    <span class="badge bg-info">Info</span>
    <span class="tag">Tag</span>
  </div>

  <div class="card mt-md" style="max-width:320px">
    <h3><span class="status-dot active"></span> Stato Card</h3>
    <p style="margin:4px 0 0">Contenuto della card con informazioni.</p>
  </div>

  <p style="margin-top:12px"><input type="text" placeholder="Campo di testo..." style="width:220px"></p>
  <ul style="margin-top:8px"><li>Elemento lista uno</li><li>Elemento lista due</li></ul>
</div>
</body>
</html>`;
}
