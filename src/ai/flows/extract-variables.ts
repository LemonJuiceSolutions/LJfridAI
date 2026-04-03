'use server';
/**
 * @fileOverview A flow that extracts variables from a given text.
 *
 * - extractVariables - A function that handles the variable extraction process.
 * - ExtractVariablesInput - The input type for the extractVariables function.
 * - ExtractVariablesOutput - The return type for the extractVariables function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { nanoid } from 'nanoid';

const ExtractVariablesInputSchema = z.string().describe('A descriptive text about a process.');
export type ExtractVariablesInput = z.infer<typeof ExtractVariablesInputSchema>;

const VariableOptionSchema = z.object({
    id: z.string().describe('A unique ID for the option.'),
    name: z.string().describe('The name of the option (e.g., "In Garanzia").'),
    value: z.number().describe('A progressive integer, starting from 0 for each variable\'s options.'),
    abbreviation: z.string().describe('A short, 3-letter abbreviation in uppercase (e.g., "GAR").')
});

const VariableSchema = z.object({
  name: z.string().describe('The name of the variable.'),
  type: z
    .enum(['boolean', 'enumeration', 'numeric', 'text'])
    .describe('The type of the variable.'),
  possibleValues: z.array(VariableOptionSchema).describe('The possible values for the variable.'),
});

const ExtractVariablesOutputSchema = z.object({
  variables: z.array(VariableSchema).describe('The extracted variables from the text. This MUST be an empty array if no variables are found.'),
});
export type ExtractVariablesOutput = z.infer<typeof ExtractVariablesOutputSchema>;

// This is a workaround because the AI has trouble generating IDs. We generate them here.
const RawVariableOptionSchema = z.object({
    name: z.string(),
    value: z.number(),
    abbreviation: z.string(),
});
const RawVariableSchema = z.object({
    name: z.string(),
    type: z.enum(['boolean', 'enumeration', 'numeric', 'text']),
    possibleValues: z.array(RawVariableOptionSchema),
});
const RawOutputSchema = z.object({
    variables: z.array(RawVariableSchema),
});


export async function extractVariables(input: ExtractVariablesInput): Promise<ExtractVariablesOutput> {
  const rawResult = await extractVariablesFlow(input);
  const variablesWithIds = rawResult.variables.map(variable => ({
    ...variable,
    possibleValues: variable.possibleValues.map(option => ({
      ...option,
      id: nanoid(8),
    })),
  }));
  return { variables: variablesWithIds };
}

const extractVariablesFlow = ai.defineFlow(
  {
    name: 'extractVariablesFlow',
    inputSchema: ExtractVariablesInputSchema,
    outputSchema: RawOutputSchema, // We use the raw schema here
  },
  async input => {
    const prompt = `You are a highly intelligent entity tasked with parsing natural language descriptions of processes and extracting key variables. Your output MUST be in Italian.

## STRUCTURED REASONING (MANDATORY):
Before extracting variables, follow this process:
1. **READ THOROUGHLY**: Read the ENTIRE text at least twice to understand all conditions and branches
2. **MAP THE LOGIC**: Identify all decision points, conditions, and branching paths in the process
3. **EXTRACT CANDIDATES**: List all potential variables that drive decisions
4. **VALIDATE EACH**: For each candidate, verify it has clear, distinct options and is NOT a final action
5. **CLASSIFY**: Determine the correct type (boolean/enumeration/numeric/text)
6. **SELF-CHECK**: Review your output - are there duplicates? Missing variables? Incorrect types?

TASK:
From the user's descriptive text provided below, identify all the distinct variables that influence the outcomes. For each variable, determine its type and list all its possible values mentioned in the text.

Follow these rules strictly:
1.  **Analyze the text**: Read the entire text to understand the logic and conditions.
2.  **Identify Variables**: A variable is a factor that can change and affects the decision-making process (e.g., "warranty status", "error code presence", "pressure level"). An 'enumeration' type variable is typically a question followed by a clear list of choices or distinct branches in the text.
3.  **Determine Type**:
    *   'boolean': For variables with two opposite states (e.g., yes/no, true/false, on/off).
    *   'enumeration': For variables with a specific, limited list of text-based options (e.g., "red", "green", "blue").
    *   'numeric': For variables representing a number.
    *   'text': For open-ended text inputs.
4.  **Structure 'possibleValues'**: For each variable, you MUST create a structured object for each possible value.
    *   'name': The name of the option (e.g., "In Garanzia").
    *   'value': Assign a progressive integer, starting from 0 for each variable's options.
    *   'abbreviation': Create a short, 3-letter abbreviation in uppercase (e.g., "GAR").
    *   **DO NOT include an 'id' field.** It will be generated automatically.
5.  **CRITICAL RULE - Discard Irrelevant Variables**: You MUST ignore and discard any potential "variable" that is too generic, does not have clear, distinct options, or simply represents a final action or decision. For example, do not extract a variable for "issue a quote" or "check the circuit".
6.  **CRITICAL RULE - Empty Array**: If you analyze the text and find absolutely no valid variables according to these rules, you MUST return a JSON object with an empty array: \`{"variables": []}\`. Do not return an empty response or a string saying "no variables found".
7.  **QUALITY CHECK**: Before returning, verify: (a) each variable name is descriptive and unique, (b) each variable has at least 2 possible values, (c) abbreviations are distinct and meaningful, (d) no two variables overlap in meaning.

Example:
-   **Input Text**: "Se una macchina segnala un codice di errore, controlla se è in garanzia. Se è in garanzia, la riparazione è gratuita, altrimenti emetti un preventivo."
-   **Expected 'variables' array**:
    [
      { 
        "name": "Codice di Errore Presente", 
        "type": "boolean", 
        "possibleValues": [
          {"name": "Sì", "value": 0, "abbreviation": "SÌ"},
          {"name": "No", "value": 1, "abbreviation": "NO"}
        ] 
      },
      { 
        "name": "Stato Garanzia", 
        "type": "boolean", 
        "possibleValues": [
          {"name": "Sì", "value": 0, "abbreviation": "SÌ"},
          {"name": "No", "value": 1, "abbreviation": "NO"}
        ]
      }
    ]

User's descriptive text:
\`\`\`
${input}
\`\`\`
`;
    
    const {output} = await ai.generate({
      model: 'googleai/gemini-2.0-flash',
      prompt,
      output: { schema: RawOutputSchema },
    });
    return output!;
  }
);
