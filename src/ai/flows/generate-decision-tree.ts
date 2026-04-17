'use server';

/**
 * @fileOverview This file defines a flow for generating a decision tree from extracted variables.
 *
 * - generateDecisionTree - A function that generates a decision tree from a text description of a process.
 * - GenerateDecisionTreeInput - The input type for the generateDecisionTree function.
 * - GenerateDecisionTreeOutput - The return type for the generateDecisionTreeOutput function.
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { getOpenRouterProvider, DEFAULT_MODEL } from '@/ai/ai-client';

const GenerateDecisionTreeInputSchema = z.object({
  textDescription: z
    .string()
    .describe(
      'A text description in natural language that describes a process, an experience, or a problem-solving scenario.'
    ),
  variablesTable: z.string().describe('A table of variables and their possible values.'),
});
export type GenerateDecisionTreeInput = z.infer<typeof GenerateDecisionTreeInputSchema>;

const GenerateDecisionTreeOutputSchema = z.object({
  naturalLanguageDecisionTree: z
    .string()
    .describe('A version in natural language of the decision tree, understandable to a non-technical person.'),
  jsonDecisionTree: z
    .string()
    .describe('A structured JSON representation of the decision tree that the engine can interpret, with nodes, conditions, and actions.'),
  questionsScript: z
    .string()
    .describe('A script of questions for step-by-step guidance in a super minimal and professional interface.'),
});
export type GenerateDecisionTreeOutput = z.infer<typeof GenerateDecisionTreeOutputSchema>;

export async function generateDecisionTree(
  input: GenerateDecisionTreeInput
): Promise<GenerateDecisionTreeOutput> {
  return generateDecisionTreeFlow(input);
}

async function generateDecisionTreeFlow(input: GenerateDecisionTreeInput): Promise<GenerateDecisionTreeOutput> {
    const promptText = `You are a Business Rules Engine with natural language interpretation capabilities.
Your output, including all text in the natural language description, the JSON content (questions and decisions), and the question script, MUST be in Italian.

## STRUCTURED REASONING (MANDATORY):
Before generating the decision tree, follow this process:
1. **UNDERSTAND**: Read the text and variables table completely. Identify the main decision flow.
2. **MAP**: Draw a mental map of all possible paths from start to end. Every variable should create a branching point.
3. **STRUCTURE**: Organize the branches logically - most important/common decisions first, edge cases later.
4. **GENERATE**: Create the tree ensuring EVERY path leads to a clear, actionable decision.
5. **VALIDATE**: Check that (a) every variable is used, (b) no path is a dead end, (c) the JSON is valid and parsable, (d) decisions are specific, not generic.

Input: A descriptive text in natural language that tells a process, an experience, or a problem-solving case, along with a table of extracted variables.

Task:
1. Use the variables and values from the variables table to construct a detailed and highly-branched decision tree. The tree should be as deep and complex as the provided text allows, considering all possible paths and conditions.
2. Each node must have a 'question' and 'options'. The 'options' should lead to another node or a final 'decision'.
3. Each leaf of the tree must be a 'decision' string, or an object with a 'decision' key.
4. Provide three outputs:
   a) A version in natural language of the tree, understandable to a non-technical person.
   b) A structured JSON representation of the decision tree.
   c) A script of questions for step-by-step guidance in a super minimal and professional interface.

**CRITICAL RULE FOR 'jsonDecisionTree'**:
The value for the 'jsonDecisionTree' field MUST be a raw, clean, and perfectly parsable JSON object string.
- It MUST NOT be wrapped in markdown backticks (e.g., \`\`\`json ... \`\`\`).
- It MUST NOT contain any explanatory text before or after the JSON object.
- It MUST start with '{' and end with '}'.

Example of a valid JSON structure for 'jsonDecisionTree':
{
  "question": "Is the device under warranty?",
  "options": {
    "Yes": {
      "question": "Is there accidental damage?",
      "options": {
        "Yes": { "decision": "Charge for repair." },
        "No": { "decision": "Free repair." }
      }
    },
    "No": { "decision": "Charge for repair." }
  }
}


Here is the input text:
${input.textDescription}

Here is the variables table:
${input.variablesTable}
`;

    let attempts = 0;
    const maxAttempts = 3;

    const { maybeRedact } = await import('@/lib/pii-redact');
    const redactedPrompt = maybeRedact(promptText);
    while (attempts < maxAttempts) {
        try {
            const provider = getOpenRouterProvider();
            const { object } = await generateObject({
                model: provider(DEFAULT_MODEL),
                prompt: redactedPrompt,
                schema: GenerateDecisionTreeOutputSchema,
            });

            // Validate JSON before returning
            JSON.parse(object.jsonDecisionTree);
            return object;
        } catch (e) {
            attempts++;
            if (attempts >= maxAttempts) {
                throw new Error("L'IA non è riuscita a generare un JSON valido dopo diversi tentativi. Si prega di riprovare.");
            }
            console.warn(`Tentativo ${attempts} fallito, l'IA ha generato un JSON non valido. Riprovo...`);
        }
    }
    // This line should not be reachable, but it satisfies TypeScript's need for a return path.
    throw new Error("Si è verificato un errore imprevisto nella generazione dell'albero.");
}
