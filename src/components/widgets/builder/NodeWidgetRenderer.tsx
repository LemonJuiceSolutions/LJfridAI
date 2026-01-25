'use client';

import { useEffect, useState } from 'react';
import { getTreeAction } from '@/app/actions';
import SmartWidgetRenderer from './SmartWidgetRenderer';
import { WidgetConfig } from '@/lib/types';

interface NodeWidgetRendererProps {
    treeId: string;
    nodeId: string;
}

export function NodeWidgetRenderer({ treeId, nodeId }: NodeWidgetRendererProps) {
    const [config, setConfig] = useState<WidgetConfig | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadWidget = async () => {
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
                    if (node?.widgetConfig) {
                        setConfig(node.widgetConfig);
                    }
                }
            } catch (error) {
                console.error('Error loading node widget:', error);
            } finally {
                setLoading(false);
            }
        };

        loadWidget();
    }, [treeId, nodeId]);

    if (loading) {
        return <div className="p-4">Caricamento widget...</div>;
    }

    if (!config) {
        return <div className="p-4 text-destructive">Widget non trovato</div>;
    }

    return <SmartWidgetRenderer config={config} data={config.data || []} />;
}
