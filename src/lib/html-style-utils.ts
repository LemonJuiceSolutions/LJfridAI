// HTML Style Overrides - mirrors the pattern of plotly-utils.ts

export interface HtmlStyleOverrides {
  // ── Page / Container ──
  page_bg_color?: string;
  page_padding?: number;
  container_max_width?: number;        // 0 = 100%
  container_border_radius?: number;
  container_shadow?: 'none' | 'sm' | 'md' | 'lg';

  // ── Header (th) ──
  header_bg_color?: string;
  header_bg_gradient_end?: string;     // if set, creates linear-gradient
  header_text_color?: string;
  header_font_size?: number;
  header_font_weight?: string;
  header_text_transform?: 'none' | 'uppercase' | 'capitalize' | 'lowercase';
  header_letter_spacing?: number;
  header_text_align?: 'left' | 'center' | 'right';
  header_vertical_align?: 'top' | 'middle' | 'bottom';
  header_padding_v?: number;           // separate from body
  header_padding_h?: number;
  header_border_bottom_width?: number; // thick line between header/body
  header_border_bottom_color?: string;
  header_white_space?: 'nowrap' | 'normal';

  // ── Body (td) ──
  body_bg_color?: string;
  body_text_color?: string;
  body_font_size?: number;
  body_font_weight?: string;
  body_line_height?: number;
  body_text_align?: 'left' | 'center' | 'right';
  body_vertical_align?: 'top' | 'middle' | 'bottom';
  body_white_space?: 'normal' | 'nowrap';
  body_text_transform?: 'none' | 'uppercase' | 'capitalize' | 'lowercase';
  body_letter_spacing?: number;

  // ── Typography ──
  font_family?: string;

  // ── Borders ──
  border_color?: string;
  border_style?: 'solid' | 'dashed' | 'dotted' | 'none';
  border_width?: number;
  table_border_radius?: number;
  row_border_color?: string;           // horizontal separators between rows
  col_border_color?: string;           // vertical separators between columns

  // ── Cell Spacing ──
  cell_padding_v?: number;
  cell_padding_h?: number;

  // ── Table Layout ──
  table_layout?: 'auto' | 'fixed';
  row_min_height?: number;             // px, 0 = auto
  min_col_width?: number;              // px, 0 = auto

  // ── First Column Styling ──
  first_col_bg_color?: string;
  first_col_text_color?: string;
  first_col_font_weight?: string;
  first_col_min_width?: number;

  // ── Last Column Styling ──
  last_col_text_align?: 'left' | 'center' | 'right';

  // ── Striping & Hover ──
  stripe_enabled?: boolean;
  stripe_color?: string;
  hover_enabled?: boolean;
  hover_color?: string;

  // ── Value Colors (positive/negative) ──
  positive_color?: string;
  negative_color?: string;

  // ── Headings (h1-h3) ──
  heading_color?: string;
  heading_font_size?: number;
  heading_margin_v?: number;

  // ── Caption / Title ──
  caption_color?: string;
  caption_font_size?: number;
  caption_bg_color?: string;
  caption_text_align?: 'left' | 'center' | 'right';
  caption_padding?: number;

  // ── Links ──
  link_color?: string;
  link_decoration?: 'none' | 'underline';

  // ── Scrollbar ──
  scrollbar_width?: 'auto' | 'thin' | 'none';

  // ── Text Overflow ──
  cell_text_overflow?: 'ellipsis' | 'clip' | 'visible';
  cell_max_width?: number;             // px, 0 = none

  // ── Custom CSS (escape hatch) ──
  custom_css?: string;
}

const DEFAULTS = {
  page_bg_color: '#ffffff',
  page_padding: 10,
  container_max_width: 0,
  container_border_radius: 0,
  container_shadow: 'none' as const,

  header_bg_color: '#1e293b',
  header_bg_gradient_end: '',
  header_text_color: '#f1f5f9',
  header_font_size: 9,
  header_font_weight: '600',
  header_text_transform: 'uppercase' as const,
  header_letter_spacing: 0.3,
  header_text_align: 'left' as const,
  header_vertical_align: 'middle' as const,
  header_padding_v: 6,
  header_padding_h: 8,
  header_border_bottom_width: 2,
  header_border_bottom_color: '#0f172a',
  header_white_space: 'nowrap' as const,

  body_bg_color: '#ffffff',
  body_text_color: '#374151',
  body_font_size: 10,
  body_font_weight: '400',
  body_line_height: 1.4,
  body_text_align: 'left' as const,
  body_vertical_align: 'middle' as const,
  body_white_space: 'normal' as const,
  body_text_transform: 'none' as const,
  body_letter_spacing: 0,

  font_family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',

  border_color: '#d1d5db',
  border_style: 'solid' as const,
  border_width: 1,
  table_border_radius: 0,
  row_border_color: '',
  col_border_color: '',

  cell_padding_v: 5,
  cell_padding_h: 7,

  table_layout: 'auto' as const,
  row_min_height: 0,
  min_col_width: 0,

  first_col_bg_color: '',
  first_col_text_color: '',
  first_col_font_weight: '',
  first_col_min_width: 0,

  last_col_text_align: '' as string,

  stripe_enabled: true,
  stripe_color: '#f9fafb',
  hover_enabled: true,
  hover_color: '#f3f4f6',

  positive_color: '#059669',
  negative_color: '#dc2626',

  heading_color: '#1f2937',
  heading_font_size: 18,
  heading_margin_v: 10,

  caption_color: '#374151',
  caption_font_size: 14,
  caption_bg_color: '',
  caption_text_align: 'left' as const,
  caption_padding: 8,

  link_color: '#2563eb',
  link_decoration: 'underline' as const,

  scrollbar_width: 'auto' as const,

  cell_text_overflow: 'visible' as const,
  cell_max_width: 0,
};

export { DEFAULTS as HTML_STYLE_DEFAULTS };

const SHADOW_MAP: Record<string, string> = {
  none: 'none',
  sm: '0 1px 3px rgba(0,0,0,0.08)',
  md: '0 2px 8px rgba(0,0,0,0.12)',
  lg: '0 4px 16px rgba(0,0,0,0.16)',
};

/**
 * Generate CSS string from HtmlStyleOverrides.
 * Returns only the CSS rules (no <style> tags).
 */
export function generateHtmlStyleCss(overrides: HtmlStyleOverrides): string {
  const o = { ...DEFAULTS, ...overrides };

  let css = '';

  // Reset
  css += `* { box-sizing: border-box; }\n`;

  // Body / Page
  css += `body { margin: 0; padding: ${o.page_padding}px; font-family: ${o.font_family}; `;
  css += `background-color: ${o.page_bg_color}; color: ${o.body_text_color}; `;
  css += `font-size: ${o.body_font_size}px; line-height: ${o.body_line_height}; `;
  if (o.scrollbar_width !== 'auto') css += `scrollbar-width: ${o.scrollbar_width}; `;
  css += `}\n`;

  // Container (wraps table if user wants max-width / shadow / radius)
  if (o.container_max_width > 0 || o.container_shadow !== 'none' || o.container_border_radius > 0) {
    css += `.container, body > div, body > table { `;
    if (o.container_max_width > 0) css += `max-width: ${o.container_max_width}px; margin-left: auto; margin-right: auto; `;
    if (o.container_border_radius > 0) css += `border-radius: ${o.container_border_radius}px; overflow: hidden; `;
    if (o.container_shadow !== 'none') css += `box-shadow: ${SHADOW_MAP[o.container_shadow] || 'none'}; `;
    css += `}\n`;
  }

  // Table
  css += `table { border-collapse: collapse; width: 100%; font-size: ${o.body_font_size}px; `;
  css += `border: ${o.border_width}px ${o.border_style} ${o.border_color}; `;
  if (o.table_layout === 'fixed') css += `table-layout: fixed; `;
  if (o.table_border_radius > 0) css += `border-radius: ${o.table_border_radius}px; overflow: hidden; `;
  css += `}\n`;

  // Header (th)
  const headerBg = o.header_bg_gradient_end
    ? `linear-gradient(135deg, ${o.header_bg_color} 0%, ${o.header_bg_gradient_end} 100%)`
    : o.header_bg_color;
  css += `th { background: ${headerBg}; color: ${o.header_text_color}; `;
  css += `font-size: ${o.header_font_size}px; font-weight: ${o.header_font_weight}; `;
  css += `padding: ${o.header_padding_v}px ${o.header_padding_h}px; `;
  css += `text-align: ${o.header_text_align}; vertical-align: ${o.header_vertical_align}; `;
  if (o.header_text_transform !== 'none') css += `text-transform: ${o.header_text_transform}; `;
  if (o.header_letter_spacing > 0) css += `letter-spacing: ${o.header_letter_spacing}px; `;
  css += `border: ${o.border_width}px ${o.border_style} ${o.border_color}; `;
  if (o.header_border_bottom_width > 0) {
    css += `border-bottom: ${o.header_border_bottom_width}px solid ${o.header_border_bottom_color}; `;
  }
  css += `white-space: ${o.header_white_space}; `;
  css += `}\n`;

  // Body cells (td)
  css += `td { color: ${o.body_text_color}; font-weight: ${o.body_font_weight}; `;
  css += `padding: ${o.cell_padding_v}px ${o.cell_padding_h}px; `;
  css += `border: ${o.border_width}px ${o.border_style} ${o.border_color}; `;
  css += `text-align: ${o.body_text_align}; vertical-align: ${o.body_vertical_align}; `;
  if (o.body_text_transform !== 'none') css += `text-transform: ${o.body_text_transform}; `;
  if (o.body_letter_spacing > 0) css += `letter-spacing: ${o.body_letter_spacing}px; `;
  if (o.body_white_space === 'nowrap') css += `white-space: nowrap; `;
  if (o.cell_text_overflow === 'ellipsis') {
    css += `overflow: hidden; text-overflow: ellipsis; `;
    if (o.body_white_space !== 'nowrap') css += `white-space: nowrap; `;
  } else if (o.cell_text_overflow === 'clip') {
    css += `overflow: hidden; `;
  }
  if (o.cell_max_width > 0) css += `max-width: ${o.cell_max_width}px; `;
  css += `}\n`;

  // Row min height
  if (o.row_min_height > 0) {
    css += `tr { min-height: ${o.row_min_height}px; }\n`;
    css += `td, th { min-height: ${o.row_min_height}px; }\n`;
  }

  // Min column width
  if (o.min_col_width > 0) {
    css += `td, th { min-width: ${o.min_col_width}px; }\n`;
  }

  // Row / col specific borders
  if (o.row_border_color) {
    css += `td { border-top-color: ${o.row_border_color}; border-bottom-color: ${o.row_border_color}; }\n`;
  }
  if (o.col_border_color) {
    css += `td, th { border-left-color: ${o.col_border_color}; border-right-color: ${o.col_border_color}; }\n`;
  }

  // Body background
  if (o.body_bg_color !== '#ffffff') {
    css += `tbody, td { background-color: ${o.body_bg_color}; }\n`;
  }

  // Striping
  if (o.stripe_enabled) {
    css += `tbody tr:nth-child(even) td { background-color: ${o.stripe_color}; }\n`;
  }

  // Hover
  if (o.hover_enabled) {
    css += `tbody tr:hover td { background-color: ${o.hover_color}; }\n`;
  }

  // First column
  if (o.first_col_bg_color || o.first_col_text_color || o.first_col_font_weight || o.first_col_min_width > 0) {
    css += `td:first-child, th:first-child { `;
    if (o.first_col_bg_color) css += `background-color: ${o.first_col_bg_color}; `;
    if (o.first_col_text_color) css += `color: ${o.first_col_text_color}; `;
    if (o.first_col_font_weight) css += `font-weight: ${o.first_col_font_weight}; `;
    if (o.first_col_min_width > 0) css += `min-width: ${o.first_col_min_width}px; `;
    css += `}\n`;
  }

  // Last column
  if (o.last_col_text_align) {
    css += `td:last-child { text-align: ${o.last_col_text_align}; }\n`;
  }

  // Value colors (positive / negative)
  css += `.positive { color: ${o.positive_color}; font-weight: 600; }\n`;
  css += `.negative { color: ${o.negative_color}; font-weight: 600; }\n`;

  // Headings
  css += `h1, h2, h3 { color: ${o.heading_color}; margin: ${o.heading_margin_v}px 0; }\n`;
  css += `h1 { font-size: ${o.heading_font_size}px; }\n`;
  css += `h2 { font-size: ${Math.round(o.heading_font_size * 0.8)}px; }\n`;
  css += `h3 { font-size: ${Math.round(o.heading_font_size * 0.65)}px; }\n`;

  // Caption
  if (o.caption_color || o.caption_bg_color || o.caption_font_size !== DEFAULTS.caption_font_size) {
    css += `caption, .caption, h1:first-child { `;
    css += `color: ${o.caption_color}; font-size: ${o.caption_font_size}px; `;
    css += `text-align: ${o.caption_text_align}; padding: ${o.caption_padding}px; `;
    if (o.caption_bg_color) css += `background-color: ${o.caption_bg_color}; `;
    css += `}\n`;
  }

  // Paragraphs
  css += `p { line-height: ${o.body_line_height}; margin: 8px 0; }\n`;

  // Links
  css += `a { color: ${o.link_color}; text-decoration: ${o.link_decoration}; }\n`;

  // Add !important to all generated declarations so they override inline styles
  // from Python/pandas HTML output (inline styles beat stylesheet rules without !important)
  css = css.replace(/: ([^;{}]+);/g, ': $1 !important;');

  // Custom CSS last (highest priority, user-controlled — no forced !important)
  if (o.custom_css) {
    css += `\n/* Custom CSS */\n${o.custom_css}\n`;
  }

  return css;
}

// ── Inspector Mode ──

/** Element zones the inspector can detect */
export type HtmlInspectorZone =
  | 'th' | 'td' | 'table' | 'body'
  | 'heading' | 'link' | 'caption' | 'first-col'
  | 'tr' | 'value-color'
  | null;

/** Human-readable labels for each zone */
export const ZONE_LABELS: Record<Exclude<HtmlInspectorZone, null>, string> = {
  th: 'Intestazione',
  td: 'Cella',
  table: 'Tabella',
  body: 'Pagina',
  heading: 'Titolo',
  link: 'Link',
  caption: 'Didascalia',
  'first-col': 'Prima Colonna',
  tr: 'Riga',
  'value-color': 'Colore Valore',
};


/** Inspector message payload from the iframe */
export interface HtmlInspectorMessage {
  zone: Exclude<HtmlInspectorZone, null>;
  /** e.g. "span.positive", "td", "th", "div.detail-item" */
  elementInfo: string;
}

/**
 * JS snippet injected into the iframe for inspector mode.
 * Detects the exact clicked element, determines its zone,
 * highlights it, and posts zone + elementInfo to the parent.
 */
function generateInspectorScript(): string {
  return `
<script>
(function() {
  var currentHighlight = null;
  var hoverEl = null;

  function clearHighlight() {
    if (currentHighlight) {
      currentHighlight.style.outline = '';
      currentHighlight.style.outlineOffset = '';
      currentHighlight = null;
    }
  }

  function highlightElement(el) {
    clearHighlight();
    currentHighlight = el;
    el.style.outline = '2px solid #8b5cf6';
    el.style.outlineOffset = '-1px';
  }

  function elementInfo(el) {
    var tag = (el.tagName || '').toLowerCase();
    var cls = el.className ? String(el.className).trim().split(/\\s+/).slice(0,2).join('.') : '';
    return cls ? tag + '.' + cls : tag;
  }

  function hasClass(el, name) {
    return el.classList && el.classList.contains(name);
  }

  function detectZone(el) {
    // 1. Check the exact element first for special classes
    if (hasClass(el, 'positive') || hasClass(el, 'negative'))
      return { zone: 'value-color', el: el, info: elementInfo(el) };

    // 2. Walk up to find the nearest meaningful zone
    var clicked = el;
    var node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      var tag = node.tagName ? node.tagName.toLowerCase() : '';

      // value-color classes at any level
      if (hasClass(node, 'positive') || hasClass(node, 'negative'))
        return { zone: 'value-color', el: node, info: elementInfo(clicked) };

      if (tag === 'a')
        return { zone: 'link', el: node, info: elementInfo(clicked) };

      if (tag === 'h1' || tag === 'h2' || tag === 'h3')
        return { zone: 'heading', el: node, info: elementInfo(clicked) };

      if (tag === 'caption' || hasClass(node, 'caption'))
        return { zone: 'caption', el: node, info: elementInfo(clicked) };

      if (tag === 'th')
        return { zone: 'th', el: node, info: elementInfo(clicked) };

      if (tag === 'td') {
        var zone = node.cellIndex === 0 ? 'first-col' : 'td';
        // Highlight the exact clicked sub-element if it's not the td itself
        var target = (clicked !== node) ? clicked : node;
        return { zone: zone, el: target, info: elementInfo(clicked) };
      }

      if (tag === 'tr')
        return { zone: 'tr', el: node, info: elementInfo(clicked) };

      if (tag === 'table')
        return { zone: 'table', el: node, info: elementInfo(clicked) };

      node = node.parentElement;
    }
    return { zone: 'body', el: document.body, info: elementInfo(clicked) };
  }

  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    var result = detectZone(e.target);
    highlightElement(result.el);
    window.parent.postMessage({
      type: 'html-inspector-select',
      zone: result.zone,
      elementInfo: result.info
    }, '*');
  }, true);

  document.addEventListener('mouseover', function(e) {
    var el = e.target;
    if (el === hoverEl || el === currentHighlight) return;
    if (hoverEl && hoverEl !== currentHighlight) {
      hoverEl.style.outline = '';
      hoverEl.style.outlineOffset = '';
    }
    hoverEl = el;
    if (el !== currentHighlight) {
      el.style.outline = '1px dashed #c4b5fd';
      el.style.outlineOffset = '-1px';
    }
  }, true);

  document.addEventListener('mouseout', function(e) {
    var el = e.target;
    if (el !== currentHighlight) {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }
    if (el === hoverEl) hoverEl = null;
  }, true);

  document.body.style.cursor = 'crosshair';
})();
</script>`;
}

/**
 * Wrap raw HTML with a full document including generated CSS.
 * When inspectorMode is true, injects click-to-inspect script.
 * Returns a complete HTML string suitable for iframe srcDoc.
 */
export function applyHtmlStyleOverrides(
  html: string,
  overrides: HtmlStyleOverrides,
  inspectorMode = false,
): string {
  const css = generateHtmlStyleCss(overrides);
  const inspector = inspectorMode ? generateInspectorScript() : '';
  return `<html><head><style>${css}</style></head><body>${html}${inspector}</body></html>`;
}
