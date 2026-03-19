'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/session";
import { getAgentUsageCache } from "@/lib/agent-usage-cache";

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

        return {
            apiKey: user.openRouterApiKey || '',
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
        await db.user.update({
            where: { id: userId },
            data: {
                openRouterApiKey: apiKey,
                openRouterModel: model
            }
        });

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
 * Get and consume the last usage data for an agent (from in-memory cache).
 * Called by clients after a streaming response completes.
 */
export async function getAgentLastUsageAction(
    key: string
): Promise<{ inputTokens: number; outputTokens: number } | null> {
    return getAgentUsageCache(key);
}
