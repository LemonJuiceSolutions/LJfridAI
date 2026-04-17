
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
 * Maps a user selected model string to an OpenRouter model ID.
 * All models go through OpenRouter — no more Genkit/Google AI routing.
 */
export function resolveModel(userModel?: string): { provider: 'openrouter', modelName: string } {
    const modelName = userModel || 'google/gemini-2.0-flash-001';
    return { provider: 'openrouter', modelName };
}

/**
 * Runs the OpenRouter agent loop: sends message, handles tool calls, sends tool outputs, repeats.
 */
export interface OpenRouterUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    total_cost?: number; // in USD, from OpenRouter
}

export interface OpenRouterResult {
    text: string;
    usage: OpenRouterUsage;
}

export async function runOpenRouterAgentLoop(
    apiKey: string,
    model: string,
    messages: any[], // Initial history including system prompt
    tools: OpenRouterTool[],
    toolDispatcher: (name: string, args: any) => Promise<string>
): Promise<string>;
export async function runOpenRouterAgentLoop(
    apiKey: string,
    model: string,
    messages: any[],
    tools: OpenRouterTool[],
    toolDispatcher: (name: string, args: any) => Promise<string>,
    returnUsage: true
): Promise<OpenRouterResult>;
export async function runOpenRouterAgentLoop(
    apiKey: string,
    model: string,
    messages: any[], // Initial history including system prompt
    tools: OpenRouterTool[],
    toolDispatcher: (name: string, args: any) => Promise<string>,
    returnUsage?: boolean
): Promise<string | OpenRouterResult> {
    if (!apiKey) {
        throw new Error('API key OpenRouter mancante. Configura la chiave nelle Impostazioni.');
    }

    // GDPR: redact PII in messages before sending to OpenRouter. Idempotent
    // for callers that already redacted upstream (sql-agent, super-agent).
    const { maybeRedact } = await import('@/lib/pii-redact');
    function redactMessage(m: any): any {
        if (!m || typeof m !== 'object') return m;
        const out: any = { ...m };
        if (typeof out.content === 'string') {
            out.content = maybeRedact(out.content);
        } else if (Array.isArray(out.content)) {
            out.content = out.content.map((part: any) =>
                part && typeof part === 'object' && typeof part.text === 'string'
                    ? { ...part, text: maybeRedact(part.text) }
                    : part,
            );
        }
        return out;
    }

    // Clone messages to avoid mutating input
    const currentMessages = [...messages];
    const MAX_ROUNDS = 15; // Safety limit
    const accumulatedUsage: OpenRouterUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, total_cost: 0 };

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
                messages: currentMessages.map(redactMessage),
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

        // Accumulate usage from each round
        if (data.usage) {
            accumulatedUsage.prompt_tokens += data.usage.prompt_tokens || 0;
            accumulatedUsage.completion_tokens += data.usage.completion_tokens || 0;
            accumulatedUsage.total_tokens += data.usage.total_tokens || 0;
            if (data.usage.total_cost != null) {
                accumulatedUsage.total_cost = (accumulatedUsage.total_cost || 0) + data.usage.total_cost;
            } else if (data.usage.cost != null) {
                accumulatedUsage.total_cost = (accumulatedUsage.total_cost || 0) + data.usage.cost;
            }
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
            if (returnUsage) {
                return { text: message.content || '', usage: accumulatedUsage };
            }
            return message.content || '';
        }
    }

    throw new Error(`Agent loop exceeded max rounds (${MAX_ROUNDS}).`);
}
