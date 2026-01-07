

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { DecisionNode, DecisionLeaf, MediaItem, LinkItem, TriggerItem, StoredTree, DecisionOptionChild } from '@/lib/types';
import { ArrowLeft, Brain, Eye, GitBranch, Lightbulb, Link as LinkIcon, Loader2, RotateCcw, Sparkles, Zap, Image as ImageIcon, Video, Flag, Play, Check } from 'lucide-react';
import {
    executeTriggerAction,
    getTreeAction,
    rephraseQuestionAction,
    resolveDependencyChainAction,
} from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import Image from 'next/image';
import Link from 'next/link';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '@/lib/utils';
import { DataTable } from '@/components/ui/data-table';
import { Database, Code, LineChart } from 'lucide-react';
// import { useFlowExecution } from '@/ai/flows/client-executor'; // Removed broken import
import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// 🚀 MODULE-LEVEL CACHE: Persists across component remounts
const GLOBAL_EXECUTION_CACHE = new Map<string, any>();

// 🔑 Generate cache key for a dependency - using hash for stability
const generateCacheKey = (dep: any): string => {
    const codeOrQuery = (dep.isPython ? dep.pythonCode : dep.query) || '';
    const type = dep.isPython ? 'python' : 'sql';
    const connector = dep.connectorId || 'none';
    // Create a stable key using a simple hash of the code
    const codeHash = hashCode(codeOrQuery);
    const key = `${type}::${connector}::${dep.tableName}::${codeHash}`;
    console.log(`[Cache] Key for "${dep.tableName}": ${key.substring(0, 80)}...`);
    return key;
};

// Simple string hash function for stable cache keys
const hashCode = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
};

// --- NEW COMPONENT: Hierarchy Visualizer ---
function HierarchyVisualizer({
    steps,
    currentStepIndex,
    isExecuting
}: {
    steps: { name: string, type: 'sql' | 'python', status: 'pending' | 'running' | 'done' | 'error' | 'cached' }[],
    currentStepIndex: number,
    isExecuting: boolean
}) {
    if (!steps || steps.length === 0) return null;

    return (
        <div className="w-full mb-4 px-1">
            <div className="flex items-center gap-2 mb-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Flusso di Esecuzione</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {steps.map((step, idx) => {
                    let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
                    let icon = null;

                    if (step.status === 'done') {
                        variant = "default"; // Green (using default style for now, commonly dark/primary)
                        icon = <Check className="h-3 w-3 mr-1" />;
                    } else if (step.status === 'cached') {
                        variant = "secondary"; // Blue for cached
                        icon = <Check className="h-3 w-3 mr-1" />;
                    } else if (step.status === 'running') {
                        variant = "secondary";
                        icon = <Loader2 className="h-3 w-3 mr-1 animate-spin" />;
                    } else if (step.status === 'error') {
                        variant = "destructive";
                    }

                    // Override style for visual differentiation: Green for new, Blue for cached
                    const greenStyle = step.status === 'done' ? "bg-emerald-500 hover:bg-emerald-600 border-transparent text-white" : "";
                    const blueStyle = step.status === 'cached' ? "bg-sky-500 hover:bg-sky-600 border-transparent text-white" : "";

                    return (
                        <div key={idx} className="flex items-center">
                            {idx > 0 && <Separator orientation="horizontal" className="w-4 h-[1px] bg-slate-200 dark:bg-slate-700 mx-1" />}
                            <Badge variant={variant} className={cn("text-[10px] h-6 px-2 flex items-center transition-all duration-300", greenStyle, blueStyle)}>
                                {icon}
                                {step.type === 'sql' ? <Database className="h-3 w-3 mr-1 opacity-70" /> : <Code className="h-3 w-3 mr-1 opacity-70" />}
                                {step.name}
                            </Badge>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// --- NEW HOOK: Helper for Flow Execution ---
// --- RESTORED HOOK: Helper for Flow Execution ---
function useFlowExecution() {
    const [steps, setSteps] = useState<{ name: string, type: 'sql' | 'python', status: 'pending' | 'running' | 'done' | 'error' | 'cached', payload?: any }[]>([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(-1);
    const [isExecuting, setIsExecuting] = useState(false);
    const [accumulatedData, setAccumulatedData] = useState<Record<string, any>>({});
    const [finalResult, setFinalResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const executeFlow = useCallback(async (
        mainCode: string,
        mainOutputType: 'table' | 'variable' | 'chart',
        dependencies: { tableName: string, query?: string, connectorId?: string, isPython?: boolean, pythonCode?: string, pythonOutputType?: string }[],
        pythonConnectorId?: string,
        resultTableName?: string
    ) => {
        setIsExecuting(true);
        setError(null);
        setFinalResult(null);
        setAccumulatedData({});

        // Log current cache state
        console.log(`[Flow] 📦 Cache state at start: ${GLOBAL_EXECUTION_CACHE.size} entries`);

        // 1. Prepare steps
        const initialSteps = dependencies.map(d => ({
            name: d.tableName,
            type: (d.isPython ? 'python' : 'sql') as 'sql' | 'python',
            status: 'pending' as const,
            payload: d
        }));

        // Add final step
        initialSteps.push({
            name: 'Generazione Output',
            type: 'python',
            status: 'pending',
            payload: { isFinal: true, code: mainCode, outputType: mainOutputType } as any
        });

        setSteps(initialSteps);
        setCurrentStepIndex(0);


        const currentData: Record<string, any> = {};
        let cacheHitCount = 0; // Track cache hits for stats

        const initialStepsRef = initialSteps; // Keep ref for easy access

        // 2. Execute Dependencies
        // Group dependencies by their dependency relationships
        const totalFlowStartTime = performance.now();

        // Simple sequential or parallel execution?
        // Reuse logic from previous efficient implementation
        const dependencyGraph = new Map<number, Set<number>>();

        for (let i = 0; i < initialSteps.length - 1; i++) {
            const step = initialSteps[i];
            const dep = step.payload;
            const depsSet = new Set<number>();
            const codeOrQuery = dep.isPython ? dep.pythonCode : dep.query;
            if (codeOrQuery) {
                for (let j = 0; j < i; j++) {
                    const prevStepName = initialSteps[j].name;
                    if (codeOrQuery.includes(prevStepName)) {
                        depsSet.add(j);
                    }
                }
            }
            dependencyGraph.set(i, depsSet);
        }

        const completed = new Set<number>();
        const executing = new Set<number>();

        while (completed.size < initialSteps.length - 1) {
            const readyToExecute: number[] = [];
            for (let i = 0; i < initialSteps.length - 1; i++) {
                if (completed.has(i) || executing.has(i)) continue;
                const deps = dependencyGraph.get(i) || new Set();
                const allDepsCompleted = Array.from(deps).every(d => completed.has(d));
                if (allDepsCompleted) readyToExecute.push(i);
            }

            if (readyToExecute.length === 0 && executing.size === 0) break; // Deadlock or done

            if (readyToExecute.length > 0) {
                readyToExecute.forEach(i => executing.add(i));
                const parallelPromises = readyToExecute.map(async (i) => {
                    const step = initialStepsRef[i];
                    const dep = step.payload;
                    const cacheKey = generateCacheKey(dep);
                    const cachedData = GLOBAL_EXECUTION_CACHE.get(cacheKey);

                    if (cachedData) {
                        currentData[step.name] = cachedData;
                        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'cached' } : s));
                        return { index: i, success: true };
                    }

                    // Execute
                    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'running' } : s));
                    try {
                        let resultData = null;
                        if (dep.isPython && dep.pythonCode) {
                            const depsBefore = dependencies.slice(0, i);
                            const res = await executePythonPreviewAction(
                                dep.pythonCode,
                                'table',
                                currentData,
                                depsBefore,
                                dep.connectorId || pythonConnectorId
                            );
                            if (res.success && res.data) resultData = res.data;
                            else throw new Error(res.error || `Error in ${step.name}`);
                        } else if (!dep.isPython && dep.query && dep.connectorId) {
                            const res = await executeSqlPreviewAction(dep.query, dep.connectorId, dependencies);
                            if (res.data) resultData = res.data;
                            else throw new Error(res.error || `Error in ${step.name}`);
                        }

                        if (resultData) {
                            GLOBAL_EXECUTION_CACHE.set(cacheKey, resultData);
                            currentData[step.name] = resultData;
                            setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'done' } : s));
                        }
                        return { index: i, success: true };
                    } catch (err: any) {
                        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'error' } : s));
                        setError(err.message);
                        setIsExecuting(false);
                        return { index: i, success: false };
                    }
                });

                const results = await Promise.all(parallelPromises);
                if (results.some(r => !r.success)) return;

                readyToExecute.forEach(i => { completed.add(i); executing.delete(i); });
            }
        }

        // 3. Final Step execution
        const finalIdx = initialSteps.length - 1;
        setSteps(prev => prev.map((s, idx) => idx === finalIdx ? { ...s, status: 'running' } : s));
        setCurrentStepIndex(finalIdx);

        try {
            const res = await executePythonPreviewAction(
                mainCode,
                mainOutputType,
                currentData,
                [],
                pythonConnectorId
            );

            if (res.success) {
                if (resultTableName && res.data) {
                    const finalResultKey = generateCacheKey({
                        isPython: true,
                        pythonCode: mainCode,
                        connectorId: pythonConnectorId,
                        tableName: resultTableName
                    });
                    GLOBAL_EXECUTION_CACHE.set(finalResultKey, res.data);
                }

                setFinalResult({
                    type: mainOutputType,
                    data: res.data,
                    variables: res.variables,
                    chartBase64: res.chartBase64,
                    chartHtml: res.chartHtml
                });
                setSteps(prev => prev.map((s, idx) => idx === finalIdx ? { ...s, status: 'done' } : s));
            } else {
                throw new Error(res.error || "Errore esecuzione finale");
            }
        } catch (err: any) {
            setSteps(prev => prev.map((s, idx) => idx === finalIdx ? { ...s, status: 'error' } : s));
            setError(err.message);
        } finally {
            setIsExecuting(false);
        }
    }, []); // Memoized to prevent infinite loops in useEffect

    return { steps, currentStepIndex, isExecuting, accumulatedData, finalResult, error, executeFlow };
}


interface InteractiveGuideProps {
    jsonTree: string;
    treeId: string;
}

type HistoryFrame = {
    tree: DecisionNode;
    path: HistoryItem[];
    treeId: string;
    treeName?: string;
};

type HistoryItem = DecisionOptionChild;

// Helper component for SQL Preview - 🚀 NOW WITH CACHING!
function SqlDataPreview({ connectorId, query, pipelineDependencies, tableName, selectedPipelines }: {
    connectorId: string,
    query: string,
    pipelineDependencies?: { tableName: string, query?: string, connectorId?: string, isPython?: boolean, pythonCode?: string, pythonOutputType?: string }[],
    tableName?: string, // Optional: if provided, we use standard cache key for future deps
    selectedPipelines?: string[] // Optional: whitelist of dependencies to include
}) {
    const [data, setData] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fromCache, setFromCache] = useState(false);

    // Memoize stable dependencies to prevent re-fetching/loops and apply filtering
    const stableDeps = useMemo(() => {
        if (!pipelineDependencies) return [];

        let filteredDeps = pipelineDependencies;

        // Smart Detection Logic
        // If selectedPipelines is provided, we normally filter strictly.
        // BUT, if a dependency is referenced in the query text, we include it anyway (Smart Inclusion).
        if (selectedPipelines) {
            filteredDeps = pipelineDependencies.filter(d => {
                const isExplicitlySelected = selectedPipelines.includes(d.tableName);
                const isReferenced = query.includes(d.tableName);
                return isExplicitlySelected || isReferenced;
            });
            console.log(`[SqlDataPreview] 🧠 Smart Filtering for "${tableName || 'sql'}":`,
                `Keeping ${filteredDeps.length}/${pipelineDependencies.length}`,
                `Selected: ${JSON.stringify(selectedPipelines)}`);
        } else {
            // NEW: Auto-Filter (Implicit)
            // If no explicit whitelist is provided, we infer dependencies from the query text.
            // FIX: Case-insensitive check to avoid missing tables like "HR2" vs "hr2"
            const mentionedDeps = pipelineDependencies.filter(d => query.toLowerCase().includes(d.tableName.toLowerCase()));

            // CRITICAL SAGE FIX: Always include the IMMEDIATE predecessor logic to preserve the chain visual.
            // Even if "HR2" isn't in the query text, if we are at "EstraiReparti" and came from "HR2", 
            // HR2 is our logical parent.
            const immediateParent = pipelineDependencies[pipelineDependencies.length - 1]; // Last item is usually the immediate parent

            // If we found references OR have an immediate parent, we use this constructed list.
            // This filters out "cousins" (pollution) while keeping the direct line.
            if (mentionedDeps.length > 0 || immediateParent) {
                // Start with referenced ones
                filteredDeps = [...mentionedDeps];

                // Add immediate parent if not already there
                if (immediateParent && !filteredDeps.find(d => d.tableName === immediateParent.tableName)) {
                    filteredDeps.push(immediateParent);
                }

                console.log(`[SqlDataPreview] ⚡ Auto-Filtering for "${tableName || 'sql'}":`,
                    `Found ${mentionedDeps.length} refs + Parent (${immediateParent?.tableName}), keeping ${filteredDeps.length}`);
            }
            // If absolutely nothing found (and no parent?), fallback to existing "filteredDeps" (all).
        }

        // 2. Deduplicate dependencies based on tableName
        return filteredDeps.filter((v, i, a) => a.findIndex(t => t.tableName === v.tableName) === i);
    }, [JSON.stringify(pipelineDependencies), JSON.stringify(selectedPipelines), query]);

    // Construct steps for visualization
    const steps = useMemo(() => {
        const currentStatus = loading ? 'running' : data ? 'done' : error ? 'error' : 'pending';

        if (!stableDeps.length) {
            return [{
                name: tableName || 'Query Corrente',
                type: 'sql' as const,
                status: currentStatus as 'pending' | 'running' | 'done' | 'error' | 'cached'
            }];
        }

        const flowSteps: { name: string, type: 'sql' | 'python', status: 'pending' | 'running' | 'done' | 'error' | 'cached' }[] = stableDeps.map(d => ({
            name: d.tableName,
            type: (d.isPython ? 'python' : 'sql') as 'sql' | 'python',
            status: 'cached'
        }));

        // Add current step
        flowSteps.push({
            name: tableName || 'Query Corrente',
            type: 'sql',
            status: currentStatus
        });

        return flowSteps;
    }, [stableDeps, tableName, loading, data, error]);

    useEffect(() => {
        let mounted = true;
        const fetchData = async () => {
            if (!connectorId || !query) return;

            // 🔑 Generate cache key
            let cacheKey: string;

            if (tableName) {
                // Use standard key format akin to executeFlow dependencies
                // This ensures that when this step is a dependency for a future step, it finds the data!
                cacheKey = generateCacheKey({
                    isPython: false,
                    connectorId,
                    tableName,
                    query
                });
            } else {
                // Fallback for standalone queries without a specific table name result
                cacheKey = `sql::${connectorId}::direct::${hashCode(query)}`;
            }

            console.log(`[SqlDataPreview] 🔑 Cache key (${tableName ? 'std' : 'direct'}): ${cacheKey.substring(0, 60)}...`);

            // 🎯 Check cache first!
            const cachedData = GLOBAL_EXECUTION_CACHE.get(cacheKey);
            if (cachedData) {
                console.log(`[SqlDataPreview] 💙 CACHE HIT! Using cached data (${cachedData.length} rows)`);
                if (mounted) {
                    setData(cachedData);
                    setFromCache(true);
                }
                return;
            }

            // 🔍 Cache miss - fetch from backend
            console.log('[SqlDataPreview] 🔍 CACHE MISS, fetching from backend...');
            setLoading(true);
            setFromCache(false);

            try {
                // Pass pipelineDependencies to backend for cascading execution
                const result = await executeSqlPreviewAction(query, connectorId, stableDeps);
                if (mounted) {
                    if (result.data) {
                        setData(result.data);
                        // 💾 Store in global cache
                        GLOBAL_EXECUTION_CACHE.set(cacheKey, result.data);
                        console.log(`[SqlDataPreview] 💾 Cached result for "${tableName || 'direct'}" (cache size: ${GLOBAL_EXECUTION_CACHE.size})`);
                    } else {
                        setError(result.error || 'Errore esecuzione query');
                    }
                }
            } catch (e) {
                if (mounted) setError('Errore di connessione');
            } finally {
                if (mounted) setLoading(false);
            }
        };
        fetchData();
        return () => { mounted = false; };
    }, [connectorId, query, stableDeps, tableName]);

    if (!connectorId || !query) return null;

    return (
        <div className="mt-4 border rounded-md overflow-hidden w-full max-w-full min-w-0 grid grid-cols-1">
            {steps.length > 0 && (
                <div className="bg-slate-50 border-b p-2">
                    <HierarchyVisualizer steps={steps} currentStepIndex={steps.length - 1} isExecuting={loading} />
                </div>
            )}
            <div className="bg-muted px-3 py-2 border-b flex items-center gap-2">
                <Database className="h-4 w-4 text-violet-600" />
                <span className="text-xs font-semibold uppercase tracking-wider">Dati Correlati {fromCache && '(Cached)'}</span>
            </div>
            {loading ? (
                <div className="p-8 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : error ? (
                <div className="p-4 text-sm text-destructive bg-destructive/10">
                    {error}
                </div>
            ) : data ? (
                <div className="max-h-[300px] overflow-auto w-full max-w-full">
                    <DataTable data={data} className="border-0" />
                </div>
            ) : null}
        </div>
    );
}

// Helper to find a node by its result name (SQL or Python) recursively in the tree
// FIX: Made case-insensitive to handle HR2 vs hr2 mismatches
const findNodeByResultName = (node: DecisionNode | DecisionLeaf | string | null, targetName: string): any => {
    if (!node) return null;
    const targetLower = targetName.toLowerCase();

    // Check array (children)
    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findNodeByResultName(item, targetName);
            if (found) return found;
        }
        return null;
    }

    // Check object
    if (typeof node === 'object') {
        // Check current node properties (case-insensitive)
        if ('pythonResultName' in node && (node as any).pythonResultName?.toLowerCase() === targetLower) return node;
        if ('sqlResultName' in node && (node as any).sqlResultName?.toLowerCase() === targetLower) return node;

        // Recursively check triggers
        if ('triggers' in node && Array.isArray((node as any).triggers)) {
            // (Triggers usually don't have results we depend on in this flow context, but good for completeness)
        }

        // Recursively check options
        if ('options' in node && (node as any).options) {
            for (const key in (node as any).options) {
                const found = findNodeByResultName((node as any).options[key], targetName);
                if (found) return found;
            }
        }
    }

    return null;
};

function PythonDataPreview({
    code,
    outputType,
    selectedPipelines,
    pipelineDependencies,
    pythonConnectorId,
    tableName,
    initialTree, // Pass full tree for lazy loading
    loadedSubTrees // NEW: Map of loaded sub-trees for cross-branch lazy loading
}: {
    code: string,
    outputType: 'table' | 'variable' | 'chart',
    selectedPipelines?: string[],
    pipelineDependencies: { tableName: string, query?: string, connectorId?: string, isPython?: boolean, pythonCode?: string, pythonOutputType?: string }[],
    pythonConnectorId?: string, // HubSpot connector ID for token injection
    tableName?: string, // Optional: if provided, we cache the FINAL result for this table name
    initialTree?: DecisionNode | null, // Optional full tree
    loadedSubTrees?: Map<string, { tree: DecisionNode, name: string }> // NEW: Sub-trees
}) {
    // Use the new hook
    const {
        steps,
        currentStepIndex,
        isExecuting,
        finalResult,
        error,
        executeFlow
    } = useFlowExecution();

    // Memoize the dependencies to prevent infinite loops and apply filtering
    const stableDeps = useMemo(() => {
        let filteredDeps = pipelineDependencies;

        // Smart Detection Logic for Python
        // Include if selected explicitly OR if referenced in the code string.
        if (selectedPipelines) {
            filteredDeps = pipelineDependencies.filter(d => {
                const isExplicitlySelected = selectedPipelines.includes(d.tableName);
                const isReferenced = code.includes(d.tableName);
                return isExplicitlySelected || isReferenced;
            });
            console.log(`[PythonDataPreview] 🧠 Smart Filtering for "${tableName || 'python'}":`,
                `Keeping ${filteredDeps.length}/${pipelineDependencies.length}`,
                `Selected: ${JSON.stringify(selectedPipelines)}`);
        } else {
            // NEW: Auto-Filter for Python (Implicit)
            console.log(`[PythonDataPreview] 🔎 Available deps for auto-detection:`, pipelineDependencies.map(d => d.tableName));
            // FIX: Case-insensitive check
            const mentionedDeps = pipelineDependencies.filter(d => code.toLowerCase().includes(d.tableName.toLowerCase()));

            // CRITICAL SAGE FIX: Always include the IMMEDIATE predecessor logic
            const immediateParent = pipelineDependencies[pipelineDependencies.length - 1];

            if (mentionedDeps.length > 0 || immediateParent) {
                filteredDeps = [...mentionedDeps];

                // Add immediate parent if not already there
                if (immediateParent && !filteredDeps.find(d => d.tableName === immediateParent.tableName)) {
                    filteredDeps.push(immediateParent);
                }

                // OLD LAZY LOADING LOGIC - REMOVED IN FAVOR OF SERVER-SIDE RESOLUTION
                // if (initialTree) {
                //     const codeLower = code.toLowerCase();
                //     const existingNames = new Set(filteredDeps.map(d => d.tableName));
                //     const potentialVars = code.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
                //     const uniqueVars = Array.from(new Set(potentialVars));

                //     uniqueVars.forEach(varName => {
                //         if (existingNames.has(varName)) return; // Already present

                //         // Try to find it in the main tree first
                //         let node = findNodeByResultName(initialTree, varName);
                //         let source = 'main tree';

                //         // If not found, search in loaded sub-trees
                //         if (!node && loadedSubTrees) {
                //             for (const [subTreeId, subTreeData] of loadedSubTrees.entries()) {
                //                 node = findNodeByResultName(subTreeData.tree, varName);
                //                 if (node) {
                //                     source = `sub-tree: ${subTreeData.name}`;
                //                     break;
                //                 }
                //             }
                //         }

                //         if (node) {
                //             // Found a node that produces this variable!
                //             console.log(`[PythonDataPreview] 🚀 LAZY LOADING dependency: ${varName} (from ${source})`);

                //             // Construct dependency
                //             if ('sqlQuery' in node) {
                //                 filteredDeps.push({
                //                     tableName: varName,
                //                     query: (node as any).sqlQuery,
                //                     connectorId: (node as any).sqlConnectorId
                //                 });
                //             } else if ('pythonCode' in node) {
                //                 filteredDeps.push({
                //                     tableName: varName,
                //                     isPython: true,
                //                     pythonCode: (node as any).pythonCode,
                //                     pythonOutputType: (node as any).pythonOutputType || 'table',
                //                     connectorId: (node as any).pythonConnectorId
                //                 });
                //             }
                //             existingNames.add(varName); // Prevent double add
                //         }
                //     });
                // }

                console.log(`[PythonDataPreview] ⚡ Auto-Filtering + Lazy Loading for "${tableName || 'python'}":`,
                    `Final List: ${filteredDeps.map(d => d.tableName).join(', ')}`);
            }
        }

        // 2. Deduplicate dependencies based on tableName
        return filteredDeps.filter((v, i, a) => a.findIndex(t => t.tableName === v.tableName) === i);
    }, [JSON.stringify(pipelineDependencies), JSON.stringify(selectedPipelines), code]);

    // NEW: Async Dependency Resolution (Server-Side)
    const [asyncDeps, setAsyncDeps] = useState<any[]>([]);
    const [isResolving, setIsResolving] = useState(false);

    useEffect(() => {
        let mounted = true;
        const resolveMissing = async () => {
            if (!code) return;

            // 1. Identify what variables are referenced but NOT in stableDeps
            const codeLower = code.toLowerCase();
            const potentialVars = code.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
            const uniqueVars = Array.from(new Set(potentialVars));

            const existingNames = new Set(stableDeps.map(d => d.tableName.toLowerCase()));
            const asyncNames = new Set(asyncDeps.map(d => d.tableName.toLowerCase()));

            const missing = uniqueVars.filter(v =>
                !existingNames.has(v.toLowerCase()) &&
                !asyncNames.has(v.toLowerCase()) &&
                v.length > 2 // Skip short vars like i, x
            );

            if (missing.length === 0) return;

            setIsResolving(true);
            // Clear any previous execution error while resolving to avoid UI flash
            // logic handled in render, but good to be explicit if we had setError exposed here.

            const newDeps: any[] = [];

            // 2. Fetch from server
            for (const varName of missing) {
                // Skip common python keywords (heuristic)
                if (['print', 'len', 'range', 'list', 'dict', 'set', 'str', 'int', 'float', 'import', 'from', 'def', 'return', 'none', 'true', 'false'].includes(varName.toLowerCase())) continue;

                try {
                    console.log(`[PythonDataPreview] 🌍 Creating server request for missing dependency chain: ${varName}`);
                    const result = await resolveDependencyChainAction(varName); // Call Server Action (Recursive Chain)

                    if (result.data && Array.isArray(result.data)) {
                        console.log(`[PythonDataPreview] ✅ Server found chain of ${result.data.length} nodes for: ${varName}`);

                        // Add ALL returned nodes as dependencies
                        for (const node of result.data) {
                            // Avoid adding duplicates if multiple chains return same node
                            // Check against newDeps too
                            const alreadyAdded = newDeps.some(d => d.tableName === (node.pythonResultName || node.sqlResultName));
                            const alreadyStable = stableDeps.some(d => d.tableName === (node.pythonResultName || node.sqlResultName));
                            const alreadyAsync = asyncDeps.some(d => d.tableName === (node.pythonResultName || node.sqlResultName));

                            if (alreadyAdded || alreadyStable || alreadyAsync) continue;

                            if ('sqlQuery' in node) {
                                newDeps.push({
                                    tableName: node.sqlResultName || varName, // Fallback if name matches
                                    query: (node as any).sqlQuery,
                                    connectorId: (node as any).sqlConnectorId
                                });
                            } else if ('pythonCode' in node) {
                                newDeps.push({
                                    tableName: node.pythonResultName || varName,
                                    isPython: true,
                                    pythonCode: (node as any).pythonCode,
                                    pythonOutputType: (node as any).pythonOutputType || 'table',
                                    connectorId: (node as any).pythonConnectorId
                                });
                            }
                        }
                    } else if (result.error) {
                        console.warn(`[PythonDataPreview] Server returned error for ${varName}: ${result.error}`);
                    }
                } catch (e) {
                    console.warn(`[PythonDataPreview] Failed to resolve ${varName} on server`, e);
                }
            }

            if (mounted && newDeps.length > 0) {
                setAsyncDeps(prev => [...prev, ...newDeps]);
            }
            if (mounted) setIsResolving(false);
        };

        resolveMissing();

        return () => { mounted = false; };
    }, [code, stableDeps.length]); // Depend on stableDeps count so we don't re-fetch if stableDeps didn't change (much)


    useEffect(() => {
        let mounted = true;
        let executed = false; // Prevent double execution

        const start = async () => {
            // Wait for async resolution if it's happening?
            // Actually, the `isResolving` state causes a re-render.
            // We should block execution until resolving is done OR timeout?
            // For now, if we are resolved (or wasn't resolving), proceed.
            if (isResolving) return;

            // Combine deps
            const allDeps = [...stableDeps, ...asyncDeps].filter((v, i, a) => a.findIndex(t => t.tableName === v.tableName) === i);

            if (executed || !code) return;
            executed = true; // Mark as started

            try {
                //console.log(`[PythonDataPreview] Starting execution for table: ${tableName || 'unnamed'}`);
                await executeFlow(
                    code,
                    outputType,
                    allDeps, // Use merged dependencies
                    pythonConnectorId,
                    tableName
                );
            } catch (e) {
                console.error("Execution failed:", e);
            }
        };

        // Debounce slightly to allow resolution to start
        const timer = setTimeout(start, 500);

        return () => {
            mounted = false;
            clearTimeout(timer);
        };
    }, [code, outputType, stableDeps, asyncDeps, isResolving, pythonConnectorId, tableName, executeFlow]); // Re-run when dependencies change

    if (!code) return null;

    return (
        <div className="mt-4 border rounded-md overflow-hidden w-full max-w-full min-w-0 grid grid-cols-1">
            <div className="bg-muted px-3 py-2 border-b flex items-center gap-2">
                <Code className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-semibold uppercase tracking-wider">Analisi Python ({outputType})</span>
            </div>

            <div className="p-4 bg-white dark:bg-zinc-950">
                {/* Visualization of the process */}
                <HierarchyVisualizer
                    steps={steps}
                    currentStepIndex={currentStepIndex}
                    isExecuting={isExecuting}
                />

                {isExecuting || isResolving ? (
                    <div className="py-8 flex flex-col items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-2" />
                        <p className="text-xs text-muted-foreground animate-pulse">
                            {isResolving ? 'Risoluzione dipendenze mancanti...' : 'Elaborazione in corso...'}
                        </p>
                    </div>
                ) : error ? (
                    <div className="p-4 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                        <p className="font-semibold mb-1">Errore esecuzione:</p>
                        {error}
                    </div>
                ) : finalResult ? (
                    <div className="w-full max-w-full">
                        {finalResult.type === 'table' && finalResult.data && (
                            <div className="max-h-[300px] overflow-auto">
                                <DataTable data={finalResult.data} className="border-0" />
                            </div>
                        )}
                        {finalResult.type === 'variable' && finalResult.variables && (
                            <pre className="p-3 text-xs overflow-auto max-h-48 bg-slate-50 dark:bg-slate-900 rounded">{JSON.stringify(finalResult.variables, null, 2)}</pre>
                        )}
                        {finalResult.type === 'chart' && (
                            <div className="w-full h-[70vh] border-none overflow-auto">
                                {finalResult.chartHtml ? (
                                    <iframe
                                        srcDoc={`<html><head><style>body{margin:0;padding:0;background:transparent;overflow:hidden;}</style></head><body>${finalResult.chartHtml}</body></html>`}
                                        className="w-full h-full border-none"
                                        title="Chart"
                                    />
                                ) : finalResult.chartBase64 ? (
                                    <img src={`data:image/png;base64,${finalResult.chartBase64}`} alt="Chart" className="max-w-full block mx-auto py-4" />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground text-xs italic">Nessun grafico generato</div>
                                )}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

// Helper to find a node by ID recursively in the tree
const findNodeById = (node: any, id: string): any => {
    if (!node) return null;
    if (typeof node === 'object' && node.id === id) return node;

    if (Array.isArray(node)) {
        for (const child of node) {
            const result = findNodeById(child, id);
            if (result) return result;
        }
    } else if (typeof node === 'object') {
        if (node.options) {
            for (const key of Object.keys(node.options)) {
                const result = findNodeById(node.options[key], id);
                if (result) return result;
            }
        }
    }
    return null;
};

export default function InteractiveGuide({ jsonTree, treeId }: InteractiveGuideProps) {
    const { toast } = useToast();

    const [treeStack, setTreeStack] = useState<HistoryFrame[]>([]);
    const [currentTree, setCurrentTree] = useState<DecisionNode | null>(null);
    const [currentNode, setCurrentNode] = useState<HistoryItem | null>(null);
    const [nodeHistory, setNodeHistory] = useState<HistoryItem[]>([]);

    const [rephrasing, setRephrasing] = useState(false);
    const [rephrasedQuestion, setRephrasedQuestion] = useState<string | null>(null);
    const [previewingMedia, setPreviewingMedia] = useState<MediaItem | null>(null);
    const [isExecutingTrigger, setIsExecutingTrigger] = useState(false);
    const [isLoadingTree, setIsLoadingTree] = useState(false);
    const [currentTreeId, setCurrentTreeId] = useState(treeId);
    const [loadedSubTrees, setLoadedSubTrees] = useState<Map<string, { tree: DecisionNode, name: string }>>(new Map());
    const [loadingSubTreeIds, setLoadingSubTreeIds] = useState<Set<string>>(new Set());

    const initialTree = useMemo(() => {
        if (!jsonTree) return null;
        try {
            return JSON.parse(jsonTree) as DecisionNode;
        } catch (error) {
            console.error("Impossibile analizzare l'albero decisionale JSON:", error);
            return null;
        }
    }, [jsonTree]);

    const handleExecuteTriggers = useCallback(async (triggers: TriggerItem[]) => {
        if (!triggers || triggers.length === 0) return;

        setIsExecutingTrigger(true);
        for (const trigger of triggers) {
            const result = await executeTriggerAction(currentTreeId, (currentNode as any)?.id, trigger);
            if (result.success) {
                toast({
                    title: "Trigger Eseguito",
                    description: result.message
                });
            } else {
                toast({
                    variant: 'destructive',
                    title: "Esecuzione Trigger Fallita",
                    description: result.message
                });
            }
        }
        setIsExecutingTrigger(false);

    }, [currentTreeId, currentNode, toast]);

    const startTree = useCallback((tree: DecisionNode, id: string, name?: string) => {
        setCurrentTree(tree);
        setCurrentNode(tree);
        setCurrentTreeId(id);
        setNodeHistory([]);
        setRephrasedQuestion(null);
    }, []);


    useEffect(() => {
        if (initialTree) {
            startTree(initialTree, treeId);
        }
    }, [initialTree, startTree, treeId]);

    useEffect(() => {
        if (currentNode && (typeof currentNode === 'object' && 'decision' in currentNode) && !('question' in currentNode)) {
            const triggers = (currentNode as DecisionLeaf).triggers;
            if (triggers && triggers.length > 0) {
                handleExecuteTriggers(triggers);
            }
        }
    }, [currentNode, handleExecuteTriggers]);

    // Auto-load sub-trees when they appear in results
    useEffect(() => {
        if (!Array.isArray(currentNode)) return;

        const subTreeRefs = currentNode
            .filter(node => typeof node === 'object' && node !== null && 'subTreeRef' in node)
            .map(node => (node as any).subTreeRef as string);

        subTreeRefs.forEach(async (ref) => {
            if (!loadedSubTrees.has(ref) && !loadingSubTreeIds.has(ref)) {
                setLoadingSubTreeIds(prev => new Set(prev).add(ref));
                try {
                    const result = await getTreeAction(ref);
                    if (result.data && result.data.jsonDecisionTree) {
                        const tree = JSON.parse(result.data.jsonDecisionTree) as DecisionNode;
                        setLoadedSubTrees(prev => new Map(prev).set(ref, { tree, name: result.data!.name }));
                    }
                } catch (e) {
                    console.error('Failed to load sub-tree:', ref, e);
                } finally {
                    setLoadingSubTreeIds(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(ref);
                        return newSet;
                    });
                }
            }
        });
    }, [currentNode, loadedSubTrees, loadingSubTreeIds]);

    const handleOptionClick = async (nextNode: HistoryItem) => {
        if (currentNode) {
            setNodeHistory([...nodeHistory, currentNode]);
        }

        if (typeof nextNode === 'object' && nextNode !== null && 'subTreeRef' in nextNode && nextNode.subTreeRef) {
            setIsLoadingTree(true);
            // Push current state to stack
            if (currentTree) {
                setTreeStack([...treeStack, { tree: currentTree, path: [...nodeHistory, currentNode!], treeId: currentTreeId, treeName: currentTree.question }]);
            }

            // Fetch and start new tree
            const result = await getTreeAction(nextNode.subTreeRef);
            setIsLoadingTree(false);
            if (result.error || !result.data) {
                toast({ variant: 'destructive', title: 'Errore', description: result.error || 'Impossibile caricare il sotto-albero.' });
                // Rollback state
                handleBack();
                return;
            }

            try {
                const subTree = JSON.parse(result.data.jsonDecisionTree) as DecisionNode;
                startTree(subTree, result.data.id, result.data.name);
            } catch (e) {
                toast({ variant: 'destructive', title: 'Errore', description: 'Il sotto-albero è malformato.' });
                handleBack();
            }
        } else {
            setCurrentNode(nextNode);
            setRephrasedQuestion(null);
        }
    };

    const handleSubTreeOptionClick = async (nextNode: HistoryItem, subTreeId: string, originalIndex: number) => {
        // Navigate within a sub-tree that's embedded in the results view
        // Keep everything in the same view, just replace the sub-tree section

        if (!Array.isArray(currentNode)) return;

        // Prepare nodes to insert (handling single node or array of nodes)
        let nodesToInsert: any[] = [];

        if (Array.isArray(nextNode)) {
            nodesToInsert = nextNode.map(n => {
                if (typeof n === 'string') return { decision: n, _subTreeSource: subTreeId };
                return { ...n, _subTreeSource: subTreeId };
            });
        } else {
            let wrappedNode: any;
            if (typeof nextNode === 'string') {
                // String decision - wrap it in an object
                wrappedNode = { decision: nextNode, _subTreeSource: subTreeId };
            } else if (typeof nextNode === 'object' && nextNode !== null) {
                // Object - add the source property
                wrappedNode = { ...nextNode, _subTreeSource: subTreeId };
            } else {
                wrappedNode = nextNode;
            }
            nodesToInsert = [wrappedNode];
        }

        // Create new array and replace the item at originalIndex
        const newArray = [...currentNode];
        newArray.splice(originalIndex, 1, ...nodesToInsert);

        // Force it to stay as an array by ensuring it's always treated as such
        setCurrentNode(newArray as any);
    };

    const handleRestart = () => {
        if (initialTree) {
            startTree(initialTree, treeId);
            setTreeStack([]);
        }
    };

    const handleBack = () => {
        if (nodeHistory.length > 0) {
            const previousNode = nodeHistory[nodeHistory.length - 1];
            setNodeHistory(nodeHistory.slice(0, -1));
            setCurrentNode(previousNode);
            setRephrasedQuestion(null);
        } else if (treeStack.length > 0) {
            // We are at the root of a sub-tree, go back to parent tree
            const parentFrame = treeStack[treeStack.length - 1];
            setTreeStack(treeStack.slice(0, -1));

            setCurrentTree(parentFrame.tree);
            setCurrentTreeId(parentFrame.treeId);
            setNodeHistory(parentFrame.path.slice(0, -1));
            setCurrentNode(parentFrame.path[parentFrame.path.length - 1]);
            setRephrasedQuestion(null);
        }
    };

    const completeSubTree = (resultNode: DecisionLeaf | string) => {
        if (treeStack.length === 0) return;

        const parentFrame = treeStack[treeStack.length - 1];

        // Clone the parent's current node (which should be an array of results)
        // We know from returnToParentTree logic that the history state we want is actually
        // NOT the last node in path (which is the question), but the State AFTER answering it.
        // Wait, 'path' in history stores the sequence of nodes visited.
        // The last item in 'path' IS the node we were at BEFORE entering the sub-tree.
        // If we entered from a result list, that list IS the current node?
        // No, typically 'currentNode' is the result list.
        // When we push to stack: path: [...nodeHistory, currentNode]
        // So the last item in 'path' IS the node that triggered the sub-tree (the result list).

        const parentCurrentNode = parentFrame.path[parentFrame.path.length - 1];

        if (!Array.isArray(parentCurrentNode)) {
            // Unexpected state: parent node is not an array (so it wasn't a multiple result scenario?)
            // If it wasn't an array, how did we click a sub-tree link? 
            // Maybe a single result was a sub-tree link?
            // In that case, we just Replace the single node.
            setTreeStack(treeStack.slice(0, -1));
            setCurrentTree(parentFrame.tree);
            setCurrentTreeId(parentFrame.treeId);
            setNodeHistory(parentFrame.path.slice(0, -1));
            setRephrasedQuestion(null);

            // Replace the whole node with the result
            setCurrentNode(resultNode);
            toast({ title: "Sotto-albero completato", description: "Risultato acquisito nell'albero principale." });
            return;
        }

        // It is an array. We need to find the link to THIS sub-tree and replace it.
        const newArray = parentCurrentNode.map(item => {
            if (typeof item === 'object' && item !== null && 'subTreeRef' in item && item.subTreeRef === currentTreeId) {
                // Found the link! Replace with result.
                // We need to ensure the result is in a format that renderLeafNode accepts in the array map
                // If resultNode is string, it's fine. If object, ensure it works.
                // The resultNode passed in is standard DecisionLeaf format.
                return resultNode;
            }
            return item;
        });

        setTreeStack(treeStack.slice(0, -1));
        setCurrentTree(parentFrame.tree);
        setCurrentTreeId(parentFrame.treeId);
        setNodeHistory(parentFrame.path.slice(0, -1)); // We go back to state where currentNode was the array
        setRephrasedQuestion(null);
        setCurrentNode(newArray); // Set the modified array as current
        toast({ title: "Sotto-albero completato", description: "Risultato integrato nell'albero principale." });
    };

    const returnToParentTree = () => {
        if (treeStack.length === 0) return;
        const parentFrame = treeStack[treeStack.length - 1];
        setTreeStack(treeStack.slice(0, -1));

        // We don't just go back, we advance in the parent tree.
        // The last node in the parent frame's path is the question that led to the sub-tree.
        // The option that was clicked is not in the history.
        const lastQuestionNode = parentFrame.path[parentFrame.path.length - 1] as DecisionNode;

        // Find which option led to the sub-tree. We need to find the option that contains the subTreeRef.
        let nextNodeInParent: HistoryItem | undefined;
        if (lastQuestionNode.options) {
            for (const optionKey in lastQuestionNode.options) {
                const optionValue = lastQuestionNode.options[optionKey];
                if (typeof optionValue === 'object' && optionValue !== null && 'subTreeRef' in optionValue && optionValue.subTreeRef === currentTreeId) {
                    // This is a tricky part. A sub-tree link acts as a leaf. We cannot "continue" from it.
                    // The logical flow should be defined in the parent tree.
                    // For now, we just return to the question that launched the sub-tree.
                    setCurrentNode(lastQuestionNode);
                    setNodeHistory(parentFrame.path.slice(0, -1));
                    setCurrentTree(parentFrame.tree);
                    setCurrentTreeId(parentFrame.treeId);
                    setRephrasedQuestion(null);
                    toast({ title: "Ritorno all'albero principale", description: "La procedura nel sotto-albero è terminata. Per continuare, seleziona un'altra opzione." });

                    return;
                }
            }
        }

        // Fallback if we can't determine where to go next, just go back.
        handleBack();
    }


    const handleRephrase = async () => {
        if (currentNode && typeof currentNode === 'object' && 'question' in currentNode && currentNode.question) {
            setRephrasing(true);
            setRephrasedQuestion(null);
            const context = `L'utente si trova in un processo decisionale. I passaggi precedenti sono: ${nodeHistory.map(h => typeof h === 'object' && 'question' in h && h.question ? h.question : '').join(' -> ')}`;

            const apiKey = localStorage.getItem('openrouter_api_key');
            const model = localStorage.getItem('openrouter_model') || 'google/gemini-2.0-flash-001';
            const openRouterConfig = apiKey ? { apiKey, model } : undefined;

            const result = await rephraseQuestionAction(currentNode.question, context, openRouterConfig);
            if (result.error) {
                toast({
                    variant: 'destructive',
                    title: 'Riformulazione Fallita',
                    description: result.error
                });
            } else {
                setRephrasedQuestion(result.data);
            }
            setRephrasing(false);
        }
    };

    if (!currentTree) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Errore</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-destructive">Impossibile caricare la guida interattiva. L'albero decisionale JSON potrebbe non essere valido.</p>
                </CardContent>
            </Card>
        );
    }

    const isDecision = typeof currentNode === 'string' || (typeof currentNode === 'object' && currentNode !== null && 'decision' in currentNode && !('question' in currentNode));
    const isQuestion = typeof currentNode === 'object' && currentNode !== null && 'question' in currentNode;

    const nodeAsLeaf = isDecision ? (currentNode as DecisionLeaf) : null;
    const decisionText = isDecision ? (typeof currentNode === 'string' ? currentNode : nodeAsLeaf?.decision) : null;

    const renderAttachments = (node: DecisionNode | DecisionLeaf) => {
        // Unified extraction for media, links, and triggers
        const mediaItems: MediaItem[] = node && typeof node === 'object' && 'media' in node && Array.isArray(node.media) ? node.media : [];
        const linkItems: LinkItem[] = node && typeof node === 'object' && 'links' in node && Array.isArray(node.links) ? node.links : [];
        const triggerItems: TriggerItem[] = node && typeof node === 'object' && 'triggers' in node && Array.isArray(node.triggers) ? node.triggers : [];

        const allAttachments = [
            ...mediaItems.map(item => ({ type: 'media' as const, item })),
            ...linkItems.map(item => ({ type: 'link' as const, item })),
            ...triggerItems.map(item => ({ type: 'trigger' as const, item }))
        ];

        if (allAttachments.length === 0) return null;

        return (
            <div className="mt-6 max-w-md mx-auto border rounded-lg p-2 space-y-1">
                {allAttachments.map((attachment, index) => {
                    let icon, name, actionWrapper;
                    const { item, type } = attachment;

                    switch (type) {
                        case 'media':
                            icon = item.type === 'image'
                                ? <ImageIcon className="h-4 w-4 text-primary" />
                                : <Video className="h-4 w-4 text-primary" />;
                            name = item.name || item.originalFilename || 'Media';
                            actionWrapper = (children: React.ReactNode) => (
                                <div onClick={() => setPreviewingMedia(item)} className="cursor-pointer flex items-center gap-3 w-full">
                                    {children}
                                </div>
                            );
                            break;
                        case 'link':
                            icon = <LinkIcon className="h-4 w-4 text-primary" />;
                            name = item.name || item.url;
                            actionWrapper = (children: React.ReactNode) => (
                                <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 w-full">
                                    {children}
                                </a>
                            );
                            break;
                        case 'trigger':
                            icon = <Zap className="h-4 w-4 text-primary" />;
                            name = item.name;
                            actionWrapper = (children: React.ReactNode) => <div className="flex items-center gap-3 w-full">{children}</div>;
                            break;
                    }

                    return (
                        <div key={index} className="flex items-center p-2 rounded-md hover:bg-muted/50 transition-colors">
                            {actionWrapper(
                                <>
                                    {icon}
                                    <div className="w-6 h-6 rounded bg-secondary flex-shrink-0 overflow-hidden relative flex items-center justify-center">
                                        {type === 'media' && item.type === 'image' && (
                                            <Image src={item.url} alt={name} layout="fill" objectFit="cover" />
                                        )}
                                        {type === 'media' && item.type === 'video' && (
                                            <Video className="h-4 w-4 text-muted-foreground" />
                                        )}
                                    </div>
                                    <span className="font-medium text-sm truncate flex-1">{name}</span>
                                </>
                            )}
                        </div>
                    )
                })}
            </div>
        );
    };

    const getAccumulatedDependencies = (history: HistoryItem[], currentNode?: DecisionNode | DecisionLeaf | string | null) => {
        const deps: { tableName: string, query?: string, connectorId?: string, isPython?: boolean, pythonCode?: string, pythonOutputType?: string }[] = [];

        // Helper to add unique deps
        const addDep = (node: any) => {
            // Handle Python dependencies
            if (node && typeof node === 'object' && node.pythonCode && node.pythonResultName) {
                if (!deps.find(d => d.tableName === node.pythonResultName)) {
                    deps.push({
                        tableName: node.pythonResultName,
                        isPython: true,
                        pythonCode: node.pythonCode,
                        pythonOutputType: node.pythonOutputType || 'table',
                        connectorId: node.pythonConnectorId // 🔥 CRITICAL FIX: Propagate connector ID for HubSpot/API calls
                    });
                }
            }
            // Handle SQL dependencies
            if (node && typeof node === 'object' && node.sqlQuery && node.sqlResultName) {
                // Avoid duplicates
                if (!deps.find(d => d.tableName === node.sqlResultName)) {
                    deps.push({
                        tableName: node.sqlResultName,
                        query: node.sqlQuery,
                        connectorId: node.sqlConnectorId
                    });
                }
            }
        };

        // 1. Add from Stack (parent trees)
        treeStack.forEach(frame => {
            frame.path.forEach(node => addDep(node));
        });

        // 2. Add from current history
        history.forEach(node => addDep(node));

        // 3. Add current node itself IF it has deps (not needed for itself, but keeping logic consistent)
        // Actually, we need deps that come BEFORE the current query.

        return deps;
    };

    const renderLeafNode = (node: DecisionLeaf | string, index?: number) => {
        const decisionText = typeof node === 'string' ? node : node.decision;
        const isLeafObject = typeof node === 'object' && node !== null;

        // Calculate dependencies UP TO this node
        // In renderLeaf, 'node' IS the current node. We need ancestors.
        const dependencies = getAccumulatedDependencies(nodeHistory);

        return (
            <div key={index} className={cn("w-full mb-4", index !== undefined && "border-b pb-4 last:border-0 last:pb-0")}>
                <div className="relative w-full bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-start p-4 gap-4 transition-all hover:shadow-md hover:border-violet-300 dark:hover:border-violet-700">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                        {isExecutingTrigger ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Flag className="h-5 w-5" />
                        )}
                    </div>
                    <div className="flex-grow min-w-0">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-0.5 opacity-70">Decisione Finale</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{decisionText}</p>
                        {isLeafObject && renderAttachments(node)}
                        {isLeafObject && 'pythonCode' in node && (node as any).pythonCode && (
                            <PythonDataPreview
                                code={(node as any).pythonCode}
                                outputType={(node as any).pythonOutputType || 'table'}
                                selectedPipelines={(node as any).pythonSelectedPipelines}
                                pipelineDependencies={dependencies}
                                pythonConnectorId={(node as any).pythonConnectorId}
                                tableName={(node as any).pythonResultName}
                                initialTree={initialTree}
                                loadedSubTrees={loadedSubTrees}
                            />
                        )}
                        {isLeafObject && 'sqlConnectorId' in node && 'sqlQuery' in node && (node as any).sqlConnectorId && (
                            <SqlDataPreview
                                connectorId={(node as any).sqlConnectorId}
                                query={(node as any).sqlQuery}
                                pipelineDependencies={dependencies}
                                tableName={(node as any).sqlResultName}
                                selectedPipelines={(node as any).sqlSelectedPipelines}
                            />
                        )}
                    </div>
                </div>

                {treeStack.length > 0 && (
                    <Button onClick={() => completeSubTree(node as any)} className="mt-4 w-full sm:w-auto h-9 text-sm" variant="secondary">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Usa questo risultato
                    </Button>
                )}
            </div>
        );
    };

    return (
        <>
            <Card className="min-h-[300px] flex flex-col">
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-lg">Guida Interattiva</CardTitle>
                    <CardDescription className="text-xs">Rispondi alle domande per navigare nell'albero decisionale.</CardDescription>
                    {treeStack.length > 0 && (
                        <div className="text-[10px] text-muted-foreground pt-1 flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            <span>Sotto-albero: <strong>{currentTree.question}</strong></span>
                        </div>
                    )}
                </CardHeader>
                <CardContent className="flex-grow flex items-center justify-center p-2">
                    {isLoadingTree ? (
                        <div className="text-center p-2">
                            <Loader2 className="mx-auto h-6 w-6 text-primary animate-spin mb-2" />
                            <p className="text-sm text-muted-foreground">Caricamento...</p>
                        </div>
                    ) : Array.isArray(currentNode) ? (
                        <div className="text-center p-1 w-full space-y-1">
                            {currentNode.map((node, index) => {
                                // Check if this node came from a sub-tree
                                const subTreeSource = (node as any)._subTreeSource || (node as any).subTreeRef;
                                const subTreeData = subTreeSource ? loadedSubTrees.get(subTreeSource) : null;

                                // Direct decision node (string or object with 'decision')
                                if (typeof node === 'string' || (typeof node === 'object' && node !== null && 'decision' in node && !('ref' in node) && !('question' in node) && !('subTreeRef' in node))) {
                                    return (
                                        <div key={index} className="w-full">
                                            {subTreeData && (
                                                <div className="flex items-center gap-2 mb-2 px-1">
                                                    <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Da</span>
                                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{subTreeData.name}</span>
                                                </div>
                                            )}
                                            {renderLeafNode(node as DecisionLeaf | string, index)}
                                        </div>
                                    );
                                }

                                // Question node from sub-tree
                                if (typeof node === 'object' && node !== null && 'question' in node && 'options' in node) {
                                    return (
                                        <div key={index} className={cn("w-full mb-4", index !== undefined && "border-b pb-4 last:border-0 last:pb-0")}>
                                            <div className="relative w-full bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-start p-4 gap-4 transition-all hover:shadow-md hover:border-violet-300 dark:hover:border-violet-700">
                                                <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                                                    <GitBranch className="h-5 w-5" />
                                                </div>
                                                <div className="flex-grow min-w-0">
                                                    {subTreeData && (
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground opacity-70">Sotto-processo</span>
                                                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{subTreeData.name}</span>
                                                        </div>
                                                    )}
                                                    <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">{(node as DecisionNode).question}</p>
                                                    {renderAttachments(node as DecisionNode)}
                                                    {'pythonCode' in node && (node as any).pythonCode && (
                                                        <PythonDataPreview
                                                            code={(node as any).pythonCode}
                                                            outputType={(node as any).pythonOutputType || 'table'}
                                                            selectedPipelines={(node as any).pythonSelectedPipelines}
                                                            pipelineDependencies={getAccumulatedDependencies(nodeHistory)}
                                                            pythonConnectorId={(node as any).pythonConnectorId}
                                                            tableName={(node as any).pythonResultName}
                                                            initialTree={initialTree}
                                                            loadedSubTrees={loadedSubTrees}
                                                        />
                                                    )}
                                                    {'sqlConnectorId' in node && 'sqlQuery' in node && (node as any).sqlConnectorId && (
                                                        <SqlDataPreview
                                                            connectorId={(node as any).sqlConnectorId}
                                                            query={(node as any).sqlQuery}
                                                            pipelineDependencies={getAccumulatedDependencies(nodeHistory)}
                                                            tableName={(node as any).sqlResultName}
                                                            selectedPipelines={(node as any).sqlSelectedPipelines}
                                                        />
                                                    )}
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                                        {Object.entries((node as DecisionNode).options!).map(([key, value]) => (
                                                            <Button
                                                                key={key}
                                                                onClick={() => handleSubTreeOptionClick(value, subTreeSource, index)}
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-auto py-2 px-3 justify-start border-slate-200 hover:border-violet-300 hover:bg-violet-50 text-slate-700 hover:text-violet-900 group"
                                                            >
                                                                <div className="flex items-center gap-2 w-full">
                                                                    <div className="flex-shrink-0 w-6 h-6 rounded bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500 flex items-center justify-center group-hover:bg-violet-100 group-hover:text-violet-600 transition-colors">
                                                                        <Check className="h-4 w-4" />
                                                                    </div>
                                                                    <span className="font-medium text-left flex-1 whitespace-normal text-xs">{key}</span>
                                                                </div>
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                // Linked decision node (object with 'ref')
                                if (typeof node === 'object' && node !== null && 'ref' in node) {
                                    const targetId = (node as any).ref;
                                    // Resolve in the correct tree (sub-tree or main tree)
                                    const lookupTree = subTreeData ? subTreeData.tree : currentTree;
                                    const targetNode = findNodeById(lookupTree, targetId);

                                    if (targetNode) {
                                        // If target is a decision, render it
                                        if (typeof targetNode === 'string' || 'decision' in targetNode) {
                                            return (
                                                <div key={index} className="w-full">
                                                    {subTreeData && (
                                                        <div className="flex items-center gap-2 mb-2 px-1">
                                                            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Da</span>
                                                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{subTreeData.name}</span>
                                                        </div>
                                                    )}
                                                    {renderLeafNode(targetNode as DecisionLeaf | string, index)}
                                                </div>
                                            );
                                        }
                                    }
                                }

                                // Sub-Tree link node
                                if (typeof node === 'object' && node !== null && 'subTreeRef' in node) {
                                    const subTreeRef = (node as any).subTreeRef;
                                    const subTreeData = loadedSubTrees.get(subTreeRef);
                                    const isLoading = loadingSubTreeIds.has(subTreeRef);

                                    if (isLoading) {
                                        return (
                                            <div key={index} className={cn("text-center p-4 w-full mb-4", index !== undefined && "border-b pb-4 last:border-0 last:pb-0")}>
                                                <Loader2 className="mx-auto h-6 w-6 text-primary animate-spin mb-2" />
                                                <p className="text-sm text-muted-foreground">Caricamento Sotto-processo...</p>
                                            </div>
                                        );
                                    }

                                    if (!subTreeData) {
                                        return null;
                                    }

                                    const subTree = subTreeData.tree;

                                    return (
                                        <div key={index} className={cn("w-full mb-4", index !== undefined && "border-b pb-4 last:border-0 last:pb-0")}>
                                            <div className="relative w-full bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-start p-4 gap-4 transition-all hover:shadow-md hover:border-violet-300 dark:hover:border-violet-700">
                                                <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                                    <LinkIcon className="h-5 w-5" />
                                                </div>
                                                <div className="flex-grow min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground opacity-70">Sotto-processo</span>
                                                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{subTreeData.name}</span>
                                                    </div>

                                                    {/* Render sub-tree's root question inline */}
                                                    {typeof subTree === 'object' && 'question' in subTree && subTree.options ? (
                                                        <>
                                                            <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">{subTree.question}</p>
                                                            {renderAttachments(subTree)}
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                                                {Object.entries(subTree.options).map(([key, value]) => (
                                                                    <Button
                                                                        key={key}
                                                                        onClick={() => handleSubTreeOptionClick(value, subTreeRef, index)}
                                                                        variant="outline"
                                                                        size="sm"
                                                                        className="h-auto py-2 px-3 justify-start border-slate-200 hover:border-violet-300 hover:bg-violet-50 text-slate-700 hover:text-violet-900 group"
                                                                    >
                                                                        <div className="flex items-center gap-2 w-full">
                                                                            <div className="flex-shrink-0 w-6 h-6 rounded bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500 flex items-center justify-center group-hover:bg-violet-100 group-hover:text-violet-600 transition-colors">
                                                                                <Check className="h-4 w-4" />
                                                                            </div>
                                                                            <span className="font-medium text-left flex-1 whitespace-normal text-xs">{key}</span>
                                                                        </div>
                                                                    </Button>
                                                                ))}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <p className="text-muted-foreground text-sm">Il sotto-albero non contiene domande valide.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                return null;
                            })}

                            {treeStack.length > 0 && (
                                <Button onClick={returnToParentTree} className="mt-6">
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Torna all'Albero Precedente
                                </Button>
                            )}
                        </div>
                    ) : isDecision && nodeAsLeaf ? (
                        <div className="w-full">
                            {renderLeafNode(nodeAsLeaf)}
                            <div className="text-center">
                                {treeStack.length > 0 && (
                                    <Button onClick={returnToParentTree} className="mt-6">
                                        <ArrowLeft className="mr-2 h-4 w-4" />
                                        Torna all'Albero Precedente
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : isQuestion && 'options' in currentNode && currentNode.options ? (
                        <div className="w-full">
                            <div className="relative w-full bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-start p-4 gap-4 mb-6 transition-all hover:shadow-md hover:border-violet-300 dark:hover:border-violet-700">
                                <div className={cn("flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                                    nodeHistory.length === 0 ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                                )}>
                                    {nodeHistory.length === 0 ? <Play className="h-5 w-5 fill-current" /> : <GitBranch className="h-5 w-5" />}
                                </div>
                                <div className="flex-grow min-w-0">
                                    <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-0.5 opacity-70">
                                        {nodeHistory.length === 0 ? "Punto di Partenza" : "Domanda"}
                                    </p>
                                    <p className="text-xl font-medium text-slate-900 dark:text-slate-100 mb-2">{(currentNode as DecisionNode).question}</p>

                                    {rephrasedQuestion && (
                                        <Alert className="mb-4 bg-primary/10 border-primary/50">
                                            <Lightbulb className="h-4 w-4 text-primary" />
                                            <AlertTitle>Suggerimento</AlertTitle>
                                            <AlertDescription>
                                                {rephrasedQuestion}
                                            </AlertDescription>
                                        </Alert>
                                    )}

                                    {renderAttachments(currentNode as DecisionNode)}
                                    {'pythonCode' in currentNode && (currentNode as any).pythonCode && (
                                        <PythonDataPreview
                                            code={(currentNode as any).pythonCode}
                                            outputType={(currentNode as any).pythonOutputType || 'table'}
                                            selectedPipelines={(currentNode as any).pythonSelectedPipelines}
                                            pipelineDependencies={getAccumulatedDependencies(nodeHistory)}
                                            pythonConnectorId={(currentNode as any).pythonConnectorId}
                                            tableName={(currentNode as any).pythonResultName}
                                        />
                                    )}
                                    {'sqlConnectorId' in currentNode && 'sqlQuery' in currentNode && (currentNode as any).sqlConnectorId && (
                                        <SqlDataPreview
                                            connectorId={(currentNode as any).sqlConnectorId}
                                            query={(currentNode as any).sqlQuery}
                                            pipelineDependencies={getAccumulatedDependencies(nodeHistory)}
                                            tableName={(currentNode as any).sqlResultName}
                                            selectedPipelines={(currentNode as any).sqlSelectedPipelines}
                                        />
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                                {Object.entries((currentNode as DecisionNode).options!).map(([key, value]) => (
                                    <Button
                                        key={key}
                                        onClick={() => handleOptionClick(value)}
                                        variant="outline"
                                        size="lg"
                                        className="h-auto py-3 px-4 justify-start border-slate-200 hover:border-violet-300 hover:bg-violet-50 text-slate-700 hover:text-violet-900 group"
                                    >
                                        <div className="flex items-center gap-3 w-full">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-md bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500 flex items-center justify-center group-hover:bg-violet-100 group-hover:text-violet-600 transition-colors">
                                                <Check className="h-4 w-4" />
                                            </div>
                                            <span className="font-medium text-left flex-1 whitespace-normal">{key}</span>
                                        </div>
                                    </Button>
                                ))}
                            </div>
                            <div className="text-center mt-6">
                                <Button variant="ghost" size="sm" onClick={handleRephrase} disabled={rephrasing}>
                                    {rephrasing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                                    Riformula la Domanda
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center p-4">
                            <p className="text-lg text-muted-foreground">L'albero decisionale sembra avere un formato non valido in questo passaggio.</p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex justify-between border-t pt-6">
                    <Button variant="ghost" onClick={handleBack} disabled={nodeHistory.length === 0 && treeStack.length === 0}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Indietro
                    </Button>
                    <Button variant="outline" onClick={handleRestart}>
                        <RotateCcw className="mr-2 h-4 w-4" /> Riavvia
                    </Button>
                </CardFooter>
            </Card>

            {/* Media Preview Dialog */}
            <Dialog open={!!previewingMedia} onOpenChange={(open) => !open && setPreviewingMedia(null)}>
                <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{previewingMedia?.name || 'Anteprima Media'}</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 flex items-center justify-center bg-muted/50 rounded-md overflow-hidden">
                        {previewingMedia?.type === 'image' && (
                            <Image src={previewingMedia.url} alt={previewingMedia.name || 'Anteprima'} width={1000} height={800} style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
                        )}
                        {previewingMedia?.type === 'video' && (
                            <video src={previewingMedia.url} controls autoPlay className="w-full max-h-full" style={{ objectFit: 'contain' }} />
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPreviewingMedia(null)}>Chiudi</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
