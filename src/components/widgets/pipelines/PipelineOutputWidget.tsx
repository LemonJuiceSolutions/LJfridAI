'use client';
import { useState, useEffect } from 'react';
import TextWidget from "@/components/dashboard/text-widget";
import SmartWidgetRenderer from "@/components/widgets/builder/SmartWidgetRenderer";
import { WidgetConfig } from "@/lib/types";
import { executeScript } from '@/ai/flows/execute-script-flow';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getPipelines } from '@/actions/pipelines';

import { useSession } from 'next-auth/react';
import { getLastNodeExecutionResultAction } from '@/app/actions/scheduler';
import { PipelineExecutionDialog } from '@/components/widgets/builder/PipelineExecutionDialog';

type PipelineOutputWidgetProps = {
    pipelineId: string;
    nodeId: string;
};

// This is a simplified version of the runNode logic from PipelinesWidget
// In a real app, this logic would be centralized in a service or context.
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

        // The start node has no script and no input, it just triggers the flow.
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
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showExecutionDialog, setShowExecutionDialog] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const { toast } = useToast();

    useEffect(() => {
        if (status === 'loading') return;

        const fetchData = async () => {
            // Only show global loading on first load
            if (refreshTrigger === 0) setIsLoading(true);
            else setIsRefreshing(true);

            if (!session?.user) {
                setIsLoading(false);
                setIsRefreshing(false);
                return;
            }

            try {
                const loadedPipelines = await getPipelines();

                // Parse pipelines JSON
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

                    // Try to get persisted result from DB first
                    let result: any = null;
                    let fromDb = false;

                    try {
                        const dbResult = await getLastNodeExecutionResultAction(pipelineId, nodeId);
                        if (dbResult.success && dbResult.data && dbResult.data.result) {
                            result = dbResult.data.result;
                            fromDb = true;
                        }
                    } catch (e) {
                        console.warn('Failed to fetch persisted result:', e);
                    }

                    // Fallback to runtime calculation if no DB result
                    if (!result && !fromDb) {
                        result = await runUpToNode(pipelines, pipelineId, nodeId);
                    }

                    setReportData(result);

                    if (refreshTrigger > 0) {
                        toast({
                            title: "Dati aggiornati",
                            description: "I dati del widget sono stati ricalcolati.",
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
        };

        fetchData();
    }, [status, session, pipelineId, nodeId, toast, refreshTrigger]);

    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    const handleUpdateHierarchyClick = () => {
        setShowExecutionDialog(true);
    };

    const handleExecutionSuccess = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    if (isLoading || status === 'loading') {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
            </div>
        );
    }

    return (
        <div className="h-full w-full">
            {widgetConfig ? (
                <SmartWidgetRenderer
                    data={reportData}
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

