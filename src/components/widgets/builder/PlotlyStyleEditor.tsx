'use client';

import React, { useCallback, useState, useRef, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, RotateCcw, Palette } from 'lucide-react';

// Re-export from shared utility so existing imports keep working
export { applyPlotlyOverrides, plotlyJsonToHtml } from '@/lib/plotly-utils';
export type { PlotlyStyleOverrides } from '@/lib/plotly-utils';
import type { PlotlyStyleOverrides } from '@/lib/plotly-utils';
import { PLOTLY_STYLE_PRESETS } from '@/lib/plotly-utils';

// ── Helper: extract current value from Plotly figure for display ──
function getFromFig(fig: any, path: string, fallback: any = undefined): any {
  if (!fig) return fallback;
  const parts = path.split('.');
  let val: any = fig;
  for (const p of parts) {
    if (val == null) return fallback;
    val = val[p];
  }
  return val ?? fallback;
}

// ── Section wrapper ──
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

// ── Color input ──
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

// ── Slider field ──
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

// ── Props ──
interface PlotlyStyleEditorProps {
  /** The original Plotly figure JSON (unmodified) */
  plotlyJson: any;
  /** Current overrides */
  overrides: PlotlyStyleOverrides;
  /** Called when overrides change */
  onChange: (overrides: PlotlyStyleOverrides) => void;
}

export default function PlotlyStyleEditor({ plotlyJson, overrides, onChange }: PlotlyStyleEditorProps) {
  const layout = plotlyJson?.layout || {};

  const set = useCallback((key: keyof PlotlyStyleOverrides, value: any) => {
    onChange({ ...overrides, [key]: value });
  }, [overrides, onChange]);

  const reset = useCallback((key: keyof PlotlyStyleOverrides) => {
    const next = { ...overrides };
    delete next[key];
    onChange(next);
  }, [overrides, onChange]);

  const resolve = (key: keyof PlotlyStyleOverrides, figPath: string, fallback: any) => {
    return overrides[key] !== undefined ? overrides[key] : getFromFig(plotlyJson, figPath, fallback);
  };

  // Extract current trace colors from figure
  const figColorway = layout.colorway || layout.template?.layout?.colorway || [
    '#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3', '#FF6692', '#B6E880'
  ];
  const currentColorway = overrides.colorway || figColorway;

  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);
  const presetDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!presetDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (presetDropdownRef.current && !presetDropdownRef.current.contains(e.target as Node)) {
        setPresetDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [presetDropdownOpen]);

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold">Stile Plotly</span>
        <button
          onClick={() => onChange({})}
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RotateCcw className="h-3 w-3" /> Ripristina tutto
        </button>
      </div>

      {/* Preset dropdown */}
      <div className="relative" ref={presetDropdownRef}>
        <button
          onClick={() => setPresetDropdownOpen(!presetDropdownOpen)}
          className="h-7 text-xs w-full flex items-center gap-2 border rounded px-2 hover:bg-muted/50 transition-colors"
        >
          <Palette className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex-1 text-left">Applica un preset...</span>
          <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${presetDropdownOpen ? 'rotate-180' : ''}`} />
        </button>
        {presetDropdownOpen && (
          <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-64 overflow-y-auto py-1">
            {PLOTLY_STYLE_PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => { onChange({ ...p.overrides }); setPresetDropdownOpen(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-muted text-xs transition-colors"
              >
                <div className="font-medium">{p.label}</div>
                <div className="text-[10px] text-muted-foreground">{p.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sfondo */}
      <Section title="Sfondo">
        <ColorField
          label="Sfondo carta"
          value={resolve('paper_bgcolor', 'layout.paper_bgcolor', '#ffffff') as string}
          onChange={v => set('paper_bgcolor', v)}
          onReset={() => reset('paper_bgcolor')}
        />
        <ColorField
          label="Sfondo grafico"
          value={resolve('plot_bgcolor', 'layout.plot_bgcolor', '#ffffff') as string}
          onChange={v => set('plot_bgcolor', v)}
          onReset={() => reset('plot_bgcolor')}
        />
      </Section>

      {/* Tipografia */}
      <Section title="Tipografia">
        <div className="space-y-1">
          <Label className="text-[11px]">Font famiglia</Label>
          <Select
            value={resolve('font_family', 'layout.font.family', 'Arial') as string}
            onValueChange={v => set('font_family', v)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['Arial', 'Helvetica', 'Inter', 'Roboto', 'Open Sans', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'monospace'].map(f => (
                <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <SliderField
          label="Dimensione font globale"
          value={resolve('font_size', 'layout.font.size', 12) as number}
          min={8} max={24} step={1}
          onChange={v => set('font_size', v)}
          onReset={() => reset('font_size')}
          unit="px"
        />
        <ColorField
          label="Colore font globale"
          value={resolve('font_color', 'layout.font.color', '#333333') as string}
          onChange={v => set('font_color', v)}
          onReset={() => reset('font_color')}
        />
        <SliderField
          label="Dimensione titolo"
          value={resolve('title_font_size', 'layout.title.font.size', 18) as number}
          min={10} max={36} step={1}
          onChange={v => set('title_font_size', v)}
          onReset={() => reset('title_font_size')}
          unit="px"
        />
        <ColorField
          label="Colore titolo"
          value={resolve('title_font_color', 'layout.title.font.color', '#333333') as string}
          onChange={v => set('title_font_color', v)}
          onReset={() => reset('title_font_color')}
        />
      </Section>

      {/* Colori tracce */}
      <Section title="Colori Tracce">
        <div className="space-y-2">
          {(() => {
            const traces: any[] = plotlyJson?.data || [];
            if (traces.length === 0) {
              // Fallback: no traces, show colorway
              return currentColorway.slice(0, 8).map((color: string, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <Label className="text-[11px] w-16">Traccia {i + 1}</Label>
                  <input
                    type="color"
                    value={color}
                    onChange={e => {
                      const newColors = [...currentColorway];
                      newColors[i] = e.target.value;
                      set('colorway', newColors);
                    }}
                    className="w-7 h-7 rounded border cursor-pointer bg-transparent p-0"
                  />
                  <span className="text-[10px] text-muted-foreground font-mono">{color}</span>
                </div>
              ));
            }

            // Helper: extract representative color from a trace
            const getTraceColor = (trace: any, idx: number): string => {
              if (typeof trace.marker?.color === 'string') return trace.marker.color;
              if (Array.isArray(trace.marker?.color) && trace.marker.color.length > 0) return trace.marker.color[0];
              if (typeof trace.line?.color === 'string') return trace.line.color;
              return currentColorway[idx % currentColorway.length] || '#636EFA';
            };

            // Group traces by name (dedup). Each group = { name, indices[], color }
            const groups: { name: string; indices: number[]; color: string }[] = [];
            const nameMap = new Map<string, number>(); // name -> group index

            traces.forEach((trace, i) => {
              const name = trace.name || `Traccia ${i + 1}`;
              const existing = nameMap.get(name);
              if (existing !== undefined) {
                groups[existing].indices.push(i);
              } else {
                nameMap.set(name, groups.length);
                groups.push({ name, indices: [i], color: getTraceColor(trace, i) });
              }
            });

            return groups.map((group, gi) => {
              const firstIdx = group.indices[0];
              const overrideColor = overrides.trace_colors?.[firstIdx];
              const displayColor = overrideColor || group.color;
              return (
                <div key={gi} className="flex items-center gap-2">
                  <Label className="text-[11px] flex-1 min-w-0 truncate" title={group.name}>
                    {group.name}
                    {group.indices.length > 1 && (
                      <span className="text-muted-foreground ml-1">({group.indices.length})</span>
                    )}
                  </Label>
                  <input
                    type="color"
                    value={displayColor}
                    onChange={e => {
                      const tc = { ...(overrides.trace_colors || {}) };
                      // Apply to ALL traces in this group
                      for (const idx of group.indices) {
                        tc[idx] = e.target.value;
                      }
                      set('trace_colors', tc);
                    }}
                    className="w-7 h-7 rounded border cursor-pointer bg-transparent p-0"
                  />
                  <span className="text-[10px] text-muted-foreground font-mono">{displayColor}</span>
                  {overrideColor && (
                    <button
                      onClick={() => {
                        const tc = { ...(overrides.trace_colors || {}) };
                        for (const idx of group.indices) delete tc[idx];
                        set('trace_colors', Object.keys(tc).length > 0 ? tc : undefined);
                      }}
                      className="p-0.5 rounded hover:bg-muted" title="Reset"
                    >
                      <RotateCcw className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
              );
            });
          })()}
          <button
            onClick={() => { reset('colorway'); reset('trace_colors'); }}
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" /> Reset colori
          </button>
        </div>
      </Section>

      {/* Margini */}
      <Section title="Margini" defaultOpen={false}>
        <SliderField
          label="Sinistra"
          value={resolve('margin_l', 'layout.margin.l', 80) as number}
          min={0} max={400} step={10}
          onChange={v => set('margin_l', v)}
          onReset={() => reset('margin_l')}
          unit="px"
        />
        <SliderField
          label="Destra"
          value={resolve('margin_r', 'layout.margin.r', 40) as number}
          min={0} max={200} step={10}
          onChange={v => set('margin_r', v)}
          onReset={() => reset('margin_r')}
          unit="px"
        />
        <SliderField
          label="Alto"
          value={resolve('margin_t', 'layout.margin.t', 80) as number}
          min={0} max={200} step={10}
          onChange={v => set('margin_t', v)}
          onReset={() => reset('margin_t')}
          unit="px"
        />
        <SliderField
          label="Basso"
          value={resolve('margin_b', 'layout.margin.b', 50) as number}
          min={0} max={200} step={10}
          onChange={v => set('margin_b', v)}
          onReset={() => reset('margin_b')}
          unit="px"
        />
      </Section>

      {/* Griglia */}
      <Section title="Griglia" defaultOpen={false}>
        <div className="flex items-center justify-between">
          <Label className="text-[11px]">Griglia asse X</Label>
          <Switch
            checked={resolve('xaxis_showgrid', 'layout.xaxis.showgrid', true) as boolean}
            onCheckedChange={v => set('xaxis_showgrid', v)}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-[11px]">Griglia asse Y</Label>
          <Switch
            checked={resolve('yaxis_showgrid', 'layout.yaxis.showgrid', true) as boolean}
            onCheckedChange={v => set('yaxis_showgrid', v)}
          />
        </div>
        <ColorField
          label="Colore griglia X"
          value={resolve('xaxis_gridcolor', 'layout.xaxis.gridcolor', '#e0e0e0') as string}
          onChange={v => set('xaxis_gridcolor', v)}
          onReset={() => reset('xaxis_gridcolor')}
        />
        <ColorField
          label="Colore griglia Y"
          value={resolve('yaxis_gridcolor', 'layout.yaxis.gridcolor', '#e0e0e0') as string}
          onChange={v => set('yaxis_gridcolor', v)}
          onReset={() => reset('yaxis_gridcolor')}
        />
        <div className="space-y-1">
          <Label className="text-[11px]">Stile griglia</Label>
          <Select
            value={resolve('xaxis_griddash', 'layout.xaxis.griddash', 'solid') as string}
            onValueChange={v => { set('xaxis_griddash', v as any); set('yaxis_griddash', v as any); }}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solid" className="text-xs">Continuo</SelectItem>
              <SelectItem value="dash" className="text-xs">Tratteggiato</SelectItem>
              <SelectItem value="dot" className="text-xs">Puntinato</SelectItem>
              <SelectItem value="dashdot" className="text-xs">Tratto-punto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      {/* Legenda */}
      <Section title="Legenda" defaultOpen={false}>
        <div className="flex items-center justify-between">
          <Label className="text-[11px]">Mostra legenda</Label>
          <Switch
            checked={resolve('showlegend', 'layout.showlegend', true) as boolean}
            onCheckedChange={v => set('showlegend', v)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Orientamento</Label>
          <Select
            value={resolve('legend_orientation', 'layout.legend.orientation', 'v') as string}
            onValueChange={v => set('legend_orientation', v as 'v' | 'h')}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="v" className="text-xs">Verticale</SelectItem>
              <SelectItem value="h" className="text-xs">Orizzontale</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      {/* Assi */}
      <Section title="Assi" defaultOpen={false}>
        <SliderField
          label="Font titolo asse X"
          value={resolve('xaxis_title_font_size', 'layout.xaxis.title.font.size', 12) as number}
          min={8} max={24} step={1}
          onChange={v => set('xaxis_title_font_size', v)}
          onReset={() => reset('xaxis_title_font_size')}
          unit="px"
        />
        <SliderField
          label="Font titolo asse Y"
          value={resolve('yaxis_title_font_size', 'layout.yaxis.title.font.size', 12) as number}
          min={8} max={24} step={1}
          onChange={v => set('yaxis_title_font_size', v)}
          onReset={() => reset('yaxis_title_font_size')}
          unit="px"
        />
        <SliderField
          label="Font tick asse X"
          value={resolve('xaxis_tickfont_size', 'layout.xaxis.tickfont.size', 10) as number}
          min={6} max={20} step={1}
          onChange={v => set('xaxis_tickfont_size', v)}
          onReset={() => reset('xaxis_tickfont_size')}
          unit="px"
        />
        <SliderField
          label="Font tick asse Y"
          value={resolve('yaxis_tickfont_size', 'layout.yaxis.tickfont.size', 10) as number}
          min={6} max={20} step={1}
          onChange={v => set('yaxis_tickfont_size', v)}
          onReset={() => reset('yaxis_tickfont_size')}
          unit="px"
        />
      </Section>

      {/* Altezza */}
      <Section title="Dimensioni" defaultOpen={false}>
        <SliderField
          label="Altezza grafico"
          value={resolve('height', 'layout.height', 500) as number}
          min={200} max={2000} step={50}
          onChange={v => set('height', v)}
          onReset={() => reset('height')}
          unit="px"
        />
      </Section>
    </div>
  );
}
