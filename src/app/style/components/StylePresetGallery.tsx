'use client';

import React, { useMemo } from 'react';
import type { UnifiedStylePreset } from '@/lib/unified-style-types';
import { generateHtmlStyleCss } from '@/lib/html-style-utils';
import { generateUiElementsCss } from '@/lib/unified-style-css';
import { Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

// ── Category badge labels ──

const CATEGORY_LABELS: Record<string, string> = {
  corporate: 'Corporate',
  dark: 'Dark',
  minimal: 'Minimal',
  colorful: 'Colorful',
  elegant: 'Elegant',
  editorial: 'Editorial',
  finance: 'Finance',
  custom: 'Custom',
};

// ── Mini preview HTML (no external CDN loads) ──

const PREVIEW_HTML_BODY = `
<h3>Title</h3>
<table>
  <thead><tr><th>A</th><th>B</th></tr></thead>
  <tbody>
    <tr><td>100</td><td class="positive">+5%</td></tr>
    <tr><td>200</td><td class="negative">-3%</td></tr>
  </tbody>
</table>
<button class="btn">Button</button>
`;

// ── Single preset card ──

function PresetCard({
  preset,
  isActive,
  isCustom,
  onSelect,
  onDelete,
}: {
  preset: UnifiedStylePreset;
  isActive: boolean;
  isCustom: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const srcDoc = useMemo(() => {
    const htmlCss = generateHtmlStyleCss(preset.html as Parameters<typeof generateHtmlStyleCss>[0]);
    const uiCss = generateUiElementsCss(preset.ui);
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:8px;overflow:hidden}
${htmlCss}
${uiCss}
</style></head><body>${PREVIEW_HTML_BODY}</body></html>`;
  }, [preset.html, preset.ui]);

  return (
    <button
      onClick={onSelect}
      className={`relative group rounded-lg border bg-card text-left transition-all hover:shadow-md overflow-hidden ${
        isActive ? 'ring-2 ring-violet-500 border-violet-400' : 'border-border hover:border-muted-foreground/30'
      }`}
    >
      {/* Mini iframe preview */}
      <div className="w-full overflow-hidden bg-white" style={{ height: 120 }}>
        <iframe
          srcDoc={srcDoc}
          sandbox="allow-same-origin"
          tabIndex={-1}
          className="border-0 origin-top-left"
          style={{
            width: '333%',
            height: '333%',
            transform: 'scale(0.3)',
            transformOrigin: 'top left',
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
          title={`Preview: ${preset.label}`}
        />
      </div>

      {/* Info */}
      <div className="p-2 space-y-0.5">
        <p className="text-xs font-bold truncate">{preset.label}</p>
        {preset.category && (
          <span className="inline-block text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {CATEGORY_LABELS[preset.category] || preset.category}
          </span>
        )}
      </div>

      {/* Delete button for custom presets */}
      {isCustom && onDelete && (
        <div
          role="button"
          tabIndex={0}
          onClick={e => {
            e.stopPropagation();
            onDelete();
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onDelete();
            }
          }}
          className="absolute top-1.5 right-1.5 p-1 rounded bg-background/80 border border-border opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
          title="Elimina preset"
        >
          <Trash2 className="h-3 w-3" />
        </div>
      )}
    </button>
  );
}

// ── Gallery component ──

export interface StylePresetGalleryProps {
  builtInPresets: UnifiedStylePreset[];
  customPresets: UnifiedStylePreset[];
  activePresetId: string;
  onSelectPreset: (preset: UnifiedStylePreset) => void;
  onDeletePreset: (id: string) => void;
}

export default function StylePresetGallery({
  builtInPresets,
  customPresets,
  activePresetId,
  onSelectPreset,
  onDeletePreset,
}: StylePresetGalleryProps) {
  const allPresets = useMemo(
    () => [...builtInPresets, ...customPresets],
    [builtInPresets, customPresets],
  );

  const customIds = useMemo(
    () => new Set(customPresets.map(p => p.id)),
    [customPresets],
  );

  return (
    <ScrollArea className="h-full">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 p-1">
        {allPresets.map(preset => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isActive={preset.id === activePresetId}
            isCustom={customIds.has(preset.id)}
            onSelect={() => onSelectPreset(preset)}
            onDelete={customIds.has(preset.id) ? () => onDeletePreset(preset.id) : undefined}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
