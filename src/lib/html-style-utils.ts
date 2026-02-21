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
  {
    id: 'corporate-blue',
    label: 'Corporate Blue',
    description: 'Professionale con accenti blu — stile report aziendale',
    overrides: {
      page_bg_color: '#f8fafc',
      page_padding: 16,
      container_max_width: 0,
      container_border_radius: 8,
      container_shadow: 'md',

      header_bg_color: '#1e40af',
      header_bg_gradient_end: '#3b82f6',
      header_text_color: '#ffffff',
      header_font_size: 10,
      header_font_weight: '600',
      header_text_transform: 'uppercase',
      header_letter_spacing: 0.5,
      header_text_align: 'left',
      header_padding_v: 8,
      header_padding_h: 12,
      header_border_bottom_width: 0,

      body_bg_color: '#ffffff',
      body_text_color: '#1e293b',
      body_font_size: 11,
      body_font_weight: '400',
      body_line_height: 1.4,
      body_text_align: 'left',

      font_family: '"Inter", "Segoe UI", Roboto, sans-serif',

      border_color: '#e2e8f0',
      border_style: 'solid',
      border_width: 1,
      table_border_radius: 8,

      cell_padding_v: 7,
      cell_padding_h: 12,

      stripe_enabled: true,
      stripe_color: '#f1f5f9',
      hover_enabled: true,
      hover_color: '#e0e7ff',

      positive_color: '#16a34a',
      negative_color: '#dc2626',

      heading_color: '#1e293b',
      heading_font_size: 18,
      heading_font_weight: '700',

      link_color: '#2563eb',
      link_decoration: 'none',
    },
  },
  {
    id: 'warm-minimal',
    label: 'Caldo Minimale',
    description: 'Toni caldi su fondo chiaro — leggero e accogliente',
    overrides: {
      page_bg_color: '#fdf8f4',
      page_padding: 20,
      container_shadow: 'sm',
      container_border_radius: 6,

      header_bg_color: '#78350f',
      header_bg_gradient_end: '',
      header_text_color: '#fef3c7',
      header_font_size: 10,
      header_font_weight: '600',
      header_text_transform: 'capitalize',
      header_letter_spacing: 0.3,
      header_padding_v: 8,
      header_padding_h: 12,
      header_border_bottom_width: 2,
      header_border_bottom_color: '#92400e',

      body_bg_color: '#fffbf5',
      body_text_color: '#44403c',
      body_font_size: 11,
      body_line_height: 1.5,

      font_family: '"Georgia", "Times New Roman", serif',

      border_color: '#e7e5e4',
      border_style: 'solid',
      border_width: 1,
      table_border_radius: 6,

      cell_padding_v: 8,
      cell_padding_h: 12,

      stripe_enabled: true,
      stripe_color: '#fef9f0',
      hover_enabled: true,
      hover_color: '#fef3c7',

      positive_color: '#15803d',
      negative_color: '#b91c1c',

      heading_color: '#78350f',
      heading_font_size: 20,
      heading_font_weight: '600',

      link_color: '#b45309',
      link_decoration: 'underline',
    },
  },
  {
    id: 'dark-sleek',
    label: 'Dark Elegante',
    description: 'Tema scuro con accenti viola — moderno e professionale',
    overrides: {
      page_bg_color: '#0f172a',
      page_padding: 16,
      container_shadow: 'lg',
      container_border_radius: 8,

      header_bg_color: '#1e1b4b',
      header_bg_gradient_end: '#312e81',
      header_text_color: '#e0e7ff',
      header_font_size: 10,
      header_font_weight: '500',
      header_text_transform: 'uppercase',
      header_letter_spacing: 1,
      header_padding_v: 8,
      header_padding_h: 12,
      header_border_bottom_width: 1,
      header_border_bottom_color: '#6366f1',

      body_bg_color: '#1e293b',
      body_text_color: '#cbd5e1',
      body_font_size: 11,
      body_line_height: 1.4,

      font_family: '"SF Mono", "Fira Code", "Cascadia Code", monospace',

      border_color: '#334155',
      border_style: 'solid',
      border_width: 1,
      table_border_radius: 8,

      cell_padding_v: 7,
      cell_padding_h: 12,

      stripe_enabled: true,
      stripe_color: '#1a2436',
      hover_enabled: true,
      hover_color: '#2d3a4f',

      positive_color: '#34d399',
      negative_color: '#f87171',

      heading_color: '#e0e7ff',
      heading_font_size: 18,
      heading_font_weight: '300',

      link_color: '#818cf8',
      link_decoration: 'none',

      scrollbar_width: 'thin',
    },
  },
  {
    id: 'swiss-precision',
    label: 'Swiss Precision',
    description: 'Pulito e geometrico — ispirato al design svizzero',
    overrides: {
      page_bg_color: '#ffffff',
      page_padding: 24,
      container_max_width: 960,
      container_border_radius: 0,
      container_shadow: 'none',

      header_bg_color: '#000000',
      header_bg_gradient_end: '',
      header_text_color: '#ffffff',
      header_font_size: 9,
      header_font_weight: '700',
      header_text_transform: 'uppercase',
      header_letter_spacing: 2,
      header_text_align: 'left',
      header_padding_v: 12,
      header_padding_h: 16,
      header_border_bottom_width: 0,
      header_white_space: 'nowrap',

      body_bg_color: '#ffffff',
      body_text_color: '#111111',
      body_font_size: 12,
      body_font_weight: '400',
      body_line_height: 1.6,
      body_text_align: 'left',

      font_family: '"Helvetica Neue", Helvetica, Arial, sans-serif',

      border_color: '#e0e0e0',
      border_style: 'solid',
      border_width: 0,
      table_border_radius: 0,
      row_border_color: '#eeeeee',
      col_border_color: '',

      cell_padding_v: 10,
      cell_padding_h: 16,

      stripe_enabled: false,
      hover_enabled: true,
      hover_color: '#f5f5f5',

      positive_color: '#1a8754',
      negative_color: '#d32f2f',

      heading_color: '#000000',
      heading_font_size: 24,
      heading_font_weight: '700',
      heading_text_transform: 'uppercase',
      heading_letter_spacing: 3,
      heading_margin_top: 20,
      heading_margin_bottom: 12,

      caption_color: '#999999',
      caption_font_size: 10,
      caption_text_transform: 'uppercase',
      caption_letter_spacing: 1.5,

      link_color: '#000000',
      link_decoration: 'underline',
      scrollbar_width: 'none',
    },
  },
  {
    id: 'emerald-executive',
    label: 'Emerald Executive',
    description: 'Verde smeraldo sofisticato — report istituzionale',
    overrides: {
      page_bg_color: '#f0fdf4',
      page_padding: 20,
      container_max_width: 0,
      container_border_radius: 10,
      container_shadow: 'md',

      header_bg_color: '#064e3b',
      header_bg_gradient_end: '#065f46',
      header_text_color: '#ecfdf5',
      header_font_size: 10,
      header_font_weight: '600',
      header_text_transform: 'uppercase',
      header_letter_spacing: 0.8,
      header_text_align: 'left',
      header_padding_v: 10,
      header_padding_h: 14,
      header_border_bottom_width: 2,
      header_border_bottom_color: '#10b981',

      body_bg_color: '#ffffff',
      body_text_color: '#1f2937',
      body_font_size: 11,
      body_font_weight: '400',
      body_line_height: 1.5,

      font_family: '"Inter", "Segoe UI", sans-serif',

      border_color: '#d1fae5',
      border_style: 'solid',
      border_width: 1,
      table_border_radius: 10,
      row_border_color: '#ecfdf5',

      cell_padding_v: 8,
      cell_padding_h: 14,

      stripe_enabled: true,
      stripe_color: '#f0fdf4',
      hover_enabled: true,
      hover_color: '#d1fae5',

      positive_color: '#059669',
      negative_color: '#dc2626',

      heading_color: '#064e3b',
      heading_font_size: 20,
      heading_font_weight: '600',

      link_color: '#059669',
      link_decoration: 'none',
    },
  },
  {
    id: 'midnight-gold',
    label: 'Midnight Gold',
    description: 'Nero e oro — lusso e autorevolezza',
    overrides: {
      page_bg_color: '#0a0a0a',
      page_padding: 20,
      container_max_width: 0,
      container_border_radius: 4,
      container_shadow: 'lg',

      header_bg_color: '#1a1a1a',
      header_bg_gradient_end: '#262626',
      header_text_color: '#d4af37',
      header_font_size: 10,
      header_font_weight: '600',
      header_text_transform: 'uppercase',
      header_letter_spacing: 1.5,
      header_text_align: 'left',
      header_padding_v: 10,
      header_padding_h: 14,
      header_border_bottom_width: 1,
      header_border_bottom_color: '#d4af37',

      body_bg_color: '#141414',
      body_text_color: '#e5e5e5',
      body_font_size: 11,
      body_font_weight: '400',
      body_line_height: 1.5,

      font_family: '"Georgia", "Times New Roman", serif',

      border_color: '#2a2a2a',
      border_style: 'solid',
      border_width: 1,
      table_border_radius: 4,
      row_border_color: '#222222',

      cell_padding_v: 9,
      cell_padding_h: 14,

      stripe_enabled: true,
      stripe_color: '#1a1a1a',
      hover_enabled: true,
      hover_color: '#252525',

      positive_color: '#d4af37',
      negative_color: '#ef4444',

      heading_color: '#d4af37',
      heading_font_size: 22,
      heading_font_weight: '400',
      heading_letter_spacing: 2,

      caption_color: '#737373',
      caption_text_transform: 'uppercase',
      caption_letter_spacing: 1.5,

      link_color: '#d4af37',
      link_decoration: 'none',
      scrollbar_width: 'thin',
    },
  },
  {
    id: 'nordic-frost',
    label: 'Nordic Frost',
    description: 'Blu-grigio ghiacciato — design scandinavo minimalista',
    overrides: {
      page_bg_color: '#f8fafc',
      page_padding: 24,
      container_max_width: 920,
      container_border_radius: 12,
      container_shadow: 'sm',

      header_bg_color: '#475569',
      header_bg_gradient_end: '#64748b',
      header_text_color: '#f1f5f9',
      header_font_size: 10,
      header_font_weight: '500',
      header_text_transform: 'none',
      header_letter_spacing: 0.3,
      header_text_align: 'left',
      header_padding_v: 10,
      header_padding_h: 16,
      header_border_bottom_width: 0,

      body_bg_color: '#ffffff',
      body_text_color: '#334155',
      body_font_size: 12,
      body_font_weight: '400',
      body_line_height: 1.6,

      font_family: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',

      border_color: '#e2e8f0',
      border_style: 'solid',
      border_width: 0,
      table_border_radius: 12,
      row_border_color: '#f1f5f9',

      cell_padding_v: 10,
      cell_padding_h: 16,

      stripe_enabled: false,
      hover_enabled: true,
      hover_color: '#f1f5f9',

      positive_color: '#0d9488',
      negative_color: '#e11d48',

      heading_color: '#1e293b',
      heading_font_size: 20,
      heading_font_weight: '300',
      heading_letter_spacing: 0.5,
      heading_margin_top: 20,
      heading_margin_bottom: 10,

      caption_color: '#94a3b8',
      caption_font_size: 11,

      link_color: '#6366f1',
      link_decoration: 'none',
      scrollbar_width: 'thin',
    },
  },
  {
    id: 'rose-quartz',
    label: 'Rose Quartz',
    description: 'Rosa antico e grigio — raffinato e contemporaneo',
    overrides: {
      page_bg_color: '#fdf2f8',
      page_padding: 20,
      container_max_width: 0,
      container_border_radius: 8,
      container_shadow: 'sm',

      header_bg_color: '#831843',
      header_bg_gradient_end: '#9d174d',
      header_text_color: '#fdf2f8',
      header_font_size: 10,
      header_font_weight: '500',
      header_text_transform: 'uppercase',
      header_letter_spacing: 1,
      header_text_align: 'left',
      header_padding_v: 9,
      header_padding_h: 14,
      header_border_bottom_width: 0,

      body_bg_color: '#ffffff',
      body_text_color: '#4a4a4a',
      body_font_size: 11,
      body_font_weight: '400',
      body_line_height: 1.5,

      font_family: '"Inter", "Segoe UI", sans-serif',

      border_color: '#fce7f3',
      border_style: 'solid',
      border_width: 1,
      table_border_radius: 8,
      row_border_color: '#fdf2f8',

      cell_padding_v: 8,
      cell_padding_h: 14,

      stripe_enabled: true,
      stripe_color: '#fdf2f8',
      hover_enabled: true,
      hover_color: '#fce7f3',

      positive_color: '#059669',
      negative_color: '#e11d48',

      heading_color: '#831843',
      heading_font_size: 20,
      heading_font_weight: '600',

      link_color: '#be185d',
      link_decoration: 'none',
    },
  },
  {
    id: 'bordeaux-classic',
    label: 'Bordeaux Classic',
    description: 'Rosso bordeaux e crema — stile classico senza tempo',
    overrides: {
      page_bg_color: '#faf5ef',
      page_padding: 24,
      container_max_width: 900,
      container_border_radius: 2,
      container_shadow: 'sm',

      header_bg_color: '#6b1c23',
      header_bg_gradient_end: '',
      header_text_color: '#faf5ef',
      header_font_size: 10,
      header_font_weight: '700',
      header_text_transform: 'uppercase',
      header_letter_spacing: 1.5,
      header_text_align: 'left',
      header_padding_v: 10,
      header_padding_h: 16,
      header_border_bottom_width: 3,
      header_border_bottom_color: '#8b2530',

      body_bg_color: '#fffcf7',
      body_text_color: '#3d2c2c',
      body_font_size: 11,
      body_font_weight: '400',
      body_line_height: 1.6,

      font_family: '"Georgia", "Palatino Linotype", "Book Antiqua", serif',

      border_color: '#e8ddd0',
      border_style: 'solid',
      border_width: 1,
      table_border_radius: 2,
      row_border_color: '#f0e8db',

      cell_padding_v: 9,
      cell_padding_h: 16,

      stripe_enabled: true,
      stripe_color: '#faf5ef',
      hover_enabled: true,
      hover_color: '#f5ebe0',

      positive_color: '#2d6a4f',
      negative_color: '#9b2226',

      heading_color: '#6b1c23',
      heading_font_size: 22,
      heading_font_weight: '400',
      heading_letter_spacing: 1,

      caption_color: '#8b7e74',
      caption_font_size: 11,
      caption_text_transform: 'uppercase',
      caption_letter_spacing: 1.2,

      link_color: '#6b1c23',
      link_decoration: 'underline',
    },
  },
  {
    id: 'ocean-teal',
    label: 'Ocean Teal',
    description: 'Teal e bianco — fresco, moderno e professionale',
    overrides: {
      page_bg_color: '#f0fdfa',
      page_padding: 20,
      container_max_width: 0,
      container_border_radius: 10,
      container_shadow: 'md',

      header_bg_color: '#134e4a',
      header_bg_gradient_end: '#115e59',
      header_text_color: '#ccfbf1',
      header_font_size: 10,
      header_font_weight: '600',
      header_text_transform: 'uppercase',
      header_letter_spacing: 0.8,
      header_text_align: 'left',
      header_padding_v: 10,
      header_padding_h: 14,
      header_border_bottom_width: 2,
      header_border_bottom_color: '#2dd4bf',

      body_bg_color: '#ffffff',
      body_text_color: '#1f2937',
      body_font_size: 11,
      body_font_weight: '400',
      body_line_height: 1.5,

      font_family: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',

      border_color: '#ccfbf1',
      border_style: 'solid',
      border_width: 1,
      table_border_radius: 10,
      row_border_color: '#f0fdfa',

      cell_padding_v: 8,
      cell_padding_h: 14,

      stripe_enabled: true,
      stripe_color: '#f0fdfa',
      hover_enabled: true,
      hover_color: '#ccfbf1',

      positive_color: '#0d9488',
      negative_color: '#dc2626',

      heading_color: '#134e4a',
      heading_font_size: 20,
      heading_font_weight: '600',

      link_color: '#0d9488',
      link_decoration: 'none',
    },
  },
  {
    id: 'obsidian-mono',
    label: 'Obsidian Mono',
    description: 'Scuro con font monospace — stile terminale sofisticato',
    overrides: {
      page_bg_color: '#18181b',
      page_padding: 16,
      container_max_width: 0,
      container_border_radius: 6,
      container_shadow: 'lg',

      header_bg_color: '#27272a',
      header_bg_gradient_end: '',
      header_text_color: '#22c55e',
      header_font_size: 10,
      header_font_weight: '600',
      header_text_transform: 'uppercase',
      header_letter_spacing: 1.5,
      header_text_align: 'left',
      header_padding_v: 8,
      header_padding_h: 14,
      header_border_bottom_width: 1,
      header_border_bottom_color: '#22c55e',

      body_bg_color: '#1f1f23',
      body_text_color: '#d4d4d8',
      body_font_size: 11,
      body_font_weight: '400',
      body_line_height: 1.5,

      font_family: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',

      border_color: '#3f3f46',
      border_style: 'solid',
      border_width: 1,
      table_border_radius: 6,
      row_border_color: '#2d2d33',

      cell_padding_v: 7,
      cell_padding_h: 14,

      stripe_enabled: true,
      stripe_color: '#232327',
      hover_enabled: true,
      hover_color: '#2a2a2f',

      positive_color: '#22c55e',
      negative_color: '#ef4444',

      heading_color: '#22c55e',
      heading_font_size: 18,
      heading_font_weight: '700',
      heading_letter_spacing: 1,

      caption_color: '#71717a',
      caption_text_transform: 'uppercase',
      caption_letter_spacing: 2,

      link_color: '#38bdf8',
      link_decoration: 'none',
      scrollbar_width: 'thin',
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
