// Per-chart style system
// Each chart can have optional style overrides that merge with the global ChartTheme
import { ChartTheme } from './chart-theme';

// ── Base style shared by all chart types ──
export interface BaseChartStyle {
  colors?: string[];
  fontFamily?: string;
  axisFontSize?: number;
  tooltipFontSize?: number;
  legendFontSize?: number;
  titleFontSize?: number;
  gridStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  gridColor?: string;
  chartMargins?: { top?: number; right?: number; bottom?: number; left?: number };
  legendPosition?: 'top' | 'bottom' | 'left' | 'right' | 'none';
  showLegend?: boolean;
  showTooltip?: boolean;
  backgroundColor?: string;
}

// ── Chart-type-specific styles ──
export interface BarChartStyle extends BaseChartStyle {
  barRadius?: number;
  barGap?: number;
  barCategoryGap?: number;
  stackBars?: boolean;
  barOrientation?: 'vertical' | 'horizontal';
}

export interface LineChartStyle extends BaseChartStyle {
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineType?: 'monotone' | 'linear' | 'step' | 'stepBefore' | 'stepAfter';
  showDots?: boolean;
  dotRadius?: number;
  activeDotRadius?: number;
  connectNulls?: boolean;
}

export interface AreaChartStyle extends BaseChartStyle {
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineType?: 'monotone' | 'linear' | 'step';
  areaOpacity?: number;
  stackAreas?: boolean;
  showDots?: boolean;
  dotRadius?: number;
}

export interface PieChartStyle extends BaseChartStyle {
  innerRadius?: number;
  outerRadius?: number;
  paddingAngle?: number;
  showLabels?: boolean;
  labelType?: 'percent' | 'value' | 'name' | 'name-percent';
  startAngle?: number;
  endAngle?: number;
}

export interface KpiCardStyle extends BaseChartStyle {
  kpiValueSize?: number;
  kpiLabelSize?: number;
  kpiPositiveColor?: string;
  kpiNegativeColor?: string;
  kpiPrefix?: string;
  kpiSuffix?: string;
  kpiDecimalPlaces?: number;
}

export interface TableStyle extends BaseChartStyle {
  tableHeaderBg?: string;
  tableAlternateRows?: boolean;
  tableRowHoverColor?: string;
  tableFontSize?: number;
  tableBorderStyle?: 'solid' | 'dashed' | 'none';
  compactMode?: boolean;
}

// ── Discriminated union ──
export type ChartStyle =
  | ({ type: 'bar-chart' } & BarChartStyle)
  | ({ type: 'line-chart' } & LineChartStyle)
  | ({ type: 'area-chart' } & AreaChartStyle)
  | ({ type: 'pie-chart' } & PieChartStyle)
  | ({ type: 'kpi-card' } & KpiCardStyle)
  | ({ type: 'table' } & TableStyle);

// ── Resolved style: merge per-chart overrides onto global theme ──
export function resolveChartStyle(
  globalTheme: ChartTheme,
  chartStyle?: ChartStyle | null
): ChartTheme & Record<string, any> {
  if (!chartStyle) return globalTheme;

  const { type, chartMargins, ...overrides } = chartStyle;

  // Remove undefined values so they don't override the theme
  const cleanOverrides: Record<string, any> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      cleanOverrides[key] = value;
    }
  }

  return {
    ...globalTheme,
    ...cleanOverrides,
    chartMargins: {
      ...globalTheme.chartMargins,
      ...(chartMargins ? Object.fromEntries(
        Object.entries(chartMargins).filter(([, v]) => v !== undefined)
      ) : {}),
    },
  };
}

// ── Helper to create an empty style for a given chart type ──
export function createEmptyStyle(chartType: string): ChartStyle {
  return { type: chartType } as ChartStyle;
}
