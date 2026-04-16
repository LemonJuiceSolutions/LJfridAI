'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/session";
import { getAgentUsageCache } from "@/lib/agent-usage-cache";
import { encrypt, tryDecrypt } from "@/lib/encryption";

async function getSession() {
    return await getServerSession(authOptions);
}

/**
 * Get OpenRouter settings for the current user
 */
export async function getOpenRouterSettingsAction(): Promise<{
    apiKey?: string;
    model?: string;
    error?: string;
}> {
    const session = await getSession();
    if (!session?.user) {
        return { error: "Non autorizzato" };
    }

    const userId = (session.user as any).id;
    if (!userId) {
        return { error: "Utente non trovato" };
    }

    try {
        const user = await db.user.findUnique({
            where: { id: userId },
            select: {
                openRouterApiKey: true,
                openRouterModel: true
            }
        });

        if (!user) {
            return { error: "Utente non trovato" };
        }

        // SECURITY: decrypt DB value (handles legacy unencrypted values) then mask
        // for client. Server actions that need the real key should use
        // resolveOpenRouterConfig() from @/lib/openrouter-credentials.
        const storedKey = user.openRouterApiKey || '';
        const rawKey = storedKey ? (tryDecrypt(storedKey) || storedKey) : '';
        const maskedKey = rawKey.length > 4
            ? '••••••••' + rawKey.slice(-4)
            : '';

        return {
            apiKey: maskedKey,
            model: user.openRouterModel || 'google/gemini-2.0-flash-001'
        };
    } catch (error) {
        console.error("Failed to get OpenRouter settings:", error);
        return { error: "Impossibile caricare le impostazioni" };
    }
}

/**
 * Save OpenRouter settings for the current user
 */
export async function saveOpenRouterSettingsAction(
    apiKey: string,
    model: string
): Promise<{ success: boolean; error?: string }> {
    const session = await getSession();
    if (!session?.user) {
        return { success: false, error: "Non autorizzato" };
    }

    const userId = (session.user as any).id;
    if (!userId) {
        return { success: false, error: "Utente non trovato" };
    }

    try {
        // Skip key update if user submitted a masked value (••••XXXX) — means they
        // didn't type a new key, just re-saved other fields. Avoid clobbering DB
        // with masked string.
        const isMasked = apiKey.startsWith('••');
        const data: any = { openRouterModel: model };
        if (!isMasked && apiKey) {
            // SECURITY: encrypt at rest before storing
            data.openRouterApiKey = encrypt(apiKey);
        }

        await db.user.update({ where: { id: userId }, data });

        revalidatePath('/settings');
        return { success: true };
    } catch (error) {
        console.error("Failed to save OpenRouter settings:", error);
        return { success: false, error: "Impossibile salvare le impostazioni" };
    }
}

/**
 * Save just the OpenRouter model (without changing API key).
 * Used by the create page model selector.
 */
export async function saveOpenRouterModelAction(model: string): Promise<{ success: boolean; error?: string }> {
    const session = await getSession();
    if (!session?.user) return { success: false, error: 'Non autorizzato' };
    const userId = (session.user as any).id;
    if (!userId) return { success: false, error: 'Utente non trovato' };
    try {
        await db.user.update({ where: { id: userId }, data: { openRouterModel: model } });
        return { success: true };
    } catch (error) {
        console.error('Failed to save OpenRouter model:', error);
        return { success: false, error: 'Impossibile salvare il modello' };
    }
}

/**
 * Get OpenRouter agent model for the current user (FridAI Agent chatbot)
 */
export async function getOpenRouterAgentModelAction(): Promise<{
    success?: boolean;
    model?: string;
    error?: string;
}> {
    try {
        const sessionUser = await getAuthenticatedUser();
        if (!sessionUser) {
            return { error: 'Non autorizzato' };
        }

        // Fetch fresh user data from DB to avoid staleness
        const user = await db.user.findUnique({ // Changed prisma to db
            where: { id: sessionUser.id },
            select: {
                openRouterAgentModel: true
            }
        });

        if (!user) {
            return { error: 'Utente non trovato' };
        }

        return {
            success: true,
            model: user.openRouterAgentModel || 'google/gemini-2.0-flash-001'
        };
    } catch (error) {
        console.error('Error in getOpenRouterAgentModelAction:', error);
        return { error: 'Errore nel recupero del modello' };
    }
}

/**
 * Save OpenRouter agent model for the current user (FridAI Agent chatbot)
 */
export async function saveOpenRouterAgentModelAction(
    model: string
): Promise<{ success: boolean; error?: string }> {
    const session = await getSession();
    if (!session?.user) {
        return { success: false, error: "Non autorizzato" };
    }

    const userId = (session.user as any).id;
    if (!userId) {
        return { success: false, error: "Utente non trovato" };
    }

    try {
        await db.user.update({
            where: { id: userId },
            data: {
                openRouterAgentModel: model
            }
        });

        return { success: true };
    } catch (error) {
        console.error("Failed to save OpenRouter agent model:", error);
        return { success: false, error: "Impossibile salvare il modello" };
    }
}

/**
 * Get the saved model for a specific agent type (sql / python)
 */
export async function getAgentTypeModelAction(
    agentType: 'sql' | 'python'
): Promise<{ model?: string; error?: string }> {
    try {
        const sessionUser = await getAuthenticatedUser();
        if (!sessionUser) return { error: 'Non autorizzato' };

        const user = await db.user.findUnique({
            where: { id: sessionUser.id },
            select: { sqlAgentModel: true, pythonAgentModel: true, claudeCliModel: true, aiProvider: true },
        });
        if (!user) return { error: 'Utente non trovato' };

        const field = agentType === 'sql' ? user.sqlAgentModel : user.pythonAgentModel;
        // fallback: per-type saved model → claudeCliModel (if CLI) → generic default
        const fallback = user.aiProvider === 'claude-cli'
            ? (user.claudeCliModel || 'claude-sonnet-4-6')
            : 'google/gemini-2.0-flash-001';
        return { model: field || fallback };
    } catch (e) {
        console.error('getAgentTypeModelAction error:', e);
        return { error: 'Errore nel recupero del modello' };
    }
}

/**
 * Save the model for a specific agent type (sql / python)
 */
export async function saveAgentTypeModelAction(
    agentType: 'sql' | 'python',
    model: string
): Promise<{ success: boolean; error?: string }> {
    const session = await getSession();
    if (!session?.user) return { success: false, error: 'Non autorizzato' };

    const userId = (session.user as any).id;
    if (!userId) return { success: false, error: 'Utente non trovato' };

    try {
        await db.user.update({
            where: { id: userId },
            data: agentType === 'sql' ? { sqlAgentModel: model } : { pythonAgentModel: model },
        });
        return { success: true };
    } catch (e) {
        console.error('saveAgentTypeModelAction error:', e);
        return { success: false, error: 'Impossibile salvare il modello' };
    }
}

/**
 * Get and consume the last usage data for an agent (from in-memory cache).
 * Called by clients after a streaming response completes.
 */
export async function getAgentLastUsageAction(
    key: string
): Promise<{ inputTokens: number; outputTokens: number } | null> {
    return getAgentUsageCache(key);
}
