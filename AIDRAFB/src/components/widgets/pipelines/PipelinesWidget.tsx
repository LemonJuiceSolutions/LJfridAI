'use client';

import React, { useState, useLayoutEffect, useRef, useEffect, MouseEvent, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
  } from '@/components/ui/collapsible';
import { PlusCircle, Play, ChevronRight, Sigma, GitMerge, GitBranch, BarChart2, Trash2, Database, GitCommitHorizontal, MoreVertical, Save, X, Loader2, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu";
import { NodeDetailSheet } from '@/components/pipelines/node-detail-sheet';
import { Code, Table2 } from 'lucide-react';
import { AddPipelineDialog } from '@/components/pipelines/add-pipeline-dialog';
import { EndNodeEditorDialog } from '@/components/pipelines/end-node-editor-dialog';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import type { Connection } from '@/components/widgets/setup/SetupWidget';
import { executeScript } from '@/ai/flows/execute-script-flow';
import { mockPipelines } from '@/lib/data';

function removeUndefinedFields(obj: any): any {
    if (obj === null || obj === undefined) {
      return null;
    }
  
    if (Array.isArray(obj)) {
      return obj.map(removeUndefinedFields);
    }
  
    if (typeof obj === 'object') {
      const newObj: { [key: string]: any } = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          if (value !== undefined) {
            newObj[key] = removeUndefinedFields(value);
          }
        }
      }
      return newObj;
    }
  
    return obj;
}

// A simple immer-like produce function for immutable updates
function produce<T>(baseState: T, producer: (draft: T) => void | T): T {
    const draft = JSON.parse(JSON.stringify(baseState));
    const result = producer(draft);
    return result === undefined ? draft : result;
}


const iconMap: { [key: string]: React.ElementType } = {
    Database,
    Code,
    Table2,
    Sigma,
    GitMerge,
    GitBranch,
    BarChart2,
    GitCommitHorizontal,
    Play,
    Share2,
};

const NodeCard = ({ node, onDeleteNode, onAddChildNode, onNodeClick, registerNodeRef, onPortClick, isLinkingFrom }: { node: any, onDeleteNode: () => void, onAddChildNode: (portIndex: number) => void, onNodeClick: () => void, registerNodeRef: (nodeId: string, el: HTMLDivElement | null) => void, onPortClick: (e: MouseEvent, nodeId: string, type: 'in' | 'out', index: number) => void, isLinkingFrom: boolean }) => {
    const IconComponent = iconMap[node.icon] || (node.isPublished ? Share2 : GitBranch);
    const iconColor = node.iconColor || 'primary';

    const hasOutputs = node.outputs && node.outputs.length > 0;

    return (
        <div ref={(el) => registerNodeRef(node.id, el)} className="relative w-56 bg-card rounded-lg shadow-md border border-border cursor-pointer hover:shadow-lg transition-shadow pointer-events-auto" onClick={onNodeClick}>
            <div className="flex items-center p-2 border-b border-border">
                {IconComponent && 
                    <div className={cn('h-6 w-6 rounded-md flex items-center justify-center mr-2', `bg-${iconColor}/10`)}>
                        <IconComponent className={cn('h-4 w-4', `text-${iconColor}`)} />
                    </div>
                }
                <span className="font-semibold text-[11px] flex-1 truncate">{node.name}</span>
                 {node.type !== 'start' && node.type !== 'end' && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={(e) => e.stopPropagation()}>
                                <MoreVertical className="h-3 w-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            {hasOutputs && node.outputs.map((output: any, index: number) => (
                                <DropdownMenuItem key={index} onClick={() => onAddChildNode(index)} className="text-xs">
                                    <PlusCircle className="mr-2 h-3 w-3" />
                                    <span className='text-[10px]'>Aggiungi Nodo Figlio</span>
                                </DropdownMenuItem>
                            ))}
                            {!hasOutputs && 
                                <DropdownMenuItem onClick={() => onAddChildNode(0)} className="text-xs">
                                    <PlusCircle className="mr-2 h-3 w-3" />
                                    <span className='text-[10px]'>Aggiungi Nodo Figlio</span>
                                </DropdownMenuItem>
                            }
                            <DropdownMenuItem onClick={onDeleteNode} className='text-destructive focus:text-destructive focus:bg-destructive/10 text-xs'>
                                <Trash2 className="mr-2 h-3 w-3" />
                                <span className='text-[10px]'>Elimina</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                 )}
            </div>
            <div className="p-1.5 text-[10px] space-y-1">
                 {hasOutputs ? node.outputs?.map((output: any, index: number) => (
                    <div key={index} className="flex justify-between items-center bg-muted/50 rounded-md p-1.5 relative h-8">
                        <span className='truncate text-muted-foreground text-[9px]'>{output.name}</span>
                        {/* Output Port */}
                        <div 
                            onClick={(e) => onPortClick(e, node.id, 'out', index)}
                            className={cn("absolute -right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-background border-2  rounded-full z-10", isLinkingFrom ? "border-green-500" : "border-primary" )}
                            data-port="out"
                            data-node-id={node.id}
                            data-port-index={index}
                        />
                    </div>
                )) : (
                     <div className="flex justify-between items-center rounded-md p-1.5 relative h-8">
                        <span className='truncate text-muted-foreground text-[9px] italic'>Nodo Finale</span>
                     </div>
                )}
            </div>
             {/* Input Port */}
             {node.type !== 'start' && (
                <div 
                    onClick={(e) => onPortClick(e, node.id, 'in', 0)}
                    className="absolute -left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-background border-2 border-primary rounded-full z-10"
                    data-port="in"
                    data-node-id={node.id}
                    data-port-index={0}
                />
            )}
        </div>
    );
};

const SvgPath = ({ d, isSelected, onSelect, onDelete }: { d: string, isSelected: boolean, onSelect: () => void, onDelete: () => void }) => {
    if (!d) return null;
    
    const pathRef = useRef<SVGPathElement>(null);
    const [center, setCenter] = useState<{ x: number, y: number } | null>(null);

    useEffect(() => {
        if (pathRef.current) {
            const pathLength = pathRef.current.getTotalLength();
            const point = pathRef.current.getPointAtLength(pathLength / 2);
            setCenter({ x: point.x, y: point.y });
        }
    }, [d]);

    return (
      <g onClick={onSelect}>
        {/* Invisible wider path for easier clicking */}
        <path 
            d={d} 
            fill="none" 
            stroke="transparent" 
            strokeWidth="20" 
            className="cursor-pointer"
        />
        <path
          ref={pathRef}
          d={d}
          fill="none"
          stroke={isSelected ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'}
          strokeWidth={isSelected ? 2 : 1.5}
          strokeDasharray={isSelected ? "none" : "3 3"}
          className={cn("pointer-events-none transition-all", isSelected && "stroke-destructive")}
        />
        {isSelected && center && (
            <foreignObject x={center.x - 10} y={center.y - 10} width="20" height="20" className='pointer-events-auto'>
                <div 
                    className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center cursor-pointer"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                >
                    <Trash2 className='h-2.5 w-2.5' />
                </div>
            </foreignObject>
        )}
      </g>
    );
  };

type LinkingState = {
    fromNode: string;
    fromPort: number;
    startX: number;
    startY: number;
} | null;

const usePipelineLayout = (pipelines: any[], openPipelineIds: string[]) => {
    const [layouts, setLayouts] = useState<Record<string, any>>({});
    const [edgePaths, setEdgePaths] = useState<Record<string, {path: string, from: string, to: string, fromPort: number}[]>>({});
    const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [svgSizes, setSvgSizes] = useState<Record<string, {width: number, height: number}>>({});

    const calculateLayout = (pipeline: any) => {
        if (!pipeline?.nodes) return [];
        const nodes = Object.values(pipeline.nodes);
        const edges = pipeline.edges;
        const adj: Record<string, string[]> = {};
        const inDegree: Record<string, number> = {};
        const levels: Record<string, number> = {};
    
        nodes.forEach((node: any) => {
            adj[node.id] = [];
            inDegree[node.id] = 0;
            levels[node.id] = -1;
        });
    
        edges.forEach((edge: any) => {
            if (adj[edge.from] && pipeline.nodes[edge.to]) {
                adj[edge.from].push(edge.to);
                inDegree[edge.to]++;
            }
        });
    
        const queue: string[] = [];
        nodes.forEach((node: any) => {
            if (inDegree[node.id] === 0) {
                queue.push(node.id);
                levels[node.id] = 0;
            }
        });
    
        let maxLevel = 0;
        let head = 0;
        while (head < queue.length) {
            const u = queue[head++];
            (adj[u] || []).forEach((v) => {
                inDegree[v]--;
                if (inDegree[v] === 0) {
                    levels[v] = (levels[u] || 0) + 1;
                    maxLevel = Math.max(maxLevel, levels[v]);
                    queue.push(v);
                }
            });
        }
    
        nodes.forEach((node: any) => {
          if (levels[node.id] === -1) {
            levels[node.id] = maxLevel > 0 ? maxLevel + 1 : 0; 
            maxLevel++;
          }
        });
        
        const layout: { id: string, level: number, rank: number }[][] = Array.from({length: maxLevel + 1}, () => []);
        
        Object.entries(levels).forEach(([nodeId, level]) => {
          if (level >= 0 && level < layout.length) {
            layout[level].push({ id: nodeId, level, rank: layout[level].length });
          }
        });
        
        return layout.map(column => column.map(node => ({ ...node, node: pipeline.nodes[node.id] })));
    };

    const updatePaths = useCallback(() => {
        const newEdgePaths: Record<string, {path: string, from: string, to: string, fromPort: number}[]> = {};
        
        openPipelineIds.forEach(pipelineId => {
            const pipeline = pipelines.find(p => p.id === pipelineId);
            if (!pipeline) return;

            const container = containerRefs.current[pipelineId];
            if (!container) return;

            const containerRect = container.getBoundingClientRect();
            newEdgePaths[pipelineId] = [];

            pipeline.edges.forEach((edge: any) => {
                const fromPortEl = container.querySelector(`[data-port="out"][data-node-id="${edge.from}"][data-port-index="${edge.fromPort || 0}"]`);
                const toPortEl = container.querySelector(`[data-port="in"][data-node-id="${edge.to}"][data-port-index="0"]`);
                
                if (!fromPortEl || !toPortEl) return;

                const fromRect = fromPortEl.getBoundingClientRect();
                const toRect = toPortEl.getBoundingClientRect();
                
                const fromX = fromRect.left + fromRect.width / 2 - containerRect.left + container.scrollLeft;
                const fromY = fromRect.top + fromRect.height / 2 - containerRect.top + container.scrollTop;
        
                const toX = toRect.left + toRect.width / 2 - containerRect.left + container.scrollLeft;
                const toY = toRect.top + toRect.height / 2 - containerRect.top + container.scrollTop;
                
                const c1X = fromX + 80;
                const c2X = toX - 80;
        
                const d = `M ${fromX} ${fromY} C ${c1X} ${fromY}, ${c2X} ${toY}, ${toX} ${toY}`;
                newEdgePaths[pipelineId].push({path: d, ...edge});
            });
        });
        
        setEdgePaths(newEdgePaths);
    }, [openPipelineIds, pipelines]);

    useEffect(() => {
        const newLayouts: Record<string, any> = {};
        if (Array.isArray(pipelines)) {
            pipelines.forEach(p => {
                newLayouts[p.id] = calculateLayout(p);
            });
        }
        setLayouts(newLayouts);
    }, [pipelines]);
    
    useLayoutEffect(() => {
        const timeoutId = setTimeout(updatePaths, 50);
        return () => clearTimeout(timeoutId);
    }, [layouts, openPipelineIds, updatePaths]);

    useLayoutEffect(() => {
        const observers: ResizeObserver[] = [];
        const scrollListeners: (() => void)[] = [];

        openPipelineIds.forEach(id => {
            const container = containerRefs.current[id];
            if (container) {
                const observer = new ResizeObserver(() => {
                    updatePaths();
                    setSvgSizes(prev => ({
                        ...prev,
                        [id]: {
                            width: container.scrollWidth,
                            height: container.scrollHeight,
                        }
                    }));
                });
                observer.observe(container);
                // Also observe the content wrapper for size changes
                const contentWrapper = container.querySelector('div');
                if (contentWrapper) {
                    observer.observe(contentWrapper);
                }

                observers.push(observer);

                const handleScroll = () => updatePaths();
                container.addEventListener('scroll', handleScroll);
                scrollListeners.push(() => container.removeEventListener('scroll', handleScroll));
            }
        });
        return () => {
            observers.forEach(o => o.disconnect());
            scrollListeners.forEach(remove => remove());
        }
    }, [openPipelineIds, updatePaths]);

    const registerNodeRef = (nodeId: string, el: HTMLDivElement | null) => {
        nodeRefs.current[nodeId] = el;
    };
    
    const registerContainerRef = (pipelineId: string, el: HTMLDivElement | null) => {
        containerRefs.current[pipelineId] = el;
    };

    return { layouts, edgePaths, registerNodeRef, registerContainerRef, updatePaths, svgSizes };
};


export default function PipelinesWidget() {
    const { toast } = useToast();
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const [pipelines, setPipelines] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [connections, setConnections] = useState<Connection[]>([]);
    const [nodeResults, setNodeResults] = useState<Record<string, any>>({});
    const [isEndNodeEditorOpen, setIsEndNodeEditorOpen] = useState(false);
    const [runningEndNode, setRunningEndNode] = useState<any>(null);
    const [endNodeResult, setEndNodeResult] = useState<any>(null);
    
    const userSettingsRef = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return doc(firestore, 'tenants', user.uid, 'userSettings', user.uid);
    }, [user, firestore]);
    
    const savePipelinesState = useCallback((updatedPipelines: any[]) => {
        if (userSettingsRef) {
            const dataToSave = { pipelines: removeUndefinedFields(updatedPipelines) };
            setDocumentNonBlocking(userSettingsRef, dataToSave, { merge: true });
        }
    }, [userSettingsRef]);

    const updateAndSavePipelines = useCallback((updater: (draft: any[]) => void | any[]) => {
        const newPipelines = produce(pipelines, updater);
        setPipelines(newPipelines);
        savePipelinesState(newPipelines);
    }, [pipelines, savePipelinesState]);


    useEffect(() => {
        if (isUserLoading) return;
        if (!userSettingsRef) {
            setIsLoading(false);
            setPipelines(mockPipelines);
            return;
        }

        const loadState = async () => {
            setIsLoading(true);
            try {
                const docSnap = await getDoc(userSettingsRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const loadedPipelines = data.pipelines;
                    
                    if (Array.isArray(loadedPipelines) && loadedPipelines.length > 0) {
                        setPipelines(loadedPipelines);
                    } else {
                       setPipelines(mockPipelines); 
                    }
                    setConnections(data.connections || []);
                } else {
                     setPipelines(mockPipelines); 
                }
            } catch (error) {
                console.error("Error loading widget state from Firestore:", error);
                setPipelines(mockPipelines);
            } finally {
                setIsLoading(false);
            }
        };
    
        loadState();
    }, [userSettingsRef, isUserLoading]);


    const [openPipelineIds, setOpenPipelineIds] = useState<string[]>([]);
    
    const [selectedNode, setSelectedNode] = useState<any>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    
    const [linkingState, setLinkingState] = useState<LinkingState>(null);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const svgContainerRef = useRef<HTMLDivElement | null>(null);

    const { layouts, edgePaths, registerNodeRef, registerContainerRef, updatePaths, svgSizes } = usePipelineLayout(pipelines, openPipelineIds);
    const [selectedEdge, setSelectedEdge] = useState<{pipelineId: string, edge: any} | null>(null);

    const [isAddPipelineDialogOpen, setIsAddPipelineDialogOpen] = useState(false);
      
    const runNode = async (pipelineId: string, nodeId: string): Promise<any> => {
        const pipeline = pipelines.find(p => p.id === pipelineId);
        if (!pipeline) throw new Error("Pipeline not found");
      
        const node = pipeline.nodes[nodeId];
        if (!node) throw new Error("Node not found");
      
        if (nodeResults[nodeId] && node.type !== 'start') {
          return nodeResults[nodeId];
        }

        if (node.type === 'end') {
            const parentEdge = pipeline.edges.find((e: any) => e.to === nodeId);
            if (parentEdge) {
                return runNode(pipelineId, parentEdge.from);
            }
            return null;
        }
      
        let inputData: any[] | undefined = undefined;
      
        if (node.inputId) {
            const [parentNodeId] = node.inputId.split('-out-');
            const parentNode = pipeline.nodes[parentNodeId];
            if(parentNode) {
                const parentResult = await runNode(pipelineId, parentNodeId);
                inputData = parentResult;
            }
        }
        
        const response = await executeScript({ script: node.script || '', data: inputData, node: node });

        if (response) {
            setNodeResults(prev => ({ ...prev, [nodeId]: response }));
            return response;
        }

        return null;
    };

    
    useEffect(() => {
        const handleMouseMove = (e: globalThis.MouseEvent) => {
            if (linkingState && svgContainerRef.current) {
                const rect = svgContainerRef.current.getBoundingClientRect();
                setMousePosition({ 
                    x: e.clientX - rect.left + svgContainerRef.current.scrollLeft, 
                    y: e.clientY - rect.top + svgContainerRef.current.scrollTop
                });
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setLinkingState(null);
                setSelectedEdge(null);
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [linkingState]);

    const handleRunPipeline = (pipelineName: string) => {
        toast({
            title: `Esecuzione Pipeline "${pipelineName}"`,
            description: "La pipeline è stata avviata in background.",
        });
    };

    const handleDeleteEdge = (pipelineId: string, edgeToDelete: any) => {
        updateAndSavePipelines(draft => {
            const pipeline = draft.find((p: any) => p.id === pipelineId);
            if (!pipeline) return;
    
            pipeline.edges = pipeline.edges.filter((e: any) => 
                !(e.from === edgeToDelete.from && e.to === edgeToDelete.to && e.fromPort === edgeToDelete.fromPort)
            );
            
            const toNode = pipeline.nodes[edgeToDelete.to];
            if (toNode) {
                if (Array.isArray(toNode.parentNodes)) {
                    toNode.parentNodes = toNode.parentNodes.filter((p: any) => p.id !== edgeToDelete.from);
                }
                if (toNode.inputId === `${edgeToDelete.from}-out-${edgeToDelete.fromPort}`) {
                    toNode.inputId = undefined;
                }
            }
        });
        setSelectedEdge(null);
    };

    const getActivePipelineId = (nodeId: string, currentPipelines: any[]): string | null => {
        if (!Array.isArray(currentPipelines)) return null;
        for (const pipeline of currentPipelines) {
          if (pipeline.nodes && Object.keys(pipeline.nodes).includes(nodeId)) {
            return pipeline.id;
          }
        }
        return null;
    };
      
    const handleAddEdge = (fromNodeId: string, fromPort: number, toNodeId: string) => {
        updateAndSavePipelines(draft => {
            const pipelineId = getActivePipelineId(fromNodeId, draft);
            if (!pipelineId) return;

            const pipeline = draft.find((p: any) => p.id === pipelineId);
            if (!pipeline) return;
            
            if (fromNodeId === toNodeId) return;

            const fromNode = pipeline.nodes[fromNodeId];
            const toNode = pipeline.nodes[toNodeId];
            if (!fromNode || !toNode) return;

            // Remove existing incoming edges to the target node
            pipeline.edges = pipeline.edges.filter((e: any) => e.to !== toNodeId);
            
            // Add the new edge
            pipeline.edges.push({ from: fromNodeId, to: toNodeId, fromPort });
            
            // Update parentNodes reference on the target node
            pipeline.nodes[toNodeId].parentNodes = [{
                id: fromNodeId,
                name: fromNode.name,
                outputs: fromNode.outputs || [{ name: 'Trigger', type: 'trigger' }]
            }];
            pipeline.nodes[toNodeId].inputId = `${fromNodeId}-out-${fromPort}`;
        });
    };
    
    const handleAddNode = (pipelineId: string, parentNodeId: string, portIndex: number) => {
        updateAndSavePipelines(draft => {
            const pipeline = draft.find((p: any) => p.id === pipelineId);
            if (!pipeline) return;
    
            const parentNode = pipeline.nodes[parentNodeId];
            if (!parentNode) return;
    
            const newNodeId = `node_${Date.now()}`;
            const newNode = {
                id: newNodeId,
                name: 'Nuovo Nodo Figlio',
                icon: 'GitBranch',
                iconColor: 'orange-500',
                outputs: [{ name: 'Output', type: 'table' }],
                script: `SELECT * FROM ?; -- Use '?' to refer to the input data`, 
                previewType: "table",
                isPublished: false,
                parentNodes: [{
                    id: parentNodeId,
                    name: parentNode.name,
                    outputs: parentNode.outputs || [{ name: 'Trigger', type: 'trigger' }]
                }],
                inputId: `${parentNodeId}-out-${portIndex}`
            };
    
            pipeline.nodes[newNodeId] = newNode;
            pipeline.edges.push({ from: parentNodeId, to: newNodeId, fromPort: portIndex });
        });
    };

    const handleDeleteNode = (pipelineId: string, nodeId: string) => {
        updateAndSavePipelines(draft => {
            const pipeline = draft.find((p: any) => p.id === pipelineId);
            if (!pipeline || !pipeline.nodes[nodeId]) return;
        
            if (['start', 'end'].includes(pipeline.nodes[nodeId].type)) {
                toast({ variant: 'destructive', title: 'Azione non permessa', description: 'Non puoi eliminare i nodi di Inizio o Fine.' });
                return;
            }
        
            delete pipeline.nodes[nodeId];
        
            pipeline.edges = pipeline.edges.filter((e: any) => e.from !== nodeId && e.to !== nodeId);
        
            Object.values(pipeline.nodes).forEach((node: any) => {
                if (node.parentNodes) {
                    node.parentNodes = node.parentNodes.filter((parent: any) => parent.id !== nodeId);
                }
                if (node.inputId?.startsWith(`${nodeId}-`)) {
                    node.inputId = undefined;
                }
            });
        });
        toast({ title: "Nodo eliminato!", description: "Il nodo è stato rimosso dalla pipeline." });
    };


    const handleNodeClick = async (node: any, pipeline: any) => {
        if (node.type === 'end') {
            setRunningEndNode({...node, pipelineId: pipeline.id});
            setIsEndNodeEditorOpen(true);
            setEndNodeResult(null);
            try {
                const result = await runNode(pipeline.id, node.id);
                setEndNodeResult(result);
            } catch (e) {
                console.error("Failed to run end node:", e);
                toast({
                    title: "Errore Esecuzione Pipeline",
                    description: "Impossibile calcolare il risultato per questo nodo finale.",
                    variant: "destructive"
                });
            }
        } else {
            const parentNodes = pipeline.edges
                .filter((e: any) => e.to === node.id)
                .map((e: any) => {
                    const parentNode = pipeline.nodes[e.from];
                    if(!parentNode) return null;
                    return {
                        id: parentNode.id,
                        name: parentNode.name,
                        outputs: (parentNode.outputs || [{name: 'Trigger'}]).map((out: any, index: number) => ({
                            ...out,
                            id: `${parentNode.id}-out-${index}`
                        }))
                    };
                }).filter(Boolean);
            
            setSelectedNode({ ...node, parentNodes: parentNodes, pipelineId: pipeline.id });
            setIsSheetOpen(true);
        }
    };

    const handleNodeSave = (updatedNodeWithContext: any) => {
        const { pipelineId, ...updatedNode } = updatedNodeWithContext;
      
        updateAndSavePipelines(draft => {
            const pipeline = draft.find((p: any) => p.id === pipelineId);
            if (pipeline && pipeline.nodes && pipeline.nodes[updatedNode.id]) {
                pipeline.nodes[updatedNode.id] = { 
                    ...pipeline.nodes[updatedNode.id], 
                    ...updatedNode
                };
            }
        });
      
        if (isSheetOpen) setIsSheetOpen(false);
        if (isEndNodeEditorOpen) setIsEndNodeEditorOpen(false);
        toast({ title: "Nodo salvato!" });
    };
      
    const handlePortClick = (e: MouseEvent, nodeId: string, portType: 'in' | 'out', portIndex: number) => {
        e.stopPropagation();
        const nodeEl = e.currentTarget as HTMLDivElement;
        const pipelineContentEl = nodeEl.closest('[data-pipeline-content]') as HTMLDivElement;
        if (!nodeEl || !pipelineContentEl) return;
        
        const containerRect = pipelineContentEl.getBoundingClientRect();
        const nodeRect = nodeEl.getBoundingClientRect();

        const startX = (portType === 'out' ? nodeRect.right : nodeRect.left) - containerRect.left + pipelineContentEl.scrollLeft;
        const startY = nodeRect.top + nodeRect.height / 2 - containerRect.top + pipelineContentEl.scrollTop;

        if (portType === 'out') {
            setLinkingState({
                fromNode: nodeId,
                fromPort: portIndex,
                startX,
                startY,
            });
        } else if (portType === 'in' && linkingState) {
            if(linkingState.fromNode !== nodeId){
                handleAddEdge(linkingState.fromNode, linkingState.fromPort, nodeId);
            }
            setLinkingState(null);
        }
    };

    const handleCanvasClick = (e: MouseEvent) => {
        if (linkingState) {
            setLinkingState(null);
        }
        if (selectedEdge) {
            setSelectedEdge(null);
        }
    };
    
    const handleAddPipeline = (name: string, description: string) => {
        updateAndSavePipelines(draft => {
            const newPipelineId = `pipe_${Date.now()}`;
            const startNodeId = `start_${Date.now()}`;
            const endNodeId = `end_${Date.now()}`;
            
            const newPipeline = {
                id: newPipelineId,
                name,
                description,
                nodes: {
                    [startNodeId]: { id: startNodeId, name: 'Start', icon: 'Play', type: 'start', schedule: { frequency: 'daily', time: '09:00' }, outputs: [{ name: 'Trigger', type: 'trigger' }] },
                    [endNodeId]: { id: endNodeId, name: 'Risultato Finale', icon: 'Table2', iconColor: 'purple-500', type: 'end', previewType: 'table', outputs: [], isPublished: false, content: '<h1>Nuovo Report</h1><p>I risultati della tua pipeline appariranno qui.</p>{{result}}' }
                },
                edges: []
            };
            draft.push(newPipeline);
            // This is a side-effect, but it's okay for UX to auto-open the new pipeline.
            setTimeout(() => setOpenPipelineIds(prev => [...prev, newPipelineId]), 0);
        });
    };

    const linkingPathD = linkingState
    ? `M ${linkingState.startX} ${linkingState.startY} L ${mousePosition.x} ${mousePosition.y}`
    : "";

    if (isLoading || isUserLoading) {
        return (
            <Card className="h-full flex flex-col">
                <CardHeader>
                    <CardTitle className="text-sm">Pipeline ETL</CardTitle>
                    <CardDescription className="text-xs">
                        Crea e gestisci pipeline di dati per estrarre, trasformare e caricare informazioni.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex justify-center items-center flex-1">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </CardContent>
            </Card>
        );
    }

    return (
        <>
        <Card className="h-full flex flex-col">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-sm">Pipeline ETL</CardTitle>
                        <CardDescription className="text-xs">
                            Crea e gestisci pipeline di dati per estrarre, trasformare e caricare informazioni.
                        </CardDescription>
                    </div>
                    <Button size="sm" className="gap-1 text-xs" onClick={() => setIsAddPipelineDialogOpen(true)}>
                        <PlusCircle className="h-3 w-3" />
                        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                            Aggiungi Pipeline
                        </span>
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
                <div className='space-y-2'>
                    {Array.isArray(pipelines) && pipelines.length > 0 ? pipelines.map(pipeline => (
                        <Card key={pipeline.id} className='overflow-hidden'>
                            <Collapsible 
                                open={openPipelineIds.includes(pipeline.id)}
                                onOpenChange={(isOpen) => {
                                    setOpenPipelineIds(prev => 
                                        isOpen 
                                            ? [...prev, pipeline.id] 
                                            : prev.filter(id => id !== pipeline.id)
                                    );
                                }}
                            >
                                <CollapsibleTrigger asChild>
                                    <div className="flex items-center p-2.5 hover:bg-muted/50 transition-colors cursor-pointer">
                                        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${openPipelineIds.includes(pipeline.id) ? 'rotate-90' : ''}`} />
                                        <div className='ml-2.5 flex-1'>
                                            <p className="font-semibold text-[11px]">{pipeline.name}</p>
                                            <p className="text-[10px] text-muted-foreground">{pipeline.description}</p>
                                        </div>
                                        <Button variant="outline" size="sm" className='mr-2 text-[10px] h-7' onClick={(e) => { e.stopPropagation(); savePipelinesState(pipelines); toast({title: "Pipeline Salvata!"}); }}>
                                            <Save className='h-3 w-3 mr-1' />
                                            Salva
                                        </Button>
                                        <Button size="sm" className="text-[10px] h-7" onClick={(e) => { e.stopPropagation(); handleRunPipeline(pipeline.name); }}>
                                            <Play className='h-3 w-3 mr-1' />
                                            Esegui
                                        </Button>
                                    </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <div 
                                        className='relative p-12 bg-muted/20 min-h-[400px] overflow-auto' 
                                        onClick={handleCanvasClick} 
                                        ref={(el) => {
                                            svgContainerRef.current = el;
                                            registerContainerRef(pipeline.id, el);
                                        }}
                                        data-pipeline-content
                                    >
                                        <svg 
                                            width={svgSizes[pipeline.id]?.width || '100%'} 
                                            height={svgSizes[pipeline.id]?.height || '100%'} 
                                            className='absolute top-0 left-0 pointer-events-none'
                                        >
                                            <g onClick={(e) => e.stopPropagation()} className="pointer-events-auto">
                                            {(edgePaths[pipeline.id] || []).map((edge, index) => {
                                                const isSelected = selectedEdge?.pipelineId === pipeline.id && selectedEdge.edge.from === edge.from && selectedEdge.edge.to === edge.to && selectedEdge.edge.fromPort === edge.fromPort;
                                                if (isSelected) return null; 
                                                return (
                                                    <SvgPath 
                                                        key={`${pipeline.id}-${index}`} 
                                                        d={edge.path} 
                                                        isSelected={false}
                                                        onSelect={() => setSelectedEdge({ pipelineId: pipeline.id, edge: edge })}
                                                        onDelete={() => handleDeleteEdge(pipeline.id, edge)}
                                                    />
                                                );
                                            })}
                                            </g>
                                            {linkingState && getActivePipelineId(linkingState.fromNode, pipelines) === pipeline.id && (
                                                <path
                                                    d={linkingPathD}
                                                    fill="none"
                                                    stroke="hsl(var(--primary))"
                                                    strokeWidth="1.5"
                                                    strokeDasharray="3 3"
                                                    className="pointer-events-none"
                                                />
                                            )}
                                        </svg>
                                        <div 
                                            className='absolute top-0 left-0 pointer-events-none'
                                            style={{ width: svgSizes[pipeline.id]?.width || '100%', height: svgSizes[pipeline.id]?.height || '100%', zIndex: 10 }}
                                        >
                                        <svg width="100%" height="100%">
                                                <g onClick={(e) => e.stopPropagation()} className="pointer-events-auto">
                                                    {selectedEdge && selectedEdge.pipelineId === pipeline.id && (edgePaths[pipeline.id] || []).find(p => p.from === selectedEdge.edge.from && p.to === selectedEdge.edge.to && p.fromPort === selectedEdge.edge.fromPort) && (
                                                        <SvgPath 
                                                            key={`${pipeline.id}-selected`} 
                                                            d={(edgePaths[pipeline.id].find(p => p.from === selectedEdge.edge.from && p.to === selectedEdge.edge.to && p.fromPort === selectedEdge.edge.fromPort) as any).path} 
                                                            isSelected={true}
                                                            onSelect={() => {}}
                                                            onDelete={() => handleDeleteEdge(pipeline.id, selectedEdge.edge)}
                                                        />
                                                    )}
                                                </g>
                                            </svg>
                                        </div>

                                        <div className="relative flex justify-start items-start min-w-max gap-28 pointer-events-none">
                                            {(layouts[pipeline.id] || []).map((column: any[], colIndex: number) => (
                                                <div key={colIndex} className="flex flex-col items-center justify-center gap-12 h-full" style={{minHeight: '320px'}}>
                                                    {column.map(({id: nodeId, node}) => {
                                                        if (!node) return null;
                                                        return (
                                                            <div key={nodeId} className='pointer-events-auto'>
                                                                <NodeCard 
                                                                    node={node} 
                                                                    onDeleteNode={() => handleDeleteNode(pipeline.id, nodeId)}
                                                                    onAddChildNode={(portIndex: number) => handleAddNode(pipeline.id, nodeId, portIndex)}
                                                                    onNodeClick={() => handleNodeClick(node, pipeline)}
                                                                    registerNodeRef={registerNodeRef}
                                                                    onPortClick={(e, nodeId, type, index) => handlePortClick(e, nodeId, type, index)}
                                                                    isLinkingFrom={linkingState?.fromNode === nodeId}
                                                                />
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        </Card>
                    )) : (
                        <div className="text-center text-muted-foreground py-10">
                            {isLoading ? 'Caricamento pipeline...' : 'Nessuna pipeline configurata. Inizia aggiungendone una!'}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
        <NodeDetailSheet 
            isOpen={isSheetOpen}
            setIsOpen={setIsSheetOpen}
            node={selectedNode}
            onSave={handleNodeSave}
            connections={connections}
            onRunPipelineNode={(nodeId) => runNode(selectedNode.pipelineId, nodeId)}
        />
        {runningEndNode && (
            <EndNodeEditorDialog
                isOpen={isEndNodeEditorOpen}
                setIsOpen={setIsEndNodeEditorOpen}
                node={runningEndNode}
                onSave={handleNodeSave}
                reportData={endNodeResult}
                isLoadingData={!endNodeResult}
            />
        )}
        <AddPipelineDialog
            isOpen={isAddPipelineDialogOpen}
            setIsOpen={setIsAddPipelineDialogOpen}
            onAdd={handleAddPipeline}
        />
        </>
    );
}
