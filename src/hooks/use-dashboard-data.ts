'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getPageLayout } from '@/actions/dashboard';

// Cache for dashboard layouts
const layoutCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export interface DashboardLayout {
    layouts: any;
    items: any[];
}

/**
 * Custom hook for fetching dashboard layout with caching
 * Similar to React Query but lighter weight for this specific use case
 */
export function useDashboardLayout(pageId: string, defaultLayouts: any, defaultItems: any[]) {
    const [data, setData] = useState<DashboardLayout | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const isMountedRef = useRef(true);
    const fetchCountRef = useRef(0);

    const fetchLayout = useCallback(async (forceRefresh = false) => {
        const currentFetchId = ++fetchCountRef.current;

        // Check cache first
        const cached = layoutCache.get(pageId);
        const now = Date.now();
        if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_DURATION) {
            if (isMountedRef.current) {
                setData(cached.data);
                setIsLoading(false);
                setError(null);
            }
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const result = await getPageLayout(pageId);

            if (!isMountedRef.current || currentFetchId !== fetchCountRef.current) {
                return;
            }

            const layoutData: DashboardLayout = result
                ? {
                    layouts: (result.layouts as any) || generateLayouts((result.items as any[]) || defaultItems, defaultLayouts),
                    items: (result.items as any[]) || defaultItems,
                }
                : {
                    layouts: generateLayouts(defaultItems, defaultLayouts),
                    items: defaultItems,
                };

            // Update cache
            layoutCache.set(pageId, { data: layoutData, timestamp: now });

            if (isMountedRef.current) {
                setData(layoutData);
                setIsLoading(false);
            }
        } catch (err) {
            console.error(`Error fetching layout for ${pageId}:`, err);
            if (isMountedRef.current && currentFetchId === fetchCountRef.current) {
                setError(err instanceof Error ? err : new Error('Failed to fetch layout'));
                setIsLoading(false);
                // Return default data on error
                setData({
                    layouts: generateLayouts(defaultItems, defaultLayouts),
                    items: defaultItems,
                });
            }
        }
    }, [pageId, defaultLayouts, defaultItems]);

    const refetch = useCallback(() => {
        return fetchLayout(true);
    }, [fetchLayout]);

    useEffect(() => {
        isMountedRef.current = true;
        fetchLayout(false);

        return () => {
            isMountedRef.current = false;
        };
    }, [fetchLayout]);

    return {
        data,
        isLoading,
        error,
        refetch,
    };
}

// Helper function to generate layouts (copied from dynamic-grid-page)
function generateLayouts(items: any[], defaultLayouts: any) {
    const staticLayouts: Record<string, any[]> = defaultLayouts;
    const layouts: Record<string, any[]> = JSON.parse(JSON.stringify(staticLayouts));

    items.forEach((item) => {
        Object.keys(layouts).forEach(bp => {
            if (!layouts[bp].find((l: any) => l.i === item.id)) {
                let h = 4; // default height
                if (item.id.includes('overview') || item.id.includes('revenue-by-product') ||
                    item.id.includes('capacity') || item.id.includes('cost-center') ||
                    item.id.includes('job-margin') || item.id.includes('python-preview') ||
                    item.id.includes('sql-preview')) {
                    h = 10;
                }
                layouts[bp].push({ i: item.id, x: 0, y: Infinity, w: layouts[bp][0]?.w || 12, h });
            }
        });
    });

    return layouts;
}

/**
 * Clear all cached layouts
 */
export function clearLayoutCache() {
    layoutCache.clear();
}

/**
 * Clear cache for a specific page
 */
export function clearLayoutCacheForPage(pageId: string) {
    layoutCache.delete(pageId);
}
