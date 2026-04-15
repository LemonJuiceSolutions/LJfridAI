/**
 * Client-side widget preview preload cache.
 *
 * When a dashboard page loads, DynamicGridPage calls preloadWidgetData()
 * with all widget items.  This fires ONE batch HTTP request to load all
 * preview data.  Individual PreviewWidgetRenderers then read from this
 * cache instead of making N separate Server Action calls.
 */

const preloadCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let inflightBatch: Promise<void> | null = null;

function cacheKey(treeId: string, nodeId: string) {
    return `${treeId}:${nodeId}`;
}

/** Check if preloaded data exists for a widget. */
export function getPreloadedWidgetData(treeId: string, nodeId: string): any | undefined {
    const key = cacheKey(treeId, nodeId);
    const entry = preloadCache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > CACHE_TTL) {
        preloadCache.delete(key);
        return undefined;
    }
    return entry.data;
}

/** Invalidate preloaded data for a specific tree. */
export function invalidatePreloadedWidgetData(treeId?: string) {
    if (treeId) {
        for (const key of preloadCache.keys()) {
            if (key.startsWith(`${treeId}:`)) preloadCache.delete(key);
        }
    } else {
        preloadCache.clear();
    }
}

/**
 * Batch-preload preview data for all widgets on a dashboard page.
 * Call this once when the layout items are known.
 *
 * @param items - Dashboard items (from layout). Widget items have IDs like
 *   `sql-preview-{treeId}-{nodeId}` or `python-preview-{treeId}-{nodeId}`.
 */
export async function preloadWidgetData(items: Array<{ id: string }>): Promise<void> {
    // Parse widget items to extract treeId + nodeId
    // Widget IDs follow patterns:
    //   sql-preview-{treeId}-{nodeId}
    //   python-preview-{treeId}-{nodeId}
    //   tree-{treeId}-{nodeId}
    // Where treeId is a UUID (contains dashes) and nodeId is the rest after the UUID.
    const widgets: Array<{ treeId: string; nodeId: string }> = [];
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

    for (const item of items) {
        let prefix = '';
        if (item.id.startsWith('sql-preview-')) prefix = 'sql-preview-';
        else if (item.id.startsWith('python-preview-')) prefix = 'python-preview-';
        else if (item.id.startsWith('tree-')) prefix = 'tree-';
        else continue;

        const rest = item.id.slice(prefix.length);
        const uuidMatch = rest.match(uuidRe);
        if (!uuidMatch) continue;

        const treeId = uuidMatch[0];
        const nodeId = rest.slice(treeId.length + 1); // +1 for the dash after UUID
        if (!nodeId) continue;

        if (!getPreloadedWidgetData(treeId, nodeId)) {
            widgets.push({ treeId, nodeId });
        }
    }

    if (widgets.length === 0) return;

    // Deduplicate
    const seen = new Set<string>();
    const unique = widgets.filter(w => {
        const key = cacheKey(w.treeId, w.nodeId);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Don't fire concurrent batch requests
    if (inflightBatch) {
        await inflightBatch;
        // After the inflight resolves, check if we still need data
        const stillNeeded = unique.filter(w => !getPreloadedWidgetData(w.treeId, w.nodeId));
        if (stillNeeded.length === 0) return;
    }

    const batch = (async () => {
        try {
            const res = await fetch('/api/internal/widget-data-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ widgets: unique }),
            });
            if (!res.ok) return;

            const data = await res.json();
            const now = Date.now();
            for (const [key, value] of Object.entries(data)) {
                preloadCache.set(key, { data: value, ts: now });
            }
            // Also cache null for widgets that weren't in the response (no preview yet)
            for (const w of unique) {
                const key = cacheKey(w.treeId, w.nodeId);
                if (!preloadCache.has(key)) {
                    preloadCache.set(key, { data: null, ts: now });
                }
            }
        } catch (e) {
            console.warn('[widget-preload] Batch fetch failed:', e);
        } finally {
            inflightBatch = null;
        }
    })();

    inflightBatch = batch;
    await batch;
}
