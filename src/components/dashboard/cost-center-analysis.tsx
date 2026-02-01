'use client';

import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { costCenterData } from '@/lib/data';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(
    value
  );

export default function CostCenterAnalysisChart() {
  // Calculate YTD values
  let ytdBudget = 0;
  let ytdActual = 0;
  const dataWithYTD = costCenterData.map((d) => {
    const totalBudget = d.budget.materials + d.budget.hours + d.budget.external;
    const totalActual =
      d.actual.materials !== null &&
      d.actual.hours !== null &&
      d.actual.external !== null
        ? d.actual.materials + d.actual.hours + d.actual.external
        : 0;

    ytdBudget += totalBudget;
    if (totalActual > 0) {
      ytdActual += totalActual;
    }
    return {
      ...d,
      ytdBudget,
      ytdActual: totalActual > 0 ? ytdActual : null,
    };
  });

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Andamento Costi per CDC</CardTitle>
        <CardDescription>
          Confronto mensile e YTD dei costi a budget vs. consuntivo per centro di costo.
        </CardDescription>
      </CardHeader>
      <CardContent className="pl-2 flex-1 overflow-y-auto custom-scrollbar">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dataWithYTD}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="month"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `€${Number(value) / 1000}k`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `€${Number(value) / 1000}k`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  const totalBudget = data.budget.materials + data.budget.hours + data.budget.external;
                  const totalActual = data.actual.materials + data.actual.hours + data.actual.external;

                  return (
                    <div className="rounded-lg border bg-background p-3 shadow-sm text-sm">
                      <p className="font-bold mb-2">{label}</p>
                      
                      <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                          <div></div>
                          <div className="font-semibold text-right">Budget</div>
                          <div className="font-semibold text-right">Consuntivo</div>

                          <div className="font-semibold text-muted-foreground">Materiali</div>
                          <div className="text-right">{formatCurrency(data.budget.materials)}</div>
                          <div className="text-right">{data.actual.materials !== null ? formatCurrency(data.actual.materials) : 'N/A'}</div>
                          
                          <div className="font-semibold text-muted-foreground">Ore Lavoro</div>
                          <div className="text-right">{formatCurrency(data.budget.hours)}</div>
                          <div className="text-right">{data.actual.hours !== null ? formatCurrency(data.actual.hours) : 'N/A'}</div>

                          <div className="font-semibold text-muted-foreground">Lavor. Esterne</div>
                          <div className="text-right">{formatCurrency(data.budget.external)}</div>
                          <div className="text-right">{data.actual.external !== null ? formatCurrency(data.actual.external) : 'N/A'}</div>
                          
                          <div className="col-span-3 border-t my-1"></div>

                          <div className="font-bold">Totale Mese</div>
                          <div className="font-bold text-right">{formatCurrency(totalBudget)}</div>
                          <div className="font-bold text-right">{totalActual > 0 ? formatCurrency(totalActual) : 'N/A'}</div>
                      </div>

                      <div className="border-t my-2"></div>

                       <div className="grid grid-cols-2 gap-x-4">
                          <div className="font-bold">Totale YTD Budget</div>
                          <div className="font-bold text-right">{formatCurrency(data.ytdBudget)}</div>
                          <div className="font-bold">Totale YTD Cons.</div>
                          <div className="font-bold text-right">{data.ytdActual !== null ? formatCurrency(data.ytdActual) : 'N/A'}</div>
                       </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend />
            {/* Budget Bars */}
            <Bar yAxisId="left" dataKey="budget.materials" name="Budget Materiali" stackId="budget" fill="hsl(var(--chart-1) / 0.4)" />
            <Bar yAxisId="left" dataKey="budget.hours" name="Budget Ore" stackId="budget" fill="hsl(var(--chart-2) / 0.4)" />
            <Bar yAxisId="left" dataKey="budget.external" name="Budget Esterni" stackId="budget" fill="hsl(var(--chart-3) / 0.4)" />

            {/* Actual Bars */}
            <Bar yAxisId="left" dataKey="actual.materials" name="Cons. Materiali" stackId="actual" fill="hsl(var(--chart-1))" />
            <Bar yAxisId="left" dataKey="actual.hours" name="Cons. Ore" stackId="actual" fill="hsl(var(--chart-2))" />
            <Bar yAxisId="left" dataKey="actual.external" name="Cons. Esterni" stackId="actual" fill="hsl(var(--chart-3))" />

            {/* YTD Lines */}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="ytdBudget"
              name="Costo Budget YTD"
              stroke="hsl(var(--chart-4))"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="ytdActual"
              name="Costo Cons. YTD"
              stroke="hsl(var(--chart-5))"
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
