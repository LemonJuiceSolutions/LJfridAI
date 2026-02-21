
'use server';

/**
 * @fileOverview A flow to rephrase a question for clarity or suggest related options.
 *
 * - rephraseQuestion - A function that rephrases a question for better understanding.
 * - RephraseQuestionInput - The input type for the rephraseQuestion function.
 * - RephraseQuestionOutput - The return type for the rephraseQuestion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const RephraseQuestionInputSchema = z.object({
  question: z.string().describe('The question to rephrase.'),
  context: z.string().optional().describe('Additional context to help rephrase the question.'),
});
export type RephraseQuestionInput = z.infer<typeof RephraseQuestionInputSchema>;

const RephraseQuestionOutputSchema = z.object({
  rephrasedQuestion: z.string().describe('The rephrased question or suggested options.'),
});
export type RephraseQuestionOutput = z.infer<typeof RephraseQuestionOutputSchema>;

export async function rephraseQuestion(input: RephraseQuestionInput): Promise<RephraseQuestionOutput> {
  return rephraseQuestionFlow(input);
}

const rephraseQuestionPrompt = ai.definePrompt({
  name: 'rephraseQuestionPrompt',
  input: {schema: RephraseQuestionInputSchema},
  output: {schema: RephraseQuestionOutputSchema},
  prompt: `You are an AI assistant specialized in making questions clearer and more effective for decision-making processes.
  You MUST respond in Italian.

  ## YOUR APPROACH:
  1. **ANALYZE** the original question: Is it ambiguous? Too technical? Too long? Missing context?
  2. **IDENTIFY** the core intent: What decision or information is this question trying to elicit?
  3. **REPHRASE** to be: (a) clear and unambiguous, (b) accessible to non-technical users, (c) actionable with distinct choices
  4. **VERIFY**: Would a user understand this question without additional context?

  Original Question: {{{question}}}

  Context: {{{context}}}

  Please provide a rephrased question that is easier to understand or suggest a few related options that the user can choose from.
  Ensure the rephrased question or suggested options are clear, concise, and use simple language.
  If the question contains technical jargon, translate it to everyday language while preserving the meaning.
  Output should be a single string.
  `,
});

const rephraseQuestionFlow = ai.defineFlow(
  {
    name: 'rephraseQuestionFlow',
    inputSchema: RephraseQuestionInputSchema,
    outputSchema: RephraseQuestionOutputSchema,
  },
  async input => {
    const {output} = await rephraseQuestionPrompt(input);
    return output!;
  }
);
