

'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { DecisionNode, DecisionLeaf, MediaItem, LinkItem, TriggerItem, StoredTree, DecisionOptionChild } from '@/lib/types';
import { ArrowLeft, Brain, Eye, GitBranch, Lightbulb, Link as LinkIcon, Loader2, RotateCcw, Sparkles, Zap, Image as ImageIcon, Video, Flag, Play, Check, Mail, Paperclip } from 'lucide-react';
import {
    executeTriggerAction,
    getTreeAction,
    rephraseQuestionAction,
    resolveDependencyChainAction,
    resolveAncestorResourcesAction,
    executeSqlPreviewAction,
    executePythonPreviewAction,
    exportTableToSqlAction
} from '@/app/actions';
import { sendTestEmailWithDataAction, getConnectorsAction } from '@/app/actions/connectors';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import Image from 'next/image';
import Link from 'next/link';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '@/lib/utils';
import { DataTable } from '@/components/ui/data-table';
import { Database, Code, LineChart } from 'lucide-react';
// import { useFlowExecution } from '@/ai/flows/client-executor'; // Removed broken import
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useOpenRouterSettings } from '@/hooks/use-openrouter';

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
        dependencies: { tableName: string, query?: string, connectorId?: string, isPython?: boolean, pythonCode?: string, pythonOutputType?: string, isIgnored?: boolean }[],
        pythonConnectorId?: string,
        resultTableName?: string
    ) => {
        setIsExecuting(true);
        setError(null);
        setFinalResult(null);
        setAccumulatedData({});

        // Log current cache state
        console.log(`[Flow] 📦 Cache state at start: ${GLOBAL_EXECUTION_CACHE.size} entries`);

        // 1. Prepare steps - FILTER OUT ignored dependencies (words from comments, etc.)
        const validDependencies = dependencies.filter(d => !d.isIgnored);

        const initialSteps = validDependencies.map(d => ({
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

            // PRE-PROCESSING: Remove Python comments before extracting identifiers
            // This prevents words in comments from being detected as dependencies
            let cleanedCode = code
                // Remove triple-quoted strings (docstrings) - both ''' and """
                .replace(/'''[\s\S]*?'''/g, '')
                .replace(/"""[\s\S]*?"""/g, '')
                // Remove single-line comments starting with #
                .replace(/#.*$/gm, '')
                // Remove string literals to avoid matching words inside strings
                .replace(/'[^']*'/g, '""')
                .replace(/"[^"]*"/g, '""');

            // 1. Identify what variables are referenced but NOT in stableDeps
            const potentialVars = cleanedCode.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
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
            // Comprehensive list of Python keywords, builtins, methods, and common patterns to skip
            const PYTHON_SKIP_IDENTIFIERS = new Set([
                // Python keywords
                'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
                'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in',
                'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while',
                'with', 'yield', 'none', 'true', 'false',
                // Python builtins
                'abs', 'aiter', 'all', 'any', 'anext', 'ascii', 'bin', 'bool', 'breakpoint',
                'bytearray', 'bytes', 'callable', 'chr', 'classmethod', 'compile', 'complex',
                'delattr', 'dict', 'dir', 'divmod', 'enumerate', 'eval', 'exec', 'filter', 'float',
                'format', 'frozenset', 'getattr', 'globals', 'hasattr', 'hash', 'help', 'hex',
                'id', 'input', 'int', 'isinstance', 'issubclass', 'iter', 'len', 'list', 'locals',
                'map', 'max', 'memoryview', 'min', 'next', 'object', 'oct', 'open', 'ord', 'pow',
                'print', 'property', 'range', 'repr', 'reversed', 'round', 'set', 'setattr',
                'slice', 'sorted', 'staticmethod', 'str', 'sum', 'super', 'tuple', 'type', 'vars', 'zip',
                // Common exception names
                'exception', 'runtimeerror', 'valueerror', 'typeerror', 'keyerror', 'indexerror',
                'attributeerror', 'nameerror', 'filenotfounderror', 'ioerror', 'oserror',
                // Common methods and attributes
                'append', 'extend', 'insert', 'remove', 'pop', 'clear', 'index', 'count', 'sort',
                'reverse', 'copy', 'get', 'keys', 'values', 'items', 'update', 'setdefault',
                'split', 'join', 'strip', 'lstrip', 'rstrip', 'replace', 'find', 'rfind',
                'startswith', 'endswith', 'upper', 'lower', 'capitalize', 'title', 'isdigit',
                'isalpha', 'isalnum', 'isspace', 'encode', 'decode', 'format', 'read', 'write',
                'readline', 'readlines', 'writelines', 'close', 'flush', 'seek', 'tell',
                // Standard library modules (commonly used)
                'json', 'datetime', 'time', 'os', 'sys', 'math', 're', 'random', 'collections',
                'itertools', 'functools', 'operator', 'io', 'pathlib', 'urllib', 'http', 'ssl',
                'socket', 'email', 'html', 'xml', 'csv', 'hashlib', 'hmac', 'base64', 'struct',
                'copy', 'pickle', 'shelve', 'sqlite3', 'zlib', 'gzip', 'bz2', 'lzma', 'zipfile',
                'tarfile', 'tempfile', 'shutil', 'glob', 'fnmatch', 'linecache', 'tokenize',
                'logging', 'warnings', 'traceback', 'typing', 'dataclasses', 'contextlib',
                'threading', 'multiprocessing', 'subprocess', 'asyncio', 'concurrent',
                'request', 'parse', 'error', 'urlopen', 'urlencode',
                // Common variable patterns
                'self', 'cls', 'args', 'kwargs', 'result', 'data', 'response', 'resp', 'req',
                'url', 'params', 'headers', 'body', 'content', 'text', 'value', 'key', 'item',
                'name', 'path', 'file', 'line', 'row', 'col', 'rows', 'cols', 'idx', 'index',
                'i', 'j', 'k', 'n', 'm', 'x', 'y', 'z', 'a', 'b', 'c', 'd', 'e', 'f', 'v', 'w',
                'tmp', 'temp', 'buf', 'buffer', 'msg', 'message', 'err', 'error', 'ex',
                'ctx', 'context', 'config', 'cfg', 'settings', 'options', 'opts',
                'output', 'input', 'out', 'inp', 'src', 'dst', 'source', 'target', 'dest',
                'start', 'end', 'begin', 'stop', 'first', 'last', 'prev', 'next', 'cur', 'current',
                'count', 'total', 'size', 'length', 'width', 'height', 'depth', 'limit', 'offset',
                'timeout', 'delay', 'interval', 'period', 'duration', 'timestamp', 'date',
                'today', 'now', 'time', 'year', 'month', 'day', 'hour', 'minute', 'second',
                'chunks', 'batch', 'batches', 'chunk', 'block', 'blocks', 'parts', 'pieces',
                'loads', 'dumps', 'load', 'dump', 'reader', 'writer', 'parser', 'builder',
                'handler', 'callback', 'listener', 'observer', 'sender', 'receiver',
                'client', 'server', 'connection', 'conn', 'session', 'transaction', 'cursor',
                'query', 'queries', 'statement', 'command', 'action', 'event', 'signal',
                'token', 'tokens', 'auth', 'authorization', 'bearer', 'api', 'endpoint',
                'method', 'methods', 'func', 'function', 'functions', 'proc', 'procedure',
                'main', 'init', 'setup', 'teardown', 'run', 'execute', 'call', 'invoke',
                'create', 'update', 'delete', 'insert', 'select', 'fetch', 'save', 'load',
                'add', 'remove', 'set', 'get', 'put', 'post', 'patch', 'head', 'options',
                'environ', 'env', 'os', 'sys', 'platform', 'version', 'release', 'info',
                'fmt', 'format', 'template', 'pattern', 'regex', 'match', 'search', 'group',
                'fromisoformat', 'strftime', 'strptime', 'isoformat', 'utcnow', 'utc',
                'utf', 'ascii', 'latin', 'unicode', 'encoding', 'charset', 'codec',
                'http', 'https', 'ftp', 'smtp', 'imap', 'pop', 'ssh', 'tcp', 'udp', 'ip',
                'application', 'content', 'type', 'accept', 'header', 'cookie', 'cookies',
                // Common library-specific identifiers (hubspot, requests, etc.)
                'hubspot', 'hubapi', 'crm', 'deals', 'companies', 'contacts', 'properties',
                'paging', 'link', 'results', 'archived', 'associations', 'objects',
                'company', 'deal', 'contact', 'line_items', 'products', 'quotes',
                'dealname', 'dealstage', 'dealtype', 'amount', 'description', 'pipeline',
                'hs_forecast_probability', 'hs_deal_stage_probability', 'createdate',
                'consegna', 'data_consegna', 'campione', 'art14_trat', 'createdAt',
                'props', 'ids', 'inputs', 'outputs', 'status', 'state', 'code',
                'qty', 'quantity', 'price', 'unit', 'currency', 'discount',
                // Italian keywords commonly used in this codebase
                'nomi', 'aziende', 'prodotti', 'associati', 'quantita', 'descrizione',
                'codice', 'cliente', 'nome', 'inizio', 'fine', 'job', 'cols', 'commesse',
                'recupero', 'futuri', 'nessuna', 'trattativa', 'trovata', 'tempo', 'totale',
                'configurato', 'non', 'campione', 'consegna', 'oggi', 'ieri', 'domani',
                // Common words
                'com', 'using', 'per', 'cached', 'quantities', 'files', 'result', 'props',
                'copy', 'input', 'output', 'value', 'key', 'index', 'count', 'total',
                // Class-like names commonly used
                'Convert', 'Build', 'Extract', 'Batch', 'Client', 'Service', 'Model',
                'Context', 'Session', 'Request', 'Response', 'Query', 'Mutation',
                // Data science libraries
                'pandas', 'pd', 'numpy', 'np', 'matplotlib', 'plt', 'seaborn', 'sns',
                'plotly', 'go', 'px', 'scipy', 'sklearn', 'tensorflow', 'tf', 'keras',
                'torch', 'cv2', 'PIL', 'openpyxl', 'xlrd', 'xlwt', 'requests',
                'beautifulsoup', 'bs4', 'lxml', 'selenium', 'scrapy',
                'df', 'dataframe', 'series', 'figure', 'ax', 'axes', 'fig', 'plot',
                'subplot', 'subplots', 'show', 'savefig', 'legend', 'xlabel', 'ylabel',
                'title', 'grid', 'scatter', 'bar', 'hist', 'pie', 'boxplot', 'heatmap',
                'express', 'graph_objects', 'make_subplots', 'iplot', 'offline',
                // DataFrame methods
                'iloc', 'loc', 'head', 'tail', 'describe', 'info', 'shape', 'columns',
                'dtypes', 'astype', 'fillna', 'dropna', 'isna', 'isnull', 'notnull',
                'groupby', 'agg', 'aggregate', 'merge', 'concat', 'pivot', 'melt',
                'apply', 'map', 'transform', 'rolling', 'resample', 'shift', 'diff',
                'to_csv', 'to_excel', 'to_json', 'to_sql', 'to_dict', 'to_list',
                'read_csv', 'read_excel', 'read_json', 'read_sql', 'read_html',
                // Common pandas/numpy identifiers
                'axis', 'inplace', 'ascending', 'how', 'left', 'right', 'inner', 'outer',
                'nan', 'inf', 'dtype', 'ndarray', 'array', 'matrix', 'zeros', 'ones',
                'empty', 'full', 'arange', 'linspace', 'meshgrid', 'reshape', 'flatten',
                'transpose', 'dot', 'cross', 'mean', 'std', 'var', 'median', 'mode',
                'percentile', 'quantile', 'cumsum', 'cumprod', 'argmax', 'argmin',
                'where', 'clip', 'abs', 'sqrt', 'exp', 'log', 'sin', 'cos', 'tan',
                // Standard libraries & Common words
                'json', 'math', 'time', 'datetime', 'random', 're', 'os', 'sys',
                'subprocess', 'shutil', 'glob', 'pickle', 'copy', 'itertools',
                'functools', 'collections', 'operator', 'typing', 'enum', 'uuid',
                'createdAt', 'names', 'Convert', 'cid', 'assoc', 'Build', 'Extract', 'dati', 'dayfirst',
                'errors', 'coerce', 'subset', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
                'reparti', 'reparto', 'passato', 'futuro', 'step', 'lines', 'Raggruppa', 'color', 'conta', 'rgb',
                'mese', 'Capacit', 'Crea', 'showlegend', 'grafico', 'violet', 'istogramma', 'fill', 'sovrapposto',
                'tozeroy', 'Aggiungi', 'fillcolor', 'barre', 'rgba', 'Mago', 'Lavorate', 'green', 'stra', 'opacity',
                'markers', 'blue', 'red', 'Personalizza', 'marker', 'layout', 'Straord', 'Confronto', 'dash',
                'Mese', 'Previste', 'Mesi', 'solid', 'Numero', 'gray', 'barmode', 'automargin', 'Mostra', 'denom',
                'affiancate', 'textposition', 'inside', 'insidetextanchor', 'middle', 'textangle', 'textfont',
                'white', 'black', 'emerald', 'xanchor', 'center', 'yanchor', 'top', 'font', 'margin', 'hovermode',
                'unified', 'annotations', 'matches', 'showticklabels', 'showline', 'linecolor', 'mirror', 'dtick',
                'category', 'normalize', 'rename', 'unique', 'pair', 'Analisi', 'Mensile', 'util',
                'HUBSPOT_TOKEN', 'hubspot_token',
                // Python script configuration constants (from GraficoTest chart code)
                'CONFIGURAZIONE', 'SHOW_AREAS', 'MOLTIPLICATORE', 'PIXEL_PER_UNIT', 'MIN_HEIGHT_PX',
                'GAP_PX', 'DASH_FITTO', 'Utilizzo', 'CAPACITA', 'ORE_LAVORATE', 'CAPACITA_NETTA',
                'ORE_LAVORATE_NET', 'CAPACITA_NETTA_NET', 'GIORNO', 'MESE_STR', 'HYBRID_WORK',
                'HYBRID_NET', 'ORE_STRAORD', 'CALCOLO', 'ALTEZZE', 'BAR_FONT', 'TRACCE', 'LINEE',
                'SCALINI', 'NET', 'MENSILI', 'STYLE', 'TITOLO', 'ALTO', 'PRESENZE', 'MINUTI', 'Prepara'
            ].map(s => s.toLowerCase()));

            for (const varName of missing) {
                // console.log(`[PythonDataPreview] 🕵️ checking var: "${varName}"`);

                // === PATTERN-BASED FILTERING (before skip list) ===
                // Skip anything starting with underscore (private/internal names)
                if (varName.startsWith('_')) {
                    // console.log(`[PythonDataPreview] ⏭️ Skipping "${varName}" (starts with _)`);
                    continue;
                }
                // Skip snake_case with underscores (Python variable naming convention)
                if (varName.includes('_') && varName === varName.toLowerCase()) {
                    // console.log(`[PythonDataPreview] ⏭️ Skipping "${varName}" (snake_case internal)`);
                    continue;
                }
                // Skip very short identifiers (1-2 chars) - these are loop variables, etc.
                if (varName.length <= 2) {
                    // console.log(`[PythonDataPreview] ⏭️ Skipping "${varName}" (too short)`);
                    continue;
                }
                // Skip identifiers ending with common suffixes that indicate variables
                if (/(_id|_ids|_data|_list|_name|_names|_date|_size|_count|_props|_items|_batch)$/i.test(varName)) {
                    // console.log(`[PythonDataPreview] ⏭️ Skipping "${varName}" (common suffix)`);
                    continue;
                }
                // Skip identifiers starting with common prefixes
                if (/^(get_|set_|fetch_|create_|delete_|update_|is_|has_|can_|all_|next_|prev_|first_|last_)/i.test(varName)) {
                    // console.log(`[PythonDataPreview] ⏭️ Skipping "${varName}" (common prefix)`);
                    continue;
                }

                // === Skip Python keywords, builtins, methods, and common patterns ===
                if (PYTHON_SKIP_IDENTIFIERS.has(varName.toLowerCase())) {
                    // console.log(`[PythonDataPreview] ⏭️ Skipping "${varName}" (in SKIP list)`);
                    continue;
                }

                try {
                    console.log(`[PythonDataPreview] 🌍 Creating server request for missing dependency chain: ${varName}`);
                    const result = await resolveDependencyChainAction(varName); // Call Server Action (Recursive Chain)

                    if (result.data && Array.isArray(result.data)) {
                        console.log(`[PythonDataPreview] ✅ Server found chain of ${result.data.length} nodes for: ${varName}`);

                        // Add ALL returned nodes as dependencies
                        for (const node of result.data) {
                            const resultName = node.pythonResultName || node.sqlResultName || '';
                            const isTarget = resultName.toLowerCase() === varName.toLowerCase();
                            const finalTableName = isTarget ? varName : (resultName || varName);

                            // Avoid adding duplicates if multiple chains return same node
                            // Check against newDeps too
                            const alreadyAdded = newDeps.some(d => d.tableName === finalTableName);
                            const alreadyStable = stableDeps.some(d => d.tableName === finalTableName);
                            const alreadyAsync = asyncDeps.some(d => d.tableName === finalTableName);

                            if (alreadyAdded || alreadyStable || alreadyAsync) continue;

                            if ('sqlQuery' in node) {
                                newDeps.push({
                                    tableName: finalTableName, // Use matched casing or fallback
                                    query: (node as any).sqlQuery,
                                    connectorId: (node as any).sqlConnectorId
                                });
                            } else if ('pythonCode' in node) {
                                newDeps.push({
                                    tableName: finalTableName,
                                    isPython: true,
                                    pythonCode: (node as any).pythonCode,
                                    pythonOutputType: (node as any).pythonOutputType || 'table',
                                    pythonConnectorId: (node as any).pythonConnectorId // Fix: Ensure this is mapped!
                                });
                            }
                        }
                    } else {
                        // Mark as failed/ignored so we don't try again
                        console.warn(`[PythonDataPreview] Server returned error for ${varName}: ${result.error || 'Not found'}. Marking as ignored.`);
                        newDeps.push({
                            tableName: varName,
                            isIgnored: true // New flag to indicate this isn't a real dependency
                        });
                    }
                } catch (e) {
                    console.warn(`[PythonDataPreview] Failed to resolve ${varName} on server`, e);
                    // Mark as ignored on error too
                    newDeps.push({
                        tableName: varName,
                        isIgnored: true
                    });
                }
            }

            if (mounted && newDeps.length > 0) {
                console.log(`[PythonDataPreview] 📥 Adding new async deps (valid+ignored):`, newDeps.map(d => d.tableName));
                setAsyncDeps(prev => [...prev, ...newDeps]);
            }
            if (mounted) setIsResolving(false);
        };

        console.log(`[PythonDataPreview] 🔍 Resolve Effect Triggered. Deps: Stable=${stableDeps.length}, Async=${asyncDeps.length}. AsyncVars: ${asyncDeps.map(d => d.tableName).join(',')}`);
        resolveMissing();

        return () => { mounted = false; };
    }, [code, stableDeps.length, asyncDeps.length]); // Fix: Add asyncDeps.length to re-trigger if needed, but the logic handles it. Actually better not to dependency loop. Keeping usage safe.


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
                    <div className="p-4 text-sm text-destructive bg-destructive/10">
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
                                        srcDoc={`<html><head><style>body{margin:0;padding:0;background:transparent;overflow:auto;}</style></head><body>${finalResult.chartHtml}</body></html>`}
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

// SQL Export Box Component - Interactive export UI with Pipeline Execution
function SqlExportBox({
    sqlExportAction,
    pipelineDependencies,
    currentNode
}: {
    sqlExportAction: { sourceTables: string[], targetConnectorId: string, targetTableName: string },
    pipelineDependencies: any[],
    currentNode: any
}) {
    const { toast } = useToast();
    const [exportStatus, setExportStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [rowsInserted, setRowsInserted] = useState<number | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);
    const [hasAutoExecuted, setHasAutoExecuted] = useState(false);

    // Use the flow execution hook for dependency pipeline
    const {
        steps,
        currentStepIndex,
        isExecuting: isPipelineExecuting,
        finalResult,
        error: pipelineError,
        executeFlow
    } = useFlowExecution();

    // Build the dependencies list for the source tables
    const sourceDeps = useMemo(() => {
        const { sourceTables } = sqlExportAction;
        const deps: any[] = [];

        for (const tableName of sourceTables) {
            // Check current node
            if ((currentNode as any)?.sqlResultName === tableName && (currentNode as any)?.sqlQuery) {
                deps.push({
                    tableName,
                    query: (currentNode as any).sqlQuery,
                    connectorId: (currentNode as any).sqlConnectorId
                });
            } else if ((currentNode as any)?.pythonResultName === tableName && (currentNode as any)?.pythonCode) {
                deps.push({
                    tableName,
                    isPython: true,
                    pythonCode: (currentNode as any).pythonCode,
                    pythonOutputType: (currentNode as any).pythonOutputType || 'table',
                    connectorId: (currentNode as any).pythonConnectorId
                });
            } else {
                // Find in pipeline dependencies
                const dep = pipelineDependencies.find(d => d.tableName === tableName);
                if (dep) {
                    deps.push(dep);
                }
            }
        }

        return deps;
    }, [sqlExportAction.sourceTables, currentNode, pipelineDependencies]);

    // 🌍 Async Dependency Resolution for missing source tables (from linked nodes)
    const [asyncResolvedDeps, setAsyncResolvedDeps] = useState<any[]>([]);
    const [isResolvingDeps, setIsResolvingDeps] = useState(false);

    useEffect(() => {
        let mounted = true;
        const resolveMissingDeps = async () => {
            const { sourceTables } = sqlExportAction;

            // Check which source tables are missing from pipelineDependencies
            const existingNames = new Set([
                ...pipelineDependencies.map(d => d.tableName.toLowerCase()),
                ...asyncResolvedDeps.map(d => d.tableName.toLowerCase())
            ]);

            const missingTables = sourceTables.filter(t => {
                // Not in current node
                if ((currentNode as any)?.sqlResultName === t) return false;
                if ((currentNode as any)?.pythonResultName === t) return false;
                // Not in existing deps
                return !existingNames.has(t.toLowerCase());
            });

            if (missingTables.length === 0) return;

            console.log(`[SqlExportBox] 🌍 Resolving missing source tables: ${missingTables.join(', ')}`);
            setIsResolvingDeps(true);

            const newDeps: any[] = [];

            for (const tableName of missingTables) {
                try {
                    console.log(`[SqlExportBox] 🌍 Fetching dependency chain for: ${tableName}`);
                    const result = await resolveDependencyChainAction(tableName);

                    if (result.data && Array.isArray(result.data)) {
                        console.log(`[SqlExportBox] ✅ Server found chain of ${result.data.length} nodes for: ${tableName}`);

                        for (const node of result.data) {
                            const nodeTableName = node.pythonResultName || node.sqlResultName;

                            // Skip if already added
                            if (newDeps.some(d => d.tableName === nodeTableName)) continue;
                            if (pipelineDependencies.some(d => d.tableName === nodeTableName)) continue;
                            if (asyncResolvedDeps.some(d => d.tableName === nodeTableName)) continue;

                            if ('sqlQuery' in node) {
                                newDeps.push({
                                    tableName: node.sqlResultName,
                                    query: node.sqlQuery,
                                    connectorId: node.sqlConnectorId
                                });
                            } else if ('pythonCode' in node) {
                                newDeps.push({
                                    tableName: node.pythonResultName,
                                    isPython: true,
                                    pythonCode: node.pythonCode,
                                    pythonOutputType: node.pythonOutputType || 'table',
                                    connectorId: node.pythonConnectorId
                                });
                            }
                        }
                    } else if (result.error) {
                        console.warn(`[SqlExportBox] Server returned error for ${tableName}: ${result.error}`);
                    }
                } catch (e) {
                    console.warn(`[SqlExportBox] Failed to resolve ${tableName}`, e);
                }
            }

            if (mounted && newDeps.length > 0) {
                console.log(`[SqlExportBox] ✅ Resolved ${newDeps.length} missing dependencies: ${newDeps.map(d => d.tableName).join(', ')}`);
                setAsyncResolvedDeps(prev => [...prev, ...newDeps]);
            }
            if (mounted) setIsResolvingDeps(false);
        };

        resolveMissingDeps();

        return () => { mounted = false; };
    }, [sqlExportAction.sourceTables, pipelineDependencies.length, asyncResolvedDeps.length, currentNode]);

    // Build full dependency chain (ancestors + source + async resolved)
    const fullDependencyChain = useMemo(() => {
        // Include all pipeline dependencies as ancestors, plus the source deps, plus async resolved
        const allDeps = [...pipelineDependencies, ...asyncResolvedDeps];

        // Add source deps that aren't already in allDeps
        for (const srcDep of sourceDeps) {
            if (!allDeps.find(d => d.tableName === srcDep.tableName)) {
                allDeps.push(srcDep);
            }
        }

        // Deduplicate
        return allDeps.filter((v, i, a) => a.findIndex(t => t.tableName === v.tableName) === i);
    }, [pipelineDependencies, sourceDeps, asyncResolvedDeps]);

    // Execute the pipeline and then export
    const handleExport = useCallback(async () => {
        console.log('[SqlExportBox] 🚀 Starting pipeline execution for export...');
        setExportStatus('running');
        setExportError(null);
        setRowsInserted(null);

        try {
            const { sourceTables, targetConnectorId, targetTableName } = sqlExportAction;

            // Try to find the source dependency definition
            // First look in our specific sourceDeps, then in the full chain (which includes async resolved)
            let mainSourceDep = sourceDeps.find(d => sourceTables.includes(d.tableName));

            if (!mainSourceDep) {
                // Fallback: look in fullDependencyChain
                mainSourceDep = fullDependencyChain.find(d => sourceTables.includes(d.tableName));
            }

            if (!mainSourceDep) {
                // Wait... if we are here, maybe we are still resolving?
                // But auto-execute logic should prevent this.
                // If manual click, we might be here too early if resolution failed.
                console.error('[SqlExportBox] Source deps:', sourceDeps);
                console.error('[SqlExportBox] Full chain:', fullDependencyChain);
                throw new Error(`Nessuna tabella sorgente trovata (${sourceTables.join(', ')})`);
            }

            // Get the ancestors (all deps except the main source)
            const ancestors = fullDependencyChain.filter(d => d.tableName !== mainSourceDep.tableName);

            console.log(`[SqlExportBox] 📦 Dependencies: ${ancestors.map(d => d.tableName).join(' → ')} → ${mainSourceDep.tableName}`);

            // Execute the flow to get the source data
            let sourceData: any[] = [];

            // Execute all dependencies first using executeSqlPreviewAction or executePythonPreviewAction
            // This will use/populate the global cache
            if (mainSourceDep.isPython && mainSourceDep.pythonCode) {
                console.log(`[SqlExportBox] 🐍 Executing Python: ${mainSourceDep.tableName}`);
                const res = await executePythonPreviewAction(
                    mainSourceDep.pythonCode,
                    mainSourceDep.pythonOutputType || 'table',
                    {}, // Pre-seeded data handled by deps
                    ancestors.map(d => ({
                        tableName: d.tableName,
                        query: d.query,
                        isPython: d.isPython,
                        pythonCode: d.pythonCode,
                        connectorId: d.connectorId
                    })),
                    mainSourceDep.connectorId
                );
                if (res.success && Array.isArray(res.data)) {
                    sourceData = res.data;
                } else {
                    throw new Error(res.error || `Errore esecuzione Python per ${mainSourceDep.tableName}`);
                }
            } else if (mainSourceDep.query) {
                console.log(`[SqlExportBox] 🗄️ Executing SQL: ${mainSourceDep.tableName}`);
                const res = await executeSqlPreviewAction(
                    mainSourceDep.query,
                    mainSourceDep.connectorId || '',
                    ancestors
                );
                if (res.data) {
                    sourceData = res.data;
                } else {
                    throw new Error(res.error || `Errore esecuzione SQL per ${mainSourceDep.tableName}`);
                }
            }

            if (sourceData.length === 0) {
                throw new Error('Nessun dato disponibile per l\'export.');
            }

            console.log(`[SqlExportBox] 📊 Got ${sourceData.length} rows, exporting to ${targetTableName}...`);

            // Execute the export
            const result = await exportTableToSqlAction(targetConnectorId, targetTableName, sourceData, true);

            if (result.success) {
                setExportStatus('success');
                setRowsInserted(result.rowsInserted || 0);
                toast({ title: "Export SQL Completato", description: `${result.rowsInserted} righe inserite in ${targetTableName}` });
            } else {
                throw new Error(result.error || 'Errore sconosciuto');
            }
        } catch (e: any) {
            console.error('[SqlExportBox] Export failed:', e);
            setExportStatus('error');
            setExportError(e.message);
            toast({ variant: 'destructive', title: "Errore Export", description: e.message });
        }
    }, [sqlExportAction, sourceDeps, fullDependencyChain, toast]);

    // 🚀 AUTO-EXECUTE: Wait for source data to be cached, then execute
    useEffect(() => {
        if (hasAutoExecuted) return;
        if (exportStatus !== 'idle') return;
        // Wait for async dependency resolution to complete first
        if (isResolvingDeps) {
            console.log('[SqlExportBox] ⏳ Waiting for dependency resolution...');
            return;
        }

        const { sourceTables } = sqlExportAction;

        // Function to check if ALL source tables are either in cache OR in fullDependencyChain
        const checkSourceDataReady = (): boolean => {
            for (const tableName of sourceTables) {
                // First check if it's in our resolved dependency chain
                const hasInDeps = fullDependencyChain.some(d => d.tableName.toLowerCase() === tableName.toLowerCase());
                if (hasInDeps) {
                    console.log(`[SqlExportBox] ✅ "${tableName}" found in dependency chain`);
                    continue;
                }

                // Then check cache
                let found = false;
                for (const [key] of GLOBAL_EXECUTION_CACHE.entries()) {
                    if (key.includes(`::${tableName}::`)) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    console.log(`[SqlExportBox] ⏳ Waiting for "${tableName}" to be cached or resolved...`);
                    return false;
                }
            }
            console.log(`[SqlExportBox] ✅ All source tables ready: ${sourceTables.join(', ')}`);
            return true;
        };

        // Execute if dependencies are resolved (either in chain or timeout)
        const executeIfReady = () => {
            if (fullDependencyChain.length > 0 || checkSourceDataReady()) {
                if (!hasAutoExecuted && exportStatus === 'idle') {
                    console.log('[SqlExportBox] 🚀 Dependencies resolved, auto-executing export...');
                    setHasAutoExecuted(true);
                    handleExport();
                    return true;
                }
            }
            return false;
        };

        // Try immediately
        if (executeIfReady()) return;

        // Poll for cache/deps availability
        let pollCount = 0;
        const maxPolls = 30; // Max 60 seconds (30 * 2000ms)

        const pollInterval = setInterval(() => {
            pollCount++;

            if (executeIfReady()) {
                clearInterval(pollInterval);
            } else if (pollCount >= maxPolls) {
                console.warn('[SqlExportBox] ⚠️ Timeout waiting for dependencies, executing anyway...');
                clearInterval(pollInterval);
                if (!hasAutoExecuted && exportStatus === 'idle') {
                    setHasAutoExecuted(true);
                    handleExport();
                }
            }
        }, 2000);

        return () => clearInterval(pollInterval);
    }, [hasAutoExecuted, exportStatus, sqlExportAction.sourceTables, handleExport, isResolvingDeps, fullDependencyChain]);

    // Build steps for visualization
    const visualSteps = useMemo(() => {
        const depSteps: { name: string, type: 'sql' | 'python', status: 'pending' | 'running' | 'done' | 'error' | 'cached' }[] = fullDependencyChain.map(d => ({
            name: d.tableName,
            type: (d.isPython ? 'python' : 'sql') as 'sql' | 'python',
            status: 'cached' as const // We assume ancestors are cached or will be executed
        }));

        // Add the export step
        depSteps.push({
            name: `Export → ${sqlExportAction.targetTableName}`,
            type: 'sql' as const,
            status: exportStatus === 'running' ? 'running' :
                exportStatus === 'success' ? 'done' :
                    exportStatus === 'error' ? 'error' : 'pending'
        });

        return depSteps;
    }, [fullDependencyChain, sqlExportAction.targetTableName, exportStatus]);

    return (
        <div className="mt-4 border rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
            <div className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 px-4 py-3 border-b flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
                    <Database className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">Esporta in Database SQL</p>
                    <p className="text-xs text-muted-foreground">
                        Tabella destinazione: <code className="font-mono bg-muted px-1 rounded">{sqlExportAction.targetTableName}</code>
                    </p>
                </div>
            </div>

            <div className="p-4 space-y-3">
                {/* Pipeline Visualization */}
                <HierarchyVisualizer
                    steps={visualSteps}
                    currentStepIndex={visualSteps.length - 1}
                    isExecuting={exportStatus === 'running'}
                />

                {/* Execute Button */}
                <Button
                    className="w-full"
                    variant={exportStatus === 'success' ? 'outline' : 'default'}
                    disabled={exportStatus === 'running'}
                    onClick={handleExport}
                >
                    {exportStatus === 'running' ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Esecuzione pipeline in corso...
                        </>
                    ) : exportStatus === 'success' ? (
                        <>
                            <Check className="mr-2 h-4 w-4 text-emerald-600" />
                            Esporta di nuovo
                        </>
                    ) : (
                        <>
                            <Database className="mr-2 h-4 w-4" />
                            Ri-esegui Export
                        </>
                    )}
                </Button>

                {/* Result */}
                {exportStatus === 'success' && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                        <Check className="h-5 w-5 text-emerald-600" />
                        <span className="text-sm text-emerald-700 dark:text-emerald-300">
                            ✅ {rowsInserted} righe inserite in <code className="font-mono">{sqlExportAction.targetTableName}</code>
                        </span>
                    </div>
                )}
                {exportStatus === 'error' && exportError && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
                        <Database className="h-5 w-5 text-destructive" />
                        <span className="text-sm text-destructive">{exportError}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// Email Action Box Component - Interactive email UI with Pipeline Execution
function EmailActionBox({
    emailAction,
    pipelineDependencies,
    currentNode,
    initialTree,
    loadedSubTrees,
    availableMedia,
    availableLinks,
    availableTriggers
}: {
    emailAction: {
        enabled: boolean;
        connectorId: string;
        to: string;
        cc?: string;
        bcc?: string;
        subject: string;
        body: string;
        attachments?: {
            tablesInBody?: string[];
            tablesAsExcel?: string[];
            pythonOutputsInBody?: string[];
            pythonOutputsAsAttachment?: string[];
            mediaAsAttachment?: string[];
        };
    };
    pipelineDependencies: any[];
    currentNode: any;
    initialTree?: DecisionNode | null;
    loadedSubTrees?: Map<string, { tree: DecisionNode, name: string }>;
    availableMedia?: MediaItem[];
    availableLinks?: LinkItem[];
    availableTriggers?: TriggerItem[];
}) {
    const { toast } = useToast();
    const [emailStatus, setEmailStatus] = useState<'idle' | 'resolving' | 'sending' | 'success' | 'error'>('idle');
    const [emailError, setEmailError] = useState<string | null>(null);
    const [hasAutoExecuted, setHasAutoExecuted] = useState(false);
    const executionRef = useRef(false); // Fix: Use ref for synchronous check to prevent double-firing

    // Async dependency resolution (same pattern as SqlExportBox)
    const [asyncResolvedDeps, setAsyncResolvedDeps] = useState<any[]>([]);
    const [isResolvingDeps, setIsResolvingDeps] = useState(false);

    // State for resolved ancestor resources from linked nodes
    const [resolvedAncestorResources, setResolvedAncestorResources] = useState<{
        media: MediaItem[],
        links: LinkItem[],
        triggers: TriggerItem[]
    } | null>(null);

    // State for resolving SMTP connector if missing
    const [resolvedSmtpConnectorId, setResolvedSmtpConnectorId] = useState<string | null>(null);

    // Resolve ancestor resources when currentNode has an ID (indicating it may be a linked node)
    useEffect(() => {
        let mounted = true;
        const resolveAncestorResources = async () => {
            const nodeId = (currentNode as any)?.id;
            if (!nodeId) return;

            console.log(`[EmailActionBox] 📎 Resolving ancestor resources for node ID: ${nodeId}`);

            try {
                const result = await resolveAncestorResourcesAction(nodeId);
                if (mounted && result.data) {
                    console.log(`[EmailActionBox] ✅ Resolved ancestor resources: ${result.data.media?.length || 0} media, ${result.data.links?.length || 0} links, ${result.data.triggers?.length || 0} triggers`);
                    setResolvedAncestorResources(result.data as any);
                }
            } catch (e) {
                console.warn('[EmailActionBox] Failed to resolve ancestor resources:', e);
            }
        };

        resolveAncestorResources();
        return () => { mounted = false; };
    }, [(currentNode as any)?.id]);

    // Combine provided resources with resolved ancestor resources
    const effectiveMedia = useMemo(() => {
        const combined = [...(availableMedia || [])];
        if (resolvedAncestorResources?.media) {
            resolvedAncestorResources.media.forEach(m => {
                if (!combined.some(existing => existing.url === m.url)) {
                    combined.push(m);
                }
            });
        }
        return combined;
    }, [availableMedia, resolvedAncestorResources]);

    const effectiveLinks = useMemo(() => {
        const combined = [...(availableLinks || [])];
        if (resolvedAncestorResources?.links) {
            resolvedAncestorResources.links.forEach(l => {
                if (!combined.some(existing => existing.name === l.name)) {
                    combined.push(l);
                }
            });
        }
        return combined;
    }, [availableLinks, resolvedAncestorResources]);

    const effectiveTriggers = useMemo(() => {
        const combined = [...(availableTriggers || [])];
        if (resolvedAncestorResources?.triggers) {
            resolvedAncestorResources.triggers.forEach(t => {
                if (!combined.some(existing => existing.name === t.name)) {
                    combined.push(t);
                }
            });
        }
        return combined;
    }, [availableTriggers, resolvedAncestorResources]);

    // Collect all required tables from attachments config
    const requiredTables = useMemo(() => {
        const tables: string[] = [];
        if (emailAction.attachments?.tablesInBody) tables.push(...emailAction.attachments.tablesInBody);
        if (emailAction.attachments?.tablesAsExcel) tables.push(...emailAction.attachments.tablesAsExcel);
        if (emailAction.attachments?.pythonOutputsInBody) tables.push(...emailAction.attachments.pythonOutputsInBody);
        if (emailAction.attachments?.pythonOutputsAsAttachment) tables.push(...emailAction.attachments.pythonOutputsAsAttachment);
        return [...new Set(tables)];
    }, [emailAction.attachments]);

    // Full dependency chain (pipelineDependencies + async resolved)
    const fullDependencyChain = useMemo(() => {
        const allDeps = [...pipelineDependencies, ...asyncResolvedDeps];
        return allDeps.filter((v, i, a) => a.findIndex(t => t.tableName === v.tableName) === i);
    }, [pipelineDependencies, asyncResolvedDeps]);

    // Resolve missing dependencies on mount
    useEffect(() => {
        let mounted = true;
        const resolveMissingDeps = async () => {
            const existingNames = new Set([
                ...pipelineDependencies.map(d => d.tableName.toLowerCase()),
                ...asyncResolvedDeps.map(d => d.tableName.toLowerCase())
            ]);

            const missingTables = requiredTables.filter(t => {
                if ((currentNode as any)?.sqlResultName?.toLowerCase() === t.toLowerCase()) return false;
                if ((currentNode as any)?.pythonResultName?.toLowerCase() === t.toLowerCase()) return false;
                return !existingNames.has(t.toLowerCase());
            });

            if (missingTables.length === 0) return;

            console.log(`[EmailActionBox] 🌍 Resolving missing tables: ${missingTables.join(', ')}`);
            setIsResolvingDeps(true);

            const newDeps: any[] = [];

            for (const tableName of missingTables) {
                try {
                    console.log(`[EmailActionBox] 🌍 Fetching dependency chain for: ${tableName}`);
                    const result = await resolveDependencyChainAction(tableName);

                    if (result.data && Array.isArray(result.data)) {
                        console.log(`[EmailActionBox] ✅ Server found chain of ${result.data.length} nodes for: ${tableName}`);

                        for (const node of result.data) {
                            const nodeTableName = node.pythonResultName || node.sqlResultName;
                            if (newDeps.some(d => d.tableName === nodeTableName)) continue;
                            if (pipelineDependencies.some(d => d.tableName === nodeTableName)) continue;
                            if (asyncResolvedDeps.some(d => d.tableName === nodeTableName)) continue;

                            if ('sqlQuery' in node) {
                                newDeps.push({
                                    tableName: node.sqlResultName,
                                    query: node.sqlQuery,
                                    connectorId: node.sqlConnectorId
                                });
                            } else if ('pythonCode' in node) {
                                newDeps.push({
                                    tableName: node.pythonResultName,
                                    isPython: true,
                                    pythonCode: node.pythonCode,
                                    pythonOutputType: node.pythonOutputType || 'table',
                                    connectorId: node.pythonConnectorId
                                });
                            }
                        }
                    } else if (result.error) {
                        console.warn(`[EmailActionBox] Server returned error for ${tableName}: ${result.error}`);
                    }
                } catch (e) {
                    console.warn(`[EmailActionBox] Failed to resolve ${tableName}`, e);
                }
            }

            if (mounted && newDeps.length > 0) {
                console.log(`[EmailActionBox] ✅ Resolved ${newDeps.length} missing dependencies`);
                setAsyncResolvedDeps(prev => [...prev, ...newDeps]);
            }
            if (mounted) setIsResolvingDeps(false);
        };

        resolveMissingDeps();
        return () => { mounted = false; };
    }, [requiredTables, pipelineDependencies, asyncResolvedDeps, currentNode]);



    // Resolve SMTP Connector if missing
    useEffect(() => {
        let mounted = true;
        const resolveSmtp = async () => {
            // If we already have a functional connectorId from props, or already resolved one, do nothing (unless it failed?)
            if (emailAction.connectorId && !resolvedSmtpConnectorId) return;
            if (resolvedSmtpConnectorId) return;

            console.log('[EmailActionBox] 🔍 ConnectorId is missing or invalid. Attempting to find a default SMTP connector...');

            try {
                const result = await getConnectorsAction();
                if (mounted && result.data) {
                    const smtpConnectors = result.data.filter((c: any) => c.type === 'SMTP');
                    if (smtpConnectors.length > 0) {
                        const bestMatch = smtpConnectors[0];
                        console.log(`[EmailActionBox] ✅ Found fallback SMTP connector: ${bestMatch.name} (${bestMatch.id})`);
                        setResolvedSmtpConnectorId(bestMatch.id);
                    } else {
                        console.warn('[EmailActionBox] ⚠️ No SMTP connectors found in the company.');
                    }
                }
            } catch (e) {
                console.warn('[EmailActionBox] Failed to fetch connectors:', e);
            }
        };

        if (!emailAction.connectorId) {
            resolveSmtp();
        }
        return () => { mounted = false; };
    }, [emailAction.connectorId, resolvedSmtpConnectorId]);

    // Handle send email
    const handleSendEmail = useCallback(async () => {
        // Use resolved connector if available, otherwise prop
        const targetConnectorId = emailAction.connectorId || resolvedSmtpConnectorId;

        console.log('[EmailActionBox] 📧 Starting email send process...', {
            configuredId: emailAction.connectorId,
            resolvedId: resolvedSmtpConnectorId,
            finalTarget: targetConnectorId
        });

        if (!targetConnectorId) {
            setEmailStatus('error');
            setEmailError("Nessun connettore SMTP configurato o trovato.");
            toast({ variant: 'destructive', title: "Errore Configurazione", description: "Manca il connettore SMTP." });
            return;
        }

        setEmailStatus('sending');
        setEmailError(null);

        try {
            // Build selected tables for the action
            const selectedTables: Array<{
                name: string;
                query: string;
                inBody: boolean;
                asExcel: boolean;
                pipelineDependencies?: any[];
            }> = [];

            const tablesInBody = emailAction.attachments?.tablesInBody || [];
            const tablesAsExcel = emailAction.attachments?.tablesAsExcel || [];

            // Find SQL tables in dependencies
            for (const tableName of [...new Set([...tablesInBody, ...tablesAsExcel])]) {
                const dep = fullDependencyChain.find(d => d.tableName === tableName && !d.isPython);
                if (dep && dep.query) {
                    selectedTables.push({
                        name: tableName,
                        query: dep.query,
                        inBody: tablesInBody.includes(tableName),
                        asExcel: tablesAsExcel.includes(tableName),
                        pipelineDependencies: fullDependencyChain.filter(d => d.tableName !== tableName)
                    });
                }
                // Check current node
                if ((currentNode as any)?.sqlResultName === tableName && (currentNode as any)?.sqlQuery) {
                    selectedTables.push({
                        name: tableName,
                        query: (currentNode as any).sqlQuery,
                        inBody: tablesInBody.includes(tableName),
                        asExcel: tablesAsExcel.includes(tableName),
                        pipelineDependencies: fullDependencyChain
                    });
                }
            }

            // Build selected Python outputs
            const selectedPythonOutputs: Array<{
                name: string;
                code: string;
                outputType: 'table' | 'variable' | 'chart';
                connectorId?: string;
                inBody: boolean;
                asAttachment: boolean;
                dependencies?: any[];
            }> = [];

            const pythonInBody = emailAction.attachments?.pythonOutputsInBody || [];
            const pythonAsAttachment = emailAction.attachments?.pythonOutputsAsAttachment || [];

            for (const tableName of [...new Set([...pythonInBody, ...pythonAsAttachment])]) {
                const dep = fullDependencyChain.find(d => d.tableName === tableName && d.isPython);
                if (dep && dep.pythonCode) {
                    selectedPythonOutputs.push({
                        name: tableName,
                        code: dep.pythonCode,
                        outputType: dep.pythonOutputType || 'table',
                        connectorId: dep.connectorId,
                        inBody: pythonInBody.includes(tableName),
                        asAttachment: pythonAsAttachment.includes(tableName),
                        dependencies: fullDependencyChain.filter(d => d.tableName !== tableName)
                    });
                }
                // Check current node
                if ((currentNode as any)?.pythonResultName === tableName && (currentNode as any)?.pythonCode) {
                    selectedPythonOutputs.push({
                        name: tableName,
                        code: (currentNode as any).pythonCode,
                        outputType: (currentNode as any).pythonOutputType || 'table',
                        connectorId: (currentNode as any).pythonConnectorId,
                        inBody: pythonInBody.includes(tableName),
                        asAttachment: pythonAsAttachment.includes(tableName),
                        dependencies: fullDependencyChain
                    });
                }
            }

            // Get SQL connector ID - search in multiple sources
            // Priority: 1. From fullDependencyChain (server-resolved), 2. From selectedTables, 3. From currentNode
            const sqlConnectorId =
                fullDependencyChain.find(d => d.connectorId && !d.isPython)?.connectorId
                || fullDependencyChain.find(d => d.connectorId)?.connectorId
                || selectedTables[0]?.pipelineDependencies?.find(d => d.connectorId)?.connectorId
                || (currentNode as any)?.sqlConnectorId
                || '';

            console.log('[EmailActionBox] 📧 sqlConnectorId resolution:', {
                fromDepsNonPython: fullDependencyChain.find(d => d.connectorId && !d.isPython)?.connectorId,
                fromDepsAny: fullDependencyChain.find(d => d.connectorId)?.connectorId,
                fromSelectedTables: selectedTables[0]?.pipelineDependencies?.find(d => d.connectorId)?.connectorId,
                fromCurrentNode: (currentNode as any)?.sqlConnectorId,
                final: sqlConnectorId
            });

            console.log(`[EmailActionBox] 📧 Sending email with ${selectedTables.length} tables, ${selectedPythonOutputs.length} Python outputs`);

            // Helper function to try sending
            const trySend = async (connId: string) => {
                return await sendTestEmailWithDataAction({
                    connectorId: connId,
                    sqlConnectorId: sqlConnectorId,
                    to: emailAction.to,
                    cc: emailAction.cc,
                    bcc: emailAction.bcc,
                    subject: emailAction.subject,
                    bodyHtml: emailAction.body,
                    selectedTables: selectedTables.map(t => ({
                        ...t,
                        // Ensure dependencies are passed correctly
                        pipelineDependencies: t.pipelineDependencies
                    })),
                    selectedPythonOutputs,
                    availableMedia: effectiveMedia,
                    availableLinks: effectiveLinks,
                    availableTriggers: effectiveTriggers,
                    mediaAttachments: emailAction.attachments?.mediaAsAttachment
                });
            };

            // First attempt
            let result = await trySend(targetConnectorId);

            // Detailed logging for debugging retry logic
            if (!result.success && result.error) {
                console.log(`[EmailActionBox] ⚠️ Email failed first attempt. Error: "${result.error}"`);
                console.log(`[EmailActionBox] 🔍 Retry check: Includes 'SMTP'? ${result.error.toLowerCase().includes('smtp')}`);
            }

            // Retry logic if connector not found
            // Check broadly for "connector" and "smtp" or specific messages
            if (!result.success && result.error && (
                result.error.includes('Connettore SMTP non trovato') ||
                result.error.includes('SMTP Connector not found') ||
                result.error.toLowerCase().includes('connector not found')
            )) {
                console.warn('[EmailActionBox] ⚠️ Configured connector failed. Attempting auto-recovery...');
                try {
                    // Fetch fresh list of connectors
                    const connResult = await getConnectorsAction();
                    if (connResult.data) {
                        const fallback = connResult.data.find((c: any) => c.type === 'SMTP');
                        if (fallback) {
                            console.log(`[EmailActionBox] 🔄 Retrying with fallback connector: ${fallback.name} (${fallback.id})`);
                            result = await trySend(fallback.id);
                            if (result.success) {
                                // If successful, update state to remember this working connector
                                setResolvedSmtpConnectorId(fallback.id);
                            }
                        } else {
                            console.error('[EmailActionBox] ❌ No fallback SMTP connectors available.');
                        }
                    }
                } catch (retryErr) {
                    console.error('[EmailActionBox] ❌ Auto-recovery failed:', retryErr);
                }
            }

            if (result.success) {
                setEmailStatus('success');
                setHasAutoExecuted(true); // Mark as executed
                toast({ title: "Email Inviata", description: `Email inviata con successo a ${emailAction.to}` });
            } else {
                console.error('[EmailActionBox] Email failed:', result.error);
                setEmailStatus('error');
                setEmailError(result.error || "Errore sconosciuto");
                toast({ variant: 'destructive', title: "Errore Email", description: result.error || "Errore sconosciuto" });
            }

        } catch (e: any) {
            console.error('[EmailActionBox] Email failed (exception):', e);
            setEmailStatus('error');
            setEmailError(e.message);
            toast({ variant: 'destructive', title: "Errore Email", description: e.message });
        }
    }, [emailAction, fullDependencyChain, currentNode, toast, resolvedSmtpConnectorId]);

    // Auto-execute when dependencies are ready
    useEffect(() => {
        if (hasAutoExecuted || executionRef.current) return; // Check ref
        if (emailStatus !== 'idle') return;
        if (isResolvingDeps) {
            console.log('[EmailActionBox] ⏳ Waiting for dependency resolution...');
            return;
        }

        // Check if all required tables are available
        const allTablesReady = requiredTables.every(tableName => {
            const inDeps = fullDependencyChain.some(d => d.tableName.toLowerCase() === tableName.toLowerCase());
            const isCurrentNode = (currentNode as any)?.sqlResultName === tableName || (currentNode as any)?.pythonResultName === tableName;
            return inDeps || isCurrentNode;
        });

        if (requiredTables.length === 0 || allTablesReady) {
            console.log('[EmailActionBox] 🚀 Dependencies ready, auto-executing email...');
            executionRef.current = true; // Mark synchronously
            setHasAutoExecuted(true);
            handleSendEmail();
        } else {
            // Poll with timeout
            const timeout = setTimeout(() => {
                if (!hasAutoExecuted && !executionRef.current && emailStatus === 'idle') {
                    console.log('[EmailActionBox] ⚠️ Timeout waiting for dependencies, executing anyway...');
                    executionRef.current = true; // Mark synchronously
                    setHasAutoExecuted(true);
                    handleSendEmail();
                }
            }, 10000);
            return () => clearTimeout(timeout);
        }
    }, [hasAutoExecuted, emailStatus, isResolvingDeps, requiredTables, fullDependencyChain, currentNode, handleSendEmail]);

    // Build visual steps
    const visualSteps = useMemo(() => {
        const steps: { name: string, type: 'sql' | 'python', status: 'pending' | 'running' | 'done' | 'error' | 'cached' }[] = [];

        fullDependencyChain.forEach(d => {
            steps.push({
                name: d.tableName,
                type: d.isPython ? 'python' : 'sql',
                status: 'cached'
            });
        });

        steps.push({
            name: `Invia Email → ${emailAction.to}`,
            type: 'sql',
            status: emailStatus === 'sending' ? 'running' :
                emailStatus === 'success' ? 'done' :
                    emailStatus === 'error' ? 'error' : 'pending'
        });

        return steps;
    }, [fullDependencyChain, emailAction.to, emailStatus]);

    return (
        <div className="mt-4 border rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
            <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 px-4 py-3 border-b flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                    <Mail className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Invio Email Automatico</p>
                    <p className="text-xs text-muted-foreground">
                        Destinatario: <code className="font-mono bg-muted px-1 rounded">{emailAction.to}</code>
                    </p>
                </div>
            </div>

            <div className="p-4 space-y-3">
                {/* Pipeline Visualization */}
                <HierarchyVisualizer
                    steps={visualSteps}
                    currentStepIndex={visualSteps.length - 1}
                    isExecuting={emailStatus === 'sending' || isResolvingDeps}
                />

                {/* Info about attachments */}
                {(requiredTables.length > 0) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                        <Paperclip className="h-3 w-3" />
                        <span>Allegati: {requiredTables.join(', ')}</span>
                    </div>
                )}

                {/* Send Button */}
                <Button
                    className="w-full"
                    variant={emailStatus === 'success' ? 'outline' : 'default'}
                    disabled={emailStatus === 'sending' || isResolvingDeps}
                    onClick={handleSendEmail}
                >
                    {isResolvingDeps ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Risoluzione dipendenze...
                        </>
                    ) : emailStatus === 'sending' ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Invio email in corso...
                        </>
                    ) : emailStatus === 'success' ? (
                        <>
                            <Check className="mr-2 h-4 w-4 text-emerald-600" />
                            Re-invia Email
                        </>
                    ) : (
                        <>
                            <Mail className="mr-2 h-4 w-4" />
                            Invia Email
                        </>
                    )}
                </Button>

                {/* Result */}
                {emailStatus === 'success' && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                        <Check className="h-5 w-5 text-emerald-600" />
                        <span className="text-sm text-emerald-700 dark:text-emerald-300">
                            ✅ Email inviata con successo a <code className="font-mono">{emailAction.to}</code>
                        </span>
                    </div>
                )}
                {emailStatus === 'error' && emailError && (
                    <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
                        <Mail className="h-5 w-5 text-destructive" />
                        <span className="text-sm text-destructive">{emailError}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function InteractiveGuide({ jsonTree, treeId }: InteractiveGuideProps) {
    const { toast } = useToast();
    const { apiKey: openRouterApiKey, model: openRouterModel } = useOpenRouterSettings();

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

    // NEW: Automated Actions State
    const [executedNodeIds, setExecutedNodeIds] = useState<Set<string>>(new Set());
    const [autoSqlResult, setAutoSqlResult] = useState<{ data: any[], query: string } | null>(null);
    const [sqlExportResult, setSqlExportResult] = useState<{ success: boolean, rowsInserted?: number, error?: string, tableName?: string } | null>(null);

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
            const leaf = currentNode as DecisionLeaf;
            const triggers = leaf.triggers;
            const nodeId = (leaf as any).id;

            // Execute Triggers (Legacy)
            if (triggers && triggers.length > 0) {
                handleExecuteTriggers(triggers);
            }

            // NEW: Automated Actions (Email & SQL)
            // Note: Email Action is now handled by EmailActionBox component in renderLeafNode
            if (nodeId && !executedNodeIds.has(nodeId)) {
                let actionExecuted = false;

                // 2. SQL Query Execution (display results)
                if ((leaf as any).sqlQuery) {
                    const query = (leaf as any).sqlQuery;
                    const connectorId = (leaf as any).sqlConnectorId;
                    console.log(`[InteractiveGuide] 💾 Executing SQL Query for node ${nodeId}`);

                    // Get dependencies from history
                    const deps = getAccumulatedDependencies(nodeHistory, leaf);

                    executeSqlPreviewAction(query, connectorId, deps)
                        .then(res => {
                            if (res.data) {
                                setAutoSqlResult({ data: res.data, query });
                                toast({ title: "Query SQL Eseguita", description: "I dati sono pronti per la visualizzazione." });
                            } else if (res.error) {
                                toast({ variant: 'destructive', title: "Errore Query SQL", description: res.error });
                            }
                        });
                    actionExecuted = true;
                }

                // 3. SQL Export Action (export to destination database)
                if ((leaf as any).sqlExportAction) {
                    const exportAction = (leaf as any).sqlExportAction;
                    const { sourceTables, targetConnectorId, targetTableName } = exportAction;
                    console.log(`[InteractiveGuide] 📤 Executing SQL Export Action for node ${nodeId}`, exportAction);

                    // Execute SQL Export with dependencies
                    (async () => {
                        try {
                            setSqlExportResult(null); // Reset
                            let sourceData: any[] = [];

                            // Get accumulated dependencies from the path
                            const deps = getAccumulatedDependencies(nodeHistory, leaf);

                            // For each source table, find and execute the dependency
                            for (const tableName of sourceTables) {
                                // Find the dependency that produces this table
                                const dep = deps.find(d => d.tableName === tableName);

                                if (dep) {
                                    if (dep.isPython && dep.pythonCode) {
                                        // Execute Python dependency
                                        console.log(`[InteractiveGuide] 🐍 Fetching Python data for ${tableName}`);
                                        const pythonDeps = deps.filter(d => d.tableName !== tableName);
                                        const res = await executePythonPreviewAction(
                                            dep.pythonCode,
                                            (dep.pythonOutputType as "table" | "variable" | "chart") || 'table',
                                            {},
                                            pythonDeps.map(d => ({
                                                tableName: d.tableName,
                                                query: d.query,
                                                isPython: d.isPython,
                                                pythonCode: d.pythonCode,
                                                connectorId: d.connectorId
                                            })),
                                            dep.connectorId
                                        );
                                        if (res.success && Array.isArray(res.data)) {
                                            sourceData = res.data;
                                            break;
                                        }
                                    } else if (dep.query) {
                                        // Execute SQL dependency
                                        console.log(`[InteractiveGuide] 🗄️ Fetching SQL data for ${tableName}`);
                                        const sqlDeps = deps.filter(d => d.tableName !== tableName);
                                        const res = await executeSqlPreviewAction(dep.query, dep.connectorId || '', sqlDeps);
                                        if (res.data) {
                                            sourceData = res.data;
                                            break;
                                        }
                                    }
                                }

                                // Also check if the current node produces this data
                                if ((leaf as any).sqlResultName === tableName && (leaf as any).sqlQuery) {
                                    const res = await executeSqlPreviewAction((leaf as any).sqlQuery, (leaf as any).sqlConnectorId || '', deps);
                                    if (res.data) {
                                        sourceData = res.data;
                                        break;
                                    }
                                }
                                if ((leaf as any).pythonResultName === tableName && (leaf as any).pythonCode) {
                                    const res = await executePythonPreviewAction(
                                        (leaf as any).pythonCode,
                                        (leaf as any).pythonOutputType || 'table',
                                        {},
                                        deps.map(d => ({
                                            tableName: d.tableName,
                                            query: d.query,
                                            isPython: d.isPython,
                                            pythonCode: d.pythonCode,
                                            connectorId: d.connectorId
                                        })),
                                        (leaf as any).pythonConnectorId
                                    );
                                    if (res.success && Array.isArray(res.data)) {
                                        sourceData = res.data;
                                        break;
                                    }
                                }
                            }

                            if (sourceData.length === 0) {
                                setSqlExportResult({ success: false, error: 'Nessun dato disponibile per l\'export.', tableName: targetTableName });
                                toast({ variant: 'destructive', title: "Errore Export", description: "Nessun dato trovato per l'esportazione." });
                                return;
                            }

                            // Execute the export
                            const result = await exportTableToSqlAction(targetConnectorId, targetTableName, sourceData, true);

                            if (result.success) {
                                setSqlExportResult({ success: true, rowsInserted: result.rowsInserted, tableName: targetTableName });
                                toast({ title: "Export SQL Completato", description: `${result.rowsInserted} righe inserite in ${targetTableName}` });
                            } else {
                                setSqlExportResult({ success: false, error: result.error, tableName: targetTableName });
                                toast({ variant: 'destructive', title: "Errore Export SQL", description: result.error || 'Errore sconosciuto' });
                            }
                        } catch (e: any) {
                            console.error('[InteractiveGuide] SQL Export failed:', e);
                            setSqlExportResult({ success: false, error: e.message, tableName: targetTableName });
                            toast({ variant: 'destructive', title: "Errore Export", description: e.message });
                        }
                    })();
                    actionExecuted = true;
                }

                if (actionExecuted) {
                    setExecutedNodeIds(prev => new Set(prev).add(nodeId));
                }
            }
        } else {
            // Reset results when moving away from a leaf
            if (autoSqlResult) setAutoSqlResult(null);
            if (sqlExportResult) setSqlExportResult(null);
        }
    }, [currentNode, handleExecuteTriggers, executedNodeIds, autoSqlResult, sqlExportResult, toast]);

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

            const openRouterConfig = openRouterApiKey ? { apiKey: openRouterApiKey, model: openRouterModel || 'google/gemini-2.0-flash-001' } : undefined;

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
                                    <div className="flex-shrink-0 w-6 h-6 rounded bg-secondary overflow-hidden relative flex items-center justify-center">
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

    // Helper to find a node by ID recursively in the tree
    // Helper to render SQL Results if present
    const renderAutoSqlResult = () => {
        if (!autoSqlResult) return null;
        return (
            <div className="mt-4 border rounded-md overflow-hidden">
                <div className="bg-muted px-3 py-2 border-b flex items-center gap-2">
                    <Database className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Risultati Query SQL</span>
                </div>
                <div className="p-0 max-h-[300px] overflow-auto bg-white dark:bg-zinc-950">
                    <DataTable data={autoSqlResult.data} className="border-0" />
                </div>
            </div>
        );
    };

    // Helper to render SQL Export Action result
    const renderSqlExportResult = () => {
        if (!sqlExportResult) return null;
        return (
            <div className={cn(
                "mt-4 border rounded-md overflow-hidden",
                sqlExportResult.success ? "border-emerald-500/50" : "border-destructive/50"
            )}>
                <div className={cn(
                    "px-3 py-3 flex items-center gap-3",
                    sqlExportResult.success ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-destructive/10"
                )}>
                    {sqlExportResult.success ? (
                        <>
                            <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                                <Check className="h-5 w-5 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Export SQL Completato</p>
                                <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
                                    {sqlExportResult.rowsInserted} righe inserite in <code className="font-mono bg-emerald-100 dark:bg-emerald-900/50 px-1 rounded">{sqlExportResult.tableName}</code>
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="h-8 w-8 rounded-full bg-destructive/20 flex items-center justify-center">
                                <Database className="h-5 w-5 text-destructive" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-destructive">Errore Export SQL</p>
                                <p className="text-xs text-destructive/80">{sqlExportResult.error}</p>
                            </div>
                        </>
                    )}
                </div>
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

    // Collect accumulated media/links/triggers from the navigation path
    const getAccumulatedResources = (history: HistoryItem[], currentNodeParam?: DecisionNode | DecisionLeaf | string | null) => {
        const media: MediaItem[] = [];
        const links: LinkItem[] = [];
        const triggers: TriggerItem[] = [];

        // Helper to add resources from a node
        const addResources = (node: any) => {
            if (node && typeof node === 'object') {
                if (node.media && Array.isArray(node.media)) {
                    media.push(...node.media);
                }
                if (node.links && Array.isArray(node.links)) {
                    links.push(...node.links);
                }
                if (node.triggers && Array.isArray(node.triggers)) {
                    triggers.push(...node.triggers);
                }
            }
        };

        // 1. Add from Stack (parent trees)
        treeStack.forEach(frame => {
            frame.path.forEach(node => addResources(node));
        });

        // 2. Add from current history
        history.forEach(node => addResources(node));

        // 3. Add from current node
        if (currentNodeParam) {
            addResources(currentNodeParam);
        }

        return { media, links, triggers };
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
                        {/* SQL Export Action Box */}
                        {isLeafObject && 'sqlExportAction' in node && (node as any).sqlExportAction && (
                            <SqlExportBox
                                sqlExportAction={(node as any).sqlExportAction}
                                pipelineDependencies={dependencies}
                                currentNode={node}
                            />
                        )}
                        {/* Email Action Box */}
                        {isLeafObject && 'emailAction' in node && (node as any).emailAction?.enabled && (() => {
                            const resources = getAccumulatedResources(nodeHistory, node);
                            return (
                                <EmailActionBox
                                    emailAction={(node as any).emailAction}
                                    pipelineDependencies={dependencies}
                                    currentNode={node}
                                    initialTree={initialTree}
                                    loadedSubTrees={loadedSubTrees}
                                    availableMedia={resources.media}
                                    availableLinks={resources.links}
                                    availableTriggers={resources.triggers}
                                />
                            );
                        })()}
                        {/* Automated SQL Query Results */}
                        {renderAutoSqlResult()}
                        {/* SQL Export Action Results */}
                        {renderSqlExportResult()}
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
                                                    {/* SQL Export Action Box for SubTree Question Nodes */}
                                                    {'sqlExportAction' in node && (node as any).sqlExportAction && (
                                                        <SqlExportBox
                                                            sqlExportAction={(node as any).sqlExportAction}
                                                            pipelineDependencies={getAccumulatedDependencies(nodeHistory)}
                                                            currentNode={node}
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
                                    {/* SQL Export Action Box for Question Nodes */}
                                    {'sqlExportAction' in currentNode && (currentNode as any).sqlExportAction && (
                                        <SqlExportBox
                                            sqlExportAction={(currentNode as any).sqlExportAction}
                                            pipelineDependencies={getAccumulatedDependencies(nodeHistory)}
                                            currentNode={currentNode}
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
