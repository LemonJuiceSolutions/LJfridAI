/**
 * In-memory session store for Lead Generator CLI agent tool calls.
 * Separated from lead-generator-flow.ts because 'use server' files
 * cannot export non-function values (like Map objects).
 *
 * Uses globalThis to persist sessions across Next.js hot reloads in development.
 * Without this, a hot reload mid-session would invalidate all active tokens.
 */

export interface ToolSession {
    companyId: string;
    apiKeys: Record<string, string>;
    conversationId?: string;
    createdAt: number;
}

// Persist across hot reloads using the same pattern as Prisma singleton
const globalForSessions = globalThis as unknown as { _leadGenSessions?: Map<string, ToolSession> };
if (!globalForSessions._leadGenSessions) {
    globalForSessions._leadGenSessions = new Map<string, ToolSession>();
}

/** In-memory session store for CLI agent tool calls — survives Next.js hot reloads */
export const activeSessions: Map<string, ToolSession> = globalForSessions._leadGenSessions;
