'use client';

import React from 'react';
import { ColorField, SliderField, SelectField, SwitchField, Section, FONTS, FONT_WEIGHTS, TEXT_ALIGNS, V_ALIGNS, TEXT_TRANSFORMS, SHADOW_OPTIONS, BORDER_STYLES } from './shared-fields';
import type { HtmlStyleOverrides } from '@/lib/html-style-utils';
import { HTML_STYLE_DEFAULTS } from '@/lib/html-style-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface HtmlTableEditorProps {
  overrides: Partial<HtmlStyleOverrides>;
  onChange: (overrides: Partial<HtmlStyleOverrides>) => void;
}

const WHITE_SPACE_OPTIONS = [
  { value: 'normal', label: 'A capo' },
  { value: 'nowrap', label: 'Riga singola' },
];

export default function HtmlTableEditor({ overrides, onChange }: HtmlTableEditorProps) {
  function val<K extends keyof HtmlStyleOverrides>(key: K): HtmlStyleOverrides[K] {
    return overrides[key] ?? (HTML_STYLE_DEFAULTS as Record<string, any>)[key];
  }
  function set<K extends keyof HtmlStyleOverrides>(key: K, value: HtmlStyleOverrides[K]) {
    onChange({ ...overrides, [key]: value });
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-1">
        {/* ── 1. Pagina / Container ── */}
        <Section title="Pagina / Container" defaultOpen>
          <ColorField label="Sfondo pagina" value={val('page_bg_color') as string} onChange={v => set('page_bg_color', v)} />
          <SliderField label="Padding pagina" value={val('page_padding') as number} min={0} max={48} step={1} onChange={v => set('page_padding', v)} />
          <SliderField label="Larghezza max container" value={val('container_max_width') as number} min={0} max={1200} step={20} onChange={v => set('container_max_width', v)} unit={val('container_max_width') === 0 ? ' (100%)' : 'px'} />
          <SliderField label="Raggio bordo container" value={val('container_border_radius') as number} min={0} max={24} step={1} onChange={v => set('container_border_radius', v)} />
          <SelectField label="Ombra container" value={val('container_shadow') as string} options={SHADOW_OPTIONS} onChange={v => set('container_shadow', v as any)} />
        </Section>

        {/* ── 2. Header (th) ── */}
        <Section title="Header (th)" defaultOpen>
          <ColorField label="Sfondo header" value={val('header_bg_color') as string} onChange={v => set('header_bg_color', v)} />
          <ColorField label="Sfondo gradiente (fine)" value={val('header_bg_gradient_end') as string} onChange={v => set('header_bg_gradient_end', v)} />
          <ColorField label="Testo header" value={val('header_text_color') as string} onChange={v => set('header_text_color', v)} />
          <SliderField label="Dimensione font" value={val('header_font_size') as number} min={8} max={18} step={1} onChange={v => set('header_font_size', v)} />
          <SelectField label="Peso font" value={val('header_font_weight') as string} options={FONT_WEIGHTS} onChange={v => set('header_font_weight', v)} />
          <SelectField label="Trasformazione testo" value={val('header_text_transform') as string} options={TEXT_TRANSFORMS} onChange={v => set('header_text_transform', v as any)} />
          <SliderField label="Spaziatura lettere" value={val('header_letter_spacing') as number} min={0} max={5} step={0.1} onChange={v => set('header_letter_spacing', v)} />
          <SelectField label="Allineamento testo" value={val('header_text_align') as string} options={TEXT_ALIGNS} onChange={v => set('header_text_align', v as any)} />
          <SelectField label="Allineamento verticale" value={val('header_vertical_align') as string} options={V_ALIGNS} onChange={v => set('header_vertical_align', v as any)} />
          <SliderField label="Padding verticale" value={val('header_padding_v') as number} min={2} max={20} step={1} onChange={v => set('header_padding_v', v)} />
          <SliderField label="Padding orizzontale" value={val('header_padding_h') as number} min={4} max={24} step={1} onChange={v => set('header_padding_h', v)} />
          <SliderField label="Bordo inferiore (spessore)" value={val('header_border_bottom_width') as number} min={0} max={6} step={1} onChange={v => set('header_border_bottom_width', v)} />
          <ColorField label="Bordo inferiore (colore)" value={val('header_border_bottom_color') as string} onChange={v => set('header_border_bottom_color', v)} />
          <SelectField label="White-space" value={val('header_white_space') as string} options={WHITE_SPACE_OPTIONS} onChange={v => set('header_white_space', v as any)} />
        </Section>

        {/* ── 3. Body (td) ── */}
        <Section title="Body (td)" defaultOpen>
          <ColorField label="Sfondo body" value={val('body_bg_color') as string} onChange={v => set('body_bg_color', v)} />
          <ColorField label="Testo body" value={val('body_text_color') as string} onChange={v => set('body_text_color', v)} />
          <SliderField label="Dimensione font" value={val('body_font_size') as number} min={9} max={18} step={1} onChange={v => set('body_font_size', v)} />
          <SelectField label="Peso font" value={val('body_font_weight') as string} options={FONT_WEIGHTS} onChange={v => set('body_font_weight', v)} />
          <SliderField label="Altezza riga" value={val('body_line_height') as number} min={1} max={2.5} step={0.05} onChange={v => set('body_line_height', v)} />
          <SelectField label="Allineamento testo" value={val('body_text_align') as string} options={TEXT_ALIGNS} onChange={v => set('body_text_align', v as any)} />
          <SelectField label="Allineamento verticale" value={val('body_vertical_align') as string} options={V_ALIGNS} onChange={v => set('body_vertical_align', v as any)} />
          <SelectField label="White-space" value={val('body_white_space') as string} options={WHITE_SPACE_OPTIONS} onChange={v => set('body_white_space', v as any)} />
          <SelectField label="Trasformazione testo" value={val('body_text_transform') as string} options={TEXT_TRANSFORMS} onChange={v => set('body_text_transform', v as any)} />
          <SliderField label="Spaziatura lettere" value={val('body_letter_spacing') as number} min={0} max={3} step={0.1} onChange={v => set('body_letter_spacing', v)} />
        </Section>

        {/* ── 4. Tipografia ── */}
        <Section title="Tipografia" defaultOpen={false}>
          <SelectField label="Font famiglia" value={val('font_family') as string} options={FONTS} onChange={v => set('font_family', v)} />
        </Section>

        {/* ── 5. Bordi ── */}
        <Section title="Bordi" defaultOpen={false}>
          <ColorField label="Colore bordo" value={val('border_color') as string} onChange={v => set('border_color', v)} />
          <SelectField label="Stile bordo" value={val('border_style') as string} options={BORDER_STYLES} onChange={v => set('border_style', v as any)} />
          <SliderField label="Spessore bordo" value={val('border_width') as number} min={0} max={4} step={1} onChange={v => set('border_width', v)} />
          <SliderField label="Raggio bordo tabella" value={val('table_border_radius') as number} min={0} max={16} step={1} onChange={v => set('table_border_radius', v)} />
          <ColorField label="Colore bordo riga" value={val('row_border_color') as string} onChange={v => set('row_border_color', v)} />
          <ColorField label="Colore bordo colonna" value={val('col_border_color') as string} onChange={v => set('col_border_color', v)} />
        </Section>

        {/* ── 6. Spaziatura Celle ── */}
        <Section title="Spaziatura Celle" defaultOpen={false}>
          <SliderField label="Padding verticale" value={val('cell_padding_v') as number} min={2} max={20} step={1} onChange={v => set('cell_padding_v', v)} />
          <SliderField label="Padding orizzontale" value={val('cell_padding_h') as number} min={4} max={24} step={1} onChange={v => set('cell_padding_h', v)} />
          <SelectField label="Table layout" value={val('table_layout') as string} options={[{ value: 'auto', label: 'Auto' }, { value: 'fixed', label: 'Fixed' }]} onChange={v => set('table_layout', v as any)} />
          <SliderField label="Altezza min riga" value={val('row_min_height') as number} min={0} max={60} step={1} onChange={v => set('row_min_height', v)} />
          <SliderField label="Larghezza min colonna" value={val('min_col_width') as number} min={0} max={200} step={1} onChange={v => set('min_col_width', v)} />
          <SliderField label="Margine verticale tabella" value={val('table_margin_v') as number} min={0} max={40} step={1} onChange={v => set('table_margin_v', v)} />
        </Section>

        {/* ── 7. Prima Colonna ── */}
        <Section title="Prima Colonna" defaultOpen={false}>
          <ColorField label="Sfondo" value={val('first_col_bg_color') as string} onChange={v => set('first_col_bg_color', v)} />
          <ColorField label="Testo" value={val('first_col_text_color') as string} onChange={v => set('first_col_text_color', v)} />
          <SelectField label="Peso font" value={val('first_col_font_weight') as string || '400'} options={FONT_WEIGHTS} onChange={v => set('first_col_font_weight', v)} />
          <SliderField label="Larghezza minima" value={val('first_col_min_width') as number} min={0} max={300} step={1} onChange={v => set('first_col_min_width', v)} />
        </Section>

        {/* ── 8. Ultima Colonna ── */}
        <Section title="Ultima Colonna" defaultOpen={false}>
          <SelectField label="Allineamento testo" value={(val('last_col_text_align') as string) || 'left'} options={TEXT_ALIGNS} onChange={v => set('last_col_text_align', v as any)} />
        </Section>

        {/* ── 9. Striping & Hover ── */}
        <Section title="Striping & Hover" defaultOpen={false}>
          <SwitchField
            label="Righe alternate"
            checked={val('stripe_enabled') as boolean}
            onChange={v => set('stripe_enabled', v)}
            colorValue={val('stripe_color') as string}
            colorLabel="Colore riga alternata"
            onColorChange={v => set('stripe_color', v)}
          />
          <SwitchField
            label="Hover riga"
            checked={val('hover_enabled') as boolean}
            onChange={v => set('hover_enabled', v)}
            colorValue={val('hover_color') as string}
            colorLabel="Colore hover"
            onColorChange={v => set('hover_color', v)}
          />
        </Section>

        {/* ── 10. Colori Valori ── */}
        <Section title="Colori Valori" defaultOpen={false}>
          <ColorField label="Positivo" value={val('positive_color') as string} onChange={v => set('positive_color', v)} />
          <ColorField label="Negativo" value={val('negative_color') as string} onChange={v => set('negative_color', v)} />
        </Section>

        {/* ── 11. Titoli (h1-h3) ── */}
        <Section title="Titoli (h1-h3)" defaultOpen={false}>
          <ColorField label="Colore" value={val('heading_color') as string} onChange={v => set('heading_color', v)} />
          <SliderField label="Dimensione font" value={val('heading_font_size') as number} min={12} max={36} step={1} onChange={v => set('heading_font_size', v)} />
          <SelectField label="Peso font" value={val('heading_font_weight') as string} options={FONT_WEIGHTS} onChange={v => set('heading_font_weight', v)} />
          <SelectField label="Allineamento testo" value={val('heading_text_align') as string} options={TEXT_ALIGNS} onChange={v => set('heading_text_align', v as any)} />
          <SelectField label="Trasformazione testo" value={val('heading_text_transform') as string} options={TEXT_TRANSFORMS} onChange={v => set('heading_text_transform', v as any)} />
          <SliderField label="Spaziatura lettere" value={val('heading_letter_spacing') as number} min={0} max={5} step={0.1} onChange={v => set('heading_letter_spacing', v)} />
          <SliderField label="Altezza riga" value={val('heading_line_height') as number} min={1} max={2.5} step={0.05} onChange={v => set('heading_line_height', v)} />
          <SliderField label="Margine superiore" value={val('heading_margin_top') as number} min={0} max={40} step={1} onChange={v => set('heading_margin_top', v)} />
          <SliderField label="Margine inferiore" value={val('heading_margin_bottom') as number} min={0} max={20} step={1} onChange={v => set('heading_margin_bottom', v)} />
        </Section>

        {/* ── 12. Caption / Title ── */}
        <Section title="Caption / Title" defaultOpen={false}>
          <ColorField label="Colore testo" value={val('caption_color') as string} onChange={v => set('caption_color', v)} />
          <SliderField label="Dimensione font" value={val('caption_font_size') as number} min={8} max={16} step={1} onChange={v => set('caption_font_size', v)} />
          <SelectField label="Peso font" value={val('caption_font_weight') as string} options={FONT_WEIGHTS} onChange={v => set('caption_font_weight', v)} />
          <ColorField label="Sfondo" value={val('caption_bg_color') as string} onChange={v => set('caption_bg_color', v)} />
          <SelectField label="Allineamento testo" value={val('caption_text_align') as string} options={TEXT_ALIGNS} onChange={v => set('caption_text_align', v as any)} />
          <SelectField label="Trasformazione testo" value={val('caption_text_transform') as string} options={TEXT_TRANSFORMS} onChange={v => set('caption_text_transform', v as any)} />
          <SliderField label="Spaziatura lettere" value={val('caption_letter_spacing') as number} min={0} max={5} step={0.1} onChange={v => set('caption_letter_spacing', v)} />
          <SliderField label="Padding" value={val('caption_padding') as number} min={0} max={20} step={1} onChange={v => set('caption_padding', v)} />
          <SliderField label="Margine inferiore" value={val('caption_margin_bottom') as number} min={0} max={20} step={1} onChange={v => set('caption_margin_bottom', v)} />
        </Section>

        {/* ── 13. Paragrafi ── */}
        <Section title="Paragrafi" defaultOpen={false}>
          <SliderField label="Margine verticale" value={val('p_margin_v') as number} min={0} max={24} step={1} onChange={v => set('p_margin_v', v)} />
          <SliderField label="Dimensione font" value={val('p_font_size') as number} min={0} max={18} step={1} onChange={v => set('p_font_size', v)} unit={val('p_font_size') === 0 ? ' (inherit)' : 'px'} />
        </Section>

        {/* ── 14. Link ── */}
        <Section title="Link" defaultOpen={false}>
          <ColorField label="Colore" value={val('link_color') as string} onChange={v => set('link_color', v)} />
          <SelectField label="Decorazione" value={val('link_decoration') as string} options={[{ value: 'none', label: 'Nessuna' }, { value: 'underline', label: 'Sottolineato' }]} onChange={v => set('link_decoration', v as any)} />
          <SelectField label="Peso font" value={val('link_font_weight') as string || '400'} options={FONT_WEIGHTS} onChange={v => set('link_font_weight', v)} />
          <SliderField label="Dimensione font" value={val('link_font_size') as number} min={0} max={18} step={1} onChange={v => set('link_font_size', v)} unit={val('link_font_size') === 0 ? ' (inherit)' : 'px'} />
        </Section>

        {/* ── 15. Scrollbar ── */}
        <Section title="Scrollbar" defaultOpen={false}>
          <SelectField label="Larghezza scrollbar" value={val('scrollbar_width') as string} options={[{ value: 'auto', label: 'Auto' }, { value: 'thin', label: 'Sottile' }, { value: 'none', label: 'Nascosta' }]} onChange={v => set('scrollbar_width', v as any)} />
        </Section>

        {/* ── 16. Overflow Testo ── */}
        <Section title="Overflow Testo" defaultOpen={false}>
          <SelectField label="Overflow testo celle" value={val('cell_text_overflow') as string} options={[{ value: 'visible', label: 'Visibile' }, { value: 'ellipsis', label: 'Ellissi...' }, { value: 'clip', label: 'Taglia' }]} onChange={v => set('cell_text_overflow', v as any)} />
          <SliderField label="Larghezza max cella" value={val('cell_max_width') as number} min={0} max={400} step={1} onChange={v => set('cell_max_width', v)} unit={val('cell_max_width') === 0 ? ' (nessun limite)' : 'px'} />
        </Section>

        {/* ── 17. CSS Personalizzato ── */}
        <Section title="CSS Personalizzato" defaultOpen={false}>
          <div className="space-y-1">
            <Label className="text-[11px]">CSS personalizzato</Label>
            <Textarea
              rows={6}
              value={(val('custom_css') as string) || ''}
              onChange={e => set('custom_css', e.target.value)}
              placeholder="/* CSS personalizzato */"
              className="text-xs font-mono"
            />
          </div>
        </Section>
      </div>
    </ScrollArea>
  );
}
