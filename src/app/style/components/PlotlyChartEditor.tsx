'use client';

import React from 'react';
import { ColorField, SliderField, SelectField, SwitchField, Section, FONTS } from './shared-fields';
import type { PlotlyStyleOverrides } from '@/lib/plotly-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';

interface PlotlyChartEditorProps {
  overrides: Partial<PlotlyStyleOverrides>;
  onChange: (overrides: Partial<PlotlyStyleOverrides>) => void;
}

const DEFAULT_COLORWAY = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0891b2', '#65a30d'];

const GRID_DASH_OPTIONS = [
  { value: 'solid', label: 'Solida' },
  { value: 'dash', label: 'Tratteggiata' },
  { value: 'dot', label: 'Punteggiata' },
  { value: 'dashdot', label: 'Tratto-punto' },
];

const LEGEND_ORIENTATION_OPTIONS = [
  { value: 'v', label: 'Verticale' },
  { value: 'h', label: 'Orizzontale' },
];

export default function PlotlyChartEditor({ overrides, onChange }: PlotlyChartEditorProps) {
  function val<K extends keyof PlotlyStyleOverrides>(key: K): NonNullable<PlotlyStyleOverrides[K]> {
    if (key === 'paper_bgcolor') return (overrides.paper_bgcolor ?? '#ffffff') as any;
    if (key === 'plot_bgcolor') return (overrides.plot_bgcolor ?? '#ffffff') as any;
    if (key === 'font_family') return (overrides.font_family ?? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif') as any;
    if (key === 'font_size') return (overrides.font_size ?? 12) as any;
    if (key === 'font_color') return (overrides.font_color ?? '#374151') as any;
    if (key === 'title_font_size') return (overrides.title_font_size ?? 16) as any;
    if (key === 'title_font_color') return (overrides.title_font_color ?? '#1f2937') as any;
    if (key === 'margin_t') return (overrides.margin_t ?? 40) as any;
    if (key === 'margin_b') return (overrides.margin_b ?? 40) as any;
    if (key === 'margin_l') return (overrides.margin_l ?? 50) as any;
    if (key === 'margin_r') return (overrides.margin_r ?? 20) as any;
    if (key === 'showlegend') return (overrides.showlegend ?? true) as any;
    if (key === 'legend_orientation') return (overrides.legend_orientation ?? 'v') as any;
    if (key === 'legend_x') return (overrides.legend_x ?? 1.02) as any;
    if (key === 'legend_y') return (overrides.legend_y ?? 1) as any;
    if (key === 'xaxis_showgrid') return (overrides.xaxis_showgrid ?? true) as any;
    if (key === 'yaxis_showgrid') return (overrides.yaxis_showgrid ?? true) as any;
    if (key === 'xaxis_gridcolor') return (overrides.xaxis_gridcolor ?? '#e5e7eb') as any;
    if (key === 'yaxis_gridcolor') return (overrides.yaxis_gridcolor ?? '#e5e7eb') as any;
    if (key === 'xaxis_griddash') return (overrides.xaxis_griddash ?? 'solid') as any;
    if (key === 'yaxis_griddash') return (overrides.yaxis_griddash ?? 'solid') as any;
    if (key === 'xaxis_title_font_size') return (overrides.xaxis_title_font_size ?? 12) as any;
    if (key === 'yaxis_title_font_size') return (overrides.yaxis_title_font_size ?? 12) as any;
    if (key === 'xaxis_tickfont_size') return (overrides.xaxis_tickfont_size ?? 10) as any;
    if (key === 'yaxis_tickfont_size') return (overrides.yaxis_tickfont_size ?? 10) as any;
    if (key === 'colorway') return (overrides.colorway ?? DEFAULT_COLORWAY) as any;
    if (key === 'height') return (overrides.height ?? 400) as any;
    return overrides[key] as any;
  }

  function set<K extends keyof PlotlyStyleOverrides>(key: K, value: PlotlyStyleOverrides[K]) {
    onChange({ ...overrides, [key]: value });
  }

  const colorway = val('colorway') as string[];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-1">
        {/* ── 1. Sfondi ── */}
        <Section title="Sfondi" defaultOpen>
          <ColorField label="Sfondo carta" value={val('paper_bgcolor') as string} onChange={v => set('paper_bgcolor', v)} />
          <ColorField label="Sfondo grafico" value={val('plot_bgcolor') as string} onChange={v => set('plot_bgcolor', v)} />
        </Section>

        {/* ── 2. Tipografia ── */}
        <Section title="Tipografia" defaultOpen>
          <SelectField label="Font famiglia" value={val('font_family') as string} options={FONTS} onChange={v => set('font_family', v)} />
          <SliderField label="Dimensione font" value={val('font_size') as number} min={8} max={18} step={1} onChange={v => set('font_size', v)} />
          <ColorField label="Colore font" value={val('font_color') as string} onChange={v => set('font_color', v)} />
          <SliderField label="Dimensione titolo" value={val('title_font_size') as number} min={10} max={28} step={1} onChange={v => set('title_font_size', v)} />
          <ColorField label="Colore titolo" value={val('title_font_color') as string} onChange={v => set('title_font_color', v)} />
        </Section>

        {/* ── 3. Palette Colori ── */}
        <Section title="Palette Colori" defaultOpen>
          <div className="space-y-2">
            <Label className="text-[11px]">Colori serie dati</Label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {colorway.map((color, i) => (
                <div key={i} className="relative group">
                  <input
                    type="color"
                    value={color}
                    onChange={e => {
                      const next = [...colorway];
                      next[i] = e.target.value;
                      set('colorway', next);
                    }}
                    className="w-7 h-7 rounded border cursor-pointer bg-transparent p-0"
                  />
                  {colorway.length > 2 && (
                    <button
                      onClick={() => {
                        const next = colorway.filter((_, idx) => idx !== i);
                        set('colorway', next);
                      }}
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Rimuovi colore"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
              {colorway.length < 8 && (
                <Button
                  variant="outline"
                  size="icon"
                  className="w-7 h-7"
                  onClick={() => set('colorway', [...colorway, '#6b7280'])}
                  title="Aggiungi colore"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </Section>

        {/* ── 4. Margini ── */}
        <Section title="Margini" defaultOpen={false}>
          <SliderField label="Margine superiore" value={val('margin_t') as number} min={0} max={100} step={1} onChange={v => set('margin_t', v)} />
          <SliderField label="Margine inferiore" value={val('margin_b') as number} min={0} max={100} step={1} onChange={v => set('margin_b', v)} />
          <SliderField label="Margine sinistro" value={val('margin_l') as number} min={0} max={100} step={1} onChange={v => set('margin_l', v)} />
          <SliderField label="Margine destro" value={val('margin_r') as number} min={0} max={100} step={1} onChange={v => set('margin_r', v)} />
        </Section>

        {/* ── 5. Legenda ── */}
        <Section title="Legenda" defaultOpen={false}>
          <SwitchField label="Mostra legenda" checked={val('showlegend') as boolean} onChange={v => set('showlegend', v)} />
          <SelectField label="Orientamento" value={val('legend_orientation') as string} options={LEGEND_ORIENTATION_OPTIONS} onChange={v => set('legend_orientation', v as any)} />
          <SliderField label="Posizione X" value={val('legend_x') as number} min={-0.5} max={1.5} step={0.05} onChange={v => set('legend_x', v)} />
          <SliderField label="Posizione Y" value={val('legend_y') as number} min={-0.5} max={1.5} step={0.05} onChange={v => set('legend_y', v)} />
        </Section>

        {/* ── 6. Griglia Assi ── */}
        <Section title="Griglia Assi" defaultOpen={false}>
          <SwitchField label="Griglia asse X" checked={val('xaxis_showgrid') as boolean} onChange={v => set('xaxis_showgrid', v)} />
          <SwitchField label="Griglia asse Y" checked={val('yaxis_showgrid') as boolean} onChange={v => set('yaxis_showgrid', v)} />
          <ColorField label="Colore griglia X" value={val('xaxis_gridcolor') as string} onChange={v => set('xaxis_gridcolor', v)} />
          <ColorField label="Colore griglia Y" value={val('yaxis_gridcolor') as string} onChange={v => set('yaxis_gridcolor', v)} />
          <SelectField label="Stile griglia X" value={val('xaxis_griddash') as string} options={GRID_DASH_OPTIONS} onChange={v => set('xaxis_griddash', v as any)} />
          <SelectField label="Stile griglia Y" value={val('yaxis_griddash') as string} options={GRID_DASH_OPTIONS} onChange={v => set('yaxis_griddash', v as any)} />
        </Section>

        {/* ── 7. Font Assi ── */}
        <Section title="Font Assi" defaultOpen={false}>
          <SliderField label="Font titolo asse X" value={val('xaxis_title_font_size') as number} min={8} max={18} step={1} onChange={v => set('xaxis_title_font_size', v)} />
          <SliderField label="Font titolo asse Y" value={val('yaxis_title_font_size') as number} min={8} max={18} step={1} onChange={v => set('yaxis_title_font_size', v)} />
          <SliderField label="Font tick asse X" value={val('xaxis_tickfont_size') as number} min={8} max={14} step={1} onChange={v => set('xaxis_tickfont_size', v)} />
          <SliderField label="Font tick asse Y" value={val('yaxis_tickfont_size') as number} min={8} max={14} step={1} onChange={v => set('yaxis_tickfont_size', v)} />
        </Section>

        {/* ── 8. Dimensioni ── */}
        <Section title="Dimensioni" defaultOpen={false}>
          <SliderField label="Altezza" value={val('height') as number} min={200} max={800} step={10} onChange={v => set('height', v)} unit="px" />
        </Section>
      </div>
    </ScrollArea>
  );
}
