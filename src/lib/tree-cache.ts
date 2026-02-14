/**
 * Shared client-side tree cache used by NodeWidgetRenderer and PreviewWidgetRenderer.
 * Prevents N+1 server calls when multiple widgets on the same tree render simultaneously.
 */

import { getTreeAction } from '@/app/actions';

const treeClientCache = new Map<string, { data: any; timestamp: number }>();
const TREE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Dedup in-flight requests: if multiple widgets request the same tree at once,
// they share one promise instead of firing N separate server calls.
const inflightRequests = new Map<string, Promise<any>>();

export async function getCachedTree(treeId: string, forceRefresh = false) {
    const now = Date.now();
    const cached = treeClientCache.get(treeId);
    if (!forceRefresh && cached && (now - cached.timestamp) < TREE_CACHE_DURATION) {
        return cached.data;
    }

    // Dedup concurrent requests for the same tree
    const inflight = inflightRequests.get(treeId);
    if (!forceRefresh && inflight) {
        return inflight;
    }

    const promise = getTreeAction(treeId, forceRefresh).then(result => {
        inflightRequests.delete(treeId);
        if (result.data) {
            treeClientCache.set(treeId, { data: result, timestamp: Date.now() });
        }
        return result;
    }).catch(err => {
        inflightRequests.delete(treeId);
        throw err;
    });

    inflightRequests.set(treeId, promise);
    return promise;
}

export function invalidateTreeCache(treeId?: string) {
    if (treeId) {
        treeClientCache.delete(treeId);
    } else {
        treeClientCache.clear();
    }
}

/**
 * Invalidate client cache AND notify all widgets on the page to refresh.
 * Uses a custom DOM event so all PreviewWidgetRenderer / NodeWidgetRenderer
 * instances sharing the same treeId can re-read fresh data.
 */
export function invalidateAndNotifyWidgets(treeId: string) {
    invalidateTreeCache(treeId);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tree-cache-invalidated', { detail: { treeId } }));
    }
}
