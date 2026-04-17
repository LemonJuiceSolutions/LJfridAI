// Central chart/table/output theme definitions
// All rendering components should import from here

export interface ChartTheme {
  // Palette (8 colors)
  colors: string[];

  // Typography
  fontFamily: string;
  axisFontSize: number;
  tooltipFontSize: number;
  legendFontSize: number;
  titleFontSize: number;

  // Grid
  gridStyle: 'solid' | 'dashed' | 'dotted' | 'none';
  gridColor: string;

  // Lines & Areas
  defaultLineStyle: 'solid' | 'dashed' | 'dotted';
  lineWidth: number;
  areaOpacity: number;

  // Bars
  barRadius: number;

  // Chart Layout
  chartMargins: { top: number; right: number; bottom: number; left: number };

  // Table Styling
  tableHeaderBg: string;
  tableAlternateRows: boolean;
  tableRowHoverColor: string;
  tableFontSize: number;
  tableBorderStyle: 'solid' | 'dashed' | 'none';

  // KPI Cards
  kpiValueSize: number;
  kpiLabelSize: number;
  kpiPositiveColor: string;
  kpiNegativeColor: string;
}

export const DEFAULT_CHART_THEME: ChartTheme = {
  colors: ['#059669', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#0088FE', '#00C49F'],

  fontFamily: 'Inter, -apple-system, sans-serif',
  axisFontSize: 12,
  tooltipFontSize: 12,
  legendFontSize: 12,
  titleFontSize: 16,

  gridStyle: 'dashed',
  gridColor: '#e2e8f0',

  defaultLineStyle: 'solid',
  lineWidth: 2,
  areaOpacity: 0.3,

  barRadius: 4,

  chartMargins: { top: 20, right: 30, bottom: 20, left: 30 },

  tableHeaderBg: 'hsl(var(--muted))',
  tableAlternateRows: true,
  tableRowHoverColor: 'hsl(var(--muted) / 0.3)',
  tableFontSize: 12,
  tableBorderStyle: 'solid',

  kpiValueSize: 36,
  kpiLabelSize: 14,
  kpiPositiveColor: '#22c55e',
  kpiNegativeColor: '#ef4444',
};

/** Deep merge a partial theme with defaults */
export function resolveTheme(partial?: Partial<ChartTheme> | null): ChartTheme {
  if (!partial) return { ...DEFAULT_CHART_THEME };
  return {
    ...DEFAULT_CHART_THEME,
    ...partial,
    chartMargins: { ...DEFAULT_CHART_THEME.chartMargins, ...(partial.chartMargins || {}) },
  };
}

/** Convert gridStyle to Recharts strokeDasharray */
export function gridStrokeDasharray(style: ChartTheme['gridStyle']): string | undefined {
  switch (style) {
    case 'dashed': return '5 5';
    case 'dotted': return '1 3';
    case 'solid': return undefined;
    case 'none': return undefined;
  }
}

/** Convert lineStyle to Recharts strokeDasharray */
export function lineStrokeDasharray(style: ChartTheme['defaultLineStyle']): string | undefined {
  switch (style) {
    case 'dashed': return '5 5';
    case 'dotted': return '1 1';
    case 'solid': return undefined;
  }
}

/** Convert hex color (#rrggbb) to raw HSL string for CSS variables (e.g. "210 50% 40%") */
export function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0% 50%';

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
