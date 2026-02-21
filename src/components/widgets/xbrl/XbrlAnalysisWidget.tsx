'use client';

import React from 'react';
import { useXbrlData } from '@/hooks/use-xbrl-data';
import { findChartConfig } from '@/lib/xbrl-analysis-tree';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';

const SmartWidgetRenderer = React.lazy(() => import('@/components/widgets/builder/SmartWidgetRenderer'));

interface XbrlAnalysisWidgetProps {
  nodeId: string;
  chartId: string;
}

export default function XbrlAnalysisWidget({ nodeId, chartId }: XbrlAnalysisWidgetProps) {
  const { data, ratios, isLoading, error, refreshData } = useXbrlData();

  const chartConfig = findChartConfig(nodeId, chartId);

  if (isLoading) {
    return (
      <Card className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full flex items-center justify-center p-4">
        <p className="text-sm text-destructive">{error}</p>
      </Card>
    );
  }

  if (!data || ratios.length === 0 || !chartConfig) {
    return (
      <Card className="h-full flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">
          {!chartConfig ? `Grafico non trovato: ${nodeId}/${chartId}` : 'Nessun dato disponibile'}
        </p>
      </Card>
    );
  }

  const extracted = chartConfig.dataExtractor(data, ratios);

  return (
    <React.Suspense
      fallback={
        <Card className="h-full flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </Card>
      }
    >
      <SmartWidgetRenderer
        data={extracted.data}
        config={{
          ...extracted.config,
          type: extracted.config.type || chartConfig.type,
          title: extracted.config.title || chartConfig.title,
        }}
        onRefresh={refreshData}
      />
    </React.Suspense>
  );
}
