'use server';
/**
 * @fileOverview An AI flow to fix or complete code scripts.
 *
 * - fixScript - A function that handles the script modification.
 */

import { ai } from '@/ai/genkit';
import { FixScriptInputSchema, FixScriptOutputSchema, type FixScriptInput, type FixScriptOutput } from '@/ai/schemas/fix-script-schema';


export async function fixScript(input: FixScriptInput): Promise<FixScriptOutput> {
  return fixScriptFlow(input);
}

const prompt = ai.definePrompt({
  name: 'fixScriptPrompt',
  input: { schema: FixScriptInputSchema },
  output: { schema: FixScriptOutputSchema },
  prompt: `You are an expert programmer specializing in SQL and Python for data pipelines.
Your task is to modify the provided script based on the user's instruction.
If the instruction implies generating code, you MUST return the code inside a markdown code block and ALWAYS precede it with a short introductory sentence. For example:
User instruction: "select all from orders"
Your response:
Here is the SQL query you requested:
'''sql
SELECT * FROM orders;
'''

If the instruction is a question or a request for explanation, answer it clearly without a code block.

Instruction: {{{instruction}}}

Script to modify:
'''
{{{script}}}
'''
`,
});

const fixScriptFlow = ai.defineFlow(
  {
    name: 'fixScriptFlow',
    inputSchema: FixScriptInputSchema,
    outputSchema: FixScriptOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
