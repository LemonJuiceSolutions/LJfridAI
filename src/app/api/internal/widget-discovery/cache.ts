/**
 * Module-scoped cache for widget discovery results. Lives outside the
 * route file because Next.js 15 forbids non-route exports from
 * `route.ts` files (only GET/POST/etc. + a fixed allowlist of config).
 */
export interface DiscoveredWidget {
    widgetId: string;
    name: string;
    treeId: string;
    nodeId: string;
    type: string;
    resultName?: string;
    pythonType?: string;
}

// Fresh window: serve cache without revalidation.
export const CACHE_TTL = 5 * 60_000;
// Stale-while-revalidate window: serve stale cache instantly, trigger rebuild.
// After this, the request blocks until a fresh build completes.
export const CACHE_SWR = 15 * 60_000;

export const cache = new Map<string, { widgets: DiscoveredWidget[]; ts: number }>();
// In-flight rebuilds, keyed by companyId. Prevents stampede of concurrent
// heavy tree scans while a rebuild is already running.
export const inflight = new Map<string, Promise<DiscoveredWidget[]>>();

/** Invalidate the discovery cache — call after pipeline execution etc. */
export function invalidateWidgetDiscoveryCache(companyId?: string) {
    if (companyId) cache.delete(companyId);
    else cache.clear();
}
