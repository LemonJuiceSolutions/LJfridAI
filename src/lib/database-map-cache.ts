import type { DatabaseMap } from '@/lib/database-map-types';

/**
 * In-memory cache for parsed DatabaseMap objects.
 * Avoids re-parsing large JSON strings on every request.
 */

interface CacheEntry {
    connectorId: string;
    map: DatabaseMap;
    updatedAt: number;
}

let _entry: CacheEntry | null = null;

export function setCachedParsedMap(connectorId: string, map: DatabaseMap): void {
    _entry = { connectorId, map, updatedAt: Date.now() };
}

export function getCachedParsedMap(connectorId: string, rawJson: string | null): DatabaseMap {
    if (_entry && _entry.connectorId === connectorId) {
        return _entry.map;
    }
    const map: DatabaseMap = rawJson ? JSON.parse(rawJson) : { tables: [], relationships: [] };
    setCachedParsedMap(connectorId, map);
    return map;
}

export function getParsedMapCacheEntry(): CacheEntry | null {
    return _entry;
}

/**
 * Attempts to recover a valid JSON object from a partial/truncated JSON string.
 * Used when AI streaming is cut off mid-response.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function recoverPartialJson(text: string): any {
    const trimmed = text.trim();
    // Try as-is first
    try {
        return JSON.parse(trimmed);
    } catch {}

    // Try closing unclosed structures
    const attempts: string[] = [];
    // Count braces/brackets to figure out what to close
    let braces = 0;
    let brackets = 0;
    let inString = false;
    let escape = false;
    for (const ch of trimmed) {
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') braces++;
        else if (ch === '}') braces--;
        else if (ch === '[') brackets++;
        else if (ch === ']') brackets--;
    }

    let closing = '';
    for (let i = 0; i < brackets; i++) closing += ']';
    for (let i = 0; i < braces; i++) closing += '}';

    if (closing) {
        attempts.push(trimmed + closing);
        // Also try removing trailing comma before closing
        attempts.push(trimmed.replace(/,\s*$/, '') + closing);
    }

    for (const attempt of attempts) {
        try {
            return JSON.parse(attempt);
        } catch {}
    }

    return null;
}
