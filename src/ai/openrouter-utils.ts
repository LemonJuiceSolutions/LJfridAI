
/**
 * @fileOverview Shared utilities for OpenRouter integration in agents.
 */

export interface OpenRouterTool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, any>;
            required: string[];
        };
    };
}

/**
 * Maps a user selected model string to either a Genkit Google model ID or returns it as an OpenRouter model ID.
 * Returns the provider ('google' or 'openrouter') and the model name to use.
 */
export function resolveModel(userModel?: string): { provider: 'google' | 'openrouter', modelName: string } {
    // Default to Gemini if no model specified
    if (!userModel) {
        return { provider: 'google', modelName: 'googleai/gemini-2.5-flash' };
    }

    // Explicit overrides for known Google models to use Genkit native plugin
    // ONLY if the user model string matches standard OpenRouter google identifiers
    // AND we want to route them through Vertex/Genkit locally.
    // However, if the user explicitly provided an API Key for OpenRouter, they might EXPECT it to go through OpenRouter.
    // But defaults usually don't have API keys for Vertex built-in unless we are in the cloud.
    // Let's stick to the simple mapping:

    // REMOVED: Force Google models to use Genkit native plugin
    // if (userModel.startsWith('google/') && (userModel.includes('gemini') || userModel.includes('flash') || userModel.includes('pro'))) {
    //     const modelName = userModel.replace('google/', '');
    //     const cleanName = modelName.replace(/-\d{3}$/, ''); // simple strip version
    //     return { provider: 'google', modelName: `googleai/${cleanName}` };
    // }

    // Default: OpenRouter
    return { provider: 'openrouter', modelName: userModel };
}

/**
 * Runs the OpenRouter agent loop: sends message, handles tool calls, sends tool outputs, repeats.
 */
export async function runOpenRouterAgentLoop(
    apiKey: string,
    model: string,
    messages: any[], // Initial history including system prompt
    tools: OpenRouterTool[],
    toolDispatcher: (name: string, args: any) => Promise<string>
): Promise<string> {
    if (!apiKey) {
        throw new Error('API key OpenRouter mancante. Configura la chiave nelle Impostazioni.');
    }

    // Clone messages to avoid mutating input
    const currentMessages = [...messages];
    const MAX_ROUNDS = 15; // Safety limit

    for (let round = 0; round < MAX_ROUNDS; round++) {
        // 1. Call API
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://fridai.ai',
                'X-Title': 'FridAI Agent',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: currentMessages,
                tools: tools.length > 0 ? tools : undefined,
                temperature: 0.7, // Consistent with Genkit config
            })
        });

        if (!response.ok) {
            let errorText = '';
            try { errorText = await response.text(); } catch { }
            throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();

        if (!data.choices || data.choices.length === 0) {
            throw new Error('OpenRouter API returned no choices.');
        }

        const choice = data.choices[0];
        const message = choice.message;

        // Add assistant message to history
        currentMessages.push(message);

        // 2. Check for tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
            // Execute all tools in parallel (or sequential if preferred, but parallel is standard)
            // But we need to push results in order? OpenAI accepts any order but matching tool_call_id is key.

            for (const toolCall of message.tool_calls) {
                const fnName = toolCall.function.name;
                const fnArgsRaw = toolCall.function.arguments;
                let fnArgs = {};
                try {
                    fnArgs = JSON.parse(fnArgsRaw);
                } catch (e) {
                    // If args are malformed, we send an error outcome
                    currentMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: fnName,
                        content: JSON.stringify({ error: "Invalid JSON arguments" })
                    });
                    continue;
                }

                // Dispatch
                let result = '';
                try {
                    result = await toolDispatcher(fnName, fnArgs);
                } catch (e: any) {
                    result = JSON.stringify({ error: e.message || "Unknown tool error" });
                }

                // Add tool response to history
                currentMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id, // CRITICAL: Link response to request
                    name: fnName,
                    content: result
                });
            }
            // Loop continues to send tool outputs back to LLM
        } else {
            // No tool calls, we have the final text answer
            return message.content || '';
        }
    }

    throw new Error(`Agent loop exceeded max rounds (${MAX_ROUNDS}).`);
}
