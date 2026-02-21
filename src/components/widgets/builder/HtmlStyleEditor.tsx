'use client';

import React, { useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, RotateCcw } from 'lucide-react';

// Re-export from shared utility so existing imports keep working
export { applyHtmlStyleOverrides, generateHtmlStyleCss, HTML_STYLE_DEFAULTS } from '@/lib/html-style-utils';
export type { HtmlStyleOverrides, HtmlInspectorZone } from '@/lib/html-style-utils';
import type { HtmlStyleOverrides, HtmlInspectorZone } from '@/lib/html-style-utils';
import { HTML_STYLE_DEFAULTS, ZONE_LABELS, ZONE_SECTION_MAP } from '@/lib/html-style-utils';

// ── Section wrapper (same as PlotlyStyleEditor) ──
function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-md">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold hover:bg-muted/50 transition-colors">
        {title}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 space-y-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Color input (same as PlotlyStyleEditor) ──
function ColorField({ label, value, onChange, onReset }: { label: string; value?: string; onChange: (v: string) => void; onReset?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-[11px] flex-1 min-w-0 truncate">{label}</Label>
      <input
        type="color"
        value={value || '#ffffff'}
        onChange={e => onChange(e.target.value)}
        className="w-7 h-7 rounded border cursor-pointer bg-transparent p-0"
      />
      {onReset && (
        <button onClick={onReset} className="p-0.5 rounded hover:bg-muted" title="Reset">
          <RotateCcw className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

// ── Slider field (same as PlotlyStyleEditor) ──
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

// ── Select field helper ──
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

// ── Props ──
interface HtmlStyleEditorProps {
  overrides: HtmlStyleOverrides;
  onChange: (overrides: HtmlStyleOverrides) => void;
  selectedZone?: HtmlInspectorZone;
  /** e.g. "span.positive", "td", "div.detail-item" */
  elementInfo?: string;
  onClearZone?: () => void;
}

export default function HtmlStyleEditor({ overrides, onChange, selectedZone, elementInfo, onClearZone }: HtmlStyleEditorProps) {
  const set = useCallback((key: keyof HtmlStyleOverrides, value: any) => {
    onChange({ ...overrides, [key]: value });
  }, [overrides, onChange]);

  const reset = useCallback((key: keyof HtmlStyleOverrides) => {
    const next = { ...overrides };
    delete next[key];
    onChange(next);
  }, [overrides, onChange]);

  const resolve = (key: keyof HtmlStyleOverrides) => {
    return overrides[key] !== undefined ? overrides[key] : (HTML_STYLE_DEFAULTS as any)[key];
  };

  const FONT_WEIGHT_OPTIONS = [
    { value: '400', label: 'Normale' },
    { value: '500', label: 'Medio' },
    { value: '600', label: 'Semi-Bold' },
    { value: '700', label: 'Grassetto' },
    { value: '800', label: 'Extra Bold' },
  ];

  const TEXT_ALIGN_OPTIONS = [
    { value: 'left', label: 'Sinistra' },
    { value: 'center', label: 'Centro' },
    { value: 'right', label: 'Destra' },
  ];

  const VERTICAL_ALIGN_OPTIONS = [
    { value: 'top', label: 'Alto' },
    { value: 'middle', label: 'Centro' },
    { value: 'bottom', label: 'Basso' },
  ];

  const TEXT_TRANSFORM_OPTIONS = [
    { value: 'none', label: 'Nessuna' },
    { value: 'uppercase', label: 'MAIUSCOLO' },
    { value: 'capitalize', label: 'Iniziale Maiuscola' },
    { value: 'lowercase', label: 'minuscolo' },
  ];

  // Inspector zone filter
  const showSection = (title: string): boolean => {
    if (!selectedZone) return true;
    return ZONE_SECTION_MAP[selectedZone]?.includes(title) ?? false;
  };

  const FONT_FAMILIES = [
    { value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', label: 'Sistema (default)' },
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

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold">
          {selectedZone ? ZONE_LABELS[selectedZone] : 'Stile HTML'}
        </span>
        <div className="flex items-center gap-2">
          {selectedZone && onClearZone && (
            <button
              onClick={onClearZone}
              className="text-[10px] text-violet-600 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-200"
            >
              Mostra tutto
            </button>
          )}
          <button
            onClick={() => onChange({})}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" /> Ripristina tutto
          </button>
        </div>
      </div>

      {selectedZone && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-[11px] text-violet-700 dark:text-violet-300 mb-1">
          <span className="font-mono text-[10px] bg-violet-100 dark:bg-violet-900 px-1 rounded">
            {elementInfo || selectedZone}
          </span>
          <span className="text-violet-500 dark:text-violet-400">{ZONE_LABELS[selectedZone]}</span>
        </div>
      )}

      {!selectedZone && (
        <p className="text-[10px] text-muted-foreground italic mb-1">
          Clicca su un elemento per ispezionarlo
        </p>
      )}

      {/* ══════ Pagina / Contenitore ══════ */}
      {showSection('Pagina / Contenitore') && <Section title="Pagina / Contenitore">
        <ColorField
          label="Sfondo pagina"
          value={resolve('page_bg_color') as string}
          onChange={v => set('page_bg_color', v)}
          onReset={() => reset('page_bg_color')}
        />
        <SliderField
          label="Padding pagina"
          value={resolve('page_padding') as number}
          min={0} max={40} step={2}
          onChange={v => set('page_padding', v)}
          onReset={() => reset('page_padding')}
          unit="px"
        />
        <SliderField
          label="Larghezza max contenitore"
          value={resolve('container_max_width') as number}
          min={0} max={1600} step={50}
          onChange={v => set('container_max_width', v)}
          onReset={() => reset('container_max_width')}
          unit={resolve('container_max_width') === 0 ? ' (auto)' : 'px'}
        />
        <SliderField
          label="Bordo arrotondato contenitore"
          value={resolve('container_border_radius') as number}
          min={0} max={20} step={1}
          onChange={v => set('container_border_radius', v)}
          onReset={() => reset('container_border_radius')}
          unit="px"
        />
        <SelectField
          label="Ombra contenitore"
          value={resolve('container_shadow') as string}
          options={[
            { value: 'none', label: 'Nessuna' },
            { value: 'sm', label: 'Leggera' },
            { value: 'md', label: 'Media' },
            { value: 'lg', label: 'Forte' },
          ]}
          onChange={v => set('container_shadow', v)}
        />
        <SelectField
          label="Scrollbar"
          value={resolve('scrollbar_width') as string}
          options={[
            { value: 'auto', label: 'Automatica' },
            { value: 'thin', label: 'Sottile' },
            { value: 'none', label: 'Nascosta' },
          ]}
          onChange={v => set('scrollbar_width', v)}
        />
      </Section>}

      {/* ══════ Intestazione (th) ══════ */}
      {showSection('Intestazione Tabella') && <Section title="Intestazione Tabella">
        <ColorField
          label="Sfondo intestazione"
          value={resolve('header_bg_color') as string}
          onChange={v => set('header_bg_color', v)}
          onReset={() => reset('header_bg_color')}
        />
        <ColorField
          label="Gradiente fine (opzionale)"
          value={(resolve('header_bg_gradient_end') as string) || resolve('header_bg_color') as string}
          onChange={v => set('header_bg_gradient_end', v)}
          onReset={() => reset('header_bg_gradient_end')}
        />
        <ColorField
          label="Colore testo"
          value={resolve('header_text_color') as string}
          onChange={v => set('header_text_color', v)}
          onReset={() => reset('header_text_color')}
        />
        <SliderField
          label="Dimensione font"
          value={resolve('header_font_size') as number}
          min={7} max={24} step={1}
          onChange={v => set('header_font_size', v)}
          onReset={() => reset('header_font_size')}
          unit="px"
        />
        <SelectField
          label="Peso font"
          value={resolve('header_font_weight') as string}
          options={FONT_WEIGHT_OPTIONS}
          onChange={v => set('header_font_weight', v)}
        />
        <SelectField
          label="Trasformazione testo"
          value={resolve('header_text_transform') as string}
          options={TEXT_TRANSFORM_OPTIONS}
          onChange={v => set('header_text_transform', v)}
        />
        <SliderField
          label="Spaziatura lettere"
          value={resolve('header_letter_spacing') as number}
          min={0} max={3} step={0.1}
          onChange={v => set('header_letter_spacing', v)}
          onReset={() => reset('header_letter_spacing')}
          unit="px"
        />
        <SelectField
          label="Allineamento orizzontale"
          value={resolve('header_text_align') as string}
          options={TEXT_ALIGN_OPTIONS}
          onChange={v => set('header_text_align', v)}
        />
        <SelectField
          label="Allineamento verticale"
          value={resolve('header_vertical_align') as string}
          options={VERTICAL_ALIGN_OPTIONS}
          onChange={v => set('header_vertical_align', v)}
        />
        <SelectField
          label="A capo testo"
          value={resolve('header_white_space') as string}
          options={[
            { value: 'nowrap', label: 'Nessun ritorno a capo' },
            { value: 'normal', label: 'A capo automatico' },
          ]}
          onChange={v => set('header_white_space', v)}
        />
      </Section>}

      {/* ══════ Spaziatura Intestazione ══════ */}
      {showSection('Spaziatura Intestazione') && <Section title="Spaziatura Intestazione" defaultOpen={!selectedZone}>
        <SliderField
          label="Padding verticale"
          value={resolve('header_padding_v') as number}
          min={1} max={24} step={1}
          onChange={v => set('header_padding_v', v)}
          onReset={() => reset('header_padding_v')}
          unit="px"
        />
        <SliderField
          label="Padding orizzontale"
          value={resolve('header_padding_h') as number}
          min={2} max={30} step={1}
          onChange={v => set('header_padding_h', v)}
          onReset={() => reset('header_padding_h')}
          unit="px"
        />
        <SliderField
          label="Bordo inferiore (spessore)"
          value={resolve('header_border_bottom_width') as number}
          min={0} max={6} step={1}
          onChange={v => set('header_border_bottom_width', v)}
          onReset={() => reset('header_border_bottom_width')}
          unit="px"
        />
        <ColorField
          label="Colore bordo inferiore"
          value={resolve('header_border_bottom_color') as string}
          onChange={v => set('header_border_bottom_color', v)}
          onReset={() => reset('header_border_bottom_color')}
        />
      </Section>}

      {/* ══════ Corpo (td) ══════ */}
      {showSection('Corpo Tabella') && <Section title="Corpo Tabella">
        <ColorField
          label="Sfondo corpo"
          value={resolve('body_bg_color') as string}
          onChange={v => set('body_bg_color', v)}
          onReset={() => reset('body_bg_color')}
        />
        <ColorField
          label="Colore testo"
          value={resolve('body_text_color') as string}
          onChange={v => set('body_text_color', v)}
          onReset={() => reset('body_text_color')}
        />
        <SliderField
          label="Dimensione font"
          value={resolve('body_font_size') as number}
          min={8} max={20} step={1}
          onChange={v => set('body_font_size', v)}
          onReset={() => reset('body_font_size')}
          unit="px"
        />
        <SelectField
          label="Peso font"
          value={resolve('body_font_weight') as string}
          options={FONT_WEIGHT_OPTIONS}
          onChange={v => set('body_font_weight', v)}
        />
        <SliderField
          label="Altezza riga"
          value={resolve('body_line_height') as number}
          min={1} max={2.5} step={0.1}
          onChange={v => set('body_line_height', v)}
          onReset={() => reset('body_line_height')}
        />
        <SelectField
          label="Allineamento orizzontale"
          value={resolve('body_text_align') as string}
          options={TEXT_ALIGN_OPTIONS}
          onChange={v => set('body_text_align', v)}
        />
        <SelectField
          label="Allineamento verticale"
          value={resolve('body_vertical_align') as string}
          options={VERTICAL_ALIGN_OPTIONS}
          onChange={v => set('body_vertical_align', v)}
        />
        <SelectField
          label="Trasformazione testo"
          value={resolve('body_text_transform') as string}
          options={TEXT_TRANSFORM_OPTIONS}
          onChange={v => set('body_text_transform', v)}
        />
        <SliderField
          label="Spaziatura lettere"
          value={resolve('body_letter_spacing') as number}
          min={0} max={3} step={0.1}
          onChange={v => set('body_letter_spacing', v)}
          onReset={() => reset('body_letter_spacing')}
          unit="px"
        />
        <SelectField
          label="A capo testo"
          value={resolve('body_white_space') as string}
          options={[
            { value: 'normal', label: 'A capo automatico' },
            { value: 'nowrap', label: 'Nessun ritorno (riga singola)' },
          ]}
          onChange={v => set('body_white_space', v)}
        />
      </Section>}

      {/* ══════ Spaziatura Celle ══════ */}
      {showSection('Spaziatura Celle') && <Section title="Spaziatura Celle" defaultOpen={!selectedZone}>
        <SliderField
          label="Padding verticale"
          value={resolve('cell_padding_v') as number}
          min={0} max={24} step={1}
          onChange={v => set('cell_padding_v', v)}
          onReset={() => reset('cell_padding_v')}
          unit="px"
        />
        <SliderField
          label="Padding orizzontale"
          value={resolve('cell_padding_h') as number}
          min={0} max={30} step={1}
          onChange={v => set('cell_padding_h', v)}
          onReset={() => reset('cell_padding_h')}
          unit="px"
        />
        <SliderField
          label="Altezza minima riga"
          value={resolve('row_min_height') as number}
          min={0} max={60} step={2}
          onChange={v => set('row_min_height', v)}
          onReset={() => reset('row_min_height')}
          unit={resolve('row_min_height') === 0 ? ' (auto)' : 'px'}
        />
        <SelectField
          label="Testo in overflow"
          value={resolve('cell_text_overflow') as string}
          options={[
            { value: 'visible', label: 'Visibile (no taglio)' },
            { value: 'ellipsis', label: 'Troncato con ...' },
            { value: 'clip', label: 'Tagliato' },
          ]}
          onChange={v => set('cell_text_overflow', v)}
        />
        <SliderField
          label="Larghezza max cella"
          value={resolve('cell_max_width') as number}
          min={0} max={500} step={10}
          onChange={v => set('cell_max_width', v)}
          onReset={() => reset('cell_max_width')}
          unit={resolve('cell_max_width') === 0 ? ' (auto)' : 'px'}
        />
      </Section>}

      {/* ══════ Tipografia ══════ */}
      {showSection('Tipografia') && <Section title="Tipografia" defaultOpen={!selectedZone}>
        <SelectField
          label="Font famiglia"
          value={resolve('font_family') as string}
          options={FONT_FAMILIES}
          onChange={v => set('font_family', v)}
        />
      </Section>}

      {/* ══════ Bordi ══════ */}
      {showSection('Bordi') && <Section title="Bordi" defaultOpen={!selectedZone}>
        <ColorField
          label="Colore bordo generale"
          value={resolve('border_color') as string}
          onChange={v => set('border_color', v)}
          onReset={() => reset('border_color')}
        />
        <SelectField
          label="Stile bordo"
          value={resolve('border_style') as string}
          options={[
            { value: 'solid', label: 'Continuo' },
            { value: 'dashed', label: 'Tratteggiato' },
            { value: 'dotted', label: 'Puntinato' },
            { value: 'none', label: 'Nessuno' },
          ]}
          onChange={v => set('border_style', v)}
        />
        <SliderField
          label="Spessore bordo"
          value={resolve('border_width') as number}
          min={0} max={4} step={1}
          onChange={v => set('border_width', v)}
          onReset={() => reset('border_width')}
          unit="px"
        />
        <SliderField
          label="Bordo arrotondato tabella"
          value={resolve('table_border_radius') as number}
          min={0} max={16} step={1}
          onChange={v => set('table_border_radius', v)}
          onReset={() => reset('table_border_radius')}
          unit="px"
        />
        <ColorField
          label="Colore separatori riga (orizzontali)"
          value={(resolve('row_border_color') as string) || resolve('border_color') as string}
          onChange={v => set('row_border_color', v)}
          onReset={() => reset('row_border_color')}
        />
        <ColorField
          label="Colore separatori colonna (verticali)"
          value={(resolve('col_border_color') as string) || resolve('border_color') as string}
          onChange={v => set('col_border_color', v)}
          onReset={() => reset('col_border_color')}
        />
      </Section>}

      {/* ══════ Layout Tabella ══════ */}
      {showSection('Layout Tabella') && <Section title="Layout Tabella" defaultOpen={!selectedZone}>
        <SelectField
          label="Layout colonne"
          value={resolve('table_layout') as string}
          options={[
            { value: 'auto', label: 'Automatico (contenuto)' },
            { value: 'fixed', label: 'Fisso (equi-distribuite)' },
          ]}
          onChange={v => set('table_layout', v)}
        />
        <SliderField
          label="Larghezza minima colonne"
          value={resolve('min_col_width') as number}
          min={0} max={300} step={10}
          onChange={v => set('min_col_width', v)}
          onReset={() => reset('min_col_width')}
          unit={resolve('min_col_width') === 0 ? ' (auto)' : 'px'}
        />
      </Section>}

      {/* ══════ Prima Colonna ══════ */}
      {showSection('Prima Colonna') && <Section title="Prima Colonna" defaultOpen={!selectedZone}>
        <ColorField
          label="Sfondo prima colonna"
          value={(resolve('first_col_bg_color') as string) || resolve('body_bg_color') as string}
          onChange={v => set('first_col_bg_color', v)}
          onReset={() => reset('first_col_bg_color')}
        />
        <ColorField
          label="Colore testo prima colonna"
          value={(resolve('first_col_text_color') as string) || resolve('body_text_color') as string}
          onChange={v => set('first_col_text_color', v)}
          onReset={() => reset('first_col_text_color')}
        />
        <SelectField
          label="Peso font prima colonna"
          value={(resolve('first_col_font_weight') as string) || '__inherit__'}
          options={[
            { value: '__inherit__', label: 'Come il corpo' },
            ...FONT_WEIGHT_OPTIONS,
          ]}
          onChange={v => set('first_col_font_weight', v === '__inherit__' ? '' : v)}
        />
        <SliderField
          label="Larghezza minima"
          value={resolve('first_col_min_width') as number}
          min={0} max={300} step={10}
          onChange={v => set('first_col_min_width', v)}
          onReset={() => reset('first_col_min_width')}
          unit={resolve('first_col_min_width') === 0 ? ' (auto)' : 'px'}
        />
      </Section>}

      {/* ══════ Ultima Colonna ══════ */}
      {showSection('Ultima Colonna') && <Section title="Ultima Colonna" defaultOpen={!selectedZone}>
        <SelectField
          label="Allineamento ultima colonna"
          value={(resolve('last_col_text_align') as string) || '__inherit__'}
          options={[
            { value: '__inherit__', label: 'Come il corpo' },
            ...TEXT_ALIGN_OPTIONS,
          ]}
          onChange={v => set('last_col_text_align', v === '__inherit__' ? '' : v)}
        />
      </Section>}

      {/* ══════ Righe Alternate & Hover ══════ */}
      {showSection('Righe Alternate & Hover') && <Section title="Righe Alternate & Hover" defaultOpen={!selectedZone}>
        <div className="flex items-center justify-between">
          <Label className="text-[11px]">Alternanza righe</Label>
          <Switch
            checked={resolve('stripe_enabled') as boolean}
            onCheckedChange={v => set('stripe_enabled', v)}
          />
        </div>
        {resolve('stripe_enabled') && (
          <ColorField
            label="Colore righe pari"
            value={resolve('stripe_color') as string}
            onChange={v => set('stripe_color', v)}
            onReset={() => reset('stripe_color')}
          />
        )}
        <div className="flex items-center justify-between">
          <Label className="text-[11px]">Effetto hover</Label>
          <Switch
            checked={resolve('hover_enabled') as boolean}
            onCheckedChange={v => set('hover_enabled', v)}
          />
        </div>
        {resolve('hover_enabled') && (
          <ColorField
            label="Colore hover"
            value={resolve('hover_color') as string}
            onChange={v => set('hover_color', v)}
            onReset={() => reset('hover_color')}
          />
        )}
      </Section>}

      {/* ══════ Colori Valori ══════ */}
      {showSection('Colori Valori (+/-)') && <Section title="Colori Valori (+/-)" defaultOpen={!selectedZone}>
        <ColorField
          label="Colore valori positivi"
          value={resolve('positive_color') as string}
          onChange={v => set('positive_color', v)}
          onReset={() => reset('positive_color')}
        />
        <ColorField
          label="Colore valori negativi"
          value={resolve('negative_color') as string}
          onChange={v => set('negative_color', v)}
          onReset={() => reset('negative_color')}
        />
      </Section>}

      {/* ══════ Titoli & Didascalie ══════ */}
      {showSection('Titoli & Didascalie') && <Section title="Titoli & Didascalie" defaultOpen={!selectedZone}>
        <ColorField
          label="Colore titoli (h1-h3)"
          value={resolve('heading_color') as string}
          onChange={v => set('heading_color', v)}
          onReset={() => reset('heading_color')}
        />
        <SliderField
          label="Dimensione h1"
          value={resolve('heading_font_size') as number}
          min={12} max={36} step={1}
          onChange={v => set('heading_font_size', v)}
          onReset={() => reset('heading_font_size')}
          unit="px"
        />
        <SliderField
          label="Margine verticale titoli"
          value={resolve('heading_margin_v') as number}
          min={0} max={30} step={2}
          onChange={v => set('heading_margin_v', v)}
          onReset={() => reset('heading_margin_v')}
          unit="px"
        />
        <ColorField
          label="Colore didascalia"
          value={resolve('caption_color') as string}
          onChange={v => set('caption_color', v)}
          onReset={() => reset('caption_color')}
        />
        <SliderField
          label="Dimensione didascalia"
          value={resolve('caption_font_size') as number}
          min={10} max={28} step={1}
          onChange={v => set('caption_font_size', v)}
          onReset={() => reset('caption_font_size')}
          unit="px"
        />
        <ColorField
          label="Sfondo didascalia"
          value={(resolve('caption_bg_color') as string) || resolve('page_bg_color') as string}
          onChange={v => set('caption_bg_color', v)}
          onReset={() => reset('caption_bg_color')}
        />
        <SelectField
          label="Allineamento didascalia"
          value={resolve('caption_text_align') as string}
          options={TEXT_ALIGN_OPTIONS}
          onChange={v => set('caption_text_align', v)}
        />
        <SliderField
          label="Padding didascalia"
          value={resolve('caption_padding') as number}
          min={0} max={30} step={2}
          onChange={v => set('caption_padding', v)}
          onReset={() => reset('caption_padding')}
          unit="px"
        />
      </Section>}

      {/* ══════ Link ══════ */}
      {showSection('Link') && <Section title="Link" defaultOpen={!selectedZone}>
        <ColorField
          label="Colore link"
          value={resolve('link_color') as string}
          onChange={v => set('link_color', v)}
          onReset={() => reset('link_color')}
        />
        <SelectField
          label="Decorazione link"
          value={resolve('link_decoration') as string}
          options={[
            { value: 'underline', label: 'Sottolineato' },
            { value: 'none', label: 'Nessuna' },
          ]}
          onChange={v => set('link_decoration', v)}
        />
      </Section>}

      {/* ══════ CSS Personalizzato ══════ */}
      {!selectedZone && <Section title="CSS Personalizzato" defaultOpen={false}>
        <Textarea
          value={overrides.custom_css || ''}
          onChange={e => set('custom_css', e.target.value)}
          placeholder={`/* Esempi:\n.positive { color: #10b981; font-weight: 600; }\n.negative { color: #ef4444; font-weight: 600; }\nth:first-child { border-left: 3px solid #3b82f6; }\ntd:nth-child(3) { text-align: right; }\n*/`}
          className="font-mono text-[11px] min-h-[140px] resize-y"
        />
        <p className="text-[9px] text-muted-foreground">
          Il CSS personalizzato viene applicato dopo i controlli visuali e ha priorita&apos; su di essi.
        </p>
      </Section>}
    </div>
  );
}
