'use client';
import React from 'react';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { capacityChartData } from '@/lib/data';

export default function CapacityChart() {
  const currentMonthIndex = new Date().getMonth();

  const data = capacityChartData.map(d => ({
    ...d,
    capacity: d.capacityUsed !== null ? d.capacityUsed : d.capacityPlanned,
  }));

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Capacità Produttiva</CardTitle>
        <CardDescription>
          Analisi mensile della capacità produttiva (in minuti) in base ai dipendenti attivi.
        </CardDescription>
      </CardHeader>
      <CardContent className="pl-2 flex-1 overflow-auto">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
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
              tickFormatter={(value) => `${value / 1000}k`}
            />
            <Tooltip
              formatter={(value: number, name: string, props) => {
                const isFuture = props.payload.capacityUsed === null;
                const label = isFuture ? 'Capacità Pianificata' : 'Capacità Utilizzata';
                if (name === 'capacity') {
                    return [`${value.toLocaleString('it-IT')} min`, label];
                }
                return [`${value.toLocaleString('it-IT')} min`, name];
              }}
            />
            <Legend />
            <Line type="monotone" dataKey="capacityContract" name="Capacità da Contratto" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
            <Bar dataKey="capacity" name="Capacità Utilizzata/Pianificata" fill="hsl(var(--chart-1))">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={index < currentMonthIndex ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-1) / 0.4)'} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
