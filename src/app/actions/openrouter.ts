'use server';

import { sanitizeJSONString, extractFirstJSON } from '@/lib/json-utils';

// Helper for OpenRouter JSON calls
export async function callOpenRouterJSON(apiKey: string, model: string, prompt: string, systemPrompt: string, maxTokens?: number): Promise<any> {
    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
    ];

    let body: any = {
        model: model,
        messages,
        response_format: { type: "json_object" },
    };
    if (maxTokens) body.max_tokens = maxTokens;

    let response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.error?.message || response.statusText || '';
        if (errMsg.toLowerCase().includes('json') || errMsg.toLowerCase().includes('response_format') || errMsg.toLowerCase().includes('not supported')) {
            console.warn(`[callOpenRouterJSON] JSON mode not supported by ${model}, retrying without response_format`);
            body = { model, messages };
            if (maxTokens) body.max_tokens = maxTokens;
            response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                const errorData2 = await response.json().catch(() => ({}));
                throw new Error(`OpenRouter Error: ${errorData2.error?.message || response.statusText}`);
            }
        } else {
            if (errMsg.toLowerCase().includes('user not found') || errMsg.toLowerCase().includes('invalid') || errMsg.toLowerCase().includes('unauthorized') || errMsg.toLowerCase().includes('401')) {
                throw new Error(`API Key OpenRouter non valida o scaduta. Controlla la tua API key nelle impostazioni (Profilo → OpenRouter). Errore originale: ${errMsg}`);
            }
            throw new Error(`OpenRouter Error: ${errMsg}`);
        }
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error(`OpenRouter: risposta vuota dal modello ${model}`);
    }
    try {
        return JSON.parse(content);
    } catch (e) {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[1]);
            } catch (e2) {
                const extracted = extractFirstJSON(jsonMatch[1]);
                if (extracted) return extracted;
            }
        }

        const extracted = extractFirstJSON(content);
        if (extracted) return extracted;

        const simpleMatch = content.match(/{[\s\S]*}/);
        if (simpleMatch) {
            try {
                return JSON.parse(simpleMatch[0]);
            } catch (e3) {
                const extractedFromMatch = extractFirstJSON(simpleMatch[0]);
                if (extractedFromMatch) return extractedFromMatch;
            }
        }

        throw new Error(`Failed to parse JSON response from AI: ${e instanceof Error ? e.message : String(e)}`);
    }
}

// Helper for OpenRouter Tool calls
export async function callOpenRouterWithTools(apiKey: string, model: string, messages: any[], tools: any[]): Promise<any> {
    const openRouterTools = tools.map(tool => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
        }
    }));

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: model,
            messages: messages,
            tools: openRouterTools,
            tool_choice: "auto"
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message;
}

export async function getOpenRouterCreditsAction(apiKey: string): Promise<{
    success: boolean;
    credits?: { totalCredits: number; totalUsage: number; remaining: number };
    error?: string;
}> {
    if (!apiKey?.trim()) return { success: false, error: 'API key mancante' };
    try {
        const res = await fetch('https://openrouter.ai/api/v1/credits', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
        });
        if (!res.ok) {
            return { success: false, error: `Errore ${res.status}: ${res.statusText}` };
        }
        const data = await res.json();
        const totalCredits = data.data?.total_credits ?? 0;
        const totalUsage = data.data?.total_usage ?? 0;
        const remaining = Math.max(0, totalCredits - totalUsage);
        return {
            success: true,
            credits: {
                totalCredits: Math.round(totalCredits * 10000) / 10000,
                totalUsage: Math.round(totalUsage * 10000) / 10000,
                remaining: Math.round(remaining * 10000) / 10000,
            },
        };
    } catch (error: any) {
        console.error('OpenRouter credits error:', error);
        return { success: false, error: error.message || 'Errore di connessione' };
    }
}

export async function testOpenRouterConnection(apiKey: string, model: string): Promise<{ success: boolean; message: string }> {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "user", content: "Ciao, questo è un test di connessione. Rispondi 'OK' se mi ricevi." }
                ],
                max_tokens: 10
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices.length > 0) {
                return { success: true, message: "Connessione riuscita! Il modello ha risposto." };
            } else {
                return { success: false, message: "Connessione stabilita, ma nessuna risposta valida dal modello." };
            }
        } else {
            let errorMsg = `Errore HTTP: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.error && errorData.error.message) {
                    errorMsg = `Errore OpenRouter: ${errorData.error.message}`;
                }
            } catch (e) { /* ignore */ }
            return { success: false, message: errorMsg };
        }
    } catch (error) {
        console.error("OpenRouter test error:", error);
        return { success: false, message: error instanceof Error ? error.message : "Errore di connessione sconosciuto." };
    }
}

export async function chatOpenRouterAction(
    apiKey: string,
    model: string,
    messages: { role: string; content: string }[]
): Promise<{ success: boolean; message: string }> {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ model, messages })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices.length > 0 && data.choices[0].message) {
                return { success: true, message: data.choices[0].message.content };
            } else {
                return { success: false, message: "Nessuna risposta valida dal modello." };
            }
        } else {
            let errorMsg = `Errore HTTP: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData.error && errorData.error.message) {
                    errorMsg = `Errore OpenRouter: ${errorData.error.message}`;
                }
            } catch (e) { /* ignore */ }
            return { success: false, message: errorMsg };
        }
    } catch (error) {
        console.error("OpenRouter chat error:", error);
        return { success: false, message: error instanceof Error ? error.message : "Errore di connessione sconosciuto." };
    }
}

export async function fetchOpenRouterModelsAction(): Promise<{ data: any[] | null; error: string | null }> {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            next: { revalidate: 3600 }
        });

        if (!response.ok) {
            throw new Error(`OpenRouter API error: ${response.statusText}`);
        }

        const json = await response.json();
        const models = json.data.map((m: any) => ({
            id: m.id,
            name: m.name,
            context_length: m.context_length,
            pricing: {
                prompt: m.pricing.prompt,
                completion: m.pricing.completion,
            },
            description: m.description
        }));

        return { data: models, error: null };
    } catch (e) {
        console.error("Error fetching OpenRouter models:", e);
        return { data: null, error: e instanceof Error ? e.message : "Errore sconosciuto nel recupero dei modelli." };
    }
}
