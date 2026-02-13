/**
 * Server-side cache for trees and variables.
 * Extracted from actions.ts so non-async helpers (like invalidateServerTreeCache)
 * can be shared without violating Next.js 'use server' export rules.
 */

import type { StoredTree, Variable } from '@/lib/types';

export const serverCache = {
    trees: null as StoredTree[] | null,
    variables: null as Variable[] | null,
    treesTimestamp: 0,
    variablesTimestamp: 0,
    // Per-tree cache to avoid N+1 queries from widget renderers
    treeById: new Map<string, { data: StoredTree; timestamp: number }>(),
    CACHE_DURATION: 30 * 60 * 1000, // 30 minuti in millisecondi
};

/**
 * Invalidate server-side tree cache for a specific tree or all trees.
 * Call this after updating a tree to ensure widgets get fresh data.
 */
export function invalidateServerTreeCache(treeId?: string) {
    if (treeId) {
        serverCache.treeById.delete(treeId);
    } else {
        serverCache.treeById.clear();
    }
    // Also invalidate the bulk trees cache
    serverCache.trees = null;
    serverCache.treesTimestamp = 0;
}
