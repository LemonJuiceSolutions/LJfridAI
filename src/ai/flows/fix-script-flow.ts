'use server';
/**
 * @fileOverview An AI flow to fix or complete code scripts.
 *
 * - fixScript - A function that handles the script modification.
 */

import { generateText } from 'ai';
import { getOpenRouterProvider, DEFAULT_MODEL } from '@/ai/ai-client';
import { type FixScriptInput, type FixScriptOutput } from '@/ai/schemas/fix-script-schema';


export async function fixScript(input: FixScriptInput): Promise<FixScriptOutput> {
  const prompt = `You are an expert programmer specializing in SQL and Python for data pipelines.
Your task is to modify the provided script based on the user's instruction.
If the instruction implies generating code, you MUST return the code inside a markdown code block and ALWAYS precede it with a short introductory sentence. For example:
User instruction: "select all from orders"
Your response:
Here is the SQL query you requested:
\`\`\`sql
SELECT * FROM orders;
\`\`\`

If the instruction is a question or a request for explanation, answer it clearly without a code block.

Instruction: ${input.instruction}

Script to modify:
\`\`\`
${input.script}
\`\`\`
`;

  const provider = getOpenRouterProvider();
  const { text } = await generateText({
      model: provider(DEFAULT_MODEL),
      prompt,
  });
  return { response: text };
}
