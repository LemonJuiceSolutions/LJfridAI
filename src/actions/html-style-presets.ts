'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { HtmlStyleOverrides, SavedHtmlStylePreset } from "@/lib/html-style-utils";
import { getHtmlStyleFieldsDescription } from "@/lib/html-style-utils";
import { getPythonBackendUrl } from "@/lib/python-backend";

// ── Auth helper (same pattern as chart-theme.ts) ──

async function getCompanyId(): Promise<string | null> {
    const session = await getServerSession(authOptions);
    if (!session?.user) return null;
    const userId = (session.user as any).id;
    if (!userId) return null;

    const user = await db.user.findUnique({
        where: { id: userId },
        select: { companyId: true },
    });
    return user?.companyId || null;
}

// ── GET ──

export async function getHtmlStylePresetsAction(): Promise<{
    presets?: SavedHtmlStylePreset[];
    error?: string;
}> {
    try {
        const companyId = await getCompanyId();
        if (!companyId) return { error: 'Non autorizzato' };

        const company = await db.company.findUnique({
            where: { id: companyId },
            select: { htmlStylePresets: true },
        });

        const presets = (company?.htmlStylePresets as SavedHtmlStylePreset[] | null) || [];
        return { presets };
    } catch (error: any) {
        console.error('Failed to get html style presets:', error);
        return { error: `Impossibile caricare i preset: ${error?.message || String(error)}` };
    }
}

// ── SAVE ──

export async function saveHtmlStylePresetAction(
    label: string,
    description: string,
    overrides: Partial<HtmlStyleOverrides>
): Promise<{ success: boolean; preset?: SavedHtmlStylePreset; error?: string }> {
    try {
        const companyId = await getCompanyId();
        if (!companyId) return { success: false, error: 'Non autorizzato' };

        const company = await db.company.findUnique({
            where: { id: companyId },
            select: { htmlStylePresets: true },
        });

        const existing = (company?.htmlStylePresets as SavedHtmlStylePreset[] | null) || [];

        const newPreset: SavedHtmlStylePreset = {
            id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            label,
            description,
            overrides,
            createdAt: new Date().toISOString(),
        };

        await db.company.update({
            where: { id: companyId },
            data: { htmlStylePresets: [...existing, newPreset] as any },
        });

        return { success: true, preset: newPreset };
    } catch (error: any) {
        console.error('Failed to save html style preset:', error);
        return { success: false, error: `Impossibile salvare il preset: ${error?.message || String(error)}` };
    }
}

// ── DELETE ──

export async function deleteHtmlStylePresetAction(
    presetId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const companyId = await getCompanyId();
        if (!companyId) return { success: false, error: 'Non autorizzato' };

        const company = await db.company.findUnique({
            where: { id: companyId },
            select: { htmlStylePresets: true },
        });

        const existing = (company?.htmlStylePresets as SavedHtmlStylePreset[] | null) || [];
        const filtered = existing.filter(p => p.id !== presetId);

        await db.company.update({
            where: { id: companyId },
            data: { htmlStylePresets: filtered as any },
        });

        return { success: true };
    } catch (error: any) {
        console.error('Failed to delete html style preset:', error);
        return { success: false, error: `Impossibile eliminare il preset: ${error?.message || String(error)}` };
    }
}

// ── SCRAPE WEBSITE STYLE ──

function sanitizeJSONString(str: string): string {
    let result = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (inString) {
            if (char === '\\' && !escaped) { escaped = true; result += char; }
            else if (char === '"' && !escaped) { inString = false; result += char; }
            else {
                if (escaped) { escaped = false; result += char; }
                else {
                    const code = char.charCodeAt(0);
                    if (code <= 0x1F) {
                        if (char === '\n') result += '\\n';
                        else if (char === '\r') result += '\\r';
                        else if (char === '\t') result += '\\t';
                        else result += ' ';
                    } else result += char;
                }
            }
        } else {
            if (char === '"') inString = true;
            result += char;
        }
    }
    return result;
}

function extractFirstJSON(str: string): any {
    const firstOpen = str.indexOf('{');
    if (firstOpen === -1) return null;
    let braceCount = 0;
    let inStr = false;
    let esc = false;
    for (let i = firstOpen; i < str.length; i++) {
        const c = str[i];
        if (inStr) {
            if (c === '\\' && !esc) esc = true;
            else if (c === '"' && !esc) inStr = false;
            else esc = false;
        } else {
            if (c === '"') inStr = true;
            else if (c === '{') braceCount++;
            else if (c === '}') {
                braceCount--;
                if (braceCount === 0) {
                    const chunk = str.substring(firstOpen, i + 1);
                    try { return JSON.parse(chunk); } catch {
                        try { return JSON.parse(sanitizeJSONString(chunk)); } catch { return null; }
                    }
                }
            }
        }
    }
    return null;
}

async function callOpenRouterJSON(apiKey: string, model: string, prompt: string, systemPrompt: string): Promise<any> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    try {
        return JSON.parse(content);
    } catch {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            try { return JSON.parse(jsonMatch[1]); } catch {
                const ext = extractFirstJSON(jsonMatch[1]);
                if (ext) return ext;
            }
        }
        const ext = extractFirstJSON(content);
        if (ext) return ext;
        throw new Error('Failed to parse JSON from AI response');
    }
}

export async function scrapeWebsiteStyleAction(
    url: string,
    openRouterApiKey?: string,
    openRouterModel?: string
): Promise<{ overrides?: Partial<HtmlStyleOverrides>; error?: string }> {
    try {
        // SECURITY: resolve masked/missing key from DB server-side
        const { resolveOpenRouterConfig } = await import('@/lib/openrouter-credentials');
        const effectiveConfig = await resolveOpenRouterConfig(
            openRouterApiKey ? { apiKey: openRouterApiKey, model: openRouterModel } : undefined
        );
        if (!effectiveConfig) {
            return { error: 'API key OpenRouter mancante. Configurala nelle impostazioni.' };
        }
        // 1. Call Python backend to extract CSS
        // PERF: timeout to prevent hanging on slow target sites
        const cssResponse = await fetch(`${getPythonBackendUrl()}/scrape-css`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
            signal: AbortSignal.timeout(60_000),
        });

        if (!cssResponse.ok) {
            const errData = await cssResponse.json().catch(() => ({}));
            return { error: errData.error || `Errore scraping (${cssResponse.status})` };
        }

        const cssData = await cssResponse.json();

        // 2. Build AI prompt
        const fieldsDesc = getHtmlStyleFieldsDescription();

        const systemPrompt = `Sei un analizzatore CSS. Data l'informazione CSS estratta da un sito web, mappa lo stile visivo al formato JSON HtmlStyleOverrides usato per tabelle dati e report HTML.

Campi disponibili (tutti opzionali):
${fieldsDesc}

REGOLE:
1. Estrai la palette colori PRIMARIA dal CSS (2-3 colori principali)
2. Il colore piu' scuro va su header_bg_color
3. Lo sfondo piu' chiaro va su page_bg_color
4. Usa il font del body per font_family
5. Deduci spaziature dal padding/margin del sito
6. Imposta stripe/hover con variazioni sottili dello sfondo
7. Tutti i colori DEVONO essere in formato hex (#xxxxxx)
8. Restituisci SOLO un oggetto JSON valido con le chiavi HtmlStyleOverrides
9. Non includere chiavi con valori null o undefined
10. Per font_family usa nomi CSS validi (es. "Helvetica Neue", Arial, sans-serif)`;

        const cssPayload = JSON.stringify(cssData, null, 2).slice(0, 15000);

        const userPrompt = `Sito web: ${url}

Dati CSS estratti:
${cssPayload}

Genera un oggetto JSON HtmlStyleOverrides che ricrea lo stile visivo di questo sito, adattato per tabelle dati e report.`;

        // 3. Call OpenRouter AI
        const result = await callOpenRouterJSON(
            effectiveConfig.apiKey,
            effectiveConfig.model,
            userPrompt,
            systemPrompt
        );

        return { overrides: result as Partial<HtmlStyleOverrides> };
    } catch (error: any) {
        console.error('Failed to scrape website style:', error);
        return { error: `Errore: ${error?.message || String(error)}` };
    }
}
