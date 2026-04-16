/**
 * Server-only helper to fetch OpenRouter credentials directly from DB.
 * Replaces the pattern of passing apiKey from client → server actions.
 *
 * SECURITY: This avoids exposing the raw API key to client-side React code,
 * where it could leak via DevTools, error logs, or bundled client code.
 */
import "server-only";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { tryDecrypt } from "@/lib/encryption";

export interface OpenRouterCredentials {
    apiKey: string;
    model: string;
}

/**
 * Get OpenRouter credentials for the currently authenticated user.
 * Returns null if no session or no key configured.
 */
export async function getOpenRouterCredentials(): Promise<OpenRouterCredentials | null> {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) return null;

    const user = await db.user.findUnique({
        where: { id: userId },
        select: { openRouterApiKey: true, openRouterModel: true },
    });

    if (!user?.openRouterApiKey) return null;

    // Transparently decrypt at-rest value (returns plaintext if legacy unencrypted)
    const apiKey = tryDecrypt(user.openRouterApiKey) || user.openRouterApiKey;

    return {
        apiKey,
        model: user.openRouterModel || "google/gemini-2.0-flash-001",
    };
}

/**
 * Resolve OpenRouter config: prefer client-supplied (legacy/explicit), fall back to DB.
 * Use this in server actions that historically accepted openRouterConfig from client.
 *
 * Going forward, callers should stop passing apiKey from client and rely on DB lookup.
 */
export async function resolveOpenRouterConfig(
    clientConfig?: { apiKey?: string; model?: string }
): Promise<OpenRouterCredentials | null> {
    // Reject masked keys (••••••••XXXX) — these come from masked client display
    const isMasked = clientConfig?.apiKey?.startsWith("••");
    if (clientConfig?.apiKey && !isMasked) {
        return {
            apiKey: clientConfig.apiKey,
            model: clientConfig.model || "google/gemini-2.0-flash-001",
        };
    }
    return getOpenRouterCredentials();
}

/** Mask API key for client transport — shows last 4 chars only. */
export function maskApiKey(key: string | null | undefined): string {
    if (!key) return "";
    if (key.length <= 4) return key;
    return "••••••••" + key.slice(-4);
}
