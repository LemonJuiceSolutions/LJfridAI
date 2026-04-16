'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { RotateCcw, Palette, Save, Trash2, Globe, Loader2, ChevronDown, ChevronUp, Bookmark, Link2, Unlink2 } from 'lucide-react';

// Re-export from shared utility so existing imports keep working
export { applyHtmlStyleOverrides, generateHtmlStyleCss, HTML_STYLE_DEFAULTS } from '@/lib/html-style-utils';
export type { HtmlStyleOverrides, HtmlInspectorZone } from '@/lib/html-style-utils';
import type { HtmlStyleOverrides, HtmlInspectorZone, SavedHtmlStylePreset } from '@/lib/html-style-utils';
import { HTML_STYLE_DEFAULTS, ZONE_LABELS, HTML_STYLE_PRESETS, isUiZone } from '@/lib/html-style-utils';
import type { UiElementsOverrides } from '@/lib/unified-style-types';
import { UI_ELEMENTS_DEFAULTS } from '@/lib/unified-style-types';
import { getHtmlStylePresetsAction, saveHtmlStylePresetAction, deleteHtmlStylePresetAction, scrapeWebsiteStyleAction } from '@/actions/html-style-presets';

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
  | { type: 'color'; key: string; label: string; fallbackKey?: string }
  | { type: 'slider'; key: string; label: string; min: number; max: number; step: number; unit?: string; zeroLabel?: string }
  | { type: 'select'; key: string; label: string; options: { value: string; label: string }[]; inheritLabel?: string }
  | { type: 'switch'; key: string; label: string; colorKey?: string; colorLabel?: string };

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
        { type: 'slider', key: 'table_margin_v', label: 'Margine esterno V', min: 0, max: 40, step: 2, unit: 'px' },
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
        { type: 'slider', key: 'p_margin_v', label: 'Margine paragrafi', min: 0, max: 24, step: 1, unit: 'px' },
        { type: 'slider', key: 'p_font_size', label: 'Dimensione paragrafi', min: 0, max: 24, step: 1, unit: 'px', zeroLabel: ' (eredita)' },
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
        { type: 'select', key: 'heading_font_weight', label: 'Peso', options: FONT_WEIGHTS },
        { type: 'select', key: 'heading_text_align', label: 'Allineamento', options: TEXT_ALIGNS },
        { type: 'select', key: 'heading_text_transform', label: 'Trasformazione', options: TEXT_TRANSFORMS },
        { type: 'slider', key: 'heading_letter_spacing', label: 'Spaziatura lettere', min: 0, max: 5, step: 0.1, unit: 'px' },
        { type: 'slider', key: 'heading_line_height', label: 'Altezza riga', min: 0.8, max: 2.5, step: 0.1 },
      ]},
      { category: 'Spaziatura', fields: [
        { type: 'slider', key: 'heading_margin_top', label: 'Margine sopra', min: 0, max: 40, step: 2, unit: 'px' },
        { type: 'slider', key: 'heading_margin_bottom', label: 'Margine sotto', min: 0, max: 40, step: 2, unit: 'px' },
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
        { type: 'select', key: 'caption_font_weight', label: 'Peso', options: FONT_WEIGHTS },
        { type: 'select', key: 'caption_text_align', label: 'Allineamento', options: TEXT_ALIGNS },
        { type: 'select', key: 'caption_text_transform', label: 'Trasformazione', options: TEXT_TRANSFORMS },
        { type: 'slider', key: 'caption_letter_spacing', label: 'Spaziatura lettere', min: 0, max: 3, step: 0.1, unit: 'px' },
      ]},
      { category: 'Spaziatura', fields: [
        { type: 'slider', key: 'caption_padding', label: 'Padding', min: 0, max: 30, step: 2, unit: 'px' },
        { type: 'slider', key: 'caption_margin_bottom', label: 'Margine sotto', min: 0, max: 30, step: 2, unit: 'px' },
      ]},
    ];

    case 'link': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'link_color', label: 'Colore' },
      ]},
      { category: 'Testo', fields: [
        { type: 'select', key: 'link_decoration', label: 'Decorazione', options: [
          { value: 'underline', label: 'Sottolineato' }, { value: 'none', label: 'Nessuna' },
        ]},
        { type: 'select', key: 'link_font_weight', label: 'Peso', options: FONT_WEIGHTS, inheritLabel: 'Ereditato' },
        { type: 'slider', key: 'link_font_size', label: 'Dimensione', min: 0, max: 24, step: 1, unit: 'px', zeroLabel: ' (eredita)' },
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
        { type: 'select', key: 'border_style', label: 'Stile bordo', options: [
          { value: 'solid', label: 'Continuo' }, { value: 'dashed', label: 'Tratteggiato' },
          { value: 'dotted', label: 'Puntinato' }, { value: 'none', label: 'Nessuno' },
        ]},
        { type: 'slider', key: 'border_width', label: 'Spessore bordo', min: 0, max: 4, step: 1, unit: 'px' },
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
    default: return [];
  }
}

// ── UI element zone field definitions ──

const BORDER_STYLES = [
  { value: 'solid', label: 'Continuo' }, { value: 'dashed', label: 'Tratteggiato' },
  { value: 'dotted', label: 'Puntinato' }, { value: 'none', label: 'Nessuno' },
];

function fieldsForUiZone(zone: string): CategoryGroup[] {
  switch (zone) {
    case 'btn': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'btn_bg_color', label: 'Sfondo' },
        { type: 'color', key: 'btn_text_color', label: 'Testo' },
        { type: 'color', key: 'btn_hover_bg_color', label: 'Sfondo hover' },
        { type: 'color', key: 'btn_hover_text_color', label: 'Testo hover' },
      ]},
      { category: 'Forma', fields: [
        { type: 'slider', key: 'btn_border_radius', label: 'Bordo arrotondato', min: 0, max: 20, step: 1, unit: 'px' },
        { type: 'slider', key: 'btn_padding_v', label: 'Padding V', min: 2, max: 20, step: 1, unit: 'px' },
        { type: 'slider', key: 'btn_padding_h', label: 'Padding H', min: 4, max: 32, step: 1, unit: 'px' },
        { type: 'color', key: 'btn_border_color', label: 'Colore bordo' },
        { type: 'slider', key: 'btn_border_width', label: 'Spessore bordo', min: 0, max: 4, step: 1, unit: 'px' },
      ]},
      { category: 'Testo', fields: [
        { type: 'slider', key: 'btn_font_size', label: 'Dimensione', min: 8, max: 20, step: 1, unit: 'px' },
        { type: 'select', key: 'btn_font_weight', label: 'Peso', options: FONT_WEIGHTS },
        { type: 'select', key: 'btn_text_transform', label: 'Trasformazione', options: TEXT_TRANSFORMS },
      ]},
      { category: 'Effetti', fields: [
        { type: 'select', key: 'btn_shadow', label: 'Ombra', options: [
          { value: 'none', label: 'Nessuna' }, { value: 'sm', label: 'Leggera' },
          { value: 'md', label: 'Media' }, { value: 'lg', label: 'Forte' },
        ]},
      ]},
    ];
    case 'btn-secondary': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'btn_secondary_bg_color', label: 'Sfondo' },
        { type: 'color', key: 'btn_secondary_text_color', label: 'Testo' },
        { type: 'color', key: 'btn_secondary_border_color', label: 'Bordo' },
        { type: 'color', key: 'btn_secondary_hover_bg_color', label: 'Sfondo hover' },
      ]},
    ];
    case 'input': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'input_bg_color', label: 'Sfondo' },
        { type: 'color', key: 'input_text_color', label: 'Testo' },
        { type: 'color', key: 'input_border_color', label: 'Bordo' },
        { type: 'color', key: 'input_placeholder_color', label: 'Placeholder' },
        { type: 'color', key: 'input_focus_border_color', label: 'Bordo focus' },
        { type: 'color', key: 'input_focus_ring_color', label: 'Anello focus' },
      ]},
      { category: 'Forma', fields: [
        { type: 'slider', key: 'input_border_radius', label: 'Bordo arrotondato', min: 0, max: 16, step: 1, unit: 'px' },
        { type: 'slider', key: 'input_border_width', label: 'Spessore bordo', min: 0, max: 4, step: 1, unit: 'px' },
        { type: 'slider', key: 'input_padding_v', label: 'Padding V', min: 2, max: 16, step: 1, unit: 'px' },
        { type: 'slider', key: 'input_padding_h', label: 'Padding H', min: 4, max: 20, step: 1, unit: 'px' },
        { type: 'slider', key: 'input_font_size', label: 'Dimensione font', min: 8, max: 20, step: 1, unit: 'px' },
      ]},
      { category: 'Slider / Range', fields: [
        { type: 'color', key: 'slider_track_color', label: 'Colore traccia' },
        { type: 'color', key: 'slider_thumb_color', label: 'Colore cursore' },
        { type: 'slider', key: 'slider_track_height', label: 'Altezza traccia', min: 1, max: 12, step: 1, unit: 'px' },
      ]},
    ];
    case 'select': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'select_bg_color', label: 'Sfondo' },
        { type: 'color', key: 'select_text_color', label: 'Testo' },
        { type: 'color', key: 'select_border_color', label: 'Bordo' },
      ]},
      { category: 'Forma', fields: [
        { type: 'slider', key: 'select_border_radius', label: 'Bordo arrotondato', min: 0, max: 16, step: 1, unit: 'px' },
      ]},
    ];
    case 'badge': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'badge_bg_color', label: 'Sfondo' },
        { type: 'color', key: 'badge_text_color', label: 'Testo' },
      ]},
      { category: 'Forma', fields: [
        { type: 'slider', key: 'badge_border_radius', label: 'Bordo arrotondato', min: 0, max: 20, step: 1, unit: 'px' },
        { type: 'slider', key: 'badge_padding_v', label: 'Padding V', min: 0, max: 12, step: 1, unit: 'px' },
        { type: 'slider', key: 'badge_padding_h', label: 'Padding H', min: 0, max: 20, step: 1, unit: 'px' },
        { type: 'slider', key: 'badge_font_size', label: 'Dimensione', min: 8, max: 16, step: 1, unit: 'px' },
        { type: 'select', key: 'badge_font_weight', label: 'Peso', options: FONT_WEIGHTS },
      ]},
    ];
    case 'card': return [
      { category: 'Colori', fields: [
        { type: 'color', key: 'card_bg_color', label: 'Sfondo' },
        { type: 'color', key: 'card_border_color', label: 'Bordo' },
        { type: 'color', key: 'card_header_color', label: 'Colore titolo' },
      ]},
      { category: 'Forma', fields: [
        { type: 'slider', key: 'card_border_radius', label: 'Bordo arrotondato', min: 0, max: 24, step: 1, unit: 'px' },
        { type: 'slider', key: 'card_padding', label: 'Padding', min: 4, max: 32, step: 2, unit: 'px' },
        { type: 'select', key: 'card_shadow', label: 'Ombra', options: [
          { value: 'none', label: 'Nessuna' }, { value: 'sm', label: 'Leggera' },
          { value: 'md', label: 'Media' }, { value: 'lg', label: 'Forte' },
        ]},
      ]},
      { category: 'Titolo card', fields: [
        { type: 'slider', key: 'card_header_font_size', label: 'Dimensione', min: 10, max: 24, step: 1, unit: 'px' },
        { type: 'select', key: 'card_header_font_weight', label: 'Peso', options: FONT_WEIGHTS },
      ]},
    ];
    case 'divider': return [
      { category: 'Stile', fields: [
        { type: 'color', key: 'divider_color', label: 'Colore' },
        { type: 'slider', key: 'divider_width', label: 'Spessore', min: 1, max: 6, step: 1, unit: 'px' },
        { type: 'select', key: 'divider_style', label: 'Stile', options: BORDER_STYLES },
      ]},
    ];
    case 'list': return [
      { category: 'Stile', fields: [
        { type: 'color', key: 'list_marker_color', label: 'Colore marcatore' },
        { type: 'slider', key: 'list_item_spacing', label: 'Spaziatura', min: 0, max: 16, step: 1, unit: 'px' },
      ]},
    ];
    default: return [];
  }
}

/** Zones in display order for "show all" mode */
const ALL_ZONES: Exclude<HtmlInspectorZone, null>[] = [
  'body', 'th', 'td', 'first-col', 'table', 'tr', 'heading', 'caption', 'link', 'value-color',
];

const ALL_UI_ZONES: Exclude<HtmlInspectorZone, null>[] = [
  'btn', 'btn-secondary', 'input', 'select', 'badge', 'card', 'divider', 'list',
];

// ── Props ──

interface HtmlStyleEditorProps {
  overrides: HtmlStyleOverrides;
  onChange: (overrides: HtmlStyleOverrides) => void;
  selectedZone?: HtmlInspectorZone;
  elementInfo?: string;
  onClearZone?: () => void;
  openRouterConfig?: { apiKey: string; model: string };
  // ── Inheritance support ──
  activeStyleHtml?: Partial<HtmlStyleOverrides>;
  activeStyleUi?: Partial<UiElementsOverrides>;
  overriddenHtmlKeys?: Set<string>;
  overriddenUiKeys?: Set<string>;
  onToggleInheritHtml?: (key: string) => void;
  onToggleInheritUi?: (key: string) => void;
  // ── UI element overrides ──
  uiOverrides?: Partial<UiElementsOverrides>;
  onUiChange?: (overrides: Partial<UiElementsOverrides>) => void;
}

export default function HtmlStyleEditor({
  overrides, onChange, selectedZone, elementInfo, onClearZone, openRouterConfig,
  activeStyleHtml, activeStyleUi, overriddenHtmlKeys, overriddenUiKeys,
  onToggleInheritHtml, onToggleInheritUi,
  uiOverrides, onUiChange,
}: HtmlStyleEditorProps) {
  const [showAll, setShowAll] = useState(false);
  const [savedPresets, setSavedPresets] = useState<SavedHtmlStylePreset[]>([]);
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);
  const [saveDropdownOpen, setSaveDropdownOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState('');
  const presetDropdownRef = useRef<HTMLDivElement>(null);
  const saveDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch saved presets on mount
  useEffect(() => {
    getHtmlStylePresetsAction().then(r => {
      if (r.presets) setSavedPresets(r.presets);
    });
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (presetDropdownRef.current && !presetDropdownRef.current.contains(e.target as Node)) {
        setPresetDropdownOpen(false);
      }
      if (saveDropdownRef.current && !saveDropdownRef.current.contains(e.target as Node)) {
        setSaveDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Reset showAll when a zone is selected via inspector
  useEffect(() => {
    if (selectedZone) setShowAll(false);
  }, [selectedZone]);

  const handleSavePreset = async () => {
    if (!saveName.trim()) return;
    setIsSaving(true);
    const res = await saveHtmlStylePresetAction(saveName.trim(), '', overrides);
    if (res.success && res.preset) {
      setSavedPresets(prev => [...prev, res.preset!]);
      setSaveName('');
      setSaveDropdownOpen(false);
    }
    setIsSaving(false);
  };

  const handleDeletePreset = async (id: string) => {
    const res = await deleteHtmlStylePresetAction(id);
    if (res.success) {
      setSavedPresets(prev => prev.filter(p => p.id !== id));
    }
  };

  const applyPreset = (presetOverrides: Partial<HtmlStyleOverrides>) => {
    onChange({ ...presetOverrides } as HtmlStyleOverrides);
    setPresetDropdownOpen(false);
  };

  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setIsScraping(true);
    setScrapeError('');
    try {
      // Key resolved server-side from DB — client no longer passes it
      const res = await scrapeWebsiteStyleAction(scrapeUrl.trim());
      if (res.overrides) {
        // Unwrap nested AI response if AI returned { overrides: {...} } or similar wrapper
        let finalOverrides = res.overrides as any;
        if (finalOverrides.overrides && typeof finalOverrides.overrides === 'object') {
          finalOverrides = finalOverrides.overrides;
        }
        // Apply the scraped style
        onChange({ ...finalOverrides } as HtmlStyleOverrides);
        // Auto-save as a preset using domain name
        try {
          const domain = new URL(scrapeUrl.trim()).hostname.replace(/^www\./, '');
          const saveRes = await saveHtmlStylePresetAction(domain, `Stile estratto da ${scrapeUrl.trim()}`, finalOverrides);
          if (saveRes.success && saveRes.preset) {
            setSavedPresets(prev => [...prev, saveRes.preset!]);
          }
        } catch { /* save failure is non-critical */ }
        setScrapeUrl('');
      } else if (res.error) {
        setScrapeError(res.error);
      }
    } catch (err: any) {
      setScrapeError(err?.message || 'Errore imprevisto durante lo scraping');
    }
    setIsScraping(false);
  };

  const set = useCallback((key: string, value: any) => {
    onChange({ ...overrides, [key]: value });
  }, [overrides, onChange]);

  const reset = useCallback((key: string) => {
    const next = { ...overrides };
    delete (next as any)[key];
    onChange(next);
  }, [overrides, onChange]);

  const resolve = useCallback((key: string): any => {
    return (overrides as any)[key] !== undefined ? (overrides as any)[key] : (HTML_STYLE_DEFAULTS as any)[key];
  }, [overrides]);

  // ── UI element set/reset/resolve ──
  const setUi = useCallback((key: string, value: any) => {
    if (!onUiChange) return;
    onUiChange({ ...uiOverrides, [key]: value });
  }, [uiOverrides, onUiChange]);

  const resetUi = useCallback((key: string) => {
    if (!onUiChange) return;
    const next = { ...uiOverrides };
    delete (next as any)[key];
    onUiChange(next);
  }, [uiOverrides, onUiChange]);

  const resolveUi = useCallback((key: string): any => {
    const nodeVal = uiOverrides ? (uiOverrides as any)[key] : undefined;
    if (nodeVal !== undefined) return nodeVal;
    if (activeStyleUi && (activeStyleUi as any)[key] !== undefined) return (activeStyleUi as any)[key];
    return (UI_ELEMENTS_DEFAULTS as any)[key];
  }, [uiOverrides, activeStyleUi]);

  // Detect if current zone is a UI zone
  const currentIsUi = selectedZone ? isUiZone(selectedZone) : false;

  // ── Render a single field (handles both HTML and UI zones) ──
  const renderField = useCallback((field: FieldDef, forUi = false) => {
    const fieldResolve = forUi ? resolveUi : resolve;
    const fieldSet = forUi ? setUi : set;
    const fieldReset = forUi ? resetUi : reset;
    const isOverridden = forUi
      ? (overriddenUiKeys?.has(field.key) ?? false)
      : (overriddenHtmlKeys?.has(field.key) ?? false);
    const onToggle = forUi ? onToggleInheritUi : onToggleInheritHtml;
    const hasInheritance = !!onToggle;

    // Inheritance badge (small link icon)
    const inheritBadge = hasInheritance ? (
      <button
        onClick={() => onToggle?.(field.key)}
        className={`p-0.5 rounded transition-colors ${isOverridden ? 'text-violet-500 hover:text-violet-700' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
        title={isOverridden ? 'Override locale — clicca per ereditare' : 'Ereditato da stile globale — clicca per sovrascrivere'}
      >
        {isOverridden ? <Unlink2 className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
      </button>
    ) : null;

    const wrapperClass = hasInheritance && !isOverridden ? 'opacity-60' : '';

    switch (field.type) {
      case 'color': {
        const val = fieldResolve(field.key) as string;
        const display = val || (field.fallbackKey ? fieldResolve(field.fallbackKey) as string : '#ffffff');
        return (
          <div key={field.key} className={`flex items-center gap-1 ${wrapperClass}`}>
            <div className="flex-1">
              <ColorField
                label={field.label}
                value={display}
                onChange={v => fieldSet(field.key, v)}
                onReset={hasInheritance ? undefined : () => fieldReset(field.key)}
              />
            </div>
            {inheritBadge}
          </div>
        );
      }
      case 'slider': {
        const val = fieldResolve(field.key) as number;
        const unit = (field.zeroLabel && val === 0) ? field.zeroLabel : (field.unit || '');
        return (
          <div key={field.key} className={wrapperClass}>
            <div className="flex items-center gap-1">
              <div className="flex-1">
                <SliderField
                  label={field.label}
                  value={val}
                  min={field.min} max={field.max} step={field.step}
                  onChange={v => fieldSet(field.key, v)}
                  onReset={hasInheritance ? undefined : () => fieldReset(field.key)}
                  unit={unit}
                />
              </div>
              {inheritBadge}
            </div>
          </div>
        );
      }
      case 'select': {
        const raw = fieldResolve(field.key) as string;
        const val = field.inheritLabel ? (raw || '__inherit__') : raw;
        const opts = field.inheritLabel
          ? [{ value: '__inherit__', label: field.inheritLabel }, ...field.options]
          : field.options;
        return (
          <div key={field.key} className={`flex items-center gap-1 ${wrapperClass}`}>
            <div className="flex-1">
              <SelectField
                label={field.label}
                value={val}
                options={opts}
                onChange={v => fieldSet(field.key, field.inheritLabel && v === '__inherit__' ? '' : v)}
              />
            </div>
            {inheritBadge}
          </div>
        );
      }
      case 'switch': {
        const checked = fieldResolve(field.key) as boolean;
        return (
          <div key={field.key} className={`space-y-2 ${wrapperClass}`}>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">{field.label}</Label>
              <div className="flex items-center gap-1">
                <Switch checked={checked} onCheckedChange={v => fieldSet(field.key, v)} />
                {inheritBadge}
              </div>
            </div>
            {field.colorKey && checked && (
              <ColorField
                label={field.colorLabel || 'Colore'}
                value={fieldResolve(field.colorKey) as string}
                onChange={v => fieldSet(field.colorKey!, v)}
                onReset={hasInheritance ? undefined : () => fieldReset(field.colorKey!)}
              />
            )}
          </div>
        );
      }
    }
  }, [resolve, set, reset, resolveUi, setUi, resetUi, overriddenHtmlKeys, overriddenUiKeys, onToggleInheritHtml, onToggleInheritUi]);

  // ── Render category groups ──
  const renderGroups = useCallback((groups: CategoryGroup[], forUi = false) => (
    <>
      {groups.map(g => (
        <div key={g.category}>
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-1.5 border-b pb-1">
            {g.category}
          </div>
          <div className="space-y-2.5">
            {g.fields.map(f => renderField(f, forUi))}
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

      {/* ════════════════════════════════════════════════════════ */}
      {/* ── ZONE-SELECTED VIEW: only zone controls ── */}
      {/* ════════════════════════════════════════════════════════ */}
      {selectedZone ? (
        <>
          {/* Zone badge with close / "show all" */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-[11px] text-violet-700 dark:text-violet-300">
            <span className="font-mono text-[10px] bg-violet-100 dark:bg-violet-900 px-1 rounded">
              {elementInfo || selectedZone}
            </span>
            <span className="flex-1 text-violet-500 dark:text-violet-400">{ZONE_LABELS[selectedZone]}</span>
            {onClearZone && (
              <button
                onClick={() => { onClearZone(); setShowAll(true); }}
                className="text-[10px] text-violet-600 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-200 whitespace-nowrap"
                title="Mostra tutte le proprietà"
              >
                Mostra tutto ›
              </button>
            )}
          </div>

          {/* Zone-specific fields ONLY */}
          {currentIsUi && uiOverrides && onUiChange
            ? renderGroups(fieldsForUiZone(selectedZone), true)
            : renderGroups(fieldsForZone(selectedZone))}
        </>
      ) : (
        <>
          {/* ════════════════════════════════════════════════════════ */}
          {/* ── GLOBAL VIEW: presets, scrape, all fields ── */}
          {/* ════════════════════════════════════════════════════════ */}

          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold">Stile HTML</span>
            <div className="flex items-center gap-2">
              {showAll && (
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

          {/* Preset selector + Save */}
          <div className="flex items-center gap-1.5">
            {/* Preset dropdown — plain div, no Portal */}
            <div ref={presetDropdownRef} className="relative flex-1">
              <button
                onClick={() => setPresetDropdownOpen(v => !v)}
                className="h-7 text-xs w-full flex items-center gap-2 border rounded-md px-2 hover:bg-muted/50 transition-colors"
              >
                <Palette className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground truncate">Preset...</span>
                {presetDropdownOpen
                  ? <ChevronUp className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                  : <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />}
              </button>
              {presetDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 w-72 bg-popover border rounded-md shadow-md z-50 p-1 max-h-[320px] overflow-y-auto">
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Built-in</div>
                  {HTML_STYLE_PRESETS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p.overrides)}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-xs transition-colors"
                    >
                      <div className="font-medium">{p.label}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight">{p.description}</div>
                    </button>
                  ))}
                  {savedPresets.length > 0 && (
                    <>
                      <Separator className="my-1" />
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Bookmark className="h-3 w-3" /> Salvati
                      </div>
                      {savedPresets.map(p => (
                        <div key={p.id} className="flex items-center">
                          <button
                            onClick={() => applyPreset(p.overrides)}
                            className="flex-1 text-left px-2 py-1.5 rounded hover:bg-muted text-xs transition-colors min-w-0"
                          >
                            <div className="font-medium truncate">{p.label}</div>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.id); }}
                            className="p-1 rounded hover:bg-destructive/10 shrink-0"
                            title="Elimina preset"
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Save dropdown — plain div, no Portal */}
            <div ref={saveDropdownRef} className="relative shrink-0">
              <button
                onClick={() => setSaveDropdownOpen(v => !v)}
                className="h-7 px-2 border rounded-md hover:bg-muted/50 transition-colors flex items-center gap-1 text-xs"
                title="Salva stile corrente"
              >
                <Save className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {saveDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-popover border rounded-md shadow-md z-50 p-3 space-y-2">
                  <div className="text-xs font-medium">Salva come preset</div>
                  <Input
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    placeholder="Nome dello stile"
                    className="h-7 text-xs"
                    onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); }}
                    autoFocus
                  />
                  <button
                    onClick={handleSavePreset}
                    disabled={!saveName.trim() || isSaving}
                    className="w-full h-7 text-xs bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                  >
                    {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    {isSaving ? 'Salvataggio...' : 'Salva'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Scrape URL */}
          {openRouterConfig?.apiKey && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input
                  value={scrapeUrl}
                  onChange={e => { setScrapeUrl(e.target.value); setScrapeError(''); }}
                  placeholder="https://esempio.com"
                  className="h-7 text-xs flex-1"
                  onKeyDown={e => { if (e.key === 'Enter') handleScrape(); }}
                />
                <button
                  onClick={handleScrape}
                  disabled={isScraping || !scrapeUrl.trim()}
                  className="h-7 px-2 text-xs border rounded-md hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 shrink-0"
                >
                  {isScraping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
                  {isScraping ? 'Scraping...' : 'Scrape'}
                </button>
              </div>
              {scrapeError && (
                <div className="text-[10px] text-destructive px-1">{scrapeError}</div>
              )}
            </div>
          )}

          {/* Content: all fields or hint */}
          {showAll ? (
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
              {/* UI element zones */}
              {uiOverrides && onUiChange && ALL_UI_ZONES.map(zone => {
                const groups = fieldsForUiZone(zone);
                if (groups.length === 0) return null;
                return (
                  <div key={zone}>
                    <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-4 mb-1 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500/50 inline-block" />
                      {ZONE_LABELS[zone]}
                    </div>
                    {renderGroups(groups, true)}
                  </div>
                );
              })}
            </>
          ) : (
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

          {/* Custom CSS */}
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
        </>
      )}
    </div>
  );
}
