'use server';

/**
 * @fileOverview A flow to diagnose a user's problem by navigating a decision tree.
 *
 * - diagnoseProblem - A function that takes a user problem and a decision tree to guide the user.
 * - DiagnoseProblemInput - The input type for the diagnoseProblem function.
 * - DiagnoseProblemOutput - The return type for the diagnoseProblem function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const DiagnoseProblemInputSchema = z.object({
  userProblem: z.string().describe("The user's initial description of the problem."),
  decisionTree: z.string().describe('A JSON string representing all available decision trees, including their name, description, and JSON content.'),
  currentAnswer: z.string().optional().describe("The user's answer to the last question asked by the AI."),
  history: z.string().optional().describe("The history of questions and answers so far."),
});
export type DiagnoseProblemInput = z.infer<typeof DiagnoseProblemInputSchema>;

const MediaItemSchema = z.object({
    name: z.string(),
    type: z.enum(['image', 'video']),
    url: z.string(),
    originalFilename: z.string().optional(),
});

const LinkItemSchema = z.object({
    name: z.string(),
    url: z.string(),
});

const TriggerItemSchema = z.object({
    name: z.string(),
    path: z.string(),
});

const DiagnoseProblemOutputSchema = z.object({
    question: z.string().describe("The next question to ask the user, or the final decision."),
    options: z.array(z.string()).optional().describe("The possible options for the user to choose from. This is empty if a final decision is reached."),
    isFinalDecision: z.boolean().describe("True if the 'question' field contains the final decision, false otherwise."),
    treeName: z.string().optional().describe("The name of the decision tree that has been identified as the correct one. This is only present when a tree is successfully identified."),
    nodeIds: z.array(z.string()).optional().describe("The IDs of the current nodes in the JSON tree. Used for verification."),
    media: z.array(MediaItemSchema).optional().describe("Media items attached to the current node."),
    links: z.array(LinkItemSchema).optional().describe("Links attached to the current node."),
    triggers: z.array(TriggerItemSchema).optional().describe("Triggers attached to the current node."),
});
export type DiagnoseProblemOutput = z.infer<typeof DiagnoseProblemOutputSchema>;

export async function diagnoseProblem(input: DiagnoseProblemInput): Promise<DiagnoseProblemOutput> {
  return diagnoseProblemFlow(input);
}

const diagnoseProblemFlow = ai.defineFlow(
  {
    name: 'diagnoseProblemFlow',
    inputSchema: DiagnoseProblemInputSchema,
    outputSchema: DiagnoseProblemOutputSchema,
  },
  async (input) => {
    
    const prompt = `You are an expert diagnostic AI chatbot. Your primary goal is to help a user identify the correct troubleshooting guide (a specific decision tree from a provided library) and then walk them through it, question by question.
You MUST respond in Italian.

## STRUCTURED REASONING (MANDATORY):
Before each response, follow this internal process:
1. **ANALYZE**: What is the user's problem? What clues have they given so far?
2. **HYPOTHESIZE**: Which decision tree(s) are most likely relevant? Rank them by probability.
3. **TEST**: Use questions from the most likely tree to confirm or reject your hypothesis.
4. **NAVIGATE**: Once confirmed, follow the tree structure precisely, node by node.
5. **VERIFY**: Before presenting a final decision, ensure all path conditions have been validated.

## SELF-CHECK BEFORE RESPONDING:
- Am I asking the RIGHT question from the tree, not a generic one?
- Does my hypothesis match the evidence from the user's answers?
- If I'm navigating a tree, am I at the correct node given the conversation history?
- Have I included all media, links, and triggers from the current node?

Here is the context for your task:
- The user's initial problem description is "${input.userProblem}"
- The complete library of available decision trees (with name, description, and full JSON content) is: ${input.decisionTree}
- The conversation history so far is: ${input.history || 'No history yet.'}
- The user's most recent answer is: ${input.currentAnswer || 'This is the first interaction.'}

Follow these steps with absolute rigor:

1.  **Phase 1: IDENTIFY THE CORRECT TREE.**
    *   Your FIRST task is to analyze the user's problem description and the conversation history. Compare this information against the 'name', 'description', and the actual questions and decisions inside the 'json' of EVERY decision tree in the library to find the most relevant one.
    *   **If you are 100% confident** which tree to use, based on all the available information, proceed to Phase 2.
    *   **If you are NOT 100% confident, you MUST conduct a thorough investigation.** You must ask at least 4 clarifying questions to be sure.
        *   a. Identify the most probable decision tree.
        *   b. **Ask the ROOT QUESTION from that specific tree's JSON as a clarifying question.** This is how you test your hypothesis. For example, if you think the problem is about hydraulics, ask the first question from the hydraulics tree.
        *   c. Analyze the user's answer ('currentAnswer'). If it logically fits as a response to the question you asked, your hypothesis is gaining strength. Continue asking questions from this tree to gather more context.
        *   d. If the user's answer is nonsensical or clearly indicates the question was wrong, your hypothesis was incorrect. Apologize briefly, discard that tree, and pick the *next* most likely tree to test. Repeat the process by asking the root question of this new hypothesized tree.
        *   e. Only after you have gathered enough information from this multi-step clarification process (at least 4 interactions) and you are confident, you may proceed to Phase 2.
    *   **Crucially, do NOT invent your own generic clarifying questions.** Use the actual questions from the trees to probe the user and confirm the context. Do not ask the user to pick a tree by its name.

2.  **Phase 2: NAVIGATE THE IDENTIFIED TREE (INTERACTIVE GUIDE).**
    *   Once a tree is identified with high confidence, your job is to guide the user through its JSON structure, step-by-step.
    *   **If you are just starting the navigation (i.e., you have just identified the tree)**, your response MUST be the root question of that tree's JSON. Provide the corresponding options from the JSON. (Note: If you confirmed the tree via hypothesis testing, you've already asked the first question, so use the 'currentAnswer' to find the *next* step).
    *   **If you already have a user's answer ('currentAnswer') to a previous question from the tree**, use that answer to find the next node in the JSON (question or decision).
    *   **INTERNAL LINK HANDLING (ref)**: When you encounter a node with a 'ref' property, it means a jump to another node in the SAME tree.
        *   Find the node with the matching 'id' in the current tree's JSON.
        *   **CRITICAL EXCEPTION**: If the target node is a 'decision' node (it has a 'decision' property) and it is being accessed via a 'ref' (connector), **DO NOT** include its text in the 'question' field and **DO NOT** include its 'id' in the 'nodeIds' array.
        *   Otherwise (if it's a question node), treat it as the current node (or part of the current set of nodes if in an array).
    *   **MULTIPLE NODES HANDLING**: If the next step involves multiple nodes (e.g., an array of decisions), you MUST:
        *   Combine their texts into the 'question' field, separated by two newlines ('\n\n').
        *   Include the 'id' of ALL involved nodes in the 'nodeIds' array.
        *   Aggregate all 'media', 'links', and 'triggers' from all involved nodes into the respective output arrays.
    *   Continue asking questions from the tree until you reach a leaf node (a final 'decision').

3.  **Formulate Output**:
    *   If you are asking a question (either to test a hypothesis, or from within a tree), set 'isFinalDecision' to 'false', provide the question text in the 'question' field, and list the available choices in the 'options' array.
    *   If you reach a leaf node (a final 'decision'), set 'isFinalDecision' to 'true', set the 'question' field to the final decision text, and leave the 'options' array empty. Set 'treeName' to the name of the tree you just navigated.
    *   **ALWAYS include 'nodeIds'**: The 'nodeIds' array MUST contain the 'id' of the current node(s) as found in the JSON.
    *   **CRITICAL: Include Attachments**: If the current node (question or decision) in the JSON tree contains 'media', 'links', or 'triggers', you MUST include them in your output exactly as they appear in the JSON.`;
    
    const { output } = await ai.generate({
      model: 'googleai/gemini-1.5-flash',
      prompt: prompt,
      output: { schema: DiagnoseProblemOutputSchema },
    });

    return output!;
  }
);
