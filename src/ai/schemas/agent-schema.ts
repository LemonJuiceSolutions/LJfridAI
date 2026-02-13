/**
 * @fileOverview Zod schemas and TypeScript types for the AI agent flows.
 *
 * - AgentInputSchema - The Zod schema for agent input
 * - AgentOutputSchema - The Zod schema for agent output
 * - AgentInput - The TypeScript type for agent input
 * - AgentOutput - The TypeScript type for agent output
 */

import { z } from 'genkit';

export const AgentInputSchema = z.object({
  nodeId: z.string().describe('The ID of the tree node'),
  agentType: z.enum(['sql', 'python']).describe('The type of agent: sql or python'),
  userMessage: z.string().describe('The user message to the agent'),
  script: z.string().describe('The current SQL query or Python code'),
  tableSchema: z.any().describe('Schema information about input tables (columns, types)'),
  inputTables: z.any().describe('Sample data from input tables for context'),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.number().optional(),
  })).describe('Previous conversation messages'),
  needsClarification: z.boolean().optional().describe('Whether the agent needs clarification'),
  connectorId: z.string().optional().describe('The SQL connector ID for executing queries'),
  companyId: z.string().optional().describe('The company ID for KB and tree access'),
  openRouterConfig: z.object({
    apiKey: z.string().optional(),
    model: z.string().optional(),
  }).optional().describe('OpenRouter configuration'),
});

export type AgentInput = z.infer<typeof AgentInputSchema>;

export const AgentOutputSchema = z.object({
  message: z.string().describe('The agent response message'),
  updatedScript: z.string().optional().describe('The updated SQL query or Python code'),
  needsClarification: z.boolean().describe('Whether the agent needs clarification'),
  clarificationQuestions: z.array(z.string()).optional().describe('Questions to ask the user for clarification'),
  preview: z.any().optional().describe('Optional preview data (table, chart, variable)'),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;
