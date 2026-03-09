'use client';

import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

// ── Shared option arrays ──

export const FONTS = [
  { value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', label: 'Sistema' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, sans-serif', label: 'Helvetica' },
  { value: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif', label: 'Segoe UI' },
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: 'Roboto, sans-serif', label: 'Roboto' },
  { value: '"Open Sans", sans-serif', label: 'Open Sans' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", serif', label: 'Times New Roman' },
  { value: '"Courier New", monospace', label: 'Courier New' },
  { value: 'monospace', label: 'Monospace' },
];

export const FONT_WEIGHTS = [
  { value: '400', label: 'Normale' },
  { value: '500', label: 'Medio' },
  { value: '600', label: 'Semi-Bold' },
  { value: '700', label: 'Grassetto' },
  { value: '800', label: 'Extra Bold' },
];

export const TEXT_ALIGNS = [
  { value: 'left', label: 'Sinistra' },
  { value: 'center', label: 'Centro' },
  { value: 'right', label: 'Destra' },
];

export const V_ALIGNS = [
  { value: 'top', label: 'Alto' },
  { value: 'middle', label: 'Centro' },
  { value: 'bottom', label: 'Basso' },
];

export const TEXT_TRANSFORMS = [
  { value: 'none', label: 'Nessuna' },
  { value: 'uppercase', label: 'MAIUSCOLO' },
  { value: 'capitalize', label: 'Iniziale Maiuscola' },
  { value: 'lowercase', label: 'minuscolo' },
];

export const SHADOW_OPTIONS = [
  { value: 'none', label: 'Nessuna' },
  { value: 'sm', label: 'Piccola' },
  { value: 'md', label: 'Media' },
  { value: 'lg', label: 'Grande' },
];

export const BORDER_STYLES = [
  { value: 'solid', label: 'Continuo' },
  { value: 'dashed', label: 'Tratteggiato' },
  { value: 'dotted', label: 'Punteggiato' },
  { value: 'none', label: 'Nessuno' },
];

// ── Field components ──

export function ColorField({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  onReset?: () => void;
}) {
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

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onReset,
  unit = '',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onReset?: () => void;
  unit?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px]">{label}</Label>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {value}{unit}
          </span>
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

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(opt => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SwitchField({
  label,
  checked,
  onChange,
  colorValue,
  colorLabel,
  onColorChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  colorValue?: string;
  colorLabel?: string;
  onColorChange?: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Switch checked={checked} onCheckedChange={onChange} className="scale-75 origin-left" />
        <Label className="text-[11px]">{label}</Label>
      </div>
      {checked && colorValue !== undefined && onColorChange && (
        <div className="flex items-center gap-2 pl-6">
          <Label className="text-[11px] flex-1 min-w-0 truncate">
            {colorLabel || 'Colore'}
          </Label>
          <input
            type="color"
            value={colorValue || '#ffffff'}
            onChange={e => onColorChange(e.target.value)}
            className="w-7 h-7 rounded border cursor-pointer bg-transparent p-0"
          />
        </div>
      )}
    </div>
  );
}

export function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <span>{title}</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && <div className="space-y-2.5">{children}</div>}
    </div>
  );
}
