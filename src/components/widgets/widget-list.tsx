'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { kpiData } from '@/lib/data';
import { getPipelines } from '@/actions/pipelines';
import { useSession } from 'next-auth/react';

// Lazy load widget components for better performance
const KpiCard = React.lazy(() => import('@/components/dashboard/kpi-card').then(m => ({ default: m.default })));
const OverviewChart = React.lazy(() => import('@/components/dashboard/overview-chart').then(m => ({ default: m.default })));
const RevenueByProductChart = React.lazy(() => import('@/components/dashboard/revenue-by-product-chart').then(m => ({ default: m.default })));
const CapacityChart = React.lazy(() => import('@/components/dashboard/capacity-chart').then(m => ({ default: m.default })));
const JobMarginAnalysis = React.lazy(() => import('@/components/dashboard/job-margin-analysis').then(m => ({ default: m.default })));
const CostCenterAnalysisChart = React.lazy(() => import('@/components/dashboard/cost-center-analysis').then(m => ({ default: m.default })));
const OrdersWidget = React.lazy(() => import('@/components/widgets/orders/OrdersWidget').then(m => ({ default: m.default })));
const PlanningWidget = React.lazy(() => import('@/components/widgets/planning/PlanningWidget').then(m => ({ default: m.default })));
const AcquistiWidget = React.lazy(() => import('./acquisti/AcquistiWidget').then(m => ({ default: m.default })));
const CuttingWidget = React.lazy(() => import('./cutting/CuttingWidget').then(m => ({ default: m.default })));
const SewingWidget = React.lazy(() => import('./sewing/SewingWidget').then(m => ({ default: m.default })));
const PrintingWidget = React.lazy(() => import('./printing/PrintingWidget').then(m => ({ default: m.default })));
const EmbroideryWidget = React.lazy(() => import('./embroidery/EmbroideryWidget').then(m => ({ default: m.default })));
const LavanderiaWidget = React.lazy(() => import('./lavanderia/LavanderiaWidget').then(m => ({ default: m.default })));
const StiroWidget = React.lazy(() => import('./stiro/StiroWidget').then(m => ({ default: m.default })));
const ControlloQualitaWidget = React.lazy(() => import('./controllo-qualita/ControlloQualitaWidget').then(m => ({ default: m.default })));
const PackagingWidget = React.lazy(() => import('./packaging/PackagingWidget').then(m => ({ default: m.default })));
const MagazzinoWidget = React.lazy(() => import('./magazzino/MagazzinoWidget').then(m => ({ default: m.default })));
const SetupWidget = React.lazy(() => import('./setup/SetupWidget').then(m => ({ default: m.default })));
const PipelinesWidget = React.lazy(() => import('./pipelines/PipelinesWidget').then(m => ({ default: m.default })));
const SqlTestTable = React.lazy(() => import('../dashboard/sql-test-table').then(m => ({ default: m.default })));
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

// Static widgets that are always available - now using lazy loading
const staticWidgets: Record<string, Widget> = {
    'kpi-1': { id: 'kpi-1', component: <React.Suspense fallback={<WidgetLoader />}><KpiCard {...kpiData[0]} /></React.Suspense>, name: 'KPI Fatturato' },
    'kpi-2': { id: 'kpi-2', component: <React.Suspense fallback={<WidgetLoader />}><KpiCard {...kpiData[1]} /></React.Suspense>, name: 'KPI Budget' },
    'kpi-3': { id: 'kpi-3', component: <React.Suspense fallback={<WidgetLoader />}><KpiCard {...kpiData[2]} /></React.Suspense>, name: 'KPI Forecast' },
    'kpi-4': { id: 'kpi-4', component: <React.Suspense fallback={<WidgetLoader />}><KpiCard {...kpiData[3]} /></React.Suspense>, name: 'KPI Anno Prec.' },
    'overview': { id: 'overview', component: <React.Suspense fallback={<WidgetLoader />}><OverviewChart /></React.Suspense>, name: 'Panoramica Fatturato' },
    'revenue-by-product': { id: 'revenue-by-product', component: <React.Suspense fallback={<WidgetLoader />}><RevenueByProductChart /></React.Suspense>, name: 'Fatturato per Prodotto' },
    'capacity': { id: 'capacity', component: <React.Suspense fallback={<WidgetLoader />}><CapacityChart /></React.Suspense>, name: 'Capacità Produttiva' },
    'cost-center': { id: 'cost-center', component: <React.Suspense fallback={<WidgetLoader />}><CostCenterAnalysisChart /></React.Suspense>, name: 'Analisi Costi CDC' },
    'job-margin': { id: 'job-margin', component: <React.Suspense fallback={<WidgetLoader />}><JobMarginAnalysis /></React.Suspense>, name: 'Analisi Marginalità' },
    'sql-test-table': { id: 'sql-test-table', component: <React.Suspense fallback={<WidgetLoader />}><SqlTestTable /></React.Suspense>, name: 'SQL Test Table' },
    'orders': { id: 'orders', component: <React.Suspense fallback={<WidgetLoader />}><OrdersWidget /></React.Suspense>, name: 'Gestione Ordini' },
    'planning': { id: 'planning', component: <React.Suspense fallback={<WidgetLoader />}><PlanningWidget /></React.Suspense>, name: 'Pianificazione Produzione' },
    'acquisti': { id: 'acquisti', component: <React.Suspense fallback={<WidgetLoader />}><AcquistiWidget /></React.Suspense>, name: 'Centrale Acquisti' },
    'cutting': { id: 'cutting', component: <React.Suspense fallback={<WidgetLoader />}><CuttingWidget /></React.Suspense>, name: 'Reparto Taglio' },
    'sewing': { id: 'sewing', component: <React.Suspense fallback={<WidgetLoader />}><SewingWidget /></React.Suspense>, name: 'Reparto Confezione' },
    'printing': { id: 'printing', component: <React.Suspense fallback={<WidgetLoader />}><PrintingWidget /></React.Suspense>, name: 'Reparto Stampa' },
    'embroidery': { id: 'embroidery', component: <React.Suspense fallback={<WidgetLoader />}><EmbroideryWidget /></React.Suspense>, name: 'Reparto Ricamo' },
    'lavanderia': { id: 'lavanderia', component: <React.Suspense fallback={<WidgetLoader />}><LavanderiaWidget /></React.Suspense>, name: 'Reparto Lavanderia' },
    'stiro': { id: 'stiro', component: <React.Suspense fallback={<WidgetLoader />}><StiroWidget /></React.Suspense>, name: 'Reparto Stiro' },
    'controllo-qualita': { id: 'controllo-qualita', component: <React.Suspense fallback={<WidgetLoader />}><ControlloQualitaWidget /></React.Suspense>, name: 'Reparto Controllo Qualità' },
    'packaging': { id: 'packaging', component: <React.Suspense fallback={<WidgetLoader />}><PackagingWidget /></React.Suspense>, name: 'Reparto Packaging' },
    'magazzino': { id: 'magazzino', component: <React.Suspense fallback={<WidgetLoader />}><MagazzinoWidget /></React.Suspense>, name: 'Magazzino' },
    'setup': { id: 'setup', component: <React.Suspense fallback={<WidgetLoader />}><SetupWidget /></React.Suspense>, name: 'Setup Connessioni' },
    'pipelines': { id: 'pipelines', component: <React.Suspense fallback={<WidgetLoader />}><PipelinesWidget /></React.Suspense>, name: 'Pipeline ETL' },
};


// Cache for dynamic widgets to avoid redundant fetches
let widgetsCache: Record<string, Widget> | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Debounce function to prevent rapid re-fetches
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    return function executedFunction(...args: Parameters<T>) {
        const later = () => {
            timeout = null;
            func(...args);
        };
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export const useAvailableWidgets = (visibleWidgetIds?: string[]) => {
    const [availableWidgets, setAvailableWidgets] = useState<Record<string, Widget>>(staticWidgets);
    const { data: session, status } = useSession();
    const [refreshKey, setRefreshKey] = useState(0);
    const isMountedRef = useRef(true);
    const fetchCountRef = useRef(0);

    // Memoized fetch function to prevent unnecessary recreations
    const fetchDynamicWidgets = useCallback(async (forceRefresh = false) => {
        if (!session?.user) return;

        // Check cache first
        const now = Date.now();
        if (!forceRefresh && widgetsCache && (now - cacheTimestamp) < CACHE_DURATION) {
            if (isMountedRef.current) {
                setAvailableWidgets({ ...staticWidgets, ...widgetsCache });
            }
            return;
        }

        try {
            const dynamicWidgets: Record<string, Widget> = {};
            const currentFetchId = ++fetchCountRef.current;

            // 1. Pipeline widgets (existing logic)
            const loadedPipelines = await getPipelines();
            if (loadedPipelines && isMountedRef.current && currentFetchId === fetchCountRef.current) {
                loadedPipelines.forEach((rawPipeline: any) => {
                    const pipeline = {
                        ...rawPipeline,
                        nodes: typeof rawPipeline.nodes === 'string' ? JSON.parse(rawPipeline.nodes) : rawPipeline.nodes
                    };

                    if (pipeline.nodes) {
                        Object.values(pipeline.nodes).forEach((node: any) => {
                            if (node.type === 'end' && node.isPublished) {
                                const widgetId = `pipeline-${pipeline.id}-${node.id}`;
                                dynamicWidgets[widgetId] = {
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

            // 2. Decision tree node widgets - only fetch if needed
            if (isMountedRef.current && currentFetchId === fetchCountRef.current) {
                const { getTreesAction } = await import('@/app/actions');
                const { NodeWidgetRenderer } = await import('./builder/NodeWidgetRenderer');
                const { PreviewWidgetRenderer } = await import('./builder/PreviewWidgetRenderer');

                const treesResult = await getTreesAction();
                if (treesResult.data && isMountedRef.current && currentFetchId === fetchCountRef.current) {
                    treesResult.data.forEach((tree: any) => {
                        const jsonTree = typeof tree.jsonDecisionTree === 'string'
                            ? JSON.parse(tree.jsonDecisionTree)
                            : tree.jsonDecisionTree;

                        // Recursively scan tree for published widgets and preview data
                        const scanNode = (node: any, path: string[] = []) => {
                            if (!node) return;

                            const nodeId = node.id || path.join('-');

                            // Check if this node has a published widget
                            if (node.widgetConfig?.isPublished) {
                                const widgetId = `tree-${tree.id}-${nodeId}`;
                                dynamicWidgets[widgetId] = {
                                    id: widgetId,
                                    name: node.widgetConfig.title || `Widget da ${tree.name}`,
                                    component: <React.Suspense fallback={<WidgetLoader />}>
                                        <NodeWidgetRenderer treeId={tree.id} nodeId={nodeId} />
                                    </React.Suspense>,
                                };
                            }

                            // Check if this node has SQL preview data
                            if (node.sqlResultName && node.sqlPreviewData) {
                                const widgetId = `sql-preview-${tree.id}-${nodeId}`;
                                dynamicWidgets[widgetId] = {
                                    id: widgetId,
                                    name: `SQL: ${node.sqlResultName} (${tree.name})`,
                                    component: <React.Suspense fallback={<WidgetLoader />}>
                                        <PreviewWidgetRenderer treeId={tree.id} nodeId={nodeId} previewType="sql" resultName={node.sqlResultName} />
                                    </React.Suspense>,
                                };
                            }

                            // Check if this node has Python preview data
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
                                    dynamicWidgets[widgetId] = {
                                        id: widgetId,
                                        name: `Python ${typeLabel}: ${node.pythonResultName} (${tree.name})`,
                                        component: <React.Suspense fallback={<WidgetLoader />}>
                                            <PreviewWidgetRenderer treeId={tree.id} nodeId={nodeId} previewType="python" resultName={node.pythonResultName} />
                                        </React.Suspense>,
                                    };
                                }
                            }

                            // Recurse into options
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
                        };

                        scanNode(jsonTree);
                    });
                }
            }

            // Update cache
            if (isMountedRef.current && currentFetchId === fetchCountRef.current) {
                widgetsCache = dynamicWidgets;
                cacheTimestamp = now;
                setAvailableWidgets({ ...staticWidgets, ...dynamicWidgets });
            }

        } catch (error) {
            console.error("Error fetching dynamic widgets:", error);
            if (isMountedRef.current) {
                setAvailableWidgets(staticWidgets);
            }
        }
    }, [session]);

    // Debounced fetch to prevent rapid calls
    const debouncedFetch = useMemo(() => debounce(fetchDynamicWidgets, 300), [fetchDynamicWidgets]);

    useEffect(() => {
        isMountedRef.current = true;
        if (status === 'loading') return;

        debouncedFetch(false);

        return () => {
            isMountedRef.current = false;
        };
    }, [status, session, refreshKey, debouncedFetch]);

    // Memoize the result to prevent unnecessary re-renders
    const memoizedWidgets = useMemo(() => availableWidgets, [availableWidgets]);

    return memoizedWidgets;
};

// You can export this if you have components that need the static list and cannot be hooks
export { staticWidgets };
