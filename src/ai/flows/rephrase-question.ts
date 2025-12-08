
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
  prompt: `You are an AI assistant designed to rephrase questions for clarity or suggest related options.
  You MUST respond in Italian.

  Original Question: {{{question}}}

  Context: {{{context}}}

  Please provide a rephrased question that is easier to understand or suggest a few related options that the user can choose from.
  Ensure the rephrased question or suggested options are clear and concise.
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
