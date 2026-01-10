'use client';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { revenueByProductData } from '@/lib/data';

export default function RevenueByProductChart() {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Fatturato per Prodotto</CardTitle>
        <CardDescription>Contribuzione al fatturato per linea di prodotto (YTD).</CardDescription>
      </CardHeader>
      <CardContent className="pl-2 flex-1 overflow-auto">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={revenueByProductData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `€${value / 1000}k`}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={80}
            />
            <Tooltip
                formatter={(value: number) => [new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value), "Fatturato"]}
            />
            <Legend />
            <Bar dataKey="revenue" name="Fatturato" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
