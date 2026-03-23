'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getCachedTree, invalidateAndNotifyWidgets } from '@/lib/tree-cache';
import SmartWidgetRenderer from './SmartWidgetRenderer';
import { WidgetConfig } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Loader2 } from 'lucide-react';
import { PipelineExecutionDialog } from '@/components/widgets/builder/PipelineExecutionDialog';

interface NodeWidgetRendererProps {
    treeId: string;
    nodeId: string;
}

export function NodeWidgetRenderer({ treeId, nodeId }: NodeWidgetRendererProps) {
    const [config, setConfig] = useState<WidgetConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showExecutionDialog, setShowExecutionDialog] = useState(false);
    const { toast } = useToast();
    const isLoadingRef = useRef(false);

    const loadWidget = useCallback(async (showLoading = true) => {
        if (isLoadingRef.current) return;
        isLoadingRef.current = true;

        if (showLoading) setLoading(true);
        else setIsRefreshing(true);
        try {
            const result = await getCachedTree(treeId, !showLoading);
            if (result.data) {
                const jsonTree = typeof result.data.jsonDecisionTree === 'string'
                    ? JSON.parse(result.data.jsonDecisionTree)
                    : result.data.jsonDecisionTree;

                // Find node by ID (recursive search)
                const findNode = (node: any): any => {
                    if (!node) return null;
                    if (node.id === nodeId) return node;

                    if (node.options) {
                        for (const child of Object.values(node.options)) {
                            if (typeof child === 'object') {
                                const found = Array.isArray(child)
                                    ? child.map(findNode).find(Boolean)
                                    : findNode(child);
                                if (found) return found;
                            }
                        }
                    }
                    return null;
                };

                const node = findNode(jsonTree);
                if (node?.widgetConfig) {
                    setConfig(node.widgetConfig);
                }
            }
        } catch (error) {
            console.error('Error loading node widget:', error);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
            isLoadingRef.current = false;
        }
    }, [treeId, nodeId]);

    useEffect(() => {
        loadWidget();
    }, [loadWidget]);

    // Listen for cross-widget refresh events
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.treeId === treeId) {
                loadWidget(false);
            }
        };
        window.addEventListener('tree-cache-invalidated', handler);
        return () => window.removeEventListener('tree-cache-invalidated', handler);
    }, [treeId, loadWidget]);

    // Listen for page-level queue trigger: open this widget's PipelineExecutionDialog
    const isQueuedRef = useRef(false);
    useEffect(() => {
        const widgetId = `tree-${treeId}-${nodeId}`;
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
    }, [treeId, nodeId]);

    const handleRefresh = () => {
        loadWidget(false);
    };

    const handleUpdateHierarchyClick = () => {
        setShowExecutionDialog(true);
    };

    const handleExecutionSuccess = () => {
        invalidateAndNotifyWidgets(treeId);
        loadWidget(false);

        // If triggered by page-level queue, auto-close dialog and advance queue
        if (isQueuedRef.current) {
            isQueuedRef.current = false;
            setShowExecutionDialog(false);
            window.dispatchEvent(new CustomEvent('widget-update-complete', {
                detail: { widgetId: `tree-${treeId}-${nodeId}`, success: true }
            }));
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">Caricamento widget...</span>
            </div>
        );
    }

    if (!config) {
        return <div className="p-4 text-destructive">Widget non trovato</div>;
    }

    return (
        <div className="h-full w-full relative">
            {isRefreshing && (
                <div className="absolute inset-0 bg-background/50 flex flex-col items-center justify-center z-10 backdrop-blur-[1px]">
                    <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                </div>
            )}
            <SmartWidgetRenderer
                config={config}
                data={config.data || []}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
                onUpdateHierarchy={handleUpdateHierarchyClick}
            />

            <PipelineExecutionDialog
                isOpen={showExecutionDialog}
                onClose={() => {
                    setShowExecutionDialog(false);
                    if (isQueuedRef.current) {
                        isQueuedRef.current = false;
                        window.dispatchEvent(new CustomEvent('widget-update-complete', {
                            detail: { widgetId: `tree-${treeId}-${nodeId}`, success: false }
                        }));
                    }
                }}
                treeId={treeId}
                nodeId={nodeId}
                onSuccess={handleExecutionSuccess}
            />
        </div>
    );
}
