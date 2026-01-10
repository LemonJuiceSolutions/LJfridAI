'use server';
/**
 * @fileOverview A flow to generate a sales report by processing mock data.
 * This flow simulates a multi-step data pipeline using Genkit tools.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { mockSalesData } from '@/lib/data';

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

// 1. Tool to get raw data (simulated)
const getRawSalesData = ai.defineTool(
  {
    name: 'getRawSalesData',
    description: 'Retrieves the raw sales data from the data source.',
    inputSchema: z.void(),
    outputSchema: z.any(),
  },
  async () => {
    // In a real scenario, this would query a database or API.
    return mockSalesData;
  }
);

// 2. Tool to aggregate data using SQL (simulated)
const aggregateSalesByProduct = ai.defineTool(
  {
    name: 'aggregateSalesByProduct',
    description: 'Aggregates sales data by product using a SQL query.',
    inputSchema: z.array(z.any()), // Expects raw data
    outputSchema: AggregatedSalesSchema,
  },
  async (data) => {
    // This simulates running a SQL query like:
    // SELECT product, SUM(sales) as total_sales FROM salesData GROUP BY product;
    const salesByProduct = data.reduce((acc, sale) => {
      if (!acc[sale.product]) {
        acc[sale.product] = 0;
      }
      acc[sale.product] += sale.sales;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(salesByProduct).map(([product, total_sales]) => ({
      product,
      total_sales,
    }));
  }
);

// 3. Tool to analyze aggregated data using Python (simulated)
const analyzeProductPerformance = ai.defineTool(
  {
    name: 'analyzeProductPerformance',
    description: 'Analyzes aggregated sales to find best/worst products and format for charting.',
    inputSchema: AggregatedSalesSchema,
    outputSchema: AnalysisResultSchema,
  },
  async (data) => {
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
);

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

const reportFlow = ai.defineFlow(
  {
    name: 'reportFlow',
    inputSchema: z.void(),
    outputSchema: ReportDataSchema,
    system: "You are a data analyst. Execute the tools in sequence to generate the final report data.",
    tools: [getRawSalesData, aggregateSalesByProduct, analyzeProductPerformance],
  },
  async () => {
    // Step 1: Get raw data
    const rawData = await getRawSalesData();
    
    // Step 2: Aggregate sales
    const aggregatedSales = await aggregateSalesByProduct(rawData);

    // Step 3: Analyze performance
    const analysis = await analyzeProductPerformance(aggregatedSales);

    // Step 4: Format for output
    const table = {
        headers: ['Product', 'Total Sales'],
        rows: aggregatedSales.map(item => [item.product, item.total_sales]),
    };

    return {
      bestProduct: analysis.bestProduct,
      worstProduct: analysis.worstProduct,
      table: table,
      chartData: analysis.chartData,
    };
  }
);

export async function runReport(): Promise<ReportData> {
  return await reportFlow();
}
