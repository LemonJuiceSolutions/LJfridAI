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

export const CACHE_TTL = 30_000;
export const cache = new Map<string, { widgets: DiscoveredWidget[]; ts: number }>();

/** Invalidate the discovery cache — call after pipeline execution etc. */
export function invalidateWidgetDiscoveryCache(companyId?: string) {
    if (companyId) cache.delete(companyId);
    else cache.clear();
}
