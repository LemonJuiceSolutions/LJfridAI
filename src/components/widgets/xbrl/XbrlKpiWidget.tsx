'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChartTheme } from '@/hooks/use-chart-theme';
import { useXbrlData } from '@/hooks/use-xbrl-data';
import type { FinancialRatios } from '@/lib/xbrl-parser';
import { Loader2 } from 'lucide-react';

type MetricKey = keyof FinancialRatios;

interface KpiMetricConfig {
  label: string;
  format: (value: number) => string;
  key: MetricKey;
  trendKey?: MetricKey;
  unit: string;
}

const METRICS: Record<string, KpiMetricConfig> = {
  roe: { label: 'ROE', key: 'roe', unit: '%', format: v => v.toFixed(1) + '%' },
  roi: { label: 'ROI', key: 'roi', unit: '%', format: v => v.toFixed(1) + '%' },
  ros: { label: 'ROS', key: 'ros', unit: '%', format: v => v.toFixed(1) + '%' },
  ebitdaMargin: { label: 'EBITDA Margin', key: 'ebitdaMargin', unit: '%', format: v => v.toFixed(1) + '%' },
  ebitda: { label: 'EBITDA', key: 'ebitda', unit: 'EUR', format: v => Math.round(v).toLocaleString('it-IT') + ' EUR' },
  currentRatio: { label: 'Current Ratio', key: 'currentRatio', unit: '', format: v => v.toFixed(2) },
  quickRatio: { label: 'Quick Ratio', key: 'quickRatio', unit: '', format: v => v.toFixed(2) },
  pfnEbitda: { label: 'PFN/EBITDA', key: 'pfnEbitda', unit: 'anni', format: v => v.toFixed(2) },
  leverageRatio: { label: 'Leverage', key: 'leverageRatio', unit: '', format: v => v.toFixed(2) },
  utile: { label: 'Utile Netto', key: 'year', unit: 'EUR', format: () => '' }, // special case
};

interface XbrlKpiWidgetProps {
  metric: string;
}

export default function XbrlKpiWidget({ metric }: XbrlKpiWidgetProps) {
  const { data, ratios, isLoading } = useXbrlData();
  const { theme } = useChartTheme();

  if (isLoading || !data || ratios.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const config = METRICS[metric];
  if (!config) {
    return (
      <Card className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Metrica non trovata: {metric}</p>
      </Card>
    );
  }

  const current = ratios[ratios.length - 1];
  const prev = ratios.length > 1 ? ratios[ratios.length - 2] : null;

  // Special case for "utile"
  let value: string;
  let changeVal: number | null = null;

  if (metric === 'utile') {
    const latestYear = data.years[data.years.length - 1];
    const prevYear = data.years.length > 1 ? data.years[data.years.length - 2] : null;
    const utile = latestYear.contoEconomico.utilePerditaEsercizio;
    value = Math.round(utile).toLocaleString('it-IT') + ' EUR';
    if (prevYear) {
      const prevUtile = prevYear.contoEconomico.utilePerditaEsercizio;
      changeVal = prevUtile !== 0 ? ((utile - prevUtile) / Math.abs(prevUtile)) * 100 : null;
    }
  } else {
    const rawValue = current[config.key] as number;
    value = config.format(rawValue);
    if (prev) {
      const prevValue = prev[config.key] as number;
      changeVal = prevValue !== 0 ? ((rawValue - prevValue) / Math.abs(prevValue)) * 100 : null;
    }
  }

  const changeStr = changeVal !== null ? (changeVal >= 0 ? '+' : '') + changeVal.toFixed(1) + '%' : '';
  const isPositive = changeVal !== null && changeVal >= 0;

  return (
    <Card className="h-full flex flex-col justify-center">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{config.label}</CardTitle>
        <span className="text-xs text-muted-foreground">{current.year}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {changeStr && (
          <p className="text-xs text-muted-foreground">
            <span style={{ color: isPositive ? theme.kpiPositiveColor : theme.kpiNegativeColor }}>
              {changeStr}
            </span>{' '}
            vs anno prec.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
