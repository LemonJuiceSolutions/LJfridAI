'use client';

import { useEffect, useState } from 'react';
import { getTreeAction } from '@/app/actions';
import { DataTable } from '@/components/ui/data-table';
import SmartWidgetRenderer from './SmartWidgetRenderer';
import { Loader2, Database, Code, AlertCircle } from 'lucide-react';

interface PreviewWidgetRendererProps {
    treeId: string;
    nodeId: string;
    previewType: 'sql' | 'python';
    resultName: string;
}

export function PreviewWidgetRenderer({ treeId, nodeId, previewType, resultName }: PreviewWidgetRendererProps) {
    const [previewData, setPreviewData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadPreview = async () => {
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
                        console.log('[PreviewWidgetRenderer] Node found:', { nodeId, previewType, hasSqlPreview: !!node.sqlPreviewData, hasPythonPreview: !!node.pythonPreviewResult });
                        if (previewType === 'sql' && node.sqlPreviewData) {
                            setPreviewData({
                                type: 'table',
                                data: node.sqlPreviewData,
                                timestamp: node.sqlPreviewTimestamp
                            });
                        } else if (previewType === 'python' && node.pythonPreviewResult) {
                            console.log('[PreviewWidgetRenderer] Python preview data:', node.pythonPreviewResult);
                            setPreviewData({
                                ...node.pythonPreviewResult,
                                timestamp: node.pythonPreviewResult?.timestamp
                            });
                        } else {
                            console.error('[PreviewWidgetRenderer] No preview data found:', { previewType, hasSqlPreview: !!node.sqlPreviewData, hasPythonPreview: !!node.pythonPreviewResult });
                            setError(`Nessuna anteprima ${previewType.toUpperCase()} trovata per questo nodo`);
                        }
                    } else {
                        console.error('[PreviewWidgetRenderer] Node not found:', { nodeId, previewType });
                        setError('Nodo non trovato');
                    }
                }
            } catch (err) {
                console.error('Error loading preview widget:', err);
                setError('Errore durante il caricamento dell\'anteprima');
            } finally {
                setLoading(false);
            }
        };

        loadPreview();
    }, [treeId, nodeId, previewType]);

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
        console.log('[PreviewWidgetRenderer] No preview data available');
        return (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <Database className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Nessun dato disponibile</p>
            </div>
        );
    }

    console.log('[PreviewWidgetRenderer] Rendering preview data:', { type: previewData.type, hasData: !!previewData.data, hasRechartsConfig: !!previewData.rechartsConfig, hasRechartsData: !!previewData.rechartsData, hasChartHtml: !!previewData.chartHtml, hasChartBase64: !!previewData.chartBase64 });

    // Render based on preview type
    if (previewData.type === 'table') {
        return (
            <div className="h-full flex flex-col">
                <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
                    <Database className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{resultName}</span>
                    {previewData.timestamp && (
                        <span className="text-xs text-muted-foreground ml-auto">
                            {new Date(previewData.timestamp).toLocaleString('it-IT', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </span>
                    )}
                </div>
                <div className="flex-1 overflow-auto">
                    <DataTable data={previewData.data} />
                </div>
            </div>
        );
    }

    if (previewData.type === 'chart') {
        return (
            <div className="h-full flex flex-col">
                <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
                    <Code className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{resultName}</span>
                    {previewData.timestamp && (
                        <span className="text-xs text-muted-foreground ml-auto">
                            {new Date(previewData.timestamp).toLocaleString('it-IT', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </span>
                    )}
                </div>
                <div className="flex-1 overflow-visible p-4" style={{ minHeight: '400px' }}>
                    {previewData.chartHtml ? (
                        <iframe
                            srcDoc={`<html><head><style>body { margin: 0; padding: 0; background: transparent; overflow: hidden; }</style></head><body>${previewData.chartHtml}</body></html>`}
                            className="w-full h-full border-none"
                            title="Interactive Chart"
                        />
                    ) : previewData.rechartsConfig && previewData.rechartsData ? (
                        <SmartWidgetRenderer
                            config={previewData.rechartsConfig}
                            data={previewData.rechartsData}
                            onRefresh={() => { }}
                            isRefreshing={false}
                        />
                    ) : previewData.chartBase64 ? (
                        <img
                            src={`data:image/png;base64,${previewData.chartBase64}`}
                            alt="Chart Preview"
                            className="w-full h-auto max-h-full object-contain"
                            style={{ minHeight: '300px' }}
                        />
                    ) : (
                        <div className="text-center text-muted-foreground">
                            Formato grafico non supportato
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (previewData.type === 'variable') {
        return (
            <div className="h-full flex flex-col">
                <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
                    <Code className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{resultName}</span>
                </div>
                <div className="flex-1 overflow-auto p-4">
                    <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto">
                        {JSON.stringify(previewData.variables, null, 2)}
                    </pre>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 text-center text-muted-foreground">
            Tipo di anteprima non supportato: {previewData.type}
        </div>
    );
}
