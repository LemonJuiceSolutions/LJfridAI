'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getCachedTree, invalidateAndNotifyWidgets } from '@/lib/tree-cache';
import { DataTable } from '@/components/ui/data-table';
import SmartWidgetRenderer from './SmartWidgetRenderer';
import { applyPlotlyOverrides, plotlyJsonToHtml } from '@/lib/plotly-utils';
import { applyHtmlStyleOverrides, injectIframeFetchPolyfill } from '@/lib/html-style-utils';
import { generateUiElementsCss } from '@/lib/unified-style-css';
import { Loader2, Database, Code, AlertCircle, RefreshCw, Zap, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useActiveUnifiedStyle } from '@/hooks/use-active-style';
import { PipelineExecutionDialog } from '@/components/widgets/builder/PipelineExecutionDialog';
import Link from 'next/link';
import get from 'lodash/get';

interface PreviewWidgetRendererProps {
    treeId: string;
    nodeId: string;
    previewType: 'sql' | 'python';
    resultName: string;
}

export function PreviewWidgetRenderer({ treeId, nodeId, previewType, resultName }: PreviewWidgetRendererProps) {
    const [previewData, setPreviewData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showExecutionDialog, setShowExecutionDialog] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [nodePath, setNodePath] = useState<string | null>(null);
    const { toast } = useToast();
    const { activeStyle } = useActiveUnifiedStyle();
    const isLoadingRef = useRef(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const loadPreview = useCallback(async (showLoading = true) => {
        // Prevent concurrent loads
        if (isLoadingRef.current) return;
        isLoadingRef.current = true;

        if (showLoading) setLoading(true);
        else setIsRefreshing(true);
        // Clear previous error so a successful refresh can show data
        setError(null);
        try {
            // Strategy: try direct cache lookup first (fast, lightweight),
            // fall back to full tree hydration only if cache misses.
            let node: any = null;

            // Helper: find the lodash-style path for a node by its ID within a tree JSON
            const findPathById = (root: any, targetId: string): string | null => {
                const search = (n: any, path: string): string | null => {
                    if (!n || typeof n !== 'object') return null;
                    if (n.id === targetId) return path;
                    if (n.options) {
                        for (const [key, child] of Object.entries(n.options)) {
                            const escapedKey = key.includes("'") ? key.replace(/'/g, "\\'") : key;
                            const childPath = `${path}.options['${escapedKey}']`;
                            if (Array.isArray(child)) {
                                for (let i = 0; i < (child as any[]).length; i++) {
                                    const found = search((child as any[])[i], `${childPath}[${i}]`);
                                    if (found) return found;
                                }
                            } else if (typeof child === 'object') {
                                const found = search(child, childPath);
                                if (found) return found;
                            }
                        }
                    }
                    return null;
                };
                return search(root, 'root');
            };

            // 0. Try preloaded batch cache first (filled by DynamicGridPage on mount — zero network)
            try {
                const { getPreloadedWidgetData } = await import('@/lib/widget-preload-cache');
                const preloaded = getPreloadedWidgetData(treeId, nodeId);
                if (preloaded) {
                    node = preloaded;
                }
            } catch { /* preload cache not available */ }

            // 1. Fallback: load directly from NodePreviewCache via Server Action
            if (!node) try {
                const { getNodePreviewAction } = await import('@/app/actions');
                const cached = await getNodePreviewAction(treeId, nodeId);
                if (cached) {
                    node = cached;
                }
            } catch (cacheErr: any) {
                console.warn(`[PreviewWidget] Cache load failed for ${nodeId}:`, cacheErr.message);
            }

            // Connector ID resolution — deferred (lazy load tree only on first user action,
            // not on initial render). The full tree is expensive to load just for one field.
            if (node && !node.pythonConnectorId) {
                // Schedule a background tree load after the widget is already rendering
                getCachedTree(treeId, false).then(treeResult => {
                    if (!treeResult?.data) return;
                    try {
                        const jsonTree = typeof treeResult.data.jsonDecisionTree === 'string'
                            ? JSON.parse(treeResult.data.jsonDecisionTree) : treeResult.data.jsonDecisionTree;
                        const p = findPathById(jsonTree, nodeId);
                        if (p) {
                            setNodePath(p);
                            const lodashPath = p.replace(/^root\.?/, '');
                            const treeNode = lodashPath ? get(jsonTree, lodashPath) : jsonTree;
                            const cid = treeNode?.pythonConnectorId || treeNode?.connectorId || treeNode?.sqlConnectorId;
                            if (cid) {
                                setPreviewData((prev: any) => prev ? { ...prev, pythonConnectorId: cid } : prev);
                            }
                        }
                    } catch { /* best-effort */ }
                }).catch(() => {});
            }

            // 2. Fallback / merge: load tree + find node inline
            // Also runs when cache hit is incomplete (e.g. cache has SQL data but tree JSON has pythonPreviewResult)
            const cacheIncomplete = node && (
                (previewType === 'python' && !node.pythonPreviewResult) ||
                (previewType === 'sql' && !node.sqlPreviewData && !node.pythonPreviewResult)
            );
            if (!node || cacheIncomplete) {
                const result = await getCachedTree(treeId, !showLoading);
                if (result.data) {
                    const jsonTree = typeof result.data.jsonDecisionTree === 'string'
                        ? JSON.parse(result.data.jsonDecisionTree)
                        : result.data.jsonDecisionTree;

                    // Reuse findPathById to locate the node and its path simultaneously
                    const foundPath = findPathById(jsonTree, nodeId);
                    if (foundPath) {
                        const lodashPath = foundPath.replace(/^root\.?/, '');
                        const treeNode = lodashPath ? get(jsonTree, lodashPath) : jsonTree;
                        // Merge: cache data takes priority, tree JSON fills gaps
                        node = node ? { ...treeNode, ...node } : treeNode;
                        setNodePath(foundPath);
                    }
                }
            }

            if (node) {
                if (previewType === 'sql') {
                    const isHtmlPreview = node.pythonPreviewResult?.type === 'html';
                    const sqlData = node.sqlPreviewData
                        || (!isHtmlPreview && node.pythonPreviewResult?.data && Array.isArray(node.pythonPreviewResult.data)
                            ? node.pythonPreviewResult.data : null)
                        || (!isHtmlPreview && node.pythonPreviewResult?.rechartsData && Array.isArray(node.pythonPreviewResult.rechartsData)
                            ? node.pythonPreviewResult.rechartsData : null);

                    const pythonTs = node.pythonPreviewResult?.timestamp || 0;
                    const sqlTs = node.sqlPreviewTimestamp || 0;

                    if (sqlData) {
                        setPreviewData({
                            type: 'table',
                            data: sqlData,
                            timestamp: Math.max(sqlTs, pythonTs) || sqlTs
                        });
                    } else if (node.pythonPreviewResult) {
                        setPreviewData({
                            ...node.pythonPreviewResult,
                            timestamp: pythonTs,
                            connectorId: node.pythonConnectorId,
                        });
                    } else {
                        setError('Nessuna anteprima trovata per questo nodo');
                    }
                } else if (previewType === 'python' && node.pythonPreviewResult) {
                    setPreviewData({
                        ...node.pythonPreviewResult,
                        timestamp: node.pythonPreviewResult?.timestamp,
                        connectorId: node.pythonConnectorId,
                    });
                } else {
                    setError(`Nessuna anteprima ${previewType.toUpperCase()} trovata per questo nodo`);
                }
            } else {
                setError('Nodo non trovato');
            }
        } catch (err) {
            console.error('Error loading preview widget:', err);
            setError('Errore durante il caricamento dell\'anteprima');
        } finally {
            setLoading(false);
            setIsRefreshing(false);
            isLoadingRef.current = false;
        }
    }, [treeId, nodeId, previewType]);

    useEffect(() => {
        loadPreview();
    }, [loadPreview]);

    // Listen for cross-widget refresh events (when another widget triggers execution)
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.treeId === treeId) {
                loadPreview(false);
            }
        };
        window.addEventListener('tree-cache-invalidated', handler);
        return () => window.removeEventListener('tree-cache-invalidated', handler);
    }, [treeId, loadPreview]);

    // Listen for DB write success from iframe (saveToDb) and re-execute pipeline.
    // Uses CustomEvent (direct, from same-origin iframe) + postMessage (fallback).
    const isHtmlWidget = previewData?.type === 'html';
    useEffect(() => {
        if (!isHtmlWidget) return; // Only HTML widgets have iframes with saveToDb

        const triggerReExecution = () => {
            console.log('[PreviewWidget] DB write success - triggering re-execution...');
            toast({ title: 'Salvato nel DB!', description: 'Ri-esecuzione per aggiornare grafico e tabella...' });
            setTimeout(() => setShowExecutionDialog(true), 500);
        };

        // Primary: CustomEvent dispatched directly on parent window by the polyfill
        const customHandler = () => triggerReExecution();
        window.addEventListener('iframe-db-write-success', customHandler);

        // Fallback: postMessage (in case CustomEvent doesn't work)
        const msgHandler = (e: MessageEvent) => {
            if (e.data?.type === 'iframe-db-write-success') {
                if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
                triggerReExecution();
            }
        };
        window.addEventListener('message', msgHandler);

        return () => {
            window.removeEventListener('iframe-db-write-success', customHandler);
            window.removeEventListener('message', msgHandler);
        };
    }, [isHtmlWidget, toast]);

    // Listen for page-level queue trigger: open this widget's PipelineExecutionDialog
    const isQueuedRef = useRef(false);
    useEffect(() => {
        const widgetId = `${previewType}-preview-${treeId}-${nodeId}`;
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.widgetId === widgetId) {
                isQueuedRef.current = true;
                window.dispatchEvent(new CustomEvent('widget-update-started', { detail: { widgetId } }));
                setShowExecutionDialog(true);
            }
        };
        window.addEventListener('trigger-widget-update', handler);
        return () => window.removeEventListener('trigger-widget-update', handler);
    }, [treeId, nodeId, previewType]);

    const handleRefresh = () => {
        loadPreview(false);
    };

    const handleUpdateHierarchyClick = () => {
        setShowExecutionDialog(true);
    };

    const handleDownloadHtml = useCallback(() => {
        if (!previewData || previewData.type !== 'html' || !previewData.html) return;
        const htmlOverrides = previewData.htmlStyleOverrides || activeStyle?.html || {};
        const uiOverrides = { ...(activeStyle?.ui || {}), ...(previewData.uiStyleOverrides || {}) };
        const uiCss = generateUiElementsCss(uiOverrides);
        const styledHtml = applyHtmlStyleOverrides(previewData.html, htmlOverrides, false, uiCss);
        const blob = new Blob([styledHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${resultName || 'report'}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [previewData, activeStyle, resultName]);

    const handleExecutionSuccess = () => {
        // Invalidate cache and notify ALL widgets sharing this treeId to refresh
        invalidateAndNotifyWidgets(treeId);
        loadPreview(false);

        // If triggered by page-level queue, auto-close dialog and advance queue
        if (isQueuedRef.current) {
            isQueuedRef.current = false;
            setShowExecutionDialog(false);
            window.dispatchEvent(new CustomEvent('widget-update-complete', {
                detail: { widgetId: `${previewType}-preview-${treeId}-${nodeId}`, success: true }
            }));
        }
    };

    // PipelineExecutionDialog must always be in the DOM so page-level queue
    // ("Aggiorna Pagina") can trigger executions even when no data exists yet.
    const executionDialog = (
        <PipelineExecutionDialog
            isOpen={showExecutionDialog}
            onClose={() => {
                setShowExecutionDialog(false);
                if (isQueuedRef.current) {
                    isQueuedRef.current = false;
                    window.dispatchEvent(new CustomEvent('widget-update-complete', {
                        detail: { widgetId: `${previewType}-preview-${treeId}-${nodeId}`, success: false }
                    }));
                }
            }}
            treeId={treeId}
            nodeId={nodeId}
            onSuccess={handleExecutionSuccess}
        />
    );

    // Compact header shown in loading/error/empty states so the user always knows which widget this is
    const renderCompactHeader = () => (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
            {previewType === 'sql' ? <Database className="h-4 w-4 text-primary" /> : <Code className="h-4 w-4 text-primary" />}
            <span className="text-sm font-medium truncate">{resultName || nodeId}</span>
            <div className="ml-auto flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    asChild
                    title="Apri nodo nell'editor"
                >
                    <Link href={`/view/${treeId}${nodePath ? `?node=${encodeURIComponent(nodePath)}` : ''}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-amber-500 hover:text-amber-600"
                    onClick={handleUpdateHierarchyClick}
                    title="Aggiorna Intera Gerarchia"
                >
                    <Zap className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );

    if (loading) {
        return (
            <>
                {executionDialog}
                <div className="h-full flex flex-col">
                    {renderCompactHeader()}
                    <div className="flex items-center justify-center flex-1 p-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                </div>
            </>
        );
    }

    if (error) {
        return (
            <>
                {executionDialog}
                <div className="h-full flex flex-col">
                    {renderCompactHeader()}
                    <div className="flex flex-col items-center justify-center flex-1 p-4 text-center">
                        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                </div>
            </>
        );
    }

    if (!previewData) {
        return (
            <>
                {executionDialog}
                <div className="h-full flex flex-col">
                    {renderCompactHeader()}
                    <div className="flex flex-col items-center justify-center flex-1 p-4 text-center">
                        <Database className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">Nessun dato disponibile</p>
                    </div>
                </div>
            </>
        );
    }

    const renderHeader = () => (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
            {previewData.type === 'table' ? <Database className="h-4 w-4 text-primary" /> : <Code className="h-4 w-4 text-primary" />}
            <span className="text-sm font-medium">{resultName}</span>
            <div className="ml-auto flex items-center gap-1">
                {previewData.timestamp && (
                    <span className="text-[10px] text-muted-foreground mr-2">
                        {new Date(previewData.timestamp).toLocaleString('it-IT', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </span>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    asChild
                    title="Apri nodo nell'editor"
                >
                    <Link href={`/view/${treeId}${nodePath ? `?node=${encodeURIComponent(nodePath)}` : ''}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                </Button>
                {previewData?.type === 'html' && previewData.html && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={handleDownloadHtml}
                        title="Scarica HTML"
                    >
                        <Download className="h-3.5 w-3.5" />
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${isRefreshing ? 'animate-spin' : ''}`}
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    title="Ricarica Anteprima"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-amber-500 hover:text-amber-600"
                    onClick={handleUpdateHierarchyClick}
                    disabled={isRefreshing}
                    title="Aggiorna Intera Gerarchia"
                >
                    <Zap className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col relative w-full">
            {renderHeader()}
            <div className="flex-1 overflow-auto relative">
                {isRefreshing && (
                    <div className="absolute inset-0 bg-background/50 flex flex-col items-center justify-center z-10 backdrop-blur-[1px]">
                        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                    </div>
                )}

                {previewData.type === 'table' ? (
                    <DataTable data={previewData.data} />
                ) : previewData.type === 'chart' ? (
                    <div className="h-full">
                        {previewData.plotlyJson ? (
                            <iframe
                                srcDoc={plotlyJsonToHtml(applyPlotlyOverrides(previewData.plotlyJson, previewData.plotlyStyleOverrides || activeStyle?.plotly || {}))}
                                className="w-full border-none"
                                title="Interactive Chart"
                                style={{ height: `${Math.max(400, previewData.plotlyJson?.layout?.height || 500)}px` }}
                            />
                        ) : previewData.chartHtml ? (
                            <iframe
                                srcDoc={`<html><head><style>body { margin: 0; padding: 0; background: transparent; overflow: auto; }</style></head><body>${previewData.chartHtml}</body></html>`}
                                className="w-full border-none h-full"
                                title="Interactive Chart"
                            />
                        ) : previewData.rechartsConfig && previewData.rechartsData ? (
                            <SmartWidgetRenderer
                                config={{
                                    ...previewData.rechartsConfig,
                                    ...(previewData.rechartsStyle ? { chartStyle: previewData.rechartsStyle } : {}),
                                }}
                                data={previewData.rechartsData}
                                onRefresh={handleRefresh}
                                isRefreshing={isRefreshing}
                                onUpdateHierarchy={handleUpdateHierarchyClick}
                            />
                        ) : previewData.chartBase64 ? (
                            <img
                                src={`data:image/png;base64,${previewData.chartBase64}`}
                                alt="Chart Preview"
                                className="w-full h-auto object-contain"
                            />
                        ) : (
                            <div className="text-center text-muted-foreground">
                                Formato grafico non supportato
                            </div>
                        )}
                    </div>
                ) : previewData.type === 'html' && previewData.html ? (
                    <div className="w-full h-full bg-white dark:bg-zinc-950 overflow-hidden min-h-[300px]">
                        <iframe
                            ref={iframeRef}
                            key={previewData.timestamp || Date.now()}
                            srcDoc={(() => {
                                const htmlOverrides = previewData.htmlStyleOverrides || activeStyle?.html || {};
                                // Merge UI overrides: per-node takes precedence over active style
                                const uiOverrides = { ...(activeStyle?.ui || {}), ...(previewData.uiStyleOverrides || {}) };
                                const uiCss = generateUiElementsCss(uiOverrides);
                                const styledHtml = applyHtmlStyleOverrides(previewData.html, htmlOverrides, false, uiCss);
                                return injectIframeFetchPolyfill(styledHtml, {
                                    connectorId: previewData.connectorId,
                                    baseUrl: typeof window !== 'undefined' ? window.location.origin : '',
                                });
                            })()}
                            className="w-full h-full border-none min-h-[300px]"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
                            title="HTML Widget Preview"
                        />
                    </div>
                ) : previewData.type === 'variable' ? (
                    <div className="p-4">
                        <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto">
                            {JSON.stringify(previewData.variables, null, 2)}
                        </pre>
                    </div>
                ) : (
                    <div className="p-4 text-center text-muted-foreground">
                        Tipo di anteprima non supportato: {previewData.type}
                    </div>
                )}
            </div>
            {executionDialog}
        </div>
    );
}
