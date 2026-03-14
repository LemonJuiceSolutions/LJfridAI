/**
 * In-memory cache for agent token usage data.
 * Populated by streaming API routes after completion, consumed once by the client.
 */

interface UsageData {
    inputTokens: number;
    outputTokens: number;
}

const cache = new Map<string, UsageData>();

export function setAgentUsageCache(key: string, data: UsageData): void {
    cache.set(key, data);
}

export function getAgentUsageCache(key: string): UsageData | null {
    const data = cache.get(key);
    if (data) {
        cache.delete(key);
    }
    return data ?? null;
}
