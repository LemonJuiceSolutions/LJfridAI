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
  if (!process.env.INTERNAL_QUERY_TOKEN) {
    throw new Error('Missing required env var: INTERNAL_QUERY_TOKEN');
  }
  const token = opts?.internalToken || process.env.INTERNAL_QUERY_TOKEN;

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
    `var isCorrectUrl=(typeof u==='string'&&(u.indexOf('/api/update-commessa')>=0||u.indexOf('/api/external-agent/')>=0));` +
    `if(!isCorrectUrl&&typeof b==='object'&&Object.keys(b).length>0){` +
    `console.warn('[polyfill] fetch POST to wrong URL intercepted:',u);` +
    // If body has 'query', just redirect URL. Otherwise use saveToDb with __DB_TABLE__
    `if(b.query){u=B+'/api/update-commessa';changed=true}` +
    `else if(window.__DB_TABLE__){console.warn('[polyfill] -> converting to saveToDb(',window.__DB_TABLE__,')');` +
    `return window.saveToDb(window.__DB_TABLE__,b,window.__DB_PK__||[])}` +
    // Fallback: no query, no __DB_TABLE__ — return fake error Response so .then() sees {success:false}
    // This prevents .catch(() => resolve({success:true})) from hiding the real error
    `else{console.error('[polyfill] fetch POST to wrong URL, no __DB_TABLE__ set, cannot save');` +
    `var errMsg='Salvataggio fallito: window.__DB_TABLE__ non impostato. Rigenera il widget.';` +
    `var errEl=document.getElementById('statusMessage');` +
    `if(errEl){errEl.textContent=errMsg;errEl.className='status-message error';errEl.style.display='block'}` +
    `return Promise.resolve(new Response(JSON.stringify({success:false,message:errMsg}),{status:200,headers:{'Content-Type':'application/json'}}))}}` +
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
    // --- 2b. insertToDb: universal DB insert function (constructs INSERT query, calls polyfilled fetch) ---
    // Usage: insertToDb('dbo.TableName', {col1:val1, col2:val2}).then(r => ...)
    `window.insertToDb=function(tbl,data){` +
    `if(!tbl||!data)return Promise.reject(new Error('Missing table or data'));` +
    `var C=[],V=[];` +
    `for(var k in data){if(!data.hasOwnProperty(k))continue;` +
    `if(k.charAt(0)==='_')continue;` + // skip internal fields like _isNew
    `C.push(k);` +
    `var v=data[k]==null?'NULL':"'"+String(data[k]).replace(/'/g,"''")+"'";` +
    `V.push(v)}` +
    `if(C.length===0)return Promise.reject(new Error('No columns to insert'));` +
    `var q="INSERT INTO "+tbl+" ("+C.join(", ")+") VALUES ("+V.join(", ")+")";` +
    `return fetch('/api/update-commessa',{method:'POST',headers:{'Content-Type':'application/json'},` +
    `body:JSON.stringify({query:q})}).then(function(r){return r.json()})};` +
    // --- 2c. deleteFromDb: universal DB delete function (constructs DELETE query, calls polyfilled fetch) ---
    // Usage: deleteFromDb('dbo.TableName', {pkCol1:val1, pkCol2:val2}, ['pkCol1','pkCol2']).then(r => ...)
    `window.deleteFromDb=function(tbl,data,pks){` +
    `if(!tbl||!data||!pks||pks.length===0)return Promise.reject(new Error('Missing table, data or PKs'));` +
    `var W=[];` +
    `for(var i=0;i<pks.length;i++){var k=pks[i];` +
    `if(!data.hasOwnProperty(k))return Promise.reject(new Error('PK field missing: '+k));` +
    `var v=data[k]==null?'':String(data[k]).replace(/'/g,"''");` +
    `W.push(k+"='"+v+"'")}` +
    `var q="DELETE FROM "+tbl+" WHERE "+W.join(" AND ");` +
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
    // --- 4. triggerPipeline: sends a postMessage to the parent to run an external agent ---
    `window.triggerPipeline=function(data){window.parent.postMessage({type:'triggerWhatIf',data:data},'*')};` +
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
    id: 'navy-consulting',
    label: 'Navy Consulting',
    description: 'Blu scuro su bianco, rigore senza fronzoli',
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
    id: 'green-consulting',
    label: 'Green Consulting',
    description: 'Verde brillante e nero — corporate audit e advisory',
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
    id: 'royal-advisory',
    label: 'Royal Advisory',
    description: 'Blu royal intenso — stile istituzionale',
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
    id: 'ember-serif',
    label: 'Ember Serif',
    description: 'Arancione e carbone — serif caldo e autorevole',
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
    id: 'soft-minimal',
    label: 'Soft Minimal',
    description: 'Bianco e nero leggero — ampio respiro, pulito',
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
    id: 'indigo-docs',
    label: 'Indigo Docs',
    description: 'Viola sottile, tipografia raffinata — documentazione moderna',
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
    id: 'terminal-pro',
    label: 'Terminal Pro',
    description: 'Terminale nero con dati arancio — stile trading',
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
    id: 'salmon-press',
    label: 'Salmon Press',
    description: 'Salmone caldo e nero — giornalismo finanziario',
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
    id: 'crimson-editorial',
    label: 'Crimson Editorial',
    description: 'Rosso e bianco, serif editoriale — stile settimanale',
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
    id: 'spreadsheet-classic',
    label: 'Spreadsheet Classic',
    description: 'Griglia visibile, sfondo celle bianco — foglio di calcolo',
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
    id: 'code-dark',
    label: 'Code Dark',
    description: 'Grigio scuro con bordi sottili — dark mode per sviluppatori',
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
  // ─── ADMIN DASHBOARD ───
  {
    id: 'nobleui-admin',
    label: 'NobleUI Admin',
    description: 'Dashboard admin moderno — Roboto, viola-blu primary, ombre leggere',
    overrides: {
      page_bg_color: '#f9fafb', page_padding: 20, container_border_radius: 4, container_shadow: 'sm',
      header_bg_color: '#f5f5f5', header_text_color: '#7987a1',
      header_font_size: 9, header_font_weight: '700', header_text_transform: 'uppercase', header_letter_spacing: 0.8,
      header_padding_v: 10, header_padding_h: 14, header_border_bottom_width: 1, header_border_bottom_color: '#dee2e6',
      body_bg_color: '#ffffff', body_text_color: '#060c17', body_font_size: 12, body_line_height: 1.5,
      font_family: '"Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      border_color: '#dee2e6', border_style: 'solid', border_width: 1, table_border_radius: 4, row_border_color: '#e9ecef',
      cell_padding_v: 10, cell_padding_h: 14,
      stripe_enabled: true, stripe_color: '#f8f9fa', hover_enabled: true, hover_color: '#f3f4f6',
      positive_color: '#05a34a', negative_color: '#ff3366',
      heading_color: '#060c17', heading_font_size: 18, heading_font_weight: '500',
      heading_margin_top: 20, heading_margin_bottom: 8,
      caption_color: '#7987a1', caption_text_transform: 'uppercase', caption_letter_spacing: 1,
      link_color: '#6571ff', link_decoration: 'none', scrollbar_width: 'thin',
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

  // html & body fill viewport exactly — no overflow escapes
  css += `html { height: 100%; overflow: hidden; }\n`;
  css += `body { margin: 0; padding: 0; height: 100%; overflow: hidden; position: relative; `;
  css += `font-family: ${o.font_family}; `;
  css += `background-color: ${o.page_bg_color}; color: ${o.body_text_color}; `;
  css += `font-size: ${o.body_font_size}px; line-height: ${o.body_line_height}; `;
  if (o.scrollbar_width !== 'auto') css += `scrollbar-width: ${o.scrollbar_width}; `;
  css += `}\n`;

  // Content wrapper — absolutely fills the viewport and is the SOLE scrollable element.
  // position:absolute + inset:0 guarantees it can never exceed the iframe viewport.
  css += `.__cw { position: absolute; top: 0; left: 0; right: 0; bottom: 0; padding: ${o.page_padding}px; overflow: auto; }\n`;

  // Container (wraps table if user wants max-width / shadow / radius)
  // Target elements INSIDE .__cw, never .__cw itself
  if (o.container_max_width > 0 || o.container_shadow !== 'none' || o.container_border_radius > 0) {
    css += `.container, .__cw > div:not(.kanban-board), .__cw > table { `;
    if (o.container_max_width > 0) css += `max-width: ${o.container_max_width}px; margin-left: auto; margin-right: auto; `;
    if (o.container_border_radius > 0) css += `border-radius: ${o.container_border_radius}px; overflow: hidden; `;
    if (o.container_shadow !== 'none') css += `box-shadow: ${SHADOW_MAP[o.container_shadow] || 'none'}; `;
    css += `}\n`;
  }

  // Table wrapper — horizontal scroll for nested table wrappers
  css += `.table-wrapper, .__cw > div:has(> table) { overflow-x: auto; max-width: 100%; }\n`;
  css += `table { border-collapse: collapse; width: 100%; max-width: 100%; font-size: ${o.body_font_size}px; `;
  css += `border: ${o.border_width}px ${o.border_style} ${o.border_color}; `;
  if (o.table_layout === 'fixed') css += `table-layout: fixed; `;
  if (o.table_border_radius > 0) css += `border-radius: ${o.table_border_radius}px; overflow: hidden; `;
  if (o.table_margin_v > 0) css += `margin-top: ${o.table_margin_v}px; margin-bottom: ${o.table_margin_v}px; `;
  css += `}\n`;

  // Header (th) — use `th, th *` to override inline styles on nested spans/divs
  const headerBg = o.header_bg_gradient_end
    ? `linear-gradient(135deg, ${o.header_bg_color} 0%, ${o.header_bg_gradient_end} 100%)`
    : o.header_bg_color;
  css += `th { background: ${headerBg}; `;
  css += `padding: ${o.header_padding_v}px ${o.header_padding_h}px; `;
  css += `text-align: ${o.header_text_align}; vertical-align: ${o.header_vertical_align}; `;
  css += `border: ${o.border_width}px ${o.border_style} ${o.border_color}; `;
  if (o.header_border_bottom_width > 0) {
    css += `border-bottom: ${o.header_border_bottom_width}px solid ${o.header_border_bottom_color}; `;
  }
  css += `white-space: ${o.header_white_space}; `;
  css += `}\n`;
  // Text properties also on descendants so they override inline styles on <span>, <div>, etc.
  css += `th, th * { color: ${o.header_text_color}; `;
  css += `font-size: ${o.header_font_size}px; font-weight: ${o.header_font_weight}; `;
  if (o.header_text_transform !== 'none') css += `text-transform: ${o.header_text_transform}; `;
  if (o.header_letter_spacing > 0) css += `letter-spacing: ${o.header_letter_spacing}px; `;
  css += `}\n`;

  // Body cells (td) — use `td, td *` for text props to override inline styles on nested elements
  css += `td { padding: ${o.cell_padding_v}px ${o.cell_padding_h}px; `;
  css += `border: ${o.border_width}px ${o.border_style} ${o.border_color}; `;
  css += `text-align: ${o.body_text_align}; vertical-align: ${o.body_vertical_align}; `;
  if (o.body_white_space === 'nowrap') css += `white-space: nowrap; `;
  if (o.cell_text_overflow === 'ellipsis') {
    css += `overflow: hidden; text-overflow: ellipsis; `;
    if (o.body_white_space !== 'nowrap') css += `white-space: nowrap; `;
  } else if (o.cell_text_overflow === 'clip') {
    css += `overflow: hidden; `;
  }
  if (o.cell_max_width > 0) css += `max-width: ${o.cell_max_width}px; `;
  css += `}\n`;
  // Text properties also on descendants so they override inline styles on <span>, <a>, etc.
  css += `td, td * { color: ${o.body_text_color}; font-weight: ${o.body_font_weight}; `;
  if (o.body_text_transform !== 'none') css += `text-transform: ${o.body_text_transform}; `;
  if (o.body_letter_spacing > 0) css += `letter-spacing: ${o.body_letter_spacing}px; `;
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
    css += `tbody tr:nth-child(even):not([data-row-status]) td { background-color: ${o.stripe_color}; }\n`;
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

// ── Premium Platform Layout CSS ──
// These classes are referenced by the AI design guide and must be
// injected into every iframe alongside the table/typography CSS.

/**
 * Generates premium CSS for platform layout classes:
 * .kpi-grid, .stat-card, .stat-value, .stat-label, .stat-change,
 * .progress-bar, .progress-fill, .status-dot, .badge (semantic variants),
 * .flex-row, .flex-col, .two-col, .three-col, .table-section,
 * .card (enhanced), spacing utilities, color utilities, accent cards,
 * and premium micro-interactions.
 *
 * Reads colors from the overrides palette when available, otherwise
 * falls back to elegant neutral defaults.
 */
export function generatePlatformLayoutCss(overrides: HtmlStyleOverrides = {}): string {
  const o = { ...DEFAULTS, ...overrides };

  // Derive semantic colors from the palette (fall back to tasteful defaults)
  const primary   = (overrides as Record<string, string>).primary   || o.header_bg_color || '#6366f1';
  const success   = (overrides as Record<string, string>).success   || o.positive_color  || '#10b981';
  const danger    = (overrides as Record<string, string>).danger    || o.negative_color  || '#ef4444';
  const warning   = (overrides as Record<string, string>).warning   || '#f59e0b';
  const info      = (overrides as Record<string, string>).info      || '#3b82f6';
  const secondary = (overrides as Record<string, string>).secondary || '#64748b';
  const textColor = o.body_text_color || '#1e293b';
  const bgCard    = (overrides as Record<string, string>).cardBg    || '#ffffff';
  const bgPage    = o.page_bg_color || '#f8fafc';
  const borderCol = o.border_color || '#e2e8f0';
  const radius    = o.table_border_radius > 0 ? o.table_border_radius : 12;
  const fontFam   = o.font_family || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  return `
/* ═══════════════════════════════════════════════════════════
   PREMIUM PLATFORM LAYOUT CSS — Auto-injected by FridAI
   ═══════════════════════════════════════════════════════════ */

/* ── CSS Custom Properties (theme-aware) ── */
.__cw {
  --primary: ${primary};
  --secondary: ${secondary};
  --success: ${success};
  --danger: ${danger};
  --warning: ${warning};
  --info: ${info};
  --text: ${textColor};
  --text-secondary: ${secondary};
  --bg: ${bgPage};
  --bg-card: ${bgCard};
  --border: ${borderCol};
  --radius: ${radius}px;
  --radius-sm: ${Math.max(4, radius - 4)}px;
  --radius-lg: ${radius + 4}px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04);
  --shadow-xl: 0 20px 25px -5px rgba(0,0,0,0.08), 0 8px 10px -6px rgba(0,0,0,0.04);
  --font: ${fontFam};
  --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  --glass-bg: rgba(255,255,255,0.7);
  --glass-border: rgba(255,255,255,0.3);
  --glass-blur: blur(12px);
}

/* ── Global Smoothing ── */
.__cw * {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ── KPI Grid (Auto-responsive) ── */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  width: 100%;
}

/* ── Stat Card (Premium glassmorphism) ── */
.stat-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all var(--transition);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--border);
  border-radius: var(--radius) var(--radius) 0 0;
  transition: background var(--transition);
}
.stat-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
  border-color: transparent;
}

/* Accent variants — colored top bar */
.stat-card.accent-primary::before { background: linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--primary) 70%, white)); }
.stat-card.accent-success::before { background: linear-gradient(90deg, var(--success), color-mix(in srgb, var(--success) 70%, white)); }
.stat-card.accent-danger::before  { background: linear-gradient(90deg, var(--danger), color-mix(in srgb, var(--danger) 70%, white)); }
.stat-card.accent-warning::before { background: linear-gradient(90deg, var(--warning), color-mix(in srgb, var(--warning) 70%, white)); }
.stat-card.accent-info::before    { background: linear-gradient(90deg, var(--info), color-mix(in srgb, var(--info) 70%, white)); }

/* Stat inner elements */
.stat-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  line-height: 1.2;
}
.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.15;
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
}
.stat-change {
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 20px;
  width: fit-content;
}
.stat-change.up {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, transparent);
}
.stat-change.up::before { content: '\\2197 '; }
.stat-change.down {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}
.stat-change.down::before { content: '\\2198 '; }

/* ── Progress Bar (Animated, premium) ── */
.progress-bar {
  width: 100%;
  height: 8px;
  background: color-mix(in srgb, var(--border) 50%, transparent);
  border-radius: 100px;
  overflow: hidden;
  position: relative;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--primary) 75%, var(--info)));
  border-radius: 100px;
  transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
}
.progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  animation: shimmer 2s ease-in-out infinite;
}
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.progress-bar.success .progress-fill {
  background: linear-gradient(90deg, var(--success), color-mix(in srgb, var(--success) 70%, #a7f3d0));
}
.progress-bar.warning .progress-fill {
  background: linear-gradient(90deg, var(--warning), color-mix(in srgb, var(--warning) 70%, #fde68a));
}
.progress-bar.danger .progress-fill {
  background: linear-gradient(90deg, var(--danger), color-mix(in srgb, var(--danger) 70%, #fca5a5));
}

/* ── Status Dot (Pulsing animation) ── */
.status-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--text-secondary);
  margin-right: 6px;
  vertical-align: middle;
  position: relative;
}
.status-dot.active {
  background: var(--success);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 40%, transparent);
  animation: pulse-dot 2s ease-in-out infinite;
}
.status-dot.warning {
  background: var(--warning);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--warning) 40%, transparent);
  animation: pulse-dot 2s ease-in-out infinite;
}
.status-dot.danger {
  background: var(--danger);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--danger) 40%, transparent);
  animation: pulse-dot 2.5s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 40%, transparent); }
  50% { box-shadow: 0 0 0 6px transparent; }
}

/* ── Badge (Semantic variants, pill style) ── */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 100px;
  line-height: 1.4;
  white-space: nowrap;
  letter-spacing: 0.2px;
}
.badge.bg-success, .badge[class*="bg-success"] {
  background: color-mix(in srgb, var(--success) 14%, transparent) !important;
  color: var(--success) !important;
  border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
}
.badge.bg-danger, .badge[class*="bg-danger"] {
  background: color-mix(in srgb, var(--danger) 14%, transparent) !important;
  color: var(--danger) !important;
  border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
}
.badge.bg-warning, .badge[class*="bg-warning"] {
  background: color-mix(in srgb, var(--warning) 14%, transparent) !important;
  color: color-mix(in srgb, var(--warning) 80%, #78350f) !important;
  border: 1px solid color-mix(in srgb, var(--warning) 25%, transparent);
}
.badge.bg-info, .badge[class*="bg-info"] {
  background: color-mix(in srgb, var(--info) 14%, transparent) !important;
  color: var(--info) !important;
  border: 1px solid color-mix(in srgb, var(--info) 25%, transparent);
}
.badge.bg-primary, .badge[class*="bg-primary"] {
  background: color-mix(in srgb, var(--primary) 14%, transparent) !important;
  color: var(--primary) !important;
  border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
}

/* ── Card (Enhanced with subtle depth) ── */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 22px 24px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition), border-color var(--transition);
}
.card:hover {
  box-shadow: var(--shadow-md);
}
.card h3 {
  margin-top: 0;
  margin-bottom: 14px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.2px;
}

/* ── Table Section (Premium wrapper) ── */
.table-section {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.table-section table {
  margin: 0;
  border: none;
  border-radius: 0;
}
.table-section table th:first-child,
.table-section table td:first-child { border-left: none; }
.table-section table th:last-child,
.table-section table td:last-child { border-right: none; }
.table-section table thead tr:first-child th { border-top: none; }
.table-section table tbody tr:last-child td { border-bottom: none; }

/* ── Layout: Flex ── */
.flex-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.flex-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Layout: Grid Columns ── */
.two-col {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
.three-col {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
@media (max-width: 640px) {
  .two-col, .three-col {
    grid-template-columns: 1fr;
  }
}

/* ── Overflow Wrapper ── */
.overflow-x {
  overflow-x: auto;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
}

/* ── Spacing Utilities ── */
.mt-sm { margin-top: 8px; }
.mt-md { margin-top: 16px; }
.mt-lg { margin-top: 24px; }
.mt-xl { margin-top: 32px; }
.mb-sm { margin-bottom: 8px; }
.mb-md { margin-bottom: 16px; }
.mb-lg { margin-bottom: 24px; }
.p-sm  { padding: 8px; }
.p-md  { padding: 16px; }
.p-lg  { padding: 24px; }
.gap-sm { gap: 8px; }
.gap-md { gap: 16px; }
.gap-lg { gap: 24px; }

/* ── Text Utilities ── */
.text-center { text-align: center; }
.text-right  { text-align: right; }
.text-sm  { font-size: 12px; }
.text-md  { font-size: 14px; }
.text-lg  { font-size: 16px; }
.text-xl  { font-size: 20px; }
.text-2xl { font-size: 24px; }
.text-3xl { font-size: 30px; }
.font-bold   { font-weight: 700; }
.font-medium { font-weight: 500; }
.font-light  { font-weight: 300; }
.w-full { width: 100%; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Color Utilities (Semantic) ── */
.text-primary   { color: var(--primary); }
.text-secondary { color: var(--text-secondary); }
.text-success   { color: var(--success); }
.text-danger    { color: var(--danger); }
.text-warning   { color: var(--warning); }
.text-info      { color: var(--info); }
.text-muted     { color: var(--text-secondary); opacity: 0.7; }

.bg-primary { background-color: color-mix(in srgb, var(--primary) 14%, transparent); }
.bg-success { background-color: color-mix(in srgb, var(--success) 14%, transparent); }
.bg-danger  { background-color: color-mix(in srgb, var(--danger) 14%, transparent); }
.bg-warning { background-color: color-mix(in srgb, var(--warning) 14%, transparent); }
.bg-info    { background-color: color-mix(in srgb, var(--info) 14%, transparent); }
.bg-card    { background-color: var(--bg-card); }

/* ── Accent Card (Colored top border) ── */
.accent-primary { border-top: 3px solid var(--primary); }
.accent-success { border-top: 3px solid var(--success); }
.accent-danger  { border-top: 3px solid var(--danger); }
.accent-warning { border-top: 3px solid var(--warning); }
.accent-info    { border-top: 3px solid var(--info); }

/* ── Editable Cell ── */
.editable-cell {
  cursor: text;
  padding: 4px 6px;
  border-radius: 4px;
  transition: all var(--transition);
  outline: none;
  min-height: 1.4em;
}
.editable-cell:hover {
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}
.editable-cell:focus {
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 30%, transparent);
}
.editable-cell.modified {
  border-left: 3px solid var(--warning);
  background: color-mix(in srgb, var(--warning) 6%, transparent);
}

/* ── Status Message ── */
.status-message {
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  display: none;
  animation: slideIn 0.3s ease-out;
}
.status-message.success {
  background: color-mix(in srgb, var(--success) 12%, transparent);
  color: var(--success);
  border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
}
.status-message.error {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
}
@keyframes slideIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Premium Tooltip ── */
[data-tooltip] {
  position: relative;
  cursor: help;
}
[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%) scale(0.95);
  padding: 6px 12px;
  background: var(--text);
  color: var(--bg-card);
  font-size: 11px;
  font-weight: 500;
  border-radius: 6px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: all 0.15s ease-out;
  z-index: 100;
}
[data-tooltip]:hover::after {
  opacity: 1;
  transform: translateX(-50%) scale(1);
}

/* ── Divider Variants ── */
.divider-gradient {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border), transparent);
  margin: 16px 0;
}

/* ── Mini Chart (Sparkline container) ── */
.mini-chart {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 24px;
  vertical-align: middle;
}
.mini-chart .bar {
  width: 4px;
  background: var(--primary);
  border-radius: 2px 2px 0 0;
  transition: height 0.3s ease;
  opacity: 0.7;
}
.mini-chart .bar:last-child { opacity: 1; }

/* ── Avatar / Icon Circle ── */
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: white;
  background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--info)));
  flex-shrink: 0;
}
.avatar.sm { width: 28px; height: 28px; font-size: 11px; }
.avatar.lg { width: 48px; height: 48px; font-size: 18px; }

/* ── Tag / Chip ── */
.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 100px;
  font-size: 11px;
  font-weight: 500;
  background: color-mix(in srgb, var(--border) 50%, transparent);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

/* ── Skeleton / Loading State ── */
.skeleton {
  background: linear-gradient(90deg, var(--border) 25%, color-mix(in srgb, var(--border) 50%, transparent) 50%, var(--border) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}
@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Kanban Board ── */
.kanban-board {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
  min-height: 400px;
  align-items: flex-start;
  -webkit-overflow-scrolling: touch;
}
.kanban-column {
  flex: 0 0 280px;
  min-width: 280px;
  max-width: 320px;
  background: color-mix(in srgb, var(--border) 25%, transparent);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 160px);
}
.kanban-column-header {
  padding: 14px 16px;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid var(--border);
  flex-shrink: 0;
}
.kanban-column-header .count {
  background: color-mix(in srgb, var(--text) 12%, transparent);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 100px;
}
.kanban-column-body {
  padding: 10px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.kanban-column-body::-webkit-scrollbar { width: 4px; }
.kanban-column-body::-webkit-scrollbar-track { background: transparent; }
.kanban-column-body::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--text-secondary) 20%, transparent); border-radius: 100px; }
.kanban-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  cursor: grab;
  transition: all var(--transition);
  box-shadow: var(--shadow-sm);
  position: relative;
}
.kanban-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--primary);
}
.kanban-card:active, .kanban-card.dragging {
  cursor: grabbing;
  opacity: 0.7;
  transform: rotate(2deg);
  box-shadow: var(--shadow-lg);
}
.kanban-card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
  line-height: 1.3;
}
.kanban-card-desc {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin-bottom: 8px;
}
.kanban-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  flex-wrap: wrap;
}
.kanban-card-delete {
  position: absolute;
  top: 6px;
  right: 8px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  opacity: 0;
  transition: opacity var(--transition), color var(--transition);
  padding: 2px 4px;
  line-height: 1;
}
.kanban-card:hover .kanban-card-delete { opacity: 1; }
.kanban-card-delete:hover { color: var(--danger); }
/* Column accent colors via data-color attribute */
.kanban-column[data-color="primary"] .kanban-column-header { border-bottom-color: var(--primary); }
.kanban-column[data-color="success"] .kanban-column-header { border-bottom-color: var(--success); }
.kanban-column[data-color="warning"] .kanban-column-header { border-bottom-color: var(--warning); }
.kanban-column[data-color="danger"]  .kanban-column-header { border-bottom-color: var(--danger); }
.kanban-column[data-color="info"]    .kanban-column-header { border-bottom-color: var(--info); }
/* Drop zone highlight */
.kanban-column-body.drag-over {
  background: color-mix(in srgb, var(--primary) 8%, transparent);
  border-radius: var(--radius-sm);
}

/* ── Empty State ── */
.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--text-secondary);
}
.empty-state .icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.4;
}
.empty-state h3 {
  color: var(--text);
  margin-bottom: 8px;
}

/* ── Number Highlight (Large metric) ── */
.metric-huge {
  font-size: 42px;
  font-weight: 800;
  letter-spacing: -1.5px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(135deg, var(--text), var(--primary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ── Timeline ── */
.timeline {
  position: relative;
  padding-left: 28px;
}
.timeline::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--border);
  border-radius: 1px;
}
.timeline-item {
  position: relative;
  padding-bottom: 20px;
}
.timeline-item::before {
  content: '';
  position: absolute;
  left: -24px;
  top: 4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid var(--bg-card);
  box-shadow: 0 0 0 2px var(--primary);
}
.timeline-item.completed::before { background: var(--success); box-shadow: 0 0 0 2px var(--success); }
.timeline-item.warning::before   { background: var(--warning); box-shadow: 0 0 0 2px var(--warning); }
.timeline-item.danger::before    { background: var(--danger); box-shadow: 0 0 0 2px var(--danger); }

/* ── Chat / Conversazione ── */
.chat-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 480px;
  overflow-y: auto;
  padding: 16px;
  scroll-behavior: smooth;
}
.chat-container::-webkit-scrollbar { width: 4px; }
.chat-container::-webkit-scrollbar-track { background: transparent; }
.chat-container::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--text-secondary) 20%, transparent); border-radius: 100px; }

.chat-bubble {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: var(--radius);
  font-size: 13px;
  line-height: 1.5;
  position: relative;
  animation: chatFadeIn 0.25s ease-out;
}
.chat-bubble.bot {
  background: var(--bg-card);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  align-self: flex-start;
  border-bottom-left-radius: 4px;
}
.chat-bubble.user {
  background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 80%, var(--info)));
  color: white;
  align-self: flex-end;
  border-bottom-right-radius: 4px;
  box-shadow: var(--shadow-md);
}
.chat-bubble .chat-time {
  font-size: 10px;
  opacity: 0.6;
  margin-top: 6px;
  display: block;
}
.chat-bubble.bot .chat-sender {
  font-size: 11px;
  font-weight: 700;
  color: var(--primary);
  margin-bottom: 4px;
  display: block;
}
@keyframes chatFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.chat-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.chat-row.user {
  flex-direction: row-reverse;
}

.typing-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  align-self: flex-start;
}
.typing-dots span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-secondary);
  opacity: 0.4;
  animation: typingBounce 1.4s ease-in-out infinite;
}
.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-6px); opacity: 1; }
}

.chat-welcome {
  text-align: center;
  padding: 40px 24px;
  color: var(--text-secondary);
}
.chat-welcome .icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 800;
  color: white;
  background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--info)));
  margin-bottom: 16px;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 30%, transparent);
}
.chat-welcome h3 {
  color: var(--text);
  font-size: 16px;
  margin-bottom: 6px;
}
.chat-welcome p {
  font-size: 13px;
  max-width: 360px;
  margin: 0 auto;
}
.chat-suggestions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
}

.chat-input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--transition), box-shadow var(--transition);
}
.chat-input-bar:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent);
}
.chat-input-bar input {
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  background: transparent !important;
  flex: 1;
  min-width: 0;
  font-size: 13px;
}
.chat-input-bar input:focus {
  box-shadow: none !important;
}

/* ── Scrollbar Styling ── */
.__cw::-webkit-scrollbar { width: 6px; height: 6px; }
.__cw::-webkit-scrollbar-track { background: transparent; }
.__cw::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--text-secondary) 30%, transparent); border-radius: 100px; }
.__cw::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--text-secondary) 50%, transparent); }

/* ── Focus Visible (Accessibility) ── */
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* ── Modal / Dialog ── */
.modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
  z-index: 1000;
  justify-content: center;
  align-items: center;
  animation: modalFadeIn 0.15s ease;
}
.modal-overlay.open, .modal-overlay.active { display: flex; }
.modal-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 28px;
  width: 92%;
  max-width: 520px;
  box-shadow: var(--shadow-xl);
  animation: modalSlideUp 0.2s ease;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-dialog h3 { margin-top: 0; margin-bottom: 20px; font-size: 18px; font-weight: 700; }
.modal-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
@keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes modalSlideUp { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }

/* ── Toast / Notification ── */
.toast-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}
.toast {
  padding: 12px 20px;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text);
  animation: toastSlideIn 0.3s ease;
  pointer-events: auto;
}
.toast.success { background: color-mix(in srgb, var(--success) 12%, var(--bg-card)); border-color: color-mix(in srgb, var(--success) 25%, transparent); color: var(--success); }
.toast.error   { background: color-mix(in srgb, var(--danger) 12%, var(--bg-card)); border-color: color-mix(in srgb, var(--danger) 25%, transparent); color: var(--danger); }
.toast.warning { background: color-mix(in srgb, var(--warning) 12%, var(--bg-card)); border-color: color-mix(in srgb, var(--warning) 25%, transparent); color: var(--warning); }
.toast.info    { background: color-mix(in srgb, var(--primary) 12%, var(--bg-card)); border-color: color-mix(in srgb, var(--primary) 25%, transparent); color: var(--primary); }
@keyframes toastSlideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }

/* ── Tabs ── */
.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 16px;
}
.tab {
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  border: none;
  background: transparent;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all var(--transition);
  margin-bottom: -1px;
}
.tab:hover { color: var(--text); background: color-mix(in srgb, var(--primary) 4%, transparent); }
.tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.tab-panel { display: none; }
.tab-panel.active { display: block; animation: tabFadeIn 0.2s ease; }
@keyframes tabFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

/* ── Toggle Switch ── */
.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute;
  inset: 0;
  background: var(--border);
  border-radius: 100px;
  cursor: pointer;
  transition: all var(--transition);
}
.toggle-slider::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  box-shadow: var(--shadow-sm);
  transition: transform var(--transition);
}
.toggle input:checked + .toggle-slider { background: var(--primary); }
.toggle input:checked + .toggle-slider::before { transform: translateX(20px); }

/* ── Dropdown Menu ── */
.dropdown { position: relative; display: inline-block; }
.dropdown-menu {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 180px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  z-index: 500;
  padding: 4px;
  animation: dropdownFadeIn 0.15s ease;
}
.dropdown-menu.open { display: block; }
.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius-sm);
  width: 100%;
  text-align: left;
  transition: background var(--transition);
}
.dropdown-item:hover { background: color-mix(in srgb, var(--primary) 8%, transparent); }
.dropdown-divider { height: 1px; background: var(--border); margin: 4px 0; }
@keyframes dropdownFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

/* ── Accordion / Collapsible ── */
.accordion { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.accordion-item { border-bottom: 1px solid var(--border); }
.accordion-item:last-child { border-bottom: none; }
.accordion-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background var(--transition);
}
.accordion-trigger:hover { background: color-mix(in srgb, var(--primary) 4%, transparent); }
.accordion-trigger::after { content: '\\25BE'; font-size: 12px; color: var(--text-secondary); transition: transform var(--transition); }
.accordion-trigger.open::after { transform: rotate(180deg); }
.accordion-content { display: none; padding: 0 18px 16px; font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
.accordion-content.open { display: block; animation: tabFadeIn 0.2s ease; }

/* ── Chip / Multi-select ── */
.chip-group { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 100px;
  font-size: 12px;
  font-weight: 500;
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--primary);
  border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
  cursor: default;
  transition: all var(--transition);
}
.chip .chip-remove {
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity var(--transition);
}
.chip .chip-remove:hover { opacity: 1; }

/* ── Stepper / Wizard ── */
.stepper {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 24px;
}
.step {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  position: relative;
}
.step::after {
  content: '';
  flex: 1;
  height: 2px;
  background: var(--border);
  margin: 0 12px;
}
.step:last-child::after { display: none; }
.step-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  background: var(--border);
  color: var(--text-secondary);
  flex-shrink: 0;
  transition: all var(--transition);
}
.step.active .step-circle { background: var(--primary); color: white; box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 20%, transparent); }
.step.completed .step-circle { background: var(--success); color: white; }
.step.completed::after { background: var(--success); }
.step-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); white-space: nowrap; }
.step.active .step-label { color: var(--primary); }
.step.completed .step-label { color: var(--success); }

/* ── Color Picker Dots ── */
.color-picker { display: flex; gap: 8px; flex-wrap: wrap; }
.color-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
}
.color-dot:hover { transform: scale(1.15); }
.color-dot.active { border-color: var(--text); box-shadow: 0 0 0 3px color-mix(in srgb, var(--text) 15%, transparent); }
.color-dot.active::after { content: '\\2713'; color: white; font-size: 13px; font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }

/* ── Floating Action Button ── */
.fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 80%, var(--info)));
  color: white;
  border: none;
  font-size: 22px;
  cursor: pointer;
  box-shadow: var(--shadow-lg), 0 0 0 0 color-mix(in srgb, var(--primary) 30%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition);
  z-index: 100;
}
.fab:hover { transform: scale(1.08); box-shadow: var(--shadow-xl); }

/* ── Print Optimization ── */
@media print {
  .stat-card, .card { break-inside: avoid; }
  .status-dot { animation: none; }
  .progress-fill::after { animation: none; }
}
`.trim();
}

// ── Inspector Mode ──

/** Element zones the inspector can detect */
export type HtmlInspectorZone =
  | 'th' | 'td' | 'table' | 'body'
  | 'heading' | 'link' | 'caption' | 'first-col'
  | 'tr' | 'value-color'
  // UI element zones
  | 'btn' | 'btn-secondary' | 'input' | 'select' | 'badge' | 'card' | 'divider' | 'list'
  | null;

/** Whether a zone maps to UiElementsOverrides (true) or HtmlStyleOverrides (false) */
export function isUiZone(zone: Exclude<HtmlInspectorZone, null>): boolean {
  return ['btn', 'btn-secondary', 'input', 'select', 'badge', 'card', 'divider', 'list'].includes(zone);
}

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
  // UI element zones
  btn: 'Bottone',
  'btn-secondary': 'Bottone Secondario',
  input: 'Campo Input',
  select: 'Menu a Tendina',
  badge: 'Badge',
  card: 'Card',
  divider: 'Separatore',
  list: 'Lista',
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
    // Helper: prefer the exact clicked element for highlight precision,
    // fall back to the zone container only when clicked IS the container.
    function pick(clicked, node) { return (clicked !== node) ? clicked : node; }

    // Helper: check if element looks like an interactive button (span/div with interactive class names or attributes)
    function looksLikeButton(node) {
      var cls = node.className ? String(node.className).toLowerCase() : '';
      // class contains common interactive keywords
      if (cls.indexOf('btn') !== -1 || cls.indexOf('button') !== -1 ||
          cls.indexOf('icon') !== -1 || cls.indexOf('action') !== -1 ||
          cls.indexOf('toggle') !== -1 || cls.indexOf('trigger') !== -1 ||
          cls.indexOf('close') !== -1 || cls.indexOf('dismiss') !== -1) return true;
      // role="button" or onclick attribute
      if (node.getAttribute) {
        if (node.getAttribute('role') === 'button') return true;
        if (node.getAttribute('onclick')) return true;
      }
      return false;
    }

    // 1. Check the exact element first for special classes
    if (hasClass(el, 'positive') || hasClass(el, 'negative'))
      return { zone: 'value-color', el: el, info: elementInfo(el) };

    // 2. Walk up to find the nearest meaningful zone
    var clicked = el;
    var node = el;
    var deepestBlock = null; // track closest block element for body fallback
    while (node && node !== document.body && node !== document.documentElement) {
      var tag = node.tagName ? node.tagName.toLowerCase() : '';

      // Track the deepest block-level element (skip the outer wrapper)
      if (!deepestBlock && !hasClass(node, '__cw') &&
          (tag === 'div' || tag === 'p' || tag === 'section' || tag === 'article' ||
           tag === 'nav' || tag === 'aside' || tag === 'header' || tag === 'footer' ||
           tag === 'main' || tag === 'figure' || tag === 'blockquote' || tag === 'form' ||
           tag === 'details' || tag === 'fieldset' || tag === 'ul' || tag === 'ol'))
        deepestBlock = node;

      // ── UI element zones (checked first, innermost match wins) ──
      if ((tag === 'button' || hasClass(node, 'btn') || looksLikeButton(node)) && !hasClass(node, 'btn-secondary'))
        return { zone: 'btn', el: pick(clicked, node), info: elementInfo(clicked) };
      if (hasClass(node, 'btn-secondary'))
        return { zone: 'btn-secondary', el: pick(clicked, node), info: elementInfo(clicked) };
      if ((tag === 'input' && node.type !== 'range') || tag === 'textarea')
        return { zone: 'input', el: node, info: elementInfo(clicked) };
      if (tag === 'input' && node.type === 'range')
        return { zone: 'input', el: node, info: elementInfo(clicked) };
      if (tag === 'select')
        return { zone: 'select', el: node, info: elementInfo(clicked) };
      if (hasClass(node, 'badge'))
        return { zone: 'badge', el: pick(clicked, node), info: elementInfo(clicked) };
      if (hasClass(node, 'card'))
        return { zone: 'card', el: pick(clicked, node), info: elementInfo(clicked) };
      if (tag === 'hr' || hasClass(node, 'divider'))
        return { zone: 'divider', el: node, info: elementInfo(clicked) };
      if (tag === 'li')
        return { zone: 'list', el: pick(clicked, node), info: elementInfo(clicked) };

      // ── Table & content zones ──
      // value-color classes at any level
      if (hasClass(node, 'positive') || hasClass(node, 'negative'))
        return { zone: 'value-color', el: node, info: elementInfo(clicked) };

      if (tag === 'a')
        return { zone: 'link', el: pick(clicked, node), info: elementInfo(clicked) };

      if (tag === 'h1' || tag === 'h2' || tag === 'h3')
        return { zone: 'heading', el: pick(clicked, node), info: elementInfo(clicked) };

      if (tag === 'caption' || hasClass(node, 'caption'))
        return { zone: 'caption', el: pick(clicked, node), info: elementInfo(clicked) };

      if (tag === 'th')
        return { zone: 'th', el: pick(clicked, node), info: elementInfo(clicked) };

      if (tag === 'td') {
        var zone = node.cellIndex === 0 ? 'first-col' : 'td';
        return { zone: zone, el: pick(clicked, node), info: elementInfo(clicked) };
      }

      if (tag === 'tr')
        return { zone: 'tr', el: pick(clicked, node), info: elementInfo(clicked) };

      if (tag === 'table')
        return { zone: 'table', el: pick(clicked, node), info: elementInfo(clicked) };

      node = node.parentElement;
    }
    // Fallback: use the deepest block element found (not the entire body)
    var fallbackEl = deepestBlock || clicked;
    if (fallbackEl === document.body || fallbackEl === document.documentElement) fallbackEl = document.body;
    return { zone: 'body', el: fallbackEl, info: elementInfo(deepestBlock || clicked) };
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
    if (e.data && e.data.type === 'html-style-update-ui') {
      var u = document.getElementById('__dynamic-ui-css');
      if (u) u.textContent = e.data.css;
    }
  });
})();
</script>`;
}

/**
 * Sanitize agent-generated HTML that may contain a full document structure
 * (<html>, <head>, <style>, <body> tags). Extracts <style> blocks and
 * returns only the body content so it can be safely wrapped.
 */
function sanitizeAgentHtml(raw: string): { bodyContent: string; extractedStyles: string } {
  let s = raw;
  // 1. Extract all <style> blocks — they get re-injected into the proper <head>
  const styles: string[] = [];
  s = s.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_m, css) => {
    styles.push(css);
    return '';
  });
  // 2. Strip document-level TAGS only (NOT block content)
  //    Scripts remain in-place so they execute in correct DOM order
  //    (moving body scripts to <head> breaks getElementById calls)
  s = s.replace(/<!doctype[^>]*>/gi, '');
  s = s.replace(/<\/?html[^>]*>/gi, '');
  s = s.replace(/<\/?head[^>]*>/gi, '');   // strip head TAGS, keep head CONTENT (scripts survive)
  s = s.replace(/<\/?body[^>]*>/gi, '');
  s = s.replace(/<meta[^>]*\/?>/gi, '');
  s = s.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');
  s = s.replace(/<link[^>]*\/?>/gi, '');

  return {
    bodyContent: s.trim(),
    extractedStyles: styles.length > 0 ? `<style id="__agent-css">${styles.join('\n')}</style>` : '',
  };
}

/**
 * Wrap raw HTML with a full document including generated CSS.
 * When inspectorMode is true, injects click-to-inspect script.
 * Returns a complete HTML string suitable for iframe srcDoc.
 *
 * If the input HTML contains a full document structure (<html>, <head>, <style>, <body>),
 * those tags are stripped and <style> blocks are moved to the proper <head>.
 */
export function applyHtmlStyleOverrides(
  html: string,
  overrides: HtmlStyleOverrides,
  inspectorMode = false,
  uiCss = '',
): string {
  const css = generateHtmlStyleCss(overrides);
  const layoutCss = generatePlatformLayoutCss(overrides);
  const inspector = inspectorMode ? generateInspectorScript() : '';
  const uiStyleTag = uiCss ? `<style id="__dynamic-ui-css">${uiCss}</style>` : '';

  // Sanitize: extract <style> blocks, strip document-level tags
  // Scripts stay in bodyContent in their original positions (DOM order matters)
  const { bodyContent, extractedStyles } = sanitizeAgentHtml(html);

  return `<html><head><style id="__dynamic-css">${css}</style><style id="__platform-layout-css">${layoutCss}</style>${uiStyleTag}${extractedStyles}</head><body><div class="__cw">${bodyContent}</div>${inspector}</body></html>`;
}
