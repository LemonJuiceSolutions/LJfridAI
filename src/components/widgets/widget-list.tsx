'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getPipelines } from '@/actions/pipelines';
import { useSession } from 'next-auth/react';

const PipelineOutputWidget = React.lazy(() => import('./pipelines/PipelineOutputWidget').then(m => ({ default: m.default })));

// Simple loading fallback for lazy-loaded components
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

        // Fetch pipelines and trees IN PARALLEL instead of sequentially
        const fetchDynamic = async () => {
            try {
                const newDynamicWidgets: Record<string, Widget> = {};

                // Pre-load dynamic imports in parallel with data fetches
                const [
                    loadedPipelines,
                    treesImport,
                    nodeRendererImport,
                    previewRendererImport,
                ] = await Promise.all([
                    getPipelines().catch(() => null),
                    import('@/app/actions').then(m => m.getTreesAction).catch(() => null),
                    import('./builder/NodeWidgetRenderer').catch(() => null),
                    import('./builder/PreviewWidgetRenderer').catch(() => null),
                ]);

                if (!isMountedRef.current || currentFetchId !== fetchCountRef.current) return;

                // Process pipeline widgets
                if (loadedPipelines) {
                    loadedPipelines.forEach((rawPipeline: any) => {
                        const pipeline = {
                            ...rawPipeline,
                            nodes: typeof rawPipeline.nodes === 'string' ? JSON.parse(rawPipeline.nodes) : rawPipeline.nodes
                        };

                        if (pipeline.nodes) {
                            Object.values(pipeline.nodes).forEach((node: any) => {
                                if (node.type === 'end' && node.isPublished) {
                                    const widgetId = `pipeline-${pipeline.id}-${node.id}`;
                                    newDynamicWidgets[widgetId] = {
                                        id: widgetId,
                                        name: node.name,
                                        component: <React.Suspense fallback={<WidgetLoader />}>
                                            <PipelineOutputWidget pipelineId={pipeline.id} nodeId={node.id} />
                                        </React.Suspense>,
                                    };
                                }
                            });
                        }
                    });
                }

                // Process decision tree widgets (only if imports succeeded)
                if (treesImport && nodeRendererImport && previewRendererImport) {
                    const { NodeWidgetRenderer } = nodeRendererImport;
                    const { PreviewWidgetRenderer } = previewRendererImport;

                    const treesResult = await treesImport();
                    if (!isMountedRef.current || currentFetchId !== fetchCountRef.current) return;

                    if (treesResult.data) {
                        treesResult.data.forEach((tree: any) => {
                            const jsonTree = typeof tree.jsonDecisionTree === 'string'
                                ? JSON.parse(tree.jsonDecisionTree)
                                : tree.jsonDecisionTree;

                            const visitedSubTrees = new Set<string>();
                            const scanNode = (node: any, path: string[] = []) => {
                                if (!node) return;
                                const nodeId = node.id || path.join('-');

                                if (node.widgetConfig?.isPublished) {
                                    const widgetId = `tree-${tree.id}-${nodeId}`;
                                    newDynamicWidgets[widgetId] = {
                                        id: widgetId,
                                        name: node.widgetConfig.title || `Widget da ${tree.name}`,
                                        component: <React.Suspense fallback={<WidgetLoader />}>
                                            <NodeWidgetRenderer treeId={tree.id} nodeId={nodeId} />
                                        </React.Suspense>,
                                    };
                                }

                                if (node.sqlResultName && node.sqlPreviewData) {
                                    const widgetId = `sql-preview-${tree.id}-${nodeId}`;
                                    newDynamicWidgets[widgetId] = {
                                        id: widgetId,
                                        name: `SQL: ${node.sqlResultName} (${tree.name})`,
                                        component: <React.Suspense fallback={<WidgetLoader />}>
                                            <PreviewWidgetRenderer treeId={tree.id} nodeId={nodeId} previewType="sql" resultName={node.sqlResultName} />
                                        </React.Suspense>,
                                    };
                                }

                                if (node.pythonResultName) {
                                    const hasPreview = node.pythonPreviewResult && (
                                        node.pythonPreviewResult.type === 'chart' ||
                                        node.pythonPreviewResult.type === 'table' ||
                                        node.pythonPreviewResult.type === 'variable' ||
                                        node.pythonPreviewResult.type === 'html'
                                    );

                                    if (hasPreview) {
                                        const widgetId = `python-preview-${tree.id}-${nodeId}`;
                                        const previewType = node.pythonPreviewResult.type;
                                        const typeLabel = previewType === 'chart' ? 'Grafico' :
                                            previewType === 'table' ? 'Tabella' :
                                                previewType === 'html' ? 'HTML' : 'Variabile';
                                        newDynamicWidgets[widgetId] = {
                                            id: widgetId,
                                            name: `Python ${typeLabel}: ${node.pythonResultName} (${tree.name})`,
                                            component: <React.Suspense fallback={<WidgetLoader />}>
                                                <PreviewWidgetRenderer treeId={tree.id} nodeId={nodeId} previewType="python" resultName={node.pythonResultName} />
                                            </React.Suspense>,
                                        };
                                    }
                                }

                                if (node.options) {
                                    Object.entries(node.options).forEach(([key, child]: [string, any]) => {
                                        if (typeof child === 'object' && !Array.isArray(child)) {
                                            scanNode(child, [...path, key]);
                                        } else if (Array.isArray(child)) {
                                            child.forEach((c, idx) => {
                                                if (typeof c === 'object') {
                                                    scanNode(c, [...path, key, String(idx)]);
                                                }
                                            });
                                        }
                                    });
                                }

                                // Also scan sub-trees (linked trees embedded via subTreeRef)
                                if (node.subTreeRef && !visitedSubTrees.has(node.subTreeRef)) {
                                    visitedSubTrees.add(node.subTreeRef);
                                    const linkedTree = treesResult.data?.find((t: any) => t.id === node.subTreeRef);
                                    if (linkedTree) {
                                        const subJson = typeof linkedTree.jsonDecisionTree === 'string'
                                            ? JSON.parse(linkedTree.jsonDecisionTree)
                                            : linkedTree.jsonDecisionTree;
                                        if (subJson) {
                                            scanNode(subJson, [...path, 'sub']);
                                        }
                                    }
                                }
                            };

                            scanNode(jsonTree);
                        });
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
