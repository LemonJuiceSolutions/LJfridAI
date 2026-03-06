// HTML Style Overrides - mirrors the pattern of plotly-utils.ts

/**
 * Inject a fetch polyfill into srcdoc HTML so that:
 * 1. Relative URLs (e.g. /api/...) are resolved to the app's absolute origin
 * 2. credentials: 'include' is added to every request
 * 3. connectorId AND internalToken are injected into POST bodies when missing
 * 4. Successful POST writes send a postMessage to the parent frame
 *
 * This is needed because srcdoc iframes have origin "null" which breaks fetch.
 * The internalToken is required for Mode 1 (raw SQL) on /api/update-commessa.
 */
export function injectIframeFetchPolyfill(html: string, opts?: { connectorId?: string; baseUrl?: string; internalToken?: string }): string {
  const cid = opts?.connectorId || '';
  // baseUrl must be provided at call site (from window.location.origin) since this may run server-side
  const base = opts?.baseUrl || '';
  // internalToken for /api/update-commessa Mode 1 (raw SQL queries)
  const token = opts?.internalToken || process.env.INTERNAL_QUERY_TOKEN || 'fridai-internal-query-2024';

  // Polyfill script: overrides fetch, injects saveToDb(), intercepts postMessage saves
  const polyfillScript = `<script>(function(){` +
    // --- Save originals & config ---
    `var F=window.fetch;var _origPM=window.parent.postMessage.bind(window.parent);` +
    `var B=${JSON.stringify(base)};var CID=${JSON.stringify(cid)};var TK=${JSON.stringify(token)};` +
    // --- 1. Fetch polyfill (resolves URLs, injects credentials, redirects wrong-URL POSTs) ---
    `window.fetch=function(u,o){` +
    // Resolve relative URLs
    `if(typeof u==='string'&&u.startsWith('/'))u=B+u;` +
    `if(!o)o={};o.credentials='include';` +
    // For POST requests with JSON body: detect wrong URLs and redirect to /api/update-commessa
    `if(o.method&&o.method.toUpperCase()==='POST'&&o.body){try{var b=JSON.parse(o.body);var changed=false;` +
    // Redirect: if URL is NOT /api/update-commessa and body has data fields, use saveToDb or redirect
    `var isCorrectUrl=(typeof u==='string'&&u.indexOf('/api/update-commessa')>=0);` +
    `if(!isCorrectUrl&&typeof b==='object'&&Object.keys(b).length>0){` +
    `console.warn('[polyfill] fetch POST to wrong URL intercepted:',u);` +
    // If body has 'query', just redirect URL. Otherwise use saveToDb with __DB_TABLE__
    `if(b.query){u=B+'/api/update-commessa';changed=true}` +
    `else if(window.__DB_TABLE__){console.warn('[polyfill] -> converting to saveToDb(',window.__DB_TABLE__,')');` +
    `return window.saveToDb(window.__DB_TABLE__,b,window.__DB_PK__||[])}` +
    `else{u=B+'/api/update-commessa';changed=true}}` +
    // Inject connectorId and internalToken
    `if(CID&&!b.connectorId){b.connectorId=CID;changed=true}if(TK&&!b.internalToken){b.internalToken=TK;changed=true}` +
    `if(changed)o.body=JSON.stringify(b)}catch(e){}}` +
    `return F.call(this,u,o).then(function(r){if(o.method&&o.method.toUpperCase()==='POST'){` +
    `r.clone().json().then(function(j){if(j.success){_origPM({type:'iframe-db-write-success'},'*')}}).catch(function(){})}return r})};` +
    // --- 2. saveToDb: universal DB save function (constructs UPDATE query, calls polyfilled fetch) ---
    // Usage: saveToDb('dbo.TableName', {col1:val1, col2:val2}, ['pkCol1']).then(r => ...)
    `window.saveToDb=function(tbl,data,pks){` +
    `if(!tbl||!data)return Promise.reject(new Error('Missing table or data'));` +
    `var S=[],W=[];pks=pks||[];` +
    `for(var k in data){if(!data.hasOwnProperty(k))continue;` +
    `var v=data[k]==null?'':String(data[k]).replace(/'/g,"''");` +
    `if(pks.indexOf(k)>=0)W.push(k+"='"+v+"'");else S.push(k+"='"+v+"'")}` +
    `if(S.length===0&&W.length>1){S=W.slice(1);W=[W[0]]}` +
    `if(W.length===0)return Promise.reject(new Error('No PK for WHERE clause'));` +
    `var q="UPDATE "+tbl+" SET "+S.join(", ")+" WHERE "+W.join(" AND ");` +
    `return fetch('/api/update-commessa',{method:'POST',headers:{'Content-Type':'application/json'},` +
    `body:JSON.stringify({query:q})}).then(function(r){return r.json()})};` +
    // --- 3. PostMessage interceptor: auto-converts save-type postMessage to saveToDb ---
    // When AI generates postMessage({type:'SAVE_...', data:...}), this interceptor
    // catches it and redirects to saveToDb using __DB_TABLE__ and __DB_PK__ metadata
    // (injected by post-processing in python-agent-flow.ts)
    `window.parent.postMessage=function(msg,orig){` +
    `if(msg&&typeof msg==='object'&&msg.type&&/save|update|write/i.test(msg.type)&&msg.type!=='iframe-db-write-success'){` +
    `console.warn('[polyfill] postMessage save intercepted -> auto-converting to saveToDb');` +
    `var tbl=window.__DB_TABLE__;var pk=window.__DB_PK__||[];` +
    `var d=msg.data||msg.payload||{};if(d.data&&typeof d.data==='object')d=d.data;` +
    // If we have table metadata and data, convert to saveToDb call
    `if(tbl&&typeof d==='object'&&Object.keys(d).length>0){` +
    `saveToDb(tbl,d,pk).then(function(r){` +
    `var el=document.getElementById('statusMessage');` +
    `if(r.success){if(el){el.textContent='Salvato! '+(r.rowsAffected||0)+' righe aggiornate';` +
    `el.className='status-message success';el.style.display='block'}}` +
    `else{if(el){el.textContent='Errore: '+(r.message||'');` +
    `el.className='status-message error';el.style.display='block'}}` +
    `}).catch(function(e){var el=document.getElementById('statusMessage');` +
    `if(el){el.textContent='Errore: '+e.message;el.className='status-message error';el.style.display='block'}});` +
    `return}` +
    // If data has a raw 'query' field, use it directly
    `if(d.query){fetch('/api/update-commessa',{method:'POST',headers:{'Content-Type':'application/json'},` +
    `body:JSON.stringify({query:d.query})}).then(function(r){return r.json()}).then(function(r){` +
    `var el=document.getElementById('statusMessage');` +
    `if(r.success&&el){el.textContent='Salvato!';el.className='status-message success';el.style.display='block'}` +
    `}).catch(function(){});return}` +
    // No table metadata - show error
    `var errDiv=document.getElementById('_pm_save_error');` +
    `if(!errDiv){errDiv=document.createElement('div');errDiv.id='_pm_save_error';` +
    `errDiv.style.cssText='position:fixed;top:0;left:0;right:0;padding:12px;background:#f8d7da;color:#721c24;text-align:center;z-index:99999;font-family:sans-serif;font-size:14px;border-bottom:2px solid #f5c6cb;';` +
    `document.body.appendChild(errDiv)}` +
    `errDiv.textContent='Errore: postMessage save senza __DB_TABLE__. Rigenera widget.';` +
    `errDiv.style.display='block';setTimeout(function(){errDiv.style.display='none'},8000);` +
    `return}` +
    `return _origPM(msg,orig)};` +
    `})();</script>`;

  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>${polyfillScript}`);
  } else if (html.includes('<html>')) {
    return html.replace('<html>', `<html><head>${polyfillScript}</head>`);
  }
  return `<head>${polyfillScript}</head>${html}`;
}

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

  // ── Table Margin ──
  table_margin_v?: number;             // px vertical margin around table

  // ── Headings (h1-h3) ──
  heading_color?: string;
  heading_font_size?: number;
  heading_font_weight?: string;
  heading_text_align?: 'left' | 'center' | 'right';
  heading_text_transform?: 'none' | 'uppercase' | 'capitalize' | 'lowercase';
  heading_letter_spacing?: number;
  heading_line_height?: number;
  heading_margin_top?: number;
  heading_margin_bottom?: number;

  // ── Caption / Title ──
  caption_color?: string;
  caption_font_size?: number;
  caption_font_weight?: string;
  caption_bg_color?: string;
  caption_text_align?: 'left' | 'center' | 'right';
  caption_text_transform?: 'none' | 'uppercase' | 'capitalize' | 'lowercase';
  caption_letter_spacing?: number;
  caption_padding?: number;
  caption_margin_bottom?: number;

  // ── Paragraphs ──
  p_margin_v?: number;
  p_font_size?: number;               // 0 = inherit from body

  // ── Links ──
  link_color?: string;
  link_decoration?: 'none' | 'underline';
  link_font_weight?: string;
  link_font_size?: number;             // 0 = inherit

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

  table_margin_v: 0,

  heading_color: '#1f2937',
  heading_font_size: 18,
  heading_font_weight: '700',
  heading_text_align: 'left' as const,
  heading_text_transform: 'none' as const,
  heading_letter_spacing: 0,
  heading_line_height: 1.3,
  heading_margin_top: 10,
  heading_margin_bottom: 10,

  caption_color: '#374151',
  caption_font_size: 14,
  caption_font_weight: '400',
  caption_bg_color: '',
  caption_text_align: 'left' as const,
  caption_text_transform: 'none' as const,
  caption_letter_spacing: 0,
  caption_padding: 8,
  caption_margin_bottom: 8,

  p_margin_v: 8,
  p_font_size: 0,

  link_color: '#2563eb',
  link_decoration: 'underline' as const,
  link_font_weight: '',
  link_font_size: 0,

  scrollbar_width: 'auto' as const,

  cell_text_overflow: 'visible' as const,
  cell_max_width: 0,
};

export { DEFAULTS as HTML_STYLE_DEFAULTS };

// ── Style Presets ──

export interface HtmlStylePreset {
  id: string;
  label: string;
  description: string;
  overrides: Partial<HtmlStyleOverrides>;
}

/** Preset salvato dall'utente (persistito in Company.htmlStylePresets) */
export interface SavedHtmlStylePreset {
  id: string;
  label: string;
  description: string;
  overrides: Partial<HtmlStyleOverrides>;
  createdAt: string; // ISO date
}

/**
 * Genera una descrizione leggibile di tutti i campi HtmlStyleOverrides
 * per il prompt AI usato dallo scraper CSS.
 */
export function getHtmlStyleFieldsDescription(): string {
  const fields: string[] = [
    // Page
    'page_bg_color (string, hex) - colore sfondo pagina',
    'page_padding (number, 0-40 px) - padding pagina',
    'container_max_width (number, 0=100%) - larghezza massima',
    'container_border_radius (number, 0-20 px) - bordo arrotondato contenitore',
    'container_shadow ("none"|"sm"|"md"|"lg") - ombra contenitore',
    // Header (th)
    'header_bg_color (string, hex) - sfondo intestazione tabella',
    'header_bg_gradient_end (string, hex, "" per nessun gradiente) - fine gradiente intestazione',
    'header_text_color (string, hex) - colore testo intestazione',
    'header_font_size (number, 7-24 px) - dimensione font intestazione',
    'header_font_weight (string, "400"|"500"|"600"|"700"|"800") - peso font intestazione',
    'header_text_transform ("none"|"uppercase"|"capitalize"|"lowercase") - trasformazione testo intestazione',
    'header_letter_spacing (number, 0-3 px) - spaziatura lettere intestazione',
    'header_text_align ("left"|"center"|"right") - allineamento intestazione',
    'header_padding_v (number, 1-24 px) - padding verticale intestazione',
    'header_padding_h (number, 2-30 px) - padding orizzontale intestazione',
    'header_border_bottom_width (number, 0-6 px) - bordo inferiore intestazione',
    'header_border_bottom_color (string, hex) - colore bordo inferiore',
    // Body (td)
    'body_bg_color (string, hex) - sfondo celle',
    'body_text_color (string, hex) - colore testo celle',
    'body_font_size (number, 8-20 px) - dimensione font celle',
    'body_font_weight (string, "400"|"500"|"600"|"700") - peso font celle',
    'body_line_height (number, 1-2.5) - altezza riga',
    'body_text_align ("left"|"center"|"right") - allineamento celle',
    // Typography
    'font_family (string, CSS font-family) - famiglia font',
    // Borders
    'border_color (string, hex) - colore bordi tabella',
    'border_style ("solid"|"dashed"|"dotted"|"none") - stile bordi',
    'border_width (number, 0-4 px) - spessore bordi',
    'table_border_radius (number, 0-16 px) - bordo arrotondato tabella',
    'row_border_color (string, hex, "" per default) - colore separatori righe',
    // Cell Spacing
    'cell_padding_v (number, 1-20 px) - padding verticale celle',
    'cell_padding_h (number, 2-30 px) - padding orizzontale celle',
    // Striping & Hover
    'stripe_enabled (boolean) - righe alternate colorate',
    'stripe_color (string, hex) - colore righe alternate',
    'hover_enabled (boolean) - evidenzia riga al passaggio mouse',
    'hover_color (string, hex) - colore hover riga',
    // Value colors
    'positive_color (string, hex) - colore valori positivi',
    'negative_color (string, hex) - colore valori negativi',
    // Table margin
    'table_margin_v (number, 0-40 px) - margine verticale tabella',
    // Headings
    'heading_color (string, hex) - colore titoli h1-h3',
    'heading_font_size (number, 12-36 px) - dimensione titoli',
    'heading_font_weight (string, "300"|"400"|"500"|"600"|"700") - peso titoli',
    'heading_text_align ("left"|"center"|"right") - allineamento titoli',
    'heading_text_transform ("none"|"uppercase"|"capitalize") - trasformazione titoli',
    'heading_letter_spacing (number, 0-3 px) - spaziatura lettere titoli',
    'heading_line_height (number, 1-2) - altezza riga titoli',
    'heading_margin_top (number, 0-40 px) - margine sopra titoli',
    'heading_margin_bottom (number, 0-40 px) - margine sotto titoli',
    // Caption
    'caption_color (string, hex) - colore didascalia',
    'caption_font_size (number, 8-20 px) - dimensione didascalia',
    'caption_font_weight (string) - peso didascalia',
    'caption_bg_color (string, hex, "" per nessuno) - sfondo didascalia',
    'caption_text_align ("left"|"center"|"right") - allineamento didascalia',
    'caption_text_transform ("none"|"uppercase"|"capitalize") - trasformazione didascalia',
    'caption_padding (number, 0-20 px) - padding didascalia',
    // Links
    'link_color (string, hex) - colore link',
    'link_decoration ("none"|"underline") - decorazione link',
    // Scrollbar
    'scrollbar_width ("auto"|"thin"|"none") - larghezza scrollbar',
  ];
  return fields.join('\n');
}

export const HTML_STYLE_PRESETS: HtmlStylePreset[] = [
  // ─── REPORT AZIENDALI ───
  {
    id: 'annual-report',
    label: 'Annual Report',
    description: 'Tipografia editoriale serif — stile bilancio annuale',
    overrides: {
      page_bg_color: '#ffffff', page_padding: 28, container_max_width: 860, container_border_radius: 0, container_shadow: 'none',
      header_bg_color: '#ffffff', header_text_color: '#1a1a1a',
      header_font_size: 9, header_font_weight: '700', header_text_transform: 'uppercase', header_letter_spacing: 2.5,
      header_padding_v: 10, header_padding_h: 12, header_border_bottom_width: 2, header_border_bottom_color: '#1a1a1a',
      body_bg_color: '#ffffff', body_text_color: '#333333', body_font_size: 11, body_line_height: 1.6,
      font_family: '"Georgia", "Palatino", serif',
      border_color: '#cccccc', border_style: 'solid', border_width: 0, table_border_radius: 0, row_border_color: '#e5e5e5',
      cell_padding_v: 8, cell_padding_h: 12,
      stripe_enabled: false, hover_enabled: false,
      positive_color: '#1a6b3c', negative_color: '#b91c1c',
      heading_color: '#1a1a1a', heading_font_size: 20, heading_font_weight: '400', heading_letter_spacing: 1, heading_text_transform: 'uppercase',
      heading_margin_top: 24, heading_margin_bottom: 8,
      caption_color: '#888888', caption_text_transform: 'uppercase', caption_letter_spacing: 2,
      link_color: '#333333', link_decoration: 'underline', scrollbar_width: 'none',
    },
  },
  {
    id: 'mckinsey',
    label: 'McKinsey',
    description: 'Blu scuro su bianco, rigore senza fronzoli — top consulting',
    overrides: {
      page_bg_color: '#ffffff', page_padding: 24, container_max_width: 900, container_border_radius: 0, container_shadow: 'none',
      header_bg_color: '#00263a', header_text_color: '#ffffff',
      header_font_size: 9, header_font_weight: '700', header_text_transform: 'uppercase', header_letter_spacing: 1.8,
      header_padding_v: 10, header_padding_h: 14, header_border_bottom_width: 0,
      body_bg_color: '#ffffff', body_text_color: '#2c2c2c', body_font_size: 11, body_line_height: 1.55,
      font_family: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      border_color: '#d9d9d9', border_style: 'solid', border_width: 0, table_border_radius: 0, row_border_color: '#e8e8e8',
      cell_padding_v: 9, cell_padding_h: 14,
      stripe_enabled: false, hover_enabled: false,
      positive_color: '#007a5e', negative_color: '#c41230',
      heading_color: '#00263a', heading_font_size: 18, heading_font_weight: '700', heading_letter_spacing: 0,
      heading_margin_top: 20, heading_margin_bottom: 8,
      caption_color: '#777777', caption_text_transform: 'uppercase', caption_letter_spacing: 1.5,
      link_color: '#00263a', link_decoration: 'none', scrollbar_width: 'none',
    },
  },
  {
    id: 'deloitte',
    label: 'Deloitte',
    description: 'Verde Deloitte e nero — corporate audit e advisory',
    overrides: {
      page_bg_color: '#ffffff', page_padding: 22, container_border_radius: 0, container_shadow: 'none',
      header_bg_color: '#86bc25', header_text_color: '#ffffff',
      header_font_size: 10, header_font_weight: '700', header_text_transform: 'uppercase', header_letter_spacing: 0.8,
      header_padding_v: 10, header_padding_h: 14, header_border_bottom_width: 0,
      body_bg_color: '#ffffff', body_text_color: '#2d2d2d', body_font_size: 11, body_line_height: 1.5,
      font_family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      border_color: '#e0e0e0', border_style: 'solid', border_width: 1, table_border_radius: 0, row_border_color: '#eeeeee',
      cell_padding_v: 8, cell_padding_h: 14,
      stripe_enabled: true, stripe_color: '#f7fae9', hover_enabled: true, hover_color: '#eef5d0',
      positive_color: '#86bc25', negative_color: '#da291c',
      heading_color: '#000000', heading_font_size: 18, heading_font_weight: '700',
      caption_color: '#666666', caption_text_transform: 'none',
      link_color: '#86bc25', link_decoration: 'none',
    },
  },
  {
    id: 'kpmg',
    label: 'KPMG',
    description: 'Blu royal intenso — revisione e consulenza istituzionale',
    overrides: {
      page_bg_color: '#ffffff', page_padding: 22, container_border_radius: 0, container_shadow: 'none',
      header_bg_color: '#00338d', header_text_color: '#ffffff',
      header_font_size: 10, header_font_weight: '600', header_text_transform: 'uppercase', header_letter_spacing: 1,
      header_padding_v: 10, header_padding_h: 14, header_border_bottom_width: 3, header_border_bottom_color: '#0091da',
      body_bg_color: '#ffffff', body_text_color: '#1e1e1e', body_font_size: 11, body_line_height: 1.5,
      font_family: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      border_color: '#dde3ef', border_style: 'solid', border_width: 1, table_border_radius: 0, row_border_color: '#e8ecf4',
      cell_padding_v: 9, cell_padding_h: 14,
      stripe_enabled: true, stripe_color: '#f4f6fb', hover_enabled: true, hover_color: '#e0e8f8',
      positive_color: '#009a44', negative_color: '#da291c',
      heading_color: '#00338d', heading_font_size: 18, heading_font_weight: '700',
      caption_color: '#6e7a8a', caption_text_transform: 'uppercase', caption_letter_spacing: 1,
      link_color: '#00338d', link_decoration: 'none',
    },
  },
  {
    id: 'pwc',
    label: 'PwC',
    description: 'Arancione e carbone — stile PricewaterhouseCoopers',
    overrides: {
      page_bg_color: '#ffffff', page_padding: 22, container_border_radius: 0, container_shadow: 'none',
      header_bg_color: '#2d2d2d', header_text_color: '#ffffff',
      header_font_size: 10, header_font_weight: '600', header_text_transform: 'uppercase', header_letter_spacing: 0.8,
      header_padding_v: 10, header_padding_h: 14, header_border_bottom_width: 3, header_border_bottom_color: '#e0301e',
      body_bg_color: '#ffffff', body_text_color: '#2d2d2d', body_font_size: 11, body_line_height: 1.5,
      font_family: '"Georgia", "Times New Roman", serif',
      border_color: '#e0e0e0', border_style: 'solid', border_width: 1, table_border_radius: 0, row_border_color: '#eeeeee',
      cell_padding_v: 8, cell_padding_h: 14,
      stripe_enabled: true, stripe_color: '#fafafa', hover_enabled: true, hover_color: '#fff4f0',
      positive_color: '#2d8c3c', negative_color: '#e0301e',
      heading_color: '#2d2d2d', heading_font_size: 19, heading_font_weight: '600',
      caption_color: '#888888', caption_text_transform: 'uppercase', caption_letter_spacing: 1,
      link_color: '#d04a02', link_decoration: 'none',
    },
  },
  // ─── CORPORATE MODERNI ───
  {
    id: 'swiss-clean',
    label: 'Swiss Clean',
    description: 'Design svizzero — Helvetica, griglia perfetta, zero rumore',
    overrides: {
      page_bg_color: '#ffffff', page_padding: 28, container_max_width: 920, container_border_radius: 0, container_shadow: 'none',
      header_bg_color: '#f5f5f5', header_text_color: '#111111',
      header_font_size: 9, header_font_weight: '600', header_text_transform: 'uppercase', header_letter_spacing: 2,
      header_padding_v: 12, header_padding_h: 16, header_border_bottom_width: 2, header_border_bottom_color: '#111111',
      body_bg_color: '#ffffff', body_text_color: '#333333', body_font_size: 12, body_line_height: 1.65,
      font_family: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      border_color: '#e0e0e0', border_width: 0, table_border_radius: 0, row_border_color: '#eeeeee',
      cell_padding_v: 10, cell_padding_h: 16,
      stripe_enabled: false, hover_enabled: true, hover_color: '#f8f8f8',
      positive_color: '#0a8754', negative_color: '#d32f2f',
      heading_color: '#111111', heading_font_size: 22, heading_font_weight: '300', heading_letter_spacing: 1.5,
      heading_margin_top: 20, heading_margin_bottom: 10,
      caption_color: '#999999', caption_text_transform: 'uppercase', caption_letter_spacing: 2.5,
      link_color: '#111111', link_decoration: 'underline', scrollbar_width: 'none',
    },
  },
  {
    id: 'flat-modern',
    label: 'Flat Modern',
    description: 'Sans-serif pulito, colori piatti — SaaS dashboard',
    overrides: {
      page_bg_color: '#f8f9fa', page_padding: 16, container_border_radius: 8, container_shadow: 'sm',
      header_bg_color: '#1f2937', header_text_color: '#f9fafb',
      header_font_size: 10, header_font_weight: '600', header_text_transform: 'uppercase', header_letter_spacing: 0.5,
      header_padding_v: 10, header_padding_h: 14, header_border_bottom_width: 0,
      body_bg_color: '#ffffff', body_text_color: '#374151', body_font_size: 11, body_line_height: 1.5,
      font_family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      border_color: '#e5e7eb', border_style: 'solid', border_width: 1, table_border_radius: 8, row_border_color: '#f3f4f6',
      cell_padding_v: 8, cell_padding_h: 14,
      stripe_enabled: true, stripe_color: '#f9fafb', hover_enabled: true, hover_color: '#f3f4f6',
      positive_color: '#059669', negative_color: '#dc2626',
      heading_color: '#111827', heading_font_size: 18, heading_font_weight: '600',
      caption_color: '#9ca3af', caption_text_transform: 'none',
      link_color: '#2563eb', link_decoration: 'none', scrollbar_width: 'thin',
    },
  },
  {
    id: 'notion-style',
    label: 'Notion Style',
    description: 'Bianco e nero leggero — stile Notion, ampio respiro',
    overrides: {
      page_bg_color: '#ffffff', page_padding: 24, container_max_width: 900, container_border_radius: 0, container_shadow: 'none',
      header_bg_color: '#ffffff', header_text_color: '#787774',
      header_font_size: 10, header_font_weight: '500', header_text_transform: 'none', header_letter_spacing: 0,
      header_padding_v: 8, header_padding_h: 10, header_border_bottom_width: 1, header_border_bottom_color: '#e3e3e0',
      body_bg_color: '#ffffff', body_text_color: '#37352f', body_font_size: 12, body_line_height: 1.6,
      font_family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      border_color: '#e3e3e0', border_width: 0, table_border_radius: 0, row_border_color: '#f1f1ef',
      cell_padding_v: 7, cell_padding_h: 10,
      stripe_enabled: false, hover_enabled: true, hover_color: '#f7f7f5',
      positive_color: '#448361', negative_color: '#d44c47',
      heading_color: '#37352f', heading_font_size: 20, heading_font_weight: '700', heading_letter_spacing: 0,
      heading_margin_top: 16, heading_margin_bottom: 6,
      caption_color: '#9b9a97', caption_text_transform: 'none',
      link_color: '#37352f', link_decoration: 'underline', scrollbar_width: 'none',
    },
  },
  {
    id: 'stripe-docs',
    label: 'Stripe Docs',
    description: 'Viola sottile, tipografia raffinata — stile documentazione Stripe',
    overrides: {
      page_bg_color: '#f6f9fc', page_padding: 20, container_border_radius: 6, container_shadow: 'sm',
      header_bg_color: '#32325d', header_text_color: '#ffffff',
      header_font_size: 10, header_font_weight: '600', header_text_transform: 'uppercase', header_letter_spacing: 0.8,
      header_padding_v: 10, header_padding_h: 14, header_border_bottom_width: 0,
      body_bg_color: '#ffffff', body_text_color: '#525f7f', body_font_size: 11, body_line_height: 1.6,
      font_family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      border_color: '#e6ebf1', border_style: 'solid', border_width: 1, table_border_radius: 6, row_border_color: '#f0f3f7',
      cell_padding_v: 9, cell_padding_h: 14,
      stripe_enabled: true, stripe_color: '#f6f9fc', hover_enabled: true, hover_color: '#e6edff',
      positive_color: '#3ecf8e', negative_color: '#e56b6f',
      heading_color: '#32325d', heading_font_size: 18, heading_font_weight: '600',
      caption_color: '#8898aa', caption_text_transform: 'none',
      link_color: '#6772e5', link_decoration: 'none',
    },
  },
  // ─── FINANZA & DATI ───
  {
    id: 'bloomberg',
    label: 'Bloomberg',
    description: 'Terminale nero con dati arancio — stile Bloomberg',
    overrides: {
      page_bg_color: '#000000', page_padding: 12, container_border_radius: 0, container_shadow: 'none',
      header_bg_color: '#1a1a1a', header_text_color: '#ff8c00',
      header_font_size: 10, header_font_weight: '700', header_text_transform: 'uppercase', header_letter_spacing: 1,
      header_padding_v: 6, header_padding_h: 10, header_border_bottom_width: 1, header_border_bottom_color: '#333333',
      body_bg_color: '#0d0d0d', body_text_color: '#cccccc', body_font_size: 11, body_line_height: 1.3,
      font_family: '"Consolas", "Monaco", "Courier New", monospace',
      border_color: '#2a2a2a', border_style: 'solid', border_width: 1, table_border_radius: 0, row_border_color: '#1a1a1a',
      col_border_color: '#1a1a1a',
      cell_padding_v: 5, cell_padding_h: 10,
      stripe_enabled: true, stripe_color: '#111111', hover_enabled: true, hover_color: '#1a1a2e',
      positive_color: '#00cc66', negative_color: '#ff3333',
      heading_color: '#ff8c00', heading_font_size: 16, heading_font_weight: '700', heading_letter_spacing: 1,
      caption_color: '#666666', caption_text_transform: 'uppercase', caption_letter_spacing: 1.5,
      link_color: '#ff8c00', link_decoration: 'none', scrollbar_width: 'thin',
    },
  },
  {
    id: 'financial-times',
    label: 'Financial Times',
    description: 'Salmone caldo e nero — stile giornalismo finanziario',
    overrides: {
      page_bg_color: '#fff1e5', page_padding: 22, container_max_width: 940, container_border_radius: 0, container_shadow: 'none',
      header_bg_color: '#1a1a1a', header_text_color: '#fff1e5',
      header_font_size: 10, header_font_weight: '700', header_text_transform: 'uppercase', header_letter_spacing: 0.5,
      header_padding_v: 8, header_padding_h: 12, header_border_bottom_width: 0,
      body_bg_color: '#fff8f0', body_text_color: '#33302e', body_font_size: 12, body_line_height: 1.5,
      font_family: '"Georgia", "Times New Roman", serif',
      border_color: '#e0cdb8', border_style: 'solid', border_width: 1, table_border_radius: 0, row_border_color: '#ecdcc8',
      cell_padding_v: 7, cell_padding_h: 12,
      stripe_enabled: true, stripe_color: '#fff1e5', hover_enabled: true, hover_color: '#ffe8d4',
      positive_color: '#006d4e', negative_color: '#cc0000',
      heading_color: '#1a1a1a', heading_font_size: 22, heading_font_weight: '700',
      caption_color: '#7f7067', caption_text_transform: 'uppercase', caption_letter_spacing: 1,
      link_color: '#1a1a1a', link_decoration: 'underline',
    },
  },
  {
    id: 'economist',
    label: 'The Economist',
    description: 'Rosso e bianco, serif editoriale — stile settimanale economico',
    overrides: {
      page_bg_color: '#ffffff', page_padding: 24, container_max_width: 880, container_border_radius: 0, container_shadow: 'none',
      header_bg_color: '#e3120b', header_text_color: '#ffffff',
      header_font_size: 9, header_font_weight: '700', header_text_transform: 'uppercase', header_letter_spacing: 1.5,
      header_padding_v: 9, header_padding_h: 12, header_border_bottom_width: 0,
      body_bg_color: '#ffffff', body_text_color: '#1d1d1b', body_font_size: 11, body_line_height: 1.55,
      font_family: '"Georgia", "Times New Roman", serif',
      border_color: '#d9d9d9', border_style: 'solid', border_width: 1, table_border_radius: 0, row_border_color: '#e8e8e8',
      cell_padding_v: 8, cell_padding_h: 12,
      stripe_enabled: false, hover_enabled: true, hover_color: '#fff5f5',
      positive_color: '#0a6847', negative_color: '#e3120b',
      heading_color: '#e3120b', heading_font_size: 22, heading_font_weight: '700', heading_letter_spacing: 0,
      heading_margin_top: 20, heading_margin_bottom: 8,
      caption_color: '#666666', caption_text_transform: 'uppercase', caption_letter_spacing: 1,
      link_color: '#e3120b', link_decoration: 'none', scrollbar_width: 'none',
    },
  },
  {
    id: 'excel-classic',
    label: 'Excel Classic',
    description: 'Griglia visibile, sfondo celle bianco — stile foglio di calcolo',
    overrides: {
      page_bg_color: '#ffffff', page_padding: 10, container_border_radius: 0, container_shadow: 'none',
      header_bg_color: '#4472c4', header_text_color: '#ffffff',
      header_font_size: 11, header_font_weight: '700', header_text_transform: 'none', header_letter_spacing: 0,
      header_padding_v: 6, header_padding_h: 8, header_border_bottom_width: 1, header_border_bottom_color: '#2e5a9e',
      body_bg_color: '#ffffff', body_text_color: '#000000', body_font_size: 11, body_line_height: 1.3,
      font_family: '"Calibri", "Segoe UI", Tahoma, sans-serif',
      border_color: '#b4c6e7', border_style: 'solid', border_width: 1, table_border_radius: 0,
      row_border_color: '#b4c6e7', col_border_color: '#b4c6e7',
      cell_padding_v: 4, cell_padding_h: 6,
      stripe_enabled: true, stripe_color: '#d6e4f0', hover_enabled: true, hover_color: '#bdd7ee',
      positive_color: '#006100', negative_color: '#cc0000',
      heading_color: '#1f3864', heading_font_size: 16, heading_font_weight: '700',
      link_color: '#0563c1', link_decoration: 'underline',
    },
  },
  // ─── ELEGANTI / LUSSO ───
  {
    id: 'black-tie',
    label: 'Black Tie',
    description: 'Nero assoluto e oro — gala, lusso, eventi esclusivi',
    overrides: {
      page_bg_color: '#0a0a0a', page_padding: 24, container_border_radius: 0, container_shadow: 'lg',
      header_bg_color: '#0a0a0a', header_text_color: '#c9a96e',
      header_font_size: 9, header_font_weight: '600', header_text_transform: 'uppercase', header_letter_spacing: 3,
      header_padding_v: 12, header_padding_h: 16, header_border_bottom_width: 1, header_border_bottom_color: '#c9a96e',
      body_bg_color: '#111111', body_text_color: '#d4d4d4', body_font_size: 11, body_line_height: 1.6,
      font_family: '"Georgia", "Palatino Linotype", serif',
      border_color: '#2a2a2a', border_style: 'solid', border_width: 0, table_border_radius: 0, row_border_color: '#1f1f1f',
      cell_padding_v: 10, cell_padding_h: 16,
      stripe_enabled: false, hover_enabled: true, hover_color: '#1a1a1a',
      positive_color: '#c9a96e', negative_color: '#e74c3c',
      heading_color: '#c9a96e', heading_font_size: 22, heading_font_weight: '400', heading_letter_spacing: 3, heading_text_transform: 'uppercase',
      heading_margin_top: 24, heading_margin_bottom: 10,
      caption_color: '#666666', caption_text_transform: 'uppercase', caption_letter_spacing: 2,
      link_color: '#c9a96e', link_decoration: 'none', scrollbar_width: 'none',
    },
  },
  {
    id: 'marble-rose',
    label: 'Marble Rose',
    description: 'Bianco marmo e rosa antico — raffinato e femminile',
    overrides: {
      page_bg_color: '#faf8f6', page_padding: 28, container_max_width: 880, container_border_radius: 0, container_shadow: 'sm',
      header_bg_color: '#faf8f6', header_text_color: '#8b6f6f',
      header_font_size: 9, header_font_weight: '600', header_text_transform: 'uppercase', header_letter_spacing: 2.5,
      header_padding_v: 11, header_padding_h: 16, header_border_bottom_width: 1, header_border_bottom_color: '#c4a6a6',
      body_bg_color: '#ffffff', body_text_color: '#4a3f3f', body_font_size: 11, body_line_height: 1.65,
      font_family: '"Garamond", "Georgia", "Times New Roman", serif',
      border_color: '#e8ddd6', border_width: 0, table_border_radius: 0, row_border_color: '#f0e8e3',
      cell_padding_v: 10, cell_padding_h: 16,
      stripe_enabled: true, stripe_color: '#fdf9f7', hover_enabled: true, hover_color: '#f8f0ed',
      positive_color: '#6b8e6b', negative_color: '#b05050',
      heading_color: '#6b4c4c', heading_font_size: 20, heading_font_weight: '400', heading_letter_spacing: 1.5,
      heading_margin_top: 24, heading_margin_bottom: 8,
      caption_color: '#b0a0a0', caption_text_transform: 'uppercase', caption_letter_spacing: 2,
      link_color: '#8b6f6f', link_decoration: 'none', scrollbar_width: 'none',
    },
  },
  {
    id: 'charcoal-copper',
    label: 'Charcoal & Copper',
    description: 'Carbone scuro e rame — industriale di lusso',
    overrides: {
      page_bg_color: '#1a1a1a', page_padding: 22, container_border_radius: 4, container_shadow: 'lg',
      header_bg_color: '#252525', header_text_color: '#d4956a',
      header_font_size: 10, header_font_weight: '600', header_text_transform: 'uppercase', header_letter_spacing: 1.5,
      header_padding_v: 10, header_padding_h: 14, header_border_bottom_width: 2, header_border_bottom_color: '#d4956a',
      body_bg_color: '#1f1f1f', body_text_color: '#c8c8c8', body_font_size: 11, body_line_height: 1.5,
      font_family: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      border_color: '#333333', border_style: 'solid', border_width: 1, table_border_radius: 4, row_border_color: '#2a2a2a',
      cell_padding_v: 9, cell_padding_h: 14,
      stripe_enabled: true, stripe_color: '#222222', hover_enabled: true, hover_color: '#2d2d2d',
      positive_color: '#5cb85c', negative_color: '#e74c3c',
      heading_color: '#d4956a', heading_font_size: 20, heading_font_weight: '500', heading_letter_spacing: 1,
      caption_color: '#777777', caption_text_transform: 'uppercase', caption_letter_spacing: 1.5,
      link_color: '#d4956a', link_decoration: 'none', scrollbar_width: 'thin',
    },
  },
  // ─── DARK PROFESSIONALI ───
  {
    id: 'midnight-navy',
    label: 'Midnight Navy',
    description: 'Navy profondo con accenti argento — report serale elegante',
    overrides: {
      page_bg_color: '#0b1426', page_padding: 20, container_border_radius: 6, container_shadow: 'lg',
      header_bg_color: '#0f1a30', header_text_color: '#94a3b8',
      header_font_size: 10, header_font_weight: '500', header_text_transform: 'uppercase', header_letter_spacing: 1.2,
      header_padding_v: 10, header_padding_h: 14, header_border_bottom_width: 1, header_border_bottom_color: '#1e3a5f',
      body_bg_color: '#0e1726', body_text_color: '#cbd5e1', body_font_size: 11, body_line_height: 1.5,
      font_family: '"Inter", -apple-system, sans-serif',
      border_color: '#1e293b', border_style: 'solid', border_width: 1, table_border_radius: 6, row_border_color: '#152033',
      cell_padding_v: 9, cell_padding_h: 14,
      stripe_enabled: true, stripe_color: '#0c1220', hover_enabled: true, hover_color: '#162240',
      positive_color: '#34d399', negative_color: '#f87171',
      heading_color: '#e2e8f0', heading_font_size: 20, heading_font_weight: '300', heading_letter_spacing: 0.5,
      caption_color: '#64748b',
      link_color: '#93c5fd', link_decoration: 'none', scrollbar_width: 'thin',
    },
  },
  {
    id: 'github-dark',
    label: 'GitHub Dark',
    description: 'Grigio scuro con bordi sottili — stile GitHub dark mode',
    overrides: {
      page_bg_color: '#0d1117', page_padding: 16, container_border_radius: 6, container_shadow: 'none',
      header_bg_color: '#161b22', header_text_color: '#c9d1d9',
      header_font_size: 10, header_font_weight: '600', header_text_transform: 'none', header_letter_spacing: 0,
      header_padding_v: 8, header_padding_h: 12, header_border_bottom_width: 1, header_border_bottom_color: '#30363d',
      body_bg_color: '#0d1117', body_text_color: '#c9d1d9', body_font_size: 11, body_line_height: 1.5,
      font_family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      border_color: '#30363d', border_style: 'solid', border_width: 1, table_border_radius: 6, row_border_color: '#21262d',
      cell_padding_v: 7, cell_padding_h: 12,
      stripe_enabled: true, stripe_color: '#161b22', hover_enabled: true, hover_color: '#1c2128',
      positive_color: '#3fb950', negative_color: '#f85149',
      heading_color: '#c9d1d9', heading_font_size: 18, heading_font_weight: '600',
      caption_color: '#8b949e',
      link_color: '#58a6ff', link_decoration: 'none', scrollbar_width: 'thin',
    },
  },
  // ─── MINIMAL / TIPOGRAFICI ───
  {
    id: 'ink-paper',
    label: 'Ink & Paper',
    description: 'Nero su bianco puro, serif elegante — stampa tipografica',
    overrides: {
      page_bg_color: '#ffffff', page_padding: 32, container_max_width: 820, container_border_radius: 0, container_shadow: 'none',
      header_bg_color: '#ffffff', header_text_color: '#000000',
      header_font_size: 8, header_font_weight: '700', header_text_transform: 'uppercase', header_letter_spacing: 3,
      header_padding_v: 10, header_padding_h: 12, header_border_bottom_width: 1, header_border_bottom_color: '#000000',
      body_bg_color: '#ffffff', body_text_color: '#1a1a1a', body_font_size: 12, body_line_height: 1.7,
      font_family: '"Palatino Linotype", "Book Antiqua", Palatino, "Georgia", serif',
      border_color: '#cccccc', border_width: 0, table_border_radius: 0, row_border_color: '#e0e0e0',
      cell_padding_v: 9, cell_padding_h: 14,
      stripe_enabled: false, hover_enabled: false,
      positive_color: '#1a5c1a', negative_color: '#8b0000',
      heading_color: '#000000', heading_font_size: 24, heading_font_weight: '400', heading_letter_spacing: 2, heading_text_transform: 'uppercase',
      heading_margin_top: 28, heading_margin_bottom: 10,
      caption_color: '#999999', caption_text_transform: 'uppercase', caption_letter_spacing: 3,
      link_color: '#000000', link_decoration: 'underline', scrollbar_width: 'none',
    },
  },
  {
    id: 'bauhaus',
    label: 'Bauhaus',
    description: 'Linee nette, sans-serif geometrico — stile Bauhaus modernista',
    overrides: {
      page_bg_color: '#f5f0e8', page_padding: 24, container_max_width: 900, container_border_radius: 0, container_shadow: 'none',
      header_bg_color: '#1a1a1a', header_text_color: '#f5f0e8',
      header_font_size: 10, header_font_weight: '700', header_text_transform: 'uppercase', header_letter_spacing: 2,
      header_padding_v: 10, header_padding_h: 14, header_border_bottom_width: 4, header_border_bottom_color: '#e63946',
      body_bg_color: '#faf6ee', body_text_color: '#1a1a1a', body_font_size: 12, body_line_height: 1.5,
      font_family: '"Futura", "Century Gothic", "Trebuchet MS", sans-serif',
      border_color: '#d4cfc4', border_style: 'solid', border_width: 1, table_border_radius: 0, row_border_color: '#e0dcd2',
      cell_padding_v: 9, cell_padding_h: 14,
      stripe_enabled: false, hover_enabled: true, hover_color: '#ede8dc',
      positive_color: '#2a7f62', negative_color: '#e63946',
      heading_color: '#e63946', heading_font_size: 22, heading_font_weight: '700', heading_letter_spacing: 1,
      heading_margin_top: 20, heading_margin_bottom: 8,
      caption_color: '#8a8477', caption_text_transform: 'uppercase', caption_letter_spacing: 2,
      link_color: '#1a1a1a', link_decoration: 'underline', scrollbar_width: 'none',
    },
  },
];

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
  if (o.table_margin_v > 0) css += `margin-top: ${o.table_margin_v}px; margin-bottom: ${o.table_margin_v}px; `;
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
  css += `h1, h2, h3 { color: ${o.heading_color}; font-weight: ${o.heading_font_weight}; `;
  css += `margin-top: ${o.heading_margin_top}px; margin-bottom: ${o.heading_margin_bottom}px; `;
  css += `text-align: ${o.heading_text_align}; line-height: ${o.heading_line_height}; `;
  if (o.heading_text_transform !== 'none') css += `text-transform: ${o.heading_text_transform}; `;
  if (o.heading_letter_spacing > 0) css += `letter-spacing: ${o.heading_letter_spacing}px; `;
  css += `}\n`;
  css += `h1 { font-size: ${o.heading_font_size}px; }\n`;
  css += `h2 { font-size: ${Math.round(o.heading_font_size * 0.8)}px; }\n`;
  css += `h3 { font-size: ${Math.round(o.heading_font_size * 0.65)}px; }\n`;

  // Caption
  css += `caption, .caption { `;
  css += `color: ${o.caption_color}; font-size: ${o.caption_font_size}px; `;
  css += `font-weight: ${o.caption_font_weight}; `;
  css += `text-align: ${o.caption_text_align}; padding: ${o.caption_padding}px; `;
  if (o.caption_text_transform !== 'none') css += `text-transform: ${o.caption_text_transform}; `;
  if (o.caption_letter_spacing > 0) css += `letter-spacing: ${o.caption_letter_spacing}px; `;
  if (o.caption_bg_color) css += `background-color: ${o.caption_bg_color}; `;
  if (o.caption_margin_bottom > 0) css += `margin-bottom: ${o.caption_margin_bottom}px; `;
  css += `}\n`;

  // Paragraphs
  css += `p { line-height: ${o.body_line_height}; margin: ${o.p_margin_v}px 0; `;
  if (o.p_font_size > 0) css += `font-size: ${o.p_font_size}px; `;
  css += `}\n`;

  // Links
  css += `a { color: ${o.link_color}; text-decoration: ${o.link_decoration}; `;
  if (o.link_font_weight) css += `font-weight: ${o.link_font_weight}; `;
  if (o.link_font_size > 0) css += `font-size: ${o.link_font_size}px; `;
  css += `}\n`;

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

  // Live CSS update listener — parent sends new CSS via postMessage
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'html-style-update') {
      var s = document.getElementById('__dynamic-css');
      if (s) s.textContent = e.data.css;
    }
  });
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
  return `<html><head><style id="__dynamic-css">${css}</style></head><body>${html}${inspector}</body></html>`;
}
