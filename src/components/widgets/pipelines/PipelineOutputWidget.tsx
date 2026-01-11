'use client';
import { useState, useEffect } from 'react';
import TextWidget from "@/components/dashboard/text-widget";
import { executeScript } from '@/ai/flows/execute-script-flow';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getPipelines } from '@/actions/pipelines';
import { useSession } from 'next-auth/react';

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
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        if (status === 'loading') return;

        const fetchData = async () => {
            if (!session?.user) return;
            setIsLoading(true);

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
                    const result = await runUpToNode(pipelines, pipelineId, nodeId);
                    setReportData(result);
                } else {
                    // Silent failure or empty state if widget refers to deleted pipeline
                    // throw new Error("Pipeline or node not found.");
                    setReportContent('<p class="text-muted-foreground italic">Pipeline non trovata o eliminata.</p>');
                }
            } catch (error: any) {
                console.error("Error running pipeline for widget:", error);
                setReportContent('<p class="text-destructive">Errore nel caricamento dei dati del widget.</p>');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [status, session, pipelineId, nodeId, toast]);

    if (isLoading || status === 'loading') {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
            </div>
        );
    }

    return (
        <TextWidget
            content={reportContent}
            onContentChange={() => { }} // Content is read-only in dashboard view
            isEditing={false}
            reportData={reportData}
            reportType={reportType}
            isLoadingData={isLoading}
        />
    );
}

