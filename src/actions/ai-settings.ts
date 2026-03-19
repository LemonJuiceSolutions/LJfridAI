'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

async function getSession() {
    return await getServerSession(authOptions);
}

export type AiProvider = 'openrouter' | 'claude-cli';

/**
 * Get the current AI provider settings for the user.
 */
export async function getAiProviderAction(): Promise<{
    provider: AiProvider;
    claudeCliModel?: string;
    error?: string;
}> {
    const session = await getSession();
    if (!session?.user) {
        return { provider: 'openrouter', error: 'Non autorizzato' };
    }

    const userId = (session.user as any).id;
    if (!userId) {
        return { provider: 'openrouter', error: 'Utente non trovato' };
    }

    try {
        const user = await db.user.findUnique({
            where: { id: userId },
            select: {
                aiProvider: true,
                claudeCliModel: true,
            },
        });

        if (!user) {
            return { provider: 'openrouter', error: 'Utente non trovato' };
        }

        return {
            provider: (user.aiProvider as AiProvider) || 'openrouter',
            claudeCliModel: user.claudeCliModel || 'claude-sonnet-4-6',
        };
    } catch (error) {
        console.error('Failed to get AI provider settings:', error);
        return { provider: 'openrouter', error: 'Impossibile caricare le impostazioni' };
    }
}

/**
 * Save the AI provider settings for the current user.
 */
export async function saveAiProviderAction(
    provider: AiProvider,
    claudeCliModel?: string
): Promise<{ success: boolean; error?: string }> {
    const session = await getSession();
    if (!session?.user) {
        return { success: false, error: 'Non autorizzato' };
    }

    const userId = (session.user as any).id;
    if (!userId) {
        return { success: false, error: 'Utente non trovato' };
    }

    try {
        await db.user.update({
            where: { id: userId },
            data: {
                aiProvider: provider,
                ...(claudeCliModel ? { claudeCliModel } : {}),
            },
        });

        revalidatePath('/settings');
        return { success: true };
    } catch (error) {
        console.error('Failed to save AI provider settings:', error);
        return { success: false, error: 'Impossibile salvare le impostazioni' };
    }
}
