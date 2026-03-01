/**
 * @fileOverview OpenRouter provider for Vercel AI SDK.
 * Uses @ai-sdk/openai with custom baseURL pointing to OpenRouter.
 */

import { createOpenAI } from '@ai-sdk/openai';

/**
 * Creates an OpenRouter-compatible provider for Vercel AI SDK.
 * Since OpenRouter exposes an OpenAI-compatible API, we reuse @ai-sdk/openai.
 */
export function createOpenRouterProvider(apiKey: string) {
    return createOpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
            'HTTP-Referer': 'https://fridai.ai',
            'X-Title': 'FridAI Agent',
        },
    });
}

/**
 * Get a model instance from OpenRouter for use with Vercel AI SDK.
 * @param apiKey - OpenRouter API key
 * @param modelId - Model identifier (e.g. 'anthropic/claude-sonnet-4', 'openai/gpt-4o')
 */
export function getOpenRouterModel(apiKey: string, modelId: string) {
    const provider = createOpenRouterProvider(apiKey);
    // MUST use .chat() for OpenRouter - the default provider(modelId) uses
    // OpenAI's Responses API which OpenRouter does NOT support.
    return provider.chat(modelId);
}
