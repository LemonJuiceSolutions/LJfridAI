'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import TextWidget from "@/components/dashboard/text-widget";
import SmartWidgetRenderer from "@/components/widgets/builder/SmartWidgetRenderer";
import { WidgetConfig } from "@/lib/types";
import { executeScript } from '@/ai/flows/execute-script-flow';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getPipelines } from '@/actions/pipelines';
import type { HtmlStyleOverrides } from '@/lib/html-style-utils';

import { useSession } from 'next-auth/react';
import { getLastNodeExecutionResultAction } from '@/app/actions/scheduler';
import { PipelineExecutionDialog } from '@/components/widgets/builder/PipelineExecutionDialog';

type PipelineOutputWidgetProps = {
    pipelineId: string;
    nodeId: string;
};

// Client-side cache for pipeline results to avoid re-fetching on every page navigation
const pipelineResultCache = new Map<string, { data: any; config: any; content: string; type: any; htmlOverrides?: any; timestamp: number }>();
const PIPELINE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// This is a simplified version of the runNode logic from PipelinesWidget
const runUpToNode = async (pipelines: any[], pipelineId: string, nodeId: string): Promise<any> => {
    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) throw new Error("Pipeline not found");

    const node = pipeline.nodes[nodeId];
    if (!node) throw new Error("Node not found");

    const nodeResults: Record<string, any> = {};

    const execute = async (currentNodeId: string): Promise<any> => {
        if (nodeResults[currentNodeId]) return nodeResults[currentNodeId];

        const currentNode = pipeline.nodes[currentNodeId];
        if (!currentNode) throw new Error(`Node ${currentNodeId} not found in pipeline`);

        if (currentNode.type === 'start') {
            return null;
        }

        let inputData: any[] | undefined = undefined;
        if (currentNode.inputId) {
            const [parentNodeId] = currentNode.inputId.split('-out-');
            if (pipeline.nodes[parentNodeId]) {
                inputData = await execute(parentNodeId);
            }
        }

        const response = await executeScript({ script: currentNode.script || '', data: inputData, node: currentNode });
        nodeResults[currentNodeId] = response;
        return response;
    };

    return execute(nodeId);
};


export default function PipelineOutputWidget({ pipelineId, nodeId }: PipelineOutputWidgetProps) {
    const { data: session, status } = useSession();
    const [reportData, setReportData] = useState<any>(null);
    const [reportContent, setReportContent] = useState<string>('');
    const [reportType, setReportType] = useState<'table' | 'kpi' | 'chart' | undefined>(undefined);
    const [widgetConfig, setWidgetConfig] = useState<WidgetConfig | undefined>(undefined);
    const [htmlStyleOverrides, setHtmlStyleOverrides] = useState<HtmlStyleOverrides | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showExecutionDialog, setShowExecutionDialog] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const { toast } = useToast();
    const hasFetchedRef = useRef(false);

    // skipCache: skip client cache and re-read from DB
    // runFallback: if DB has no results, run the pipeline as fallback
    const fetchData = useCallback(async (skipCache: boolean, runFallback: boolean) => {
        if (!session?.user) {
            setIsLoading(false);
            setIsRefreshing(false);
            return;
        }

        if (skipCache) setIsRefreshing(true);
        else setIsLoading(true);

        const cacheKey = `${pipelineId}-${nodeId}`;

        // Check client cache only on initial loads (not after refresh/execution)
        if (!skipCache) {
            const cached = pipelineResultCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < PIPELINE_CACHE_DURATION) {
                setReportData(cached.data);
                setReportContent(cached.content);
                setReportType(cached.type);
                setWidgetConfig(cached.config);
                setHtmlStyleOverrides(cached.htmlOverrides || undefined);
                setIsLoading(false);
                return;
            }
        }

        try {
            const loadedPipelines = await getPipelines();

            const pipelines = (loadedPipelines || []).map((p: any) => ({
                ...p,
                nodes: typeof p.nodes === 'string' ? JSON.parse(p.nodes) : p.nodes,
                edges: typeof p.edges === 'string' ? JSON.parse(p.edges) : p.edges
            }));

            const pipeline = pipelines.find((p: any) => p.id === pipelineId);
            const node = pipeline?.nodes[nodeId];

            if (pipeline && node) {
                setReportContent(node.content || '{{result}}');
                setReportType(node.previewType);
                setWidgetConfig(node.widgetConfig);
                // Load htmlStyleOverrides from pythonPreviewResult or directly from node
                const nodeHtmlOverrides = node.pythonPreviewResult?.htmlStyleOverrides || node.htmlStyleOverrides;
                setHtmlStyleOverrides(nodeHtmlOverrides || undefined);

                // Always try to get persisted result from DB
                let result: any = null;

                try {
                    const dbResult = await getLastNodeExecutionResultAction(pipelineId, nodeId);
                    if (dbResult.success && dbResult.data && dbResult.data.result) {
                        result = dbResult.data.result;
                    }
                } catch (e) {
                    console.warn('Failed to fetch persisted result:', e);
                }

                // Only run the full pipeline as fallback if explicitly requested
                if (!result && runFallback) {
                    result = await runUpToNode(pipelines, pipelineId, nodeId);
                }

                setReportData(result);

                // Update client cache with fresh data
                pipelineResultCache.set(cacheKey, {
                    data: result,
                    config: node.widgetConfig,
                    content: node.content || '{{result}}',
                    type: node.previewType,
                    htmlOverrides: nodeHtmlOverrides,
                    timestamp: Date.now(),
                });

                if (skipCache && result) {
                    toast({
                        title: "Dati aggiornati",
                        description: "I dati del widget sono stati aggiornati.",
                        duration: 3000
                    });
                }
            } else {
                setReportContent('<p class="text-muted-foreground italic">Pipeline non trovata o eliminata.</p>');
            }
        } catch (error: any) {
            console.error("Error running pipeline for widget:", error);
            setReportContent('<p class="text-destructive">Errore nel caricamento dei dati del widget.</p>');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [session, pipelineId, nodeId, toast]);

    useEffect(() => {
        if (status === 'loading' || hasFetchedRef.current) return;
        hasFetchedRef.current = true;
        fetchData(false, false); // Use cache, no fallback
    }, [status, fetchData]);

    const handleRefresh = () => {
        // Refresh button: skip cache, re-read from DB, run pipeline only if no DB result
        fetchData(true, true);
    };

    const handleUpdateHierarchyClick = () => {
        setShowExecutionDialog(true);
    };

    const handleExecutionSuccess = () => {
        // After execution dialog: invalidate cache, re-read fresh results from DB (no pipeline re-run)
        const cacheKey = `${pipelineId}-${nodeId}`;
        pipelineResultCache.delete(cacheKey);
        fetchData(true, false);
    };

    if (isLoading || status === 'loading') {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
            </div>
        );
    }

    // Normalize reportData for SmartWidgetRenderer: extract array from wrapper objects
    // SQL results come as { data: [...rows] }, Python as { data: [...], rechartsData: [...] }
    const normalizedData = Array.isArray(reportData)
        ? reportData
        : (reportData?.data && Array.isArray(reportData.data))
            ? reportData.data
            : (reportData?.rechartsData && Array.isArray(reportData.rechartsData))
                ? reportData.rechartsData
                : reportData;

    return (
        <div className="h-full w-full">
            {widgetConfig ? (
                <SmartWidgetRenderer
                    data={normalizedData}
                    config={widgetConfig}
                    onRefresh={handleRefresh}
                    isRefreshing={isRefreshing}
                    onUpdateHierarchy={handleUpdateHierarchyClick}
                />
            ) : (
                <TextWidget
                    content={reportContent}
                    onContentChange={() => { }} // Content is read-only in dashboard view
                    isEditing={false}
                    reportData={reportData}
                    reportType={reportType}
                    isLoadingData={isLoading}
                    onRefresh={handleRefresh}
                    onUpdateHierarchy={handleUpdateHierarchyClick}
                    htmlStyleOverrides={htmlStyleOverrides}
                />
            )}

            <PipelineExecutionDialog
                isOpen={showExecutionDialog}
                onClose={() => setShowExecutionDialog(false)}
                treeId={pipelineId}
                nodeId={nodeId}
                onSuccess={handleExecutionSuccess}
            />
        </div>
    );
}
