'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';

// Lazy-loaded renderers — only imported when building the component map
const PipelineOutputWidget = React.lazy(() => import('./pipelines/PipelineOutputWidget').then(m => ({ default: m.default })));

const WidgetLoader = () => (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <div className="animate-pulse">Caricamento...</div>
    </div>
);

export type Widget = {
    id: string;
    name: string;
    component: React.ReactNode;
};

/**
 * Widget discovery hook.
 *
 * Uses a single API call to `/api/internal/widget-discovery` which runs
 * entirely server-side — no multi-MB tree JSON serialized via RSC.
 * The API returns only widget IDs and names (~few KB).
 * Actual data is loaded on-demand by each renderer when it mounts.
 */
export const useAvailableWidgets = () => {
    const [dynamicWidgets, setDynamicWidgets] = useState<Record<string, Widget>>({});
    const { data: session, status } = useSession();
    const isMountedRef = useRef(true);
    const fetchCountRef = useRef(0);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Listen for tree-cache-invalidated events to refresh widget list
    useEffect(() => {
        const handler = () => {
            setRefreshTrigger(prev => prev + 1);
        };
        window.addEventListener('tree-cache-invalidated', handler);
        return () => window.removeEventListener('tree-cache-invalidated', handler);
    }, []);

    // Public method to force refresh
    const refresh = useCallback(() => {
        setRefreshTrigger(prev => prev + 1);
    }, []);

    useEffect(() => {
        isMountedRef.current = true;
        if (status === 'loading' || !session?.user) return;

        const currentFetchId = ++fetchCountRef.current;

        const fetchDynamic = async () => {
            try {
                // Single API call: server does all tree scanning + preview metadata lookup
                // Returns lightweight list: [{ widgetId, name, treeId, nodeId, type, ... }]
                const [discoveryRes, nodeRendererImport, previewRendererImport] = await Promise.all([
                    fetch('/api/internal/widget-discovery').then(r => r.ok ? r.json() : []).catch(() => []),
                    import('./builder/NodeWidgetRenderer').catch(() => null),
                    import('./builder/PreviewWidgetRenderer').catch(() => null),
                ]);

                if (!isMountedRef.current || currentFetchId !== fetchCountRef.current) return;

                const newDynamicWidgets: Record<string, Widget> = {};
                const widgets: any[] = discoveryRes || [];

                for (const w of widgets) {
                    if (w.type === 'pipeline') {
                        newDynamicWidgets[w.widgetId] = {
                            id: w.widgetId,
                            name: w.name,
                            component: <React.Suspense fallback={<WidgetLoader />}>
                                <PipelineOutputWidget pipelineId={w.treeId} nodeId={w.nodeId} />
                            </React.Suspense>,
                        };
                    } else if (w.type === 'node' && nodeRendererImport) {
                        const { NodeWidgetRenderer } = nodeRendererImport;
                        newDynamicWidgets[w.widgetId] = {
                            id: w.widgetId,
                            name: w.name,
                            component: <React.Suspense fallback={<WidgetLoader />}>
                                <NodeWidgetRenderer treeId={w.treeId} nodeId={w.nodeId} />
                            </React.Suspense>,
                        };
                    } else if ((w.type === 'sql' || w.type === 'python') && previewRendererImport) {
                        const { PreviewWidgetRenderer } = previewRendererImport;
                        newDynamicWidgets[w.widgetId] = {
                            id: w.widgetId,
                            name: w.name,
                            component: <React.Suspense fallback={<WidgetLoader />}>
                                <PreviewWidgetRenderer
                                    treeId={w.treeId}
                                    nodeId={w.nodeId}
                                    previewType={w.type}
                                    resultName={w.resultName || ''}
                                />
                            </React.Suspense>,
                        };
                    }
                }

                if (isMountedRef.current && currentFetchId === fetchCountRef.current) {
                    setDynamicWidgets(newDynamicWidgets);
                }
            } catch (error) {
                console.error("Error fetching dynamic widgets:", error);
            }
        };

        fetchDynamic();

        return () => {
            isMountedRef.current = false;
        };
    }, [status, session, refreshTrigger]);

    return { widgets: dynamicWidgets, refresh };
};
