'use client';

import { useEffect, useState } from 'react';
import { getTreeAction } from '@/app/actions';
import { DataTable } from '@/components/ui/data-table';
import SmartWidgetRenderer from './SmartWidgetRenderer';
import { Loader2, Database, Code, AlertCircle, RefreshCw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { PipelineExecutionDialog } from '@/components/widgets/builder/PipelineExecutionDialog';

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
    const { toast } = useToast();

    const loadPreview = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        else setIsRefreshing(true);
        try {
            const result = await getTreeAction(treeId);
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
                if (node) {
                    if (previewType === 'sql' && node.sqlPreviewData) {
                        setPreviewData({
                            type: 'table',
                            data: node.sqlPreviewData,
                            timestamp: node.sqlPreviewTimestamp
                        });
                    } else if (previewType === 'python' && node.pythonPreviewResult) {
                        setPreviewData({
                            ...node.pythonPreviewResult,
                            timestamp: node.pythonPreviewResult?.timestamp
                        });
                    } else {
                        setError(`Nessuna anteprima ${previewType.toUpperCase()} trovata per questo nodo`);
                    }
                } else {
                    setError('Nodo non trovato');
                }
            }
        } catch (err) {
            console.error('Error loading preview widget:', err);
            setError('Errore durante il caricamento dell\'anteprima');
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        loadPreview();
    }, [treeId, nodeId, previewType]);

    const handleRefresh = () => {
        loadPreview(false);
    };

    const handleUpdateHierarchyClick = () => {
        setShowExecutionDialog(true);
    };

    const handleExecutionSuccess = () => {
        loadPreview(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                <p className="text-sm text-destructive">{error}</p>
            </div>
        );
    }

    if (!previewData) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <Database className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Nessun dato disponibile</p>
            </div>
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
                    <div className="h-full p-4">
                        {previewData.chartHtml ? (
                            <iframe
                                srcDoc={`<html><head><style>body { margin: 0; padding: 0; background: transparent; overflow: auto; }</style></head><body>${previewData.chartHtml}</body></html>`}
                                className="w-full border-none h-full"
                                title="Interactive Chart"
                            />
                        ) : previewData.rechartsConfig && previewData.rechartsData ? (
                            <SmartWidgetRenderer
                                config={previewData.rechartsConfig}
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
                            srcDoc={`<html><head><style>body { margin: 0; padding: 10px; font-family: sans-serif; overflow: auto; }</style></head><body>${previewData.html}</body></html>`}
                            className="w-full h-full border-none min-h-[300px]"
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

            <PipelineExecutionDialog
                isOpen={showExecutionDialog}
                onClose={() => setShowExecutionDialog(false)}
                treeId={treeId}
                nodeId={nodeId}
                onSuccess={handleExecutionSuccess}
            />
        </div>
    );
}
