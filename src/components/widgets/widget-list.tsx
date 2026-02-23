'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
const XbrlAnalysisWidget = React.lazy(() => import('./xbrl/XbrlAnalysisWidget').then(m => ({ default: m.default })));
const XbrlKpiWidget = React.lazy(() => import('./xbrl/XbrlKpiWidget').then(m => ({ default: m.default })));
const XbrlDashboardSummary = React.lazy(() => import('./xbrl/XbrlDashboardSummary').then(m => ({ default: m.default })));

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
    // XBRL Financial Analysis Widgets
    'xbrl-summary': { id: 'xbrl-summary', component: <React.Suspense fallback={<WidgetLoader />}><XbrlDashboardSummary /></React.Suspense>, name: 'XBRL Riepilogo Analisi' },
    'xbrl-kpi-roe': { id: 'xbrl-kpi-roe', component: <React.Suspense fallback={<WidgetLoader />}><XbrlKpiWidget metric="roe" /></React.Suspense>, name: 'XBRL KPI ROE' },
    'xbrl-kpi-ebitda-margin': { id: 'xbrl-kpi-ebitda-margin', component: <React.Suspense fallback={<WidgetLoader />}><XbrlKpiWidget metric="ebitdaMargin" /></React.Suspense>, name: 'XBRL KPI EBITDA Margin' },
    'xbrl-kpi-pfn-ebitda': { id: 'xbrl-kpi-pfn-ebitda', component: <React.Suspense fallback={<WidgetLoader />}><XbrlKpiWidget metric="pfnEbitda" /></React.Suspense>, name: 'XBRL KPI PFN/EBITDA' },
    'xbrl-kpi-current-ratio': { id: 'xbrl-kpi-current-ratio', component: <React.Suspense fallback={<WidgetLoader />}><XbrlKpiWidget metric="currentRatio" /></React.Suspense>, name: 'XBRL KPI Current Ratio' },
    'xbrl-kpi-utile': { id: 'xbrl-kpi-utile', component: <React.Suspense fallback={<WidgetLoader />}><XbrlKpiWidget metric="utile" /></React.Suspense>, name: 'XBRL KPI Utile Netto' },
    'xbrl-composizione-attivo': { id: 'xbrl-composizione-attivo', component: <React.Suspense fallback={<WidgetLoader />}><XbrlAnalysisWidget nodeId="equilibrio-patrimoniale" chartId="composizione-attivo" /></React.Suspense>, name: 'XBRL Composizione Attivo' },
    'xbrl-composizione-passivo': { id: 'xbrl-composizione-passivo', component: <React.Suspense fallback={<WidgetLoader />}><XbrlAnalysisWidget nodeId="equilibrio-patrimoniale" chartId="composizione-passivo" /></React.Suspense>, name: 'XBRL Composizione Passivo' },
    'xbrl-indici-liquidita': { id: 'xbrl-indici-liquidita', component: <React.Suspense fallback={<WidgetLoader />}><XbrlAnalysisWidget nodeId="equilibrio-finanziario" chartId="indici-liquidita" /></React.Suspense>, name: 'XBRL Indici Liquidita' },
    'xbrl-struttura-costi': { id: 'xbrl-struttura-costi', component: <React.Suspense fallback={<WidgetLoader />}><XbrlAnalysisWidget nodeId="equilibrio-economico" chartId="struttura-costi" /></React.Suspense>, name: 'XBRL Struttura Costi' },
    'xbrl-margini-trend': { id: 'xbrl-margini-trend', component: <React.Suspense fallback={<WidgetLoader />}><XbrlAnalysisWidget nodeId="equilibrio-economico" chartId="margini-trend" /></React.Suspense>, name: 'XBRL Margini Trend' },
    'xbrl-evoluzione-ricavi': { id: 'xbrl-evoluzione-ricavi', component: <React.Suspense fallback={<WidgetLoader />}><XbrlAnalysisWidget nodeId="trend-sviluppo" chartId="evoluzione-ricavi" /></React.Suspense>, name: 'XBRL Evoluzione Ricavi' },
    'xbrl-evoluzione-patrimonio': { id: 'xbrl-evoluzione-patrimonio', component: <React.Suspense fallback={<WidgetLoader />}><XbrlAnalysisWidget nodeId="trend-sviluppo" chartId="evoluzione-patrimonio" /></React.Suspense>, name: 'XBRL Evoluzione Patrimonio' },
    'xbrl-indicatori-redditivita': { id: 'xbrl-indicatori-redditivita', component: <React.Suspense fallback={<WidgetLoader />}><XbrlAnalysisWidget nodeId="indicatori-redditivita" chartId="trend-indicatori" /></React.Suspense>, name: 'XBRL Indicatori Redditivita' },
    'xbrl-giorni-ciclo': { id: 'xbrl-giorni-ciclo', component: <React.Suspense fallback={<WidgetLoader />}><XbrlAnalysisWidget nodeId="capitale-circolante" chartId="giorni-ciclo" /></React.Suspense>, name: 'XBRL Giorni Incasso/Pagamento' },
    'xbrl-leverage-trend': { id: 'xbrl-leverage-trend', component: <React.Suspense fallback={<WidgetLoader />}><XbrlAnalysisWidget nodeId="sostenibilita-debito" chartId="leverage-trend" /></React.Suspense>, name: 'XBRL Leverage Trend' },
};


// Cache for dynamic widgets to avoid redundant fetches
let widgetsCache: Record<string, Widget> | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Invalidate widget list cache (call when tree data changes)
export function invalidateWidgetListCache() {
    widgetsCache = null;
    cacheTimestamp = 0;
}

export const useAvailableWidgets = () => {
    // Start with static widgets immediately - no waiting for dynamic ones
    const [dynamicWidgets, setDynamicWidgets] = useState<Record<string, Widget>>({});
    const { data: session, status } = useSession();
    const isMountedRef = useRef(true);
    const fetchCountRef = useRef(0);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Listen for tree-cache-invalidated events to refresh widget list
    useEffect(() => {
        const handler = () => {
            invalidateWidgetListCache();
            setRefreshTrigger(prev => prev + 1);
        };
        window.addEventListener('tree-cache-invalidated', handler);
        return () => window.removeEventListener('tree-cache-invalidated', handler);
    }, []);

    useEffect(() => {
        isMountedRef.current = true;
        if (status === 'loading' || !session?.user) return;

        // Check cache first
        const now = Date.now();
        if (widgetsCache && (now - cacheTimestamp) < CACHE_DURATION) {
            setDynamicWidgets(widgetsCache);
            return;
        }

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

                // Update cache and state
                if (isMountedRef.current && currentFetchId === fetchCountRef.current) {
                    widgetsCache = newDynamicWidgets;
                    cacheTimestamp = Date.now();
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

    // Merge static + dynamic only when dynamic changes
    const allWidgets = useMemo(
        () => ({ ...staticWidgets, ...dynamicWidgets }),
        [dynamicWidgets]
    );

    return allWidgets;
};

// You can export this if you have components that need the static list and cannot be hooks
export { staticWidgets };
