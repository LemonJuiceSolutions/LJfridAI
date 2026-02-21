'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RotateCcw } from 'lucide-react';

// Re-export from shared utility so existing imports keep working
export { applyHtmlStyleOverrides, generateHtmlStyleCss, HTML_STYLE_DEFAULTS } from '@/lib/html-style-utils';
export type { HtmlStyleOverrides, HtmlInspectorZone } from '@/lib/html-style-utils';
import type { HtmlStyleOverrides, HtmlInspectorZone } from '@/lib/html-style-utils';
import { HTML_STYLE_DEFAULTS, ZONE_LABELS } from '@/lib/html-style-utils';

// ── Inline field helpers (kept from before) ──

function ColorField({ label, value, onChange, onReset }: { label: string; value?: string; onChange: (v: string) => void; onReset?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-[11px] flex-1 min-w-0 truncate">{label}</Label>
      <input type="color" value={value || '#ffffff'} onChange={e => onChange(e.target.value)} className="w-7 h-7 rounded border cursor-pointer bg-transparent p-0" />
      {onReset && (
        <button onClick={onReset} className="p-0.5 rounded hover:bg-muted" title="Reset">
          <RotateCcw className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

function SliderField({ label, value, min, max, step, onChange, onReset, unit = '' }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; onReset?: () => void; unit?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px]">{label}</Label>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground tabular-nums">{value}{unit}</span>
          {onReset && (
            <button onClick={onReset} className="p-0.5 rounded hover:bg-muted" title="Reset">
              <RotateCcw className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(opt => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Field definition types ──

type FieldDef =
  | { type: 'color'; key: keyof HtmlStyleOverrides; label: string; fallbackKey?: keyof HtmlStyleOverrides }
  | { type: 'slider'; key: keyof HtmlStyleOverrides; label: string; min: number; max: number; step: number; unit?: string; zeroLabel?: string }
  | { type: 'select'; key: keyof HtmlStyleOverrides; label: string; options: { value: string; label: string }[]; inheritLabel?: string }
  | { type: 'switch'; key: keyof HtmlStyleOverrides; label: string; colorKey?: keyof HtmlStyleOverrides; colorLabel?: string };

interface CategoryGroup { category: string; fields: FieldDef[] }

// ── Shared option lists ──

const FONT_WEIGHTS = [
  { value: '400', label: 'Normale' }, { value: '500', label: 'Medio' },
  { value: '600', label: 'Semi-Bold' }, { value: '700', label: 'Grassetto' },
  { value: '800', label: 'Extra Bold' },
];
const TEXT_ALIGNS = [
  { value: 'left', label: 'Sinistra' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Destra' },
];
const V_ALIGNS = [
  { value: 'top', label: 'Alto' }, { value: 'middle', label: 'Centro' }, { value: 'bottom', label: 'Basso' },
];
const TEXT_TRANSFORMS = [
  { value: 'none', label: 'Nessuna' }, { value: 'uppercase', label: 'MAIUSCOLO' },
  { value: 'capitalize', label: 'Iniziale Maiuscola' }, { value: 'lowercase', label: 'minuscolo' },
];
const FONTS = [
  { value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', label: 'Sistema' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, sans-serif', label: 'Helvetica' },
  { value: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif', label: 'Segoe UI' },
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: 'Roboto, sans-serif', label: 'Roboto' },
  { value: '"Open Sans", sans-serif', label: 'Open Sans' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, sans-serif', label: 'Tahoma' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", serif', label: 'Times New Roman' },
  { value: '"Courier New", monospace', label: 'Courier New' },
  { value: 'monospace', label: 'Monospace' },
];
const WRAP_OPTS = [
  { value: 'normal', label: 'A capo automatico' }, { value: 'nowrap', label: 'Riga singola' },
];

// ── Per-zone field definitions ──

function fieldsForZone(zone: Exclude<HtmlInspectorZone, null>): CategoryGroup[] {
  switch (zone) {
    case 'th': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'header_bg_color', label: 'Sfondo' },
        { type: 'color', key: 'header_bg_gradient_end', label: 'Gradiente fine', fallbackKey: 'header_bg_color' },
        { type: 'color', key: 'header_text_color', label: 'Colore testo' },
      ]},
      { category: 'Testo', fields: [
        { type: 'select', key: 'font_family', label: 'Font', options: FONTS },
        { type: 'slider', key: 'header_font_size', label: 'Dimensione', min: 7, max: 24, step: 1, unit: 'px' },
        { type: 'select', key: 'header_font_weight', label: 'Peso', options: FONT_WEIGHTS },
        { type: 'select', key: 'header_text_transform', label: 'Trasformazione', options: TEXT_TRANSFORMS },
        { type: 'slider', key: 'header_letter_spacing', label: 'Spaziatura lettere', min: 0, max: 3, step: 0.1, unit: 'px' },
        { type: 'select', key: 'header_text_align', label: 'Allineamento H', options: TEXT_ALIGNS },
        { type: 'select', key: 'header_vertical_align', label: 'Allineamento V', options: V_ALIGNS },
        { type: 'select', key: 'header_white_space', label: 'A capo', options: WRAP_OPTS },
      ]},
      { category: 'Spaziatura', fields: [
        { type: 'slider', key: 'header_padding_v', label: 'Padding verticale', min: 1, max: 24, step: 1, unit: 'px' },
        { type: 'slider', key: 'header_padding_h', label: 'Padding orizzontale', min: 2, max: 30, step: 1, unit: 'px' },
      ]},
      { category: 'Bordi', fields: [
        { type: 'color', key: 'border_color', label: 'Colore bordo' },
        { type: 'select', key: 'border_style', label: 'Stile bordo', options: [
          { value: 'solid', label: 'Continuo' }, { value: 'dashed', label: 'Tratteggiato' },
          { value: 'dotted', label: 'Puntinato' }, { value: 'none', label: 'Nessuno' },
        ]},
        { type: 'slider', key: 'border_width', label: 'Spessore bordo', min: 0, max: 4, step: 1, unit: 'px' },
        { type: 'slider', key: 'header_border_bottom_width', label: 'Bordo inferiore', min: 0, max: 6, step: 1, unit: 'px' },
        { type: 'color', key: 'header_border_bottom_color', label: 'Colore bordo inferiore' },
        { type: 'color', key: 'col_border_color', label: 'Separatori colonna', fallbackKey: 'border_color' },
      ]},
    ];

    case 'td': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'body_bg_color', label: 'Sfondo' },
        { type: 'color', key: 'body_text_color', label: 'Colore testo' },
        { type: 'color', key: 'positive_color', label: 'Valori positivi' },
        { type: 'color', key: 'negative_color', label: 'Valori negativi' },
      ]},
      { category: 'Testo', fields: [
        { type: 'select', key: 'font_family', label: 'Font', options: FONTS },
        { type: 'slider', key: 'body_font_size', label: 'Dimensione', min: 8, max: 20, step: 1, unit: 'px' },
        { type: 'select', key: 'body_font_weight', label: 'Peso', options: FONT_WEIGHTS },
        { type: 'select', key: 'body_text_transform', label: 'Trasformazione', options: TEXT_TRANSFORMS },
        { type: 'slider', key: 'body_letter_spacing', label: 'Spaziatura lettere', min: 0, max: 3, step: 0.1, unit: 'px' },
        { type: 'slider', key: 'body_line_height', label: 'Altezza riga', min: 1, max: 2.5, step: 0.1 },
        { type: 'select', key: 'body_text_align', label: 'Allineamento H', options: TEXT_ALIGNS },
        { type: 'select', key: 'body_vertical_align', label: 'Allineamento V', options: V_ALIGNS },
        { type: 'select', key: 'body_white_space', label: 'A capo', options: WRAP_OPTS },
      ]},
      { category: 'Spaziatura', fields: [
        { type: 'slider', key: 'cell_padding_v', label: 'Padding verticale', min: 0, max: 24, step: 1, unit: 'px' },
        { type: 'slider', key: 'cell_padding_h', label: 'Padding orizzontale', min: 0, max: 30, step: 1, unit: 'px' },
        { type: 'slider', key: 'row_min_height', label: 'Altezza minima riga', min: 0, max: 60, step: 2, unit: 'px', zeroLabel: ' (auto)' },
        { type: 'slider', key: 'cell_max_width', label: 'Larghezza max', min: 0, max: 500, step: 10, unit: 'px', zeroLabel: ' (auto)' },
      ]},
      { category: 'Bordi', fields: [
        { type: 'color', key: 'border_color', label: 'Colore bordo' },
        { type: 'select', key: 'border_style', label: 'Stile bordo', options: [
          { value: 'solid', label: 'Continuo' }, { value: 'dashed', label: 'Tratteggiato' },
          { value: 'dotted', label: 'Puntinato' }, { value: 'none', label: 'Nessuno' },
        ]},
        { type: 'slider', key: 'border_width', label: 'Spessore bordo', min: 0, max: 4, step: 1, unit: 'px' },
        { type: 'color', key: 'row_border_color', label: 'Separatori riga', fallbackKey: 'border_color' },
        { type: 'color', key: 'col_border_color', label: 'Separatori colonna', fallbackKey: 'border_color' },
      ]},
      { category: 'Overflow', fields: [
        { type: 'select', key: 'cell_text_overflow', label: 'Testo overflow', options: [
          { value: 'visible', label: 'Visibile' }, { value: 'ellipsis', label: 'Troncato ...' }, { value: 'clip', label: 'Tagliato' },
        ]},
      ]},
      { category: 'Effetti', fields: [
        { type: 'switch', key: 'stripe_enabled', label: 'Alternanza righe', colorKey: 'stripe_color', colorLabel: 'Colore righe pari' },
        { type: 'switch', key: 'hover_enabled', label: 'Effetto hover', colorKey: 'hover_color', colorLabel: 'Colore hover' },
      ]},
    ];

    case 'first-col': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'first_col_bg_color', label: 'Sfondo', fallbackKey: 'body_bg_color' },
        { type: 'color', key: 'first_col_text_color', label: 'Colore testo', fallbackKey: 'body_text_color' },
        { type: 'color', key: 'positive_color', label: 'Valori positivi' },
        { type: 'color', key: 'negative_color', label: 'Valori negativi' },
      ]},
      { category: 'Testo', fields: [
        { type: 'select', key: 'font_family', label: 'Font', options: FONTS },
        { type: 'slider', key: 'body_font_size', label: 'Dimensione', min: 8, max: 20, step: 1, unit: 'px' },
        { type: 'select', key: 'first_col_font_weight', label: 'Peso', options: FONT_WEIGHTS, inheritLabel: 'Come il corpo' },
        { type: 'select', key: 'body_text_transform', label: 'Trasformazione', options: TEXT_TRANSFORMS },
        { type: 'slider', key: 'body_letter_spacing', label: 'Spaziatura lettere', min: 0, max: 3, step: 0.1, unit: 'px' },
        { type: 'slider', key: 'body_line_height', label: 'Altezza riga', min: 1, max: 2.5, step: 0.1 },
        { type: 'select', key: 'body_text_align', label: 'Allineamento H', options: TEXT_ALIGNS },
        { type: 'select', key: 'body_vertical_align', label: 'Allineamento V', options: V_ALIGNS },
        { type: 'select', key: 'body_white_space', label: 'A capo', options: WRAP_OPTS },
      ]},
      { category: 'Spaziatura', fields: [
        { type: 'slider', key: 'cell_padding_v', label: 'Padding verticale', min: 0, max: 24, step: 1, unit: 'px' },
        { type: 'slider', key: 'cell_padding_h', label: 'Padding orizzontale', min: 0, max: 30, step: 1, unit: 'px' },
        { type: 'slider', key: 'first_col_min_width', label: 'Larghezza minima', min: 0, max: 300, step: 10, unit: 'px', zeroLabel: ' (auto)' },
        { type: 'slider', key: 'row_min_height', label: 'Altezza minima riga', min: 0, max: 60, step: 2, unit: 'px', zeroLabel: ' (auto)' },
      ]},
      { category: 'Bordi', fields: [
        { type: 'color', key: 'border_color', label: 'Colore bordo' },
        { type: 'select', key: 'border_style', label: 'Stile bordo', options: [
          { value: 'solid', label: 'Continuo' }, { value: 'dashed', label: 'Tratteggiato' },
          { value: 'dotted', label: 'Puntinato' }, { value: 'none', label: 'Nessuno' },
        ]},
        { type: 'slider', key: 'border_width', label: 'Spessore bordo', min: 0, max: 4, step: 1, unit: 'px' },
        { type: 'color', key: 'row_border_color', label: 'Separatori riga', fallbackKey: 'border_color' },
        { type: 'color', key: 'col_border_color', label: 'Separatori colonna', fallbackKey: 'border_color' },
      ]},
      { category: 'Effetti', fields: [
        { type: 'switch', key: 'stripe_enabled', label: 'Alternanza righe', colorKey: 'stripe_color', colorLabel: 'Colore righe pari' },
        { type: 'switch', key: 'hover_enabled', label: 'Effetto hover', colorKey: 'hover_color', colorLabel: 'Colore hover' },
      ]},
    ];

    case 'table': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'body_bg_color', label: 'Sfondo celle' },
        { type: 'color', key: 'header_bg_color', label: 'Sfondo intestazione' },
      ]},
      { category: 'Bordi', fields: [
        { type: 'color', key: 'border_color', label: 'Colore bordo' },
        { type: 'select', key: 'border_style', label: 'Stile bordo', options: [
          { value: 'solid', label: 'Continuo' }, { value: 'dashed', label: 'Tratteggiato' },
          { value: 'dotted', label: 'Puntinato' }, { value: 'none', label: 'Nessuno' },
        ]},
        { type: 'slider', key: 'border_width', label: 'Spessore bordo', min: 0, max: 4, step: 1, unit: 'px' },
        { type: 'slider', key: 'table_border_radius', label: 'Bordo arrotondato', min: 0, max: 16, step: 1, unit: 'px' },
        { type: 'color', key: 'row_border_color', label: 'Separatori riga', fallbackKey: 'border_color' },
        { type: 'color', key: 'col_border_color', label: 'Separatori colonna', fallbackKey: 'border_color' },
      ]},
      { category: 'Layout', fields: [
        { type: 'select', key: 'table_layout', label: 'Layout colonne', options: [
          { value: 'auto', label: 'Automatico' }, { value: 'fixed', label: 'Equi-distribuite' },
        ]},
        { type: 'slider', key: 'min_col_width', label: 'Larghezza min colonne', min: 0, max: 300, step: 10, unit: 'px', zeroLabel: ' (auto)' },
        { type: 'select', key: 'last_col_text_align', label: 'Allineamento ultima col.', options: TEXT_ALIGNS, inheritLabel: 'Come il corpo' },
      ]},
      { category: 'Testo', fields: [
        { type: 'select', key: 'font_family', label: 'Font', options: FONTS },
        { type: 'slider', key: 'body_font_size', label: 'Dimensione celle', min: 8, max: 20, step: 1, unit: 'px' },
        { type: 'slider', key: 'header_font_size', label: 'Dimensione intestazione', min: 7, max: 24, step: 1, unit: 'px' },
      ]},
      { category: 'Spaziatura', fields: [
        { type: 'slider', key: 'cell_padding_v', label: 'Padding V celle', min: 0, max: 24, step: 1, unit: 'px' },
        { type: 'slider', key: 'cell_padding_h', label: 'Padding H celle', min: 0, max: 30, step: 1, unit: 'px' },
        { type: 'slider', key: 'header_padding_v', label: 'Padding V intestazione', min: 1, max: 24, step: 1, unit: 'px' },
        { type: 'slider', key: 'header_padding_h', label: 'Padding H intestazione', min: 2, max: 30, step: 1, unit: 'px' },
      ]},
      { category: 'Effetti', fields: [
        { type: 'switch', key: 'stripe_enabled', label: 'Alternanza righe', colorKey: 'stripe_color', colorLabel: 'Colore righe pari' },
        { type: 'switch', key: 'hover_enabled', label: 'Effetto hover', colorKey: 'hover_color', colorLabel: 'Colore hover' },
      ]},
    ];

    case 'body': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'page_bg_color', label: 'Sfondo pagina' },
        { type: 'color', key: 'body_text_color', label: 'Colore testo' },
      ]},
      { category: 'Testo', fields: [
        { type: 'select', key: 'font_family', label: 'Font', options: FONTS },
        { type: 'slider', key: 'body_font_size', label: 'Dimensione', min: 8, max: 20, step: 1, unit: 'px' },
        { type: 'select', key: 'body_font_weight', label: 'Peso', options: FONT_WEIGHTS },
        { type: 'select', key: 'body_text_transform', label: 'Trasformazione', options: TEXT_TRANSFORMS },
        { type: 'slider', key: 'body_letter_spacing', label: 'Spaziatura lettere', min: 0, max: 3, step: 0.1, unit: 'px' },
        { type: 'slider', key: 'body_line_height', label: 'Altezza riga', min: 1, max: 2.5, step: 0.1 },
        { type: 'select', key: 'body_text_align', label: 'Allineamento H', options: TEXT_ALIGNS },
      ]},
      { category: 'Spaziatura', fields: [
        { type: 'slider', key: 'page_padding', label: 'Padding pagina', min: 0, max: 40, step: 2, unit: 'px' },
      ]},
      { category: 'Contenitore', fields: [
        { type: 'slider', key: 'container_max_width', label: 'Larghezza max', min: 0, max: 1600, step: 50, unit: 'px', zeroLabel: ' (auto)' },
        { type: 'slider', key: 'container_border_radius', label: 'Bordo arrotondato', min: 0, max: 20, step: 1, unit: 'px' },
        { type: 'select', key: 'container_shadow', label: 'Ombra', options: [
          { value: 'none', label: 'Nessuna' }, { value: 'sm', label: 'Leggera' },
          { value: 'md', label: 'Media' }, { value: 'lg', label: 'Forte' },
        ]},
        { type: 'select', key: 'scrollbar_width', label: 'Scrollbar', options: [
          { value: 'auto', label: 'Automatica' }, { value: 'thin', label: 'Sottile' }, { value: 'none', label: 'Nascosta' },
        ]},
      ]},
    ];

    case 'heading': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'heading_color', label: 'Colore' },
      ]},
      { category: 'Testo', fields: [
        { type: 'select', key: 'font_family', label: 'Font', options: FONTS },
        { type: 'slider', key: 'heading_font_size', label: 'Dimensione h1', min: 12, max: 36, step: 1, unit: 'px' },
      ]},
      { category: 'Spaziatura', fields: [
        { type: 'slider', key: 'heading_margin_v', label: 'Margine verticale', min: 0, max: 30, step: 2, unit: 'px' },
      ]},
    ];

    case 'caption': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'caption_color', label: 'Colore testo' },
        { type: 'color', key: 'caption_bg_color', label: 'Sfondo', fallbackKey: 'page_bg_color' },
      ]},
      { category: 'Testo', fields: [
        { type: 'select', key: 'font_family', label: 'Font', options: FONTS },
        { type: 'slider', key: 'caption_font_size', label: 'Dimensione', min: 10, max: 28, step: 1, unit: 'px' },
        { type: 'select', key: 'caption_text_align', label: 'Allineamento', options: TEXT_ALIGNS },
      ]},
      { category: 'Spaziatura', fields: [
        { type: 'slider', key: 'caption_padding', label: 'Padding', min: 0, max: 30, step: 2, unit: 'px' },
      ]},
    ];

    case 'link': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'link_color', label: 'Colore' },
      ]},
      { category: 'Stile', fields: [
        { type: 'select', key: 'link_decoration', label: 'Decorazione', options: [
          { value: 'underline', label: 'Sottolineato' }, { value: 'none', label: 'Nessuna' },
        ]},
      ]},
    ];

    case 'tr': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'body_bg_color', label: 'Sfondo celle' },
        { type: 'color', key: 'body_text_color', label: 'Colore testo' },
      ]},
      { category: 'Effetti', fields: [
        { type: 'switch', key: 'stripe_enabled', label: 'Alternanza righe', colorKey: 'stripe_color', colorLabel: 'Colore righe pari' },
        { type: 'switch', key: 'hover_enabled', label: 'Effetto hover', colorKey: 'hover_color', colorLabel: 'Colore hover' },
      ]},
      { category: 'Spaziatura', fields: [
        { type: 'slider', key: 'row_min_height', label: 'Altezza minima', min: 0, max: 60, step: 2, unit: 'px', zeroLabel: ' (auto)' },
        { type: 'slider', key: 'cell_padding_v', label: 'Padding V celle', min: 0, max: 24, step: 1, unit: 'px' },
        { type: 'slider', key: 'cell_padding_h', label: 'Padding H celle', min: 0, max: 30, step: 1, unit: 'px' },
      ]},
      { category: 'Bordi', fields: [
        { type: 'color', key: 'row_border_color', label: 'Separatori riga', fallbackKey: 'border_color' },
        { type: 'color', key: 'border_color', label: 'Colore bordo' },
      ]},
    ];

    case 'value-color': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'positive_color', label: 'Valori positivi' },
        { type: 'color', key: 'negative_color', label: 'Valori negativi' },
      ]},
      { category: 'Testo', fields: [
        { type: 'select', key: 'font_family', label: 'Font', options: FONTS },
        { type: 'slider', key: 'body_font_size', label: 'Dimensione', min: 8, max: 20, step: 1, unit: 'px' },
        { type: 'select', key: 'body_font_weight', label: 'Peso', options: FONT_WEIGHTS },
      ]},
    ];
  }
}

/** Zones in display order for "show all" mode */
const ALL_ZONES: Exclude<HtmlInspectorZone, null>[] = [
  'body', 'th', 'td', 'first-col', 'table', 'tr', 'heading', 'caption', 'link', 'value-color',
];

// ── Props ──

interface HtmlStyleEditorProps {
  overrides: HtmlStyleOverrides;
  onChange: (overrides: HtmlStyleOverrides) => void;
  selectedZone?: HtmlInspectorZone;
  elementInfo?: string;
  onClearZone?: () => void;
}

export default function HtmlStyleEditor({ overrides, onChange, selectedZone, elementInfo, onClearZone }: HtmlStyleEditorProps) {
  const [showAll, setShowAll] = useState(false);

  // Reset showAll when a zone is selected via inspector
  useEffect(() => {
    if (selectedZone) setShowAll(false);
  }, [selectedZone]);

  const set = useCallback((key: keyof HtmlStyleOverrides, value: any) => {
    onChange({ ...overrides, [key]: value });
  }, [overrides, onChange]);

  const reset = useCallback((key: keyof HtmlStyleOverrides) => {
    const next = { ...overrides };
    delete next[key];
    onChange(next);
  }, [overrides, onChange]);

  const resolve = useCallback((key: keyof HtmlStyleOverrides): any => {
    return overrides[key] !== undefined ? overrides[key] : (HTML_STYLE_DEFAULTS as any)[key];
  }, [overrides]);

  // ── Render a single field ──
  const renderField = useCallback((field: FieldDef) => {
    switch (field.type) {
      case 'color': {
        const val = resolve(field.key) as string;
        const display = val || (field.fallbackKey ? resolve(field.fallbackKey) as string : '#ffffff');
        return (
          <ColorField
            key={field.key}
            label={field.label}
            value={display}
            onChange={v => set(field.key, v)}
            onReset={() => reset(field.key)}
          />
        );
      }
      case 'slider': {
        const val = resolve(field.key) as number;
        const unit = (field.zeroLabel && val === 0) ? field.zeroLabel : (field.unit || '');
        return (
          <SliderField
            key={field.key}
            label={field.label}
            value={val}
            min={field.min} max={field.max} step={field.step}
            onChange={v => set(field.key, v)}
            onReset={() => reset(field.key)}
            unit={unit}
          />
        );
      }
      case 'select': {
        const raw = resolve(field.key) as string;
        const val = field.inheritLabel ? (raw || '__inherit__') : raw;
        const opts = field.inheritLabel
          ? [{ value: '__inherit__', label: field.inheritLabel }, ...field.options]
          : field.options;
        return (
          <SelectField
            key={field.key}
            label={field.label}
            value={val}
            options={opts}
            onChange={v => set(field.key, field.inheritLabel && v === '__inherit__' ? '' : v)}
          />
        );
      }
      case 'switch': {
        const checked = resolve(field.key) as boolean;
        return (
          <div key={field.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">{field.label}</Label>
              <Switch checked={checked} onCheckedChange={v => set(field.key, v)} />
            </div>
            {field.colorKey && checked && (
              <ColorField
                label={field.colorLabel || 'Colore'}
                value={resolve(field.colorKey) as string}
                onChange={v => set(field.colorKey!, v)}
                onReset={() => reset(field.colorKey!)}
              />
            )}
          </div>
        );
      }
    }
  }, [resolve, set, reset]);

  // ── Render category groups ──
  const renderGroups = useCallback((groups: CategoryGroup[]) => (
    <>
      {groups.map(g => (
        <div key={g.category}>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-1.5 border-b pb-1">
            {g.category}
          </div>
          <div className="space-y-2.5">
            {g.fields.map(renderField)}
          </div>
        </div>
      ))}
    </>
  ), [renderField]);

  // ── "Show all" data: all zones, deduped by key ──
  const allGroupsByZone = useMemo(() => {
    const seen = new Set<string>();
    const result: { zoneLabel: string; groups: CategoryGroup[] }[] = [];
    for (const zone of ALL_ZONES) {
      const zoneGroups = fieldsForZone(zone);
      const filtered: CategoryGroup[] = [];
      for (const g of zoneGroups) {
        const newFields = g.fields.filter(f => !seen.has(f.key));
        newFields.forEach(f => seen.add(f.key));
        if (newFields.length > 0) filtered.push({ ...g, fields: newFields });
      }
      if (filtered.length > 0) result.push({ zoneLabel: ZONE_LABELS[zone], groups: filtered });
    }
    return result;
  }, []);

  return (
    <div className="space-y-1 text-sm">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold">
          {selectedZone ? ZONE_LABELS[selectedZone] : 'Stile HTML'}
        </span>
        <div className="flex items-center gap-2">
          {selectedZone && onClearZone && (
            <button
              onClick={() => { onClearZone(); setShowAll(true); }}
              className="text-[10px] text-violet-600 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-200"
            >
              Mostra tutto
            </button>
          )}
          {showAll && !selectedZone && (
            <button
              onClick={() => setShowAll(false)}
              className="text-[10px] text-violet-600 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-200"
            >
              Nascondi
            </button>
          )}
          <button
            onClick={() => onChange({})}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" /> Ripristina
          </button>
        </div>
      </div>

      {/* ── Zone badge ── */}
      {selectedZone && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-[11px] text-violet-700 dark:text-violet-300">
          <span className="font-mono text-[10px] bg-violet-100 dark:bg-violet-900 px-1 rounded">
            {elementInfo || selectedZone}
          </span>
          <span className="text-violet-500 dark:text-violet-400">{ZONE_LABELS[selectedZone]}</span>
        </div>
      )}

      {/* ── Content ── */}
      {selectedZone ? (
        /* Inspector: fields for selected zone */
        renderGroups(fieldsForZone(selectedZone))
      ) : showAll ? (
        /* All properties organized by zone */
        <>
          {allGroupsByZone.map(({ zoneLabel, groups }) => (
            <div key={zoneLabel}>
              <div className="text-[11px] font-bold text-violet-600 dark:text-violet-400 mt-4 mb-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-500/50 inline-block" />
                {zoneLabel}
              </div>
              {renderGroups(groups)}
            </div>
          ))}
        </>
      ) : (
        /* Hint: click to inspect */
        <div className="py-8 text-center">
          <div className="text-[11px] text-muted-foreground">
            Clicca su un elemento nell&apos;anteprima per ispezionarlo
          </div>
          <button
            onClick={() => setShowAll(true)}
            className="mt-2 text-[10px] text-violet-600 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-200"
          >
            oppure mostra tutte le proprieta&apos;
          </button>
        </div>
      )}

      {/* ── Custom CSS (always visible) ── */}
      <div className="mt-4">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 border-b pb-1">
          CSS Personalizzato
        </div>
        <Textarea
          value={overrides.custom_css || ''}
          onChange={e => set('custom_css', e.target.value)}
          placeholder="/* Regole CSS personalizzate */"
          className="font-mono text-[11px] min-h-[80px] resize-y"
        />
        <p className="text-[9px] text-muted-foreground mt-1">
          Applicato dopo i controlli visuali, ha priorita&apos; su di essi.
        </p>
      </div>
    </div>
  );
}
