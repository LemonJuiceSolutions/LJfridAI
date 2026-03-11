import type { HtmlStyleOverrides } from '@/lib/html-style-utils';
import type { PlotlyStyleOverrides } from '@/lib/plotly-utils';

// ── UI Elements Overrides ──────────────────────────────────────────────────

export interface UiElementsOverrides {
    // Primary button
    btn_bg_color: string;
    btn_text_color: string;
    btn_hover_bg_color: string;
    btn_hover_text_color: string;
    btn_border_radius: number;
    btn_padding_v: number;
    btn_padding_h: number;
    btn_font_size: number;
    btn_font_weight: string;
    btn_border_color: string;
    btn_border_width: number;
    btn_shadow: 'none' | 'sm' | 'md' | 'lg';
    btn_text_transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';

    // Secondary button
    btn_secondary_bg_color: string;
    btn_secondary_text_color: string;
    btn_secondary_border_color: string;
    btn_secondary_hover_bg_color: string;

    // Input & Textarea
    input_bg_color: string;
    input_text_color: string;
    input_placeholder_color: string;
    input_border_color: string;
    input_focus_border_color: string;
    input_focus_ring_color: string;
    input_border_radius: number;
    input_border_width: number;
    input_padding_v: number;
    input_padding_h: number;
    input_font_size: number;

    // Select / Dropdown
    select_bg_color: string;
    select_text_color: string;
    select_border_color: string;
    select_border_radius: number;

    // Badge
    badge_bg_color: string;
    badge_text_color: string;
    badge_border_radius: number;
    badge_font_size: number;
    badge_padding_v: number;
    badge_padding_h: number;
    badge_font_weight: string;

    // Card
    card_bg_color: string;
    card_border_color: string;
    card_border_radius: number;
    card_shadow: 'none' | 'sm' | 'md' | 'lg';
    card_padding: number;
    card_header_font_size: number;
    card_header_font_weight: string;
    card_header_color: string;

    // Divider / HR
    divider_color: string;
    divider_width: number;
    divider_style: 'solid' | 'dashed' | 'dotted';

    // Lists
    list_marker_color: string;
    list_item_spacing: number;

    // Slider / Range
    slider_track_color: string;
    slider_thumb_color: string;
    slider_track_height: number;

    // Custom CSS
    ui_custom_css: string;
}

export const UI_ELEMENTS_DEFAULTS: UiElementsOverrides = {
    btn_bg_color: '#6366f1',
    btn_text_color: '#ffffff',
    btn_hover_bg_color: '#4f46e5',
    btn_hover_text_color: '#ffffff',
    btn_border_radius: 6,
    btn_padding_v: 8,
    btn_padding_h: 16,
    btn_font_size: 14,
    btn_font_weight: '500',
    btn_border_color: 'transparent',
    btn_border_width: 0,
    btn_shadow: 'none',
    btn_text_transform: 'none',

    btn_secondary_bg_color: '#f1f5f9',
    btn_secondary_text_color: '#1e293b',
    btn_secondary_border_color: '#e2e8f0',
    btn_secondary_hover_bg_color: '#e2e8f0',

    input_bg_color: '#ffffff',
    input_text_color: '#1e293b',
    input_placeholder_color: '#94a3b8',
    input_border_color: '#e2e8f0',
    input_focus_border_color: '#6366f1',
    input_focus_ring_color: '#6366f133',
    input_border_radius: 6,
    input_border_width: 1,
    input_padding_v: 8,
    input_padding_h: 12,
    input_font_size: 14,

    select_bg_color: '#ffffff',
    select_text_color: '#1e293b',
    select_border_color: '#e2e8f0',
    select_border_radius: 6,

    badge_bg_color: '#e0e7ff',
    badge_text_color: '#4338ca',
    badge_border_radius: 12,
    badge_font_size: 11,
    badge_padding_v: 2,
    badge_padding_h: 8,
    badge_font_weight: '500',

    card_bg_color: '#ffffff',
    card_border_color: '#e2e8f0',
    card_border_radius: 8,
    card_shadow: 'sm',
    card_padding: 16,
    card_header_font_size: 15,
    card_header_font_weight: '600',
    card_header_color: '#1e293b',

    divider_color: '#e2e8f0',
    divider_width: 1,
    divider_style: 'solid',

    list_marker_color: '#6366f1',
    list_item_spacing: 4,

    slider_track_color: '#e2e8f0',
    slider_thumb_color: '#6366f1',
    slider_track_height: 4,

    ui_custom_css: '',
};

// ── Unified Style Preset ───────────────────────────────────────────────────

export interface UnifiedStylePreset {
    id: string;
    label: string;
    description: string;
    category: 'corporate' | 'dark' | 'minimal' | 'colorful' | 'elegant' | 'editorial' | 'finance' | 'custom';
    html: Partial<HtmlStyleOverrides>;
    plotly: Partial<PlotlyStyleOverrides>;
    ui: Partial<UiElementsOverrides>;
    createdAt?: string;
    isBuiltIn: boolean;
}
