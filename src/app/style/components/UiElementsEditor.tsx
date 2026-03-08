'use client';

import React from 'react';
import { ColorField, SliderField, SelectField, Section, FONT_WEIGHTS, SHADOW_OPTIONS, BORDER_STYLES, TEXT_TRANSFORMS } from './shared-fields';
import type { UiElementsOverrides } from '@/lib/unified-style-types';
import { UI_ELEMENTS_DEFAULTS } from '@/lib/unified-style-types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface UiElementsEditorProps {
  overrides: Partial<UiElementsOverrides>;
  onChange: (overrides: Partial<UiElementsOverrides>) => void;
}

const DIVIDER_STYLES_NO_NONE = BORDER_STYLES.filter(s => s.value !== 'none');

export default function UiElementsEditor({ overrides, onChange }: UiElementsEditorProps) {
  function val<K extends keyof UiElementsOverrides>(key: K) {
    return overrides[key] ?? UI_ELEMENTS_DEFAULTS[key as keyof typeof UI_ELEMENTS_DEFAULTS];
  }
  function set<K extends keyof UiElementsOverrides>(key: K, value: UiElementsOverrides[K]) {
    onChange({ ...overrides, [key]: value });
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-1">

        {/* ── Bottone Primario ── */}
        <Section title="Bottone Primario" defaultOpen>
          <ColorField label="Sfondo" value={val('btn_bg_color') as string} onChange={v => set('btn_bg_color', v)} />
          <ColorField label="Testo" value={val('btn_text_color') as string} onChange={v => set('btn_text_color', v)} />
          <ColorField label="Sfondo hover" value={val('btn_hover_bg_color') as string} onChange={v => set('btn_hover_bg_color', v)} />
          <ColorField label="Testo hover" value={val('btn_hover_text_color') as string} onChange={v => set('btn_hover_text_color', v)} />
          <SliderField label="Border radius" value={val('btn_border_radius') as number} min={0} max={20} step={1} unit="px" onChange={v => set('btn_border_radius', v)} />
          <SliderField label="Padding verticale" value={val('btn_padding_v') as number} min={4} max={16} step={1} unit="px" onChange={v => set('btn_padding_v', v)} />
          <SliderField label="Padding orizzontale" value={val('btn_padding_h') as number} min={8} max={32} step={1} unit="px" onChange={v => set('btn_padding_h', v)} />
          <SliderField label="Font size" value={val('btn_font_size') as number} min={10} max={18} step={1} unit="px" onChange={v => set('btn_font_size', v)} />
          <SelectField label="Font weight" value={val('btn_font_weight') as string} options={FONT_WEIGHTS} onChange={v => set('btn_font_weight', v)} />
          <ColorField label="Bordo" value={val('btn_border_color') as string} onChange={v => set('btn_border_color', v)} />
          <SliderField label="Larghezza bordo" value={val('btn_border_width') as number} min={0} max={4} step={1} unit="px" onChange={v => set('btn_border_width', v)} />
          <SelectField label="Ombra" value={val('btn_shadow') as string} options={SHADOW_OPTIONS} onChange={v => set('btn_shadow', v as UiElementsOverrides['btn_shadow'])} />
          <SelectField label="Trasformazione testo" value={val('btn_text_transform') as string} options={TEXT_TRANSFORMS} onChange={v => set('btn_text_transform', v as UiElementsOverrides['btn_text_transform'])} />
        </Section>

        {/* ── Bottone Secondario ── */}
        <Section title="Bottone Secondario" defaultOpen>
          <ColorField label="Sfondo" value={val('btn_secondary_bg_color') as string} onChange={v => set('btn_secondary_bg_color', v)} />
          <ColorField label="Testo" value={val('btn_secondary_text_color') as string} onChange={v => set('btn_secondary_text_color', v)} />
          <ColorField label="Bordo" value={val('btn_secondary_border_color') as string} onChange={v => set('btn_secondary_border_color', v)} />
          <ColorField label="Sfondo hover" value={val('btn_secondary_hover_bg_color') as string} onChange={v => set('btn_secondary_hover_bg_color', v)} />
        </Section>

        {/* ── Input & Textarea ── */}
        <Section title="Input & Textarea">
          <ColorField label="Sfondo" value={val('input_bg_color') as string} onChange={v => set('input_bg_color', v)} />
          <ColorField label="Testo" value={val('input_text_color') as string} onChange={v => set('input_text_color', v)} />
          <ColorField label="Placeholder" value={val('input_placeholder_color') as string} onChange={v => set('input_placeholder_color', v)} />
          <ColorField label="Bordo" value={val('input_border_color') as string} onChange={v => set('input_border_color', v)} />
          <ColorField label="Bordo focus" value={val('input_focus_border_color') as string} onChange={v => set('input_focus_border_color', v)} />
          <ColorField label="Ring focus" value={val('input_focus_ring_color') as string} onChange={v => set('input_focus_ring_color', v)} />
          <SliderField label="Border radius" value={val('input_border_radius') as number} min={0} max={16} step={1} unit="px" onChange={v => set('input_border_radius', v)} />
          <SliderField label="Larghezza bordo" value={val('input_border_width') as number} min={0} max={4} step={1} unit="px" onChange={v => set('input_border_width', v)} />
          <SliderField label="Padding verticale" value={val('input_padding_v') as number} min={4} max={16} step={1} unit="px" onChange={v => set('input_padding_v', v)} />
          <SliderField label="Padding orizzontale" value={val('input_padding_h') as number} min={6} max={24} step={1} unit="px" onChange={v => set('input_padding_h', v)} />
          <SliderField label="Font size" value={val('input_font_size') as number} min={10} max={18} step={1} unit="px" onChange={v => set('input_font_size', v)} />
        </Section>

        {/* ── Select / Dropdown ── */}
        <Section title="Select / Dropdown">
          <ColorField label="Sfondo" value={val('select_bg_color') as string} onChange={v => set('select_bg_color', v)} />
          <ColorField label="Testo" value={val('select_text_color') as string} onChange={v => set('select_text_color', v)} />
          <ColorField label="Bordo" value={val('select_border_color') as string} onChange={v => set('select_border_color', v)} />
          <SliderField label="Border radius" value={val('select_border_radius') as number} min={0} max={16} step={1} unit="px" onChange={v => set('select_border_radius', v)} />
        </Section>

        {/* ── Badge ── */}
        <Section title="Badge">
          <ColorField label="Sfondo" value={val('badge_bg_color') as string} onChange={v => set('badge_bg_color', v)} />
          <ColorField label="Testo" value={val('badge_text_color') as string} onChange={v => set('badge_text_color', v)} />
          <SliderField label="Border radius" value={val('badge_border_radius') as number} min={0} max={20} step={1} unit="px" onChange={v => set('badge_border_radius', v)} />
          <SliderField label="Font size" value={val('badge_font_size') as number} min={8} max={16} step={1} unit="px" onChange={v => set('badge_font_size', v)} />
          <SliderField label="Padding verticale" value={val('badge_padding_v') as number} min={1} max={8} step={1} unit="px" onChange={v => set('badge_padding_v', v)} />
          <SliderField label="Padding orizzontale" value={val('badge_padding_h') as number} min={4} max={16} step={1} unit="px" onChange={v => set('badge_padding_h', v)} />
          <SelectField label="Font weight" value={val('badge_font_weight') as string} options={FONT_WEIGHTS} onChange={v => set('badge_font_weight', v)} />
        </Section>

        {/* ── Card ── */}
        <Section title="Card">
          <ColorField label="Sfondo" value={val('card_bg_color') as string} onChange={v => set('card_bg_color', v)} />
          <ColorField label="Bordo" value={val('card_border_color') as string} onChange={v => set('card_border_color', v)} />
          <SliderField label="Border radius" value={val('card_border_radius') as number} min={0} max={20} step={1} unit="px" onChange={v => set('card_border_radius', v)} />
          <SelectField label="Ombra" value={val('card_shadow') as string} options={SHADOW_OPTIONS} onChange={v => set('card_shadow', v as UiElementsOverrides['card_shadow'])} />
          <SliderField label="Padding" value={val('card_padding') as number} min={8} max={32} step={1} unit="px" onChange={v => set('card_padding', v)} />
          <SliderField label="Titolo font size" value={val('card_header_font_size') as number} min={12} max={24} step={1} unit="px" onChange={v => set('card_header_font_size', v)} />
          <SelectField label="Titolo font weight" value={val('card_header_font_weight') as string} options={FONT_WEIGHTS} onChange={v => set('card_header_font_weight', v)} />
          <ColorField label="Titolo colore" value={val('card_header_color') as string} onChange={v => set('card_header_color', v)} />
        </Section>

        {/* ── Divider / HR ── */}
        <Section title="Divider / HR">
          <ColorField label="Colore" value={val('divider_color') as string} onChange={v => set('divider_color', v)} />
          <SliderField label="Spessore" value={val('divider_width') as number} min={1} max={6} step={1} unit="px" onChange={v => set('divider_width', v)} />
          <SelectField label="Stile" value={val('divider_style') as string} options={DIVIDER_STYLES_NO_NONE} onChange={v => set('divider_style', v as UiElementsOverrides['divider_style'])} />
        </Section>

        {/* ── Liste ── */}
        <Section title="Liste">
          <ColorField label="Colore marker" value={val('list_marker_color') as string} onChange={v => set('list_marker_color', v)} />
          <SliderField label="Spaziatura elementi" value={val('list_item_spacing') as number} min={0} max={12} step={1} unit="px" onChange={v => set('list_item_spacing', v)} />
        </Section>

        {/* ── Slider / Range ── */}
        <Section title="Slider / Range">
          <ColorField label="Colore traccia" value={val('slider_track_color') as string} onChange={v => set('slider_track_color', v)} />
          <ColorField label="Colore thumb" value={val('slider_thumb_color') as string} onChange={v => set('slider_thumb_color', v)} />
          <SliderField label="Altezza traccia" value={val('slider_track_height') as number} min={2} max={12} step={1} unit="px" onChange={v => set('slider_track_height', v)} />
        </Section>

        {/* ── CSS Personalizzato ── */}
        <Section title="CSS Personalizzato">
          <div className="space-y-1">
            <Label className="text-[11px]">CSS aggiuntivo</Label>
            <Textarea
              rows={6}
              value={overrides.ui_custom_css ?? ''}
              onChange={e => set('ui_custom_css', e.target.value)}
              placeholder="/* Inserisci CSS personalizzato... */"
              className="text-xs font-mono"
            />
          </div>
        </Section>

      </div>
    </ScrollArea>
  );
}
