/**
 * Shared AI client using OpenRouter via Vercel AI SDK.
 * Replaces the old Genkit/Google AI setup.
 * NOTE: no 'use server' — this is a plain module, safe to import from both server actions and route handlers.
 */
import { createOpenAI } from '@ai-sdk/openai';

export function getOpenRouterProvider() {
    return createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY || '',
        headers: {
            'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:9002',
            'X-Title': 'FridAI',
        },
    });
}

export const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';
