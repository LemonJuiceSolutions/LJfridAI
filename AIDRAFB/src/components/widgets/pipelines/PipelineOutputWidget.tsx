'use client';
import { useState, useEffect } from 'react';
import TextWidget from "@/components/dashboard/text-widget";
import { useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { executeScript } from '@/ai/flows/execute-script-flow';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
    const [reportData, setReportData] = useState<any>(null);
    const [reportContent, setReportContent] = useState<string>('');
    const [reportType, setReportType] = useState<'table' | 'kpi' | 'chart' | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const userSettingsRef = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return doc(firestore, 'tenants', user.uid, 'userSettings', user.uid);
    }, [user, firestore]);

    useEffect(() => {
        const fetchData = async () => {
            if (!userSettingsRef || isUserLoading) return;
            setIsLoading(true);

            try {
                const docSnap = await getDoc(userSettingsRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const pipelines = data.pipelines || [];
                    const pipeline = pipelines.find((p: any) => p.id === pipelineId);
                    const node = pipeline?.nodes[nodeId];

                    if (pipeline && node) {
                        setReportContent(node.content || '{{result}}');
                        setReportType(node.previewType);
                        const result = await runUpToNode(pipelines, pipelineId, nodeId);
                        setReportData(result);
                    } else {
                         throw new Error("Pipeline or node not found in user settings.");
                    }
                }
            } catch (error: any) {
                console.error("Error running pipeline for widget:", error);
                toast({
                    variant: "destructive",
                    title: "Errore Widget Pipeline",
                    description: error.message || "Impossibile caricare i dati per questo widget.",
                });
                setReportContent('<p class="text-destructive">Errore nel caricamento dei dati del widget.</p>');
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [userSettingsRef, isUserLoading, pipelineId, nodeId, toast]);
    
    if (isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
            </div>
        );
    }
    
    return (
        <TextWidget
            content={reportContent}
            onContentChange={() => {}} // Content is read-only in dashboard view
            isEditing={false}
            reportData={reportData}
            reportType={reportType}
            isLoadingData={isLoading}
        />
    );
}
