'use client';
import React from 'react';
import { ComposedChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { overviewChartData } from '@/lib/data';

export default function OverviewChart() {

  const currentMonthIndex = new Date().getMonth();

  // Create separate data series for actual and forecast
  const chartData = overviewChartData.map((item, index) => ({
    ...item,
    revenueActualDisplay: index <= currentMonthIndex ? item.revenueActual : null,
    forecastDisplay: index >= currentMonthIndex ? (item.revenueActual ?? item.forecast) : null,
  }));

  // Connect the forecast line to the last actual data point
  if (currentMonthIndex > 0 && currentMonthIndex < chartData.length) {
    chartData[currentMonthIndex].revenueActualDisplay = chartData[currentMonthIndex - 1].revenueActual;
  }

  return (
    <Card className="xl:col-span-2 h-full flex flex-col">
      <CardHeader>
        <CardTitle>Fatturato, Intake & Budget</CardTitle>
        <CardDescription>Andamento mensile del fatturato, ordini acquisiti (intake) e budget.</CardDescription>
      </CardHeader>
      <CardContent className="pl-2 flex-1 overflow-y-auto custom-scrollbar">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `€${value / 1000}k`}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                const displayName = name === 'revenueActualDisplay' ? 'Fatturato Reale' : name === 'forecastDisplay' ? 'Forecast' : name;
                return [new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value), displayName];
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="revenueActualDisplay"
              name="Fatturato Reale"
              stroke="hsl(var(--chart-4))"
              strokeWidth={3}
              dot={(props: any) => {
                const { cx, cy, index } = props;
                if (index > currentMonthIndex) {
                  return <g />;
                }
                return <circle key={index} cx={cx} cy={cy} r={4} fill="hsl(var(--chart-4))" stroke="#fff" strokeWidth={2} />;
              }}

            />
            <Line
              type="monotone"
              dataKey="forecastDisplay"
              name="Forecast"
              stroke="hsl(var(--chart-1))"
              strokeWidth={3}
              strokeDasharray="5 5"
              dot={false}
            />
            <Line type="monotone" dataKey="intake" name="Intake" stroke="hsl(var(--chart-2))" strokeWidth={2} />
            <Line type="monotone" dataKey="budget" name="Budget" stroke="hsl(var(--chart-3))" strokeWidth={2} strokeDasharray="5 5" />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
