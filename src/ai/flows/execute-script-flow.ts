'use server';
/**
 * @fileOverview An AI flow to execute SQL scripts.
 *
 * - executeScript - A function that handles the script execution.
 */

import { ai } from '@/ai/genkit';
import { customerOrdersData, materialsData, mockSalesData } from '@/lib/data';
import { ExecuteScriptInputSchema, ExecuteScriptOutputSchema, type ExecuteScriptInput, type ExecuteScriptOutput } from '@/ai/schemas/execute-script-schema';


export async function executeScript(input: ExecuteScriptInput): Promise<ExecuteScriptOutput> {
  return executeScriptFlow(input);
}


// A simple regex to find the table name after FROM
const fromRegex = /from\s+([a-zA-Z0-9_]+)/i;

const executeScriptFlow = ai.defineFlow(
  {
    name: 'executeScriptFlow',
    inputSchema: ExecuteScriptInputSchema,
    outputSchema: ExecuteScriptOutputSchema,
  },
  async ({ script, data, node }) => {
    try {
      let sourceData: any[] = [];
      const fromMatch = script ? script.match(fromRegex) : null;

      const tableName = fromMatch?.[1];

      if (data) {
        sourceData = data;
      } else if (tableName) {
        if (tableName.toLowerCase() === 'customerordersdata') {
          const cleanedData = customerOrdersData.flatMap(order =>
            order.lines.map(line => ({
              orderId: order.id,
              customer: order.customer,
              orderDate: order.date,
              productId: line.jobId,
              productName: line.product,
              sku: line.sku,
              quantity: line.quantity,
              price: line.price,
              lineStatus: line.status,
            }))
          );
          sourceData = cleanedData;
        } else if (tableName.toLowerCase() === 'materialsdata') {
          sourceData = materialsData;
        } else if (tableName.toLowerCase() === 'orders') { // For mock discount calc
          sourceData = [{ discount_percentage: 10 }, { discount_percentage: 15 }, { discount_percentage: 5 }];
        }
      }

      // --- SIMULATED EXECUTION ---

      if (node?.previewType === 'kpi') {
        if (script && script.toLowerCase().includes('avg')) {
          const sum = sourceData.reduce((acc, item) => acc + (item.discount_percentage || 0), 0);
          const avg = sourceData.length > 0 ? sum / sourceData.length : 0;
          if (avg > 0) {
            return {
              value: avg.toFixed(1) + '%',
              label: 'Sconto Medio',
            };
          }
        }
        // Fallback KPI value if script fails or doesn't produce a result
        return {
          value: '12.3%',
          label: 'Sconto Medio (mock)',
        };
      }

      if (node?.previewType === 'chart') {
        const salesByProduct = mockSalesData.reduce((acc, sale) => {
          if (!acc[sale.product]) {
            acc[sale.product] = 0;
          }
          acc[sale.product] += sale.sales;
          return acc;
        }, {} as Record<string, number>);

        const chartData = Object.entries(salesByProduct).map(([product, total_sales]) => ({
          name: product,
          value: total_sales,
        }));
        return chartData;
      }

      // Default to table format
      const salesByProduct = mockSalesData.reduce((acc, sale) => {
        if (!acc[sale.product]) {
          acc[sale.product] = 0;
        }
        acc[sale.product] += sale.sales;
        return acc;
      }, {} as Record<string, number>);

      const tableData = Object.entries(salesByProduct).map(([product, total_sales]) => ({
        product,
        total_sales,
      }));

      return tableData;


    } catch (e: any) {
      console.error('Error executing script:', e);
      throw new Error(`Failed to execute script: ${e.message}`);
    }
  }
);
