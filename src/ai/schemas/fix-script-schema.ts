/**
 * @fileOverview Zod schemas and TypeScript types for the fixScript flow.
 *
 * - FixScriptInputSchema - The Zod schema for the fixScript function input.
 * - FixScriptInput - The TypeScript type for the fixScript function input.
 * - FixScriptOutputSchema - The Zod schema for the fixScript function output.
 * - FixScriptOutput - The TypeScript type for the fixScript function output.
 */

import { z } from 'zod';

export const FixScriptInputSchema = z.object({
  instruction: z.string().describe('The instruction for the AI (e.g., "Fix this script", "Complete this script").'),
  script: z.string().describe('The code script to be modified.'),
});
export type FixScriptInput = z.infer<typeof FixScriptInputSchema>;

export const FixScriptOutputSchema = z.object({
  response: z.string().describe("The AI's full response, which can include both explanatory text and markdown code blocks."),
});
export type FixScriptOutput = z.infer<typeof FixScriptOutputSchema>;
