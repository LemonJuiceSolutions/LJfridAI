'use server';
/**
 * @fileOverview A flow to generate a sales report by processing mock data.
 * This flow simulates a multi-step data pipeline using plain async functions.
 */

import { z } from 'zod';
import { mockSalesData } from '@/lib/data';
import { logAiDecision, startAiTimer } from '@/lib/ai-audit';

// Define schemas for tool inputs and outputs
const AggregatedSalesSchema = z.array(z.object({
  product: z.string(),
  total_sales: z.number(),
}));

const AnalysisResultSchema = z.object({
  bestProduct: z.string(),
  worstProduct: z.string(),
  chartData: z.array(z.object({
    name: z.string(),
    value: z.number(),
  })),
});

// 1. Function to get raw data (simulated)
async function getRawSalesData(): Promise<any[]> {
  // In a real scenario, this would query a database or API.
  return mockSalesData;
}

// 2. Function to aggregate data using SQL (simulated)
async function aggregateSalesByProduct(data: any[]): Promise<z.infer<typeof AggregatedSalesSchema>> {
  // This simulates running a SQL query like:
  // SELECT product, SUM(sales) as total_sales FROM salesData GROUP BY product;
  const salesByProduct = data.reduce((acc, sale: any) => {
    if (!acc[sale.product]) {
      acc[sale.product] = 0;
    }
    acc[sale.product] += Number(sale.sales || 0);
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(salesByProduct).map(([product, total_sales]) => ({
    product,
    total_sales: Number(total_sales),
  }));
}

// 3. Function to analyze aggregated data using Python (simulated)
async function analyzeProductPerformance(data: any[]): Promise<z.infer<typeof AnalysisResultSchema>> {
  // This simulates a Python script for analysis
  if (data.length === 0) {
    return { bestProduct: 'N/A', worstProduct: 'N/A', chartData: [] };
  }

  let bestProduct = data[0];
  let worstProduct = data[0];

  data.forEach(item => {
    if (item.total_sales > bestProduct.total_sales) {
      bestProduct = item;
    }
    if (item.total_sales < worstProduct.total_sales) {
      worstProduct = item;
    }
  });

  const chartData = data.map(item => ({
    name: item.product,
    value: item.total_sales,
  }));

  return {
    bestProduct: bestProduct.product,
    worstProduct: worstProduct.product,
    chartData: chartData,
  };
}

// Main flow output schema
const ReportDataSchema = z.object({
  bestProduct: z.string().describe("The product with the highest sales."),
  worstProduct: z.string().describe("The product with the lowest sales."),
  table: z.object({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number()]))),
  }).describe("A table of aggregated sales data."),
  chartData: z.array(z.object({
    name: z.string(),
    value: z.number(),
  })).describe("Data formatted for a bar chart."),
});
export type ReportData = z.infer<typeof ReportDataSchema>;

async function reportFlow(): Promise<ReportData> {
  const timer = startAiTimer();

  // Step 1: Get raw data
  const rawData = await getRawSalesData();

  // Step 2: Aggregate sales
  const aggregatedSales = await aggregateSalesByProduct(rawData);

  // Step 3: Analyze performance
  const analysis = await analyzeProductPerformance(aggregatedSales);

  // Step 4: Format for output
  const table = {
    headers: ['Product', 'Total Sales'],
    rows: aggregatedSales.map(item => [item.product, item.total_sales] as [string, number]),
  };

  const result = {
    bestProduct: analysis.bestProduct,
    worstProduct: analysis.worstProduct,
    table: table,
    chartData: analysis.chartData,
  };

  try {
    logAiDecision({
      timestamp: new Date().toISOString(),
      userId: 'unknown',
      companyId: 'unknown',
      flowName: 'report',
      model: 'local-aggregation',
      durationMs: timer.durationMs(),
      inputSummary: `Sales report generation (${rawData.length} raw records)`,
      outputSummary: `Best: ${result.bestProduct}, Worst: ${result.worstProduct}, ${aggregatedSales.length} products`,
      action: 'generated',
    });
  } catch (_) { /* never break the flow */ }

  return result;
}

export async function runReport(): Promise<ReportData> {
  return await reportFlow();
}
