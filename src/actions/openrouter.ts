'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

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
 * Get OpenRouter agent model for the current user (FridAI Agent chatbot)
 */
export async function getOpenRouterAgentModelAction(): Promise<{
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
                openRouterAgentModel: true
            }
        });

        if (!user) {
            return { error: "Utente non trovato" };
        }

        return {
            model: user.openRouterAgentModel || 'google/gemini-2.0-flash-001'
        };
    } catch (error) {
        console.error("Failed to get OpenRouter agent model:", error);
        return { error: "Impossibile caricare il modello" };
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
