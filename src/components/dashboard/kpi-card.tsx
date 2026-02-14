'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useChartTheme } from '@/hooks/use-chart-theme';

type KpiCardProps = {
  title: string;
  value: string;
  change: string;
  period: string;
  className?: string;
};

export default function KpiCard({ title, value, change, period, className }: KpiCardProps) {
  const { theme } = useChartTheme();
  const isPositive = change.startsWith('+');
  return (
    <Card className={cn("h-full flex flex-col justify-center", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">
          {change && <span style={{ color: isPositive ? theme.kpiPositiveColor : theme.kpiNegativeColor }}>{change}</span>} {period}
        </p>
      </CardContent>
    </Card>
  );
}
