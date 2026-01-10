/**
 * @fileOverview Zod schemas and TypeScript types for the executeScript flow.
 *
 * - ExecuteScriptInputSchema - The Zod schema for the executeScript function input.
 * - ExecuteScriptInput - The TypeScript type for the executeScript function input.
 * - ExecuteScriptOutputSchema - The Zod schema for the executeScript function output.
 * - ExecuteScriptOutput - The TypeScript type for the executeScript function output.
 */

import { z } from 'genkit';

export const ExecuteScriptInputSchema = z.object({
  script: z.string().describe('The SQL script to be executed.').optional(),
  data: z.any().describe('The data to run the script against.').optional(),
  node: z.any().describe('The pipeline node configuration.').optional(),
});
export type ExecuteScriptInput = z.infer<typeof ExecuteScriptInputSchema>;

export const ExecuteScriptOutputSchema = z.any();
export type ExecuteScriptOutput = z.infer<typeof ExecuteScriptOutputSchema>;
