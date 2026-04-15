'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, GitBranch, Database, Upload, AlertCircle } from 'lucide-react';
import { getTreeAction, getTreesAction } from '@/app/actions';

import { useToast } from '@/hooks/use-toast';

type PipelineStatus = {
    name: string;
    type: 'python' | 'sql' | 'export' | 'sharepoint' | 'email' | 'hubspot' | 'ai';
    status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
    executionTime?: number;
    message?: string;
};

interface ExecutionStep {
    id: string;
    type: 'execution' | 'write' | 'final';
    ancestor?: any;
    label: string;
    pipelineType: 'python' | 'sql' | 'export' | 'sharepoint' | 'email' | 'hubspot' | 'ai';
    sourceAncestorName?: string;
    aiConfig?: any;
}

interface PipelineExecutionDialogProps {
    isOpen: boolean;
    onClose: () => void;
    treeId: string;
    nodeId: string;
    onSuccess?: () => void;
}

export function PipelineExecutionDialog({ isOpen, onClose, treeId, nodeId, onSuccess }: PipelineExecutionDialogProps) {
    const [isExecuting, setIsExecuting] = useState(false);
    const [executionPipeline, setExecutionPipeline] = useState<PipelineStatus[]>([]);
    const [progressStep, setProgressStep] = useState(0); // 0: Init, 1: Loading, 2: Executing, 3: Completed
    const [error, setError] = useState<string | null>(null);
    const isExecutingRef = useRef(false);
    const { toast } = useToast();

    // Reset state when dialog opens
    useEffect(() => {
        if (isOpen) {
            setExecutionPipeline([]);
            setProgressStep(0);
            setError(null);
            isExecutingRef.current = false;
            startExecution();
        }
    }, [isOpen]);

    const startExecution = async () => {
        if (isExecutingRef.current) return;
        setIsExecuting(true);
        isExecutingRef.current = true;
        setProgressStep(1);

        try {
            // 1. Fetch Tree and ALL other trees for sub-tree resolution
            const [treeResult, allTreesResult] = await Promise.all([
                getTreeAction(treeId),
                getTreesAction()
            ]);

            if (!treeResult.data) throw new Error("Tree not found");

            const allTrees = (allTreesResult.data || []).map((p: any) => ({
                ...p,
                jsonDecisionTree: typeof p.jsonDecisionTree === 'string' ? JSON.parse(p.jsonDecisionTree) : p.jsonDecisionTree
            }));

            const tree = typeof treeResult.data.jsonDecisionTree === 'string'
                ? JSON.parse(treeResult.data.jsonDecisionTree)
                : treeResult.data.jsonDecisionTree;

            // 2. Flatten tree to find path and collect ancestors (recursive with sub-trees)
            const flatTree: any[] = [];
            const flatten = (node: any, path: string, visitedTrees: Set<string> = new Set()) => {
                if (!node) return;

                // Handle Sub-Tree references
                if (node.subTreeRef) {
                    const subTreeId = node.subTreeRef;
                    const linkedTree = allTrees.find(t => t.id === subTreeId);

                    flatTree.push({ path, node });

                    if (linkedTree && !visitedTrees.has(subTreeId)) {
                        const subTreeJson = linkedTree.jsonDecisionTree;
                        const newVisited = new Set(visitedTrees);
                        newVisited.add(subTreeId);
                        if (subTreeJson) {
                            flatten(subTreeJson, `${path}.sub`, newVisited);
                        }
                    }
                    return;
                }

                flatTree.push({ path, node });

                if (node.options) {
                    Object.entries(node.options).forEach(([option, childNode]) => {
                        const optPath = `${path}.options['${option.replace(/'/g, "\\'")}']`;
                        if (Array.isArray(childNode)) {
                            childNode.forEach((c, idx) => flatten(c, `${optPath}[${idx}]`, visitedTrees));
                        } else {
                            flatten(childNode, optPath, visitedTrees);
                        }
                    });
                }
            };
            flatten(tree, 'root');

            const targetItem = flatTree.find(item => item.node.id === nodeId);
            if (!targetItem) throw new Error("Node not found");
            const currentPath = targetItem.path;

            // 3. Resolve Dependencies (Ancestor Input Tables)
            // Replicate visual-tree.tsx logic
            const getNodeType = (node: any): 'sql' | 'python' | 'sharepoint' | 'email' | 'hubspot' | 'export' | 'ai' => {
                // AI node: has an active AI prompt configured — this is the strongest signal.
                // Prioritize over leftover sqlQuery/pythonCode from previous configurations.
                // NOTE: Only check for prompt — outputName and enabled may be empty/false on older nodes.
                console.log('[PIPELINE] getNodeType:', {
                    name: node.question || node.decision || node.name || node.sqlResultName,
                    hasAiConfig: !!node.aiConfig,
                    aiPrompt: !!node.aiConfig?.prompt,
                    aiOutputName: node.aiConfig?.outputName,
                    aiEnabled: node.aiConfig?.enabled,
                    hasSqlQuery: !!node.sqlQuery,
                    hasPythonCode: !!node.pythonCode,
                });
                if (node.aiConfig?.prompt) return 'ai';

                const isPython = node.isPython === true || (node.isPython === undefined && !!node.pythonCode && !node.sqlQuery);
                if (isPython || node.type === 'python') return 'python';

                if (node.type === 'sharepoint' || node.sharepointPath || node.sharepointAction || (node.name && node.name.toLowerCase().includes('sharepoint'))) return 'sharepoint';
                if (node.type === 'hubspot' || node.hubspotAction || node.hubspotObjectType) return 'hubspot';

                // Prioritize explicit SQL over generic Email action check to ensure data nodes execute
                if (node.sqlQuery) return 'sql';

                if (node.type === 'email' || node.emailAction || node.emailTemplate) return 'email';

                // AI fallback: node has AI output even if it also has SQL/Python
                if (node.aiConfig?.outputName) return 'ai';

                return 'sql';
            };

            const resolveDependencies = (node: any, visited: Set<string> = new Set()): any[] => {
                const deps: any[] = [];
                const pipelines = [
                    ...(node.pythonSelectedPipelines || []),
                    ...(node.selectedPipelines || []),
                    ...(node.sqlSelectedPipelines || [])
                ];

                const uniquePipelines = Array.from(new Set(pipelines));

                uniquePipelines.forEach(pName => {
                    if (visited.has(pName)) return;
                    const sourceItem = flatTree.find(item => {
                        const n = item.node;
                        return n && typeof n === 'object' &&
                            (n.pythonResultName === pName || n.sqlResultName === pName || n.name === pName ||
                             (n.aiConfig?.outputName === pName));
                    });

                    if (sourceItem) {
                        const sn = sourceItem.node;
                        const newVisited = new Set(visited);
                        newVisited.add(pName);
                        const nType = getNodeType(sn);
                        // Filter out email inputs as dependencies for now, unless they produce data (unlikely)
                        if (nType === 'email') return;

                        // AI node dependency: check if pName matches aiConfig.outputName
                        // OR if the node has an AI prompt and pName matches via sqlResultName/pythonResultName fallback
                        // (handles nodes where outputName is empty but prompt exists — the AI result
                        //  is stored under sqlResultName/pythonResultName)
                        const computedAiOutput = sn.aiConfig?.outputName
                            || (sn.aiConfig?.prompt ? (sn.sqlResultName || sn.pythonResultName) : null);
                        if (computedAiOutput === pName && sn.aiConfig?.prompt) {
                            deps.push({
                                tableName: pName,
                                nodeId: sn.id,
                                path: sourceItem.path,
                                name: pName,
                                nodeName: sn.question || sn.decision || sn.name,
                                nodeType: 'ai',
                                isPython: false,
                                aiConfig: sn.aiConfig,
                                pipelineDependencies: resolveDependencies(sn, newVisited),
                            });
                            return;
                        }

                        // FIX: For hybrid nodes, determine type from which result name matched
                        // to avoid copying pythonCode on SQL-type deps (which would hijack execution)
                        let depIsPython = nType === 'python';
                        if (sn.sqlResultName && sn.pythonResultName && sn.sqlQuery && sn.pythonCode) {
                            // Hybrid node: check which result name the dependency matched
                            depIsPython = sn.pythonResultName === pName && sn.sqlResultName !== pName;
                        }

                        deps.push({
                            tableName: pName,
                            nodeId: sn.id,
                            path: sourceItem.path, // Capture path for uniqueness in collectAncestors
                            name: pName, // Normalize to name
                            sqlResultName: sn.sqlResultName, // Preserve original result name
                            pythonResultName: sn.pythonResultName, // Preserve original result name
                            nodeName: sn.question || sn.decision || sn.name,
                            writesToDatabase: sn.writesToDatabase || !!sn.sqlExportAction,
                            sqlExportTargetTableName: sn.sqlExportAction?.targetTableName || sn.sqlExportTargetTableName,
                            sqlExportTargetConnectorId: sn.sqlExportAction?.targetConnectorId || sn.sqlExportTargetConnectorId,
                            connectorId: depIsPython ? sn.pythonConnectorId : sn.sqlConnectorId,
                            sqlQuery: depIsPython ? undefined : sn.sqlQuery,
                            query: depIsPython ? undefined : sn.sqlQuery,
                            isPython: depIsPython,
                            nodeType: depIsPython ? 'python' : nType,
                            pythonCode: depIsPython ? sn.pythonCode : undefined,
                            pythonOutputType: depIsPython ? sn.pythonOutputType : undefined,
                            pipelineDependencies: resolveDependencies(sn, newVisited),
                            selectedDocuments: sn.selectedDocuments,
                            sharepointPath: sn.sharepointPath,
                            sharepointAction: sn.sharepointAction,
                            emailAction: sn.emailAction,
                            hubspotAction: sn.hubspotAction
                        });
                    }
                });
                return deps;
            };

            // Collect physical ancestors first (Scope of Execution)
            const physicalAncestors: any[] = [];
            flatTree.forEach(item => {
                const nodePath = item.path;
                const node = item.node;

                let isAncestor = currentPath !== nodePath && currentPath.startsWith(nodePath + '.');

                if (!isAncestor && nodePath.includes('.sub')) {
                    const subTreeRootPath = nodePath.split('.sub')[0];
                    if (currentPath.startsWith(subTreeRootPath + '.options')) {
                        isAncestor = true;
                    }
                }

                if (isAncestor && (node.sqlResultName || node.pythonResultName || node.aiConfig?.outputName || node.aiConfig?.prompt)) {
                    const nType = getNodeType(node);
                    console.log('[PIPELINE] Ancestor node:', {
                        nodeName: node.question || node.decision || node.name,
                        nType,
                        sqlResultName: node.sqlResultName,
                        pythonResultName: node.pythonResultName,
                        aiOutputName: node.aiConfig?.outputName,
                        aiPrompt: !!node.aiConfig?.prompt,
                        aiEnabled: node.aiConfig?.enabled,
                        hasSqlQuery: !!node.sqlQuery,
                    });
                    if (nType === 'email') return; // Exclude email nodes from the list

                    const resolvedDeps = resolveDependencies(node);
                    const commonNodeName = node.question || node.decision || node.name;

                    // AI output: ALWAYS create a separate AI entry if the node has AI prompt
                    // Use outputName if set, otherwise fallback to sqlResultName/pythonResultName
                    const aiOutputName = node.aiConfig?.outputName
                        ? node.aiConfig.outputName
                        : (node.aiConfig?.prompt ? (node.sqlResultName || node.pythonResultName || null) : null);
                    console.log('[PIPELINE] AI entry check:', { aiOutputName, hasPrompt: !!node.aiConfig?.prompt, willCreateAi: !!(aiOutputName && node.aiConfig?.prompt) });
                    if (aiOutputName && node.aiConfig?.prompt) {
                        physicalAncestors.push({
                            id: node.id,
                            path: nodePath,
                            name: aiOutputName,
                            nodeType: 'ai',
                            isPython: false,
                            aiConfig: node.aiConfig,
                            pipelineDependencies: resolvedDeps,
                            nodeName: commonNodeName,
                            writesToDatabase: false,
                        });
                    }

                    // Skip SQL/Python if:
                    // - node has no SQL/Python result names, OR
                    // - the SQL/Python result name is the SAME as the AI output (avoid duplicate execution)
                    // - node is a pure AI node (has aiConfig.prompt but no separate SQL/Python output)
                    const sqlName = node.sqlResultName;
                    const pyName = node.pythonResultName;
                    const hasSqlOutput = sqlName && sqlName !== aiOutputName;
                    const hasPyOutput = pyName && pyName !== aiOutputName;
                    if (!hasSqlOutput && !hasPyOutput) return;

                    // FIX: Hybrid nodes (both SQL and Python) need TWO separate entries
                    // to ensure both operations execute independently and save to the correct preview fields.
                    // Without this, `if (node.pythonCode)` in the execution loop makes Python always win.
                    const isHybridNode = !!(node.sqlResultName && node.pythonResultName && node.sqlQuery && node.pythonCode);
                    const commonWritesToDb = node.writesToDatabase || !!node.sqlExportAction;
                    const commonExportTable = node.sqlExportAction?.targetTableName || node.sqlExportTargetTableName;
                    const commonExportConnector = node.sqlExportAction?.targetConnectorId || node.sqlExportTargetConnectorId;

                    if (isHybridNode) {
                        // SQL entry — no pythonCode to prevent Python branch from hijacking
                        physicalAncestors.push({
                            id: node.id,
                            path: nodePath,
                            name: node.sqlResultName,
                            sqlResultName: node.sqlResultName,
                            sqlQuery: node.sqlQuery,
                            query: node.sqlQuery,
                            nodeType: 'sql',
                            isPython: false,
                            pythonCode: undefined,
                            pythonOutputType: undefined,
                            connectorId: node.sqlConnectorId || node.connectorId,
                            pipelineDependencies: resolvedDeps,
                            nodeName: commonNodeName,
                            writesToDatabase: commonWritesToDb,
                            sqlExportTargetTableName: commonExportTable,
                            sqlExportTargetConnectorId: commonExportConnector,
                        });
                        // Python entry — no sqlQuery to prevent SQL branch
                        physicalAncestors.push({
                            id: node.id,
                            path: nodePath,
                            name: node.pythonResultName,
                            pythonResultName: node.pythonResultName,
                            sqlQuery: undefined,
                            query: undefined,
                            nodeType: 'python',
                            isPython: true,
                            pythonCode: node.pythonCode,
                            pythonOutputType: node.pythonOutputType,
                            connectorId: node.pythonConnectorId || node.connectorId,
                            pipelineDependencies: resolvedDeps,
                            nodeName: commonNodeName,
                            writesToDatabase: false, // Only SQL entry handles DB writes
                            selectedDocuments: node.selectedDocuments,
                        });
                    } else {
                        physicalAncestors.push({
                            id: node.id,
                            path: nodePath,
                            name: node.sqlResultName || node.pythonResultName,
                            sqlResultName: node.sqlResultName,
                            pythonResultName: node.pythonResultName,
                            sqlQuery: node.sqlQuery,
                            query: node.sqlQuery,
                            nodeType: nType,
                            isPython: nType === 'python',
                            pythonCode: nType === 'python' ? node.pythonCode : undefined,
                            connectorId: node.connectorId || node.sqlConnectorId || node.pythonConnectorId,
                            pythonOutputType: node.pythonOutputType,
                            pipelineDependencies: resolvedDeps,
                            nodeName: commonNodeName,
                            writesToDatabase: commonWritesToDb,
                            sqlExportTargetTableName: commonExportTable,
                            sqlExportTargetConnectorId: commonExportConnector,
                            selectedDocuments: node.selectedDocuments,
                            sharepointPath: node.sharepointPath,
                            sharepointAction: node.sharepointAction,
                            emailAction: node.emailAction,
                            hubspotAction: node.hubspotAction
                        });
                    }
                }
            });

            // 4. Collect ALL ancestors (Logical closure) using collectAncestors logic from edit-node-dialog
            // This ensures meaningful Topological Sort (Dependency Order) and includes non-physical ancestor dependencies
            const collectAncestors = (nodes: any[], visited = new Map<string, any>()) => {
                nodes.forEach(node => {
                    // Process dependencies first (DFS) so they appear earlier in the list
                    if (node.pipelineDependencies && node.pipelineDependencies.length > 0) {
                        collectAncestors(node.pipelineDependencies, visited);
                    }

                    const nameOrTable = node.name || node.tableName;
                    // Use path as the primary key if available, fallback to nodeId + name for uniqueness
                    // matching edit-node-dialog logic
                    const key = node.path ? `${node.path}_${nameOrTable}` : (node.nodeId ? `${node.nodeId}_${nameOrTable}` : (node.id ? `${node.id}_${nameOrTable}` : nameOrTable));

                    if (!visited.has(key)) {
                        visited.set(key, {
                            ...node,
                            id: node.id || node.nodeId, // normalize ID
                            nodeType: node.nodeType || (node.isPython ? 'python' : node.aiConfig ? 'ai' : 'sql') // ensure nodeType
                        });
                    }
                });
                return visited;
            };

            const uniqueNodesMap = collectAncestors(physicalAncestors);
            const resolvedAncestors = Array.from(uniqueNodesMap.values());
            console.log('[PIPELINE] Resolved Execution List:', resolvedAncestors.map(n => ({
                name: n.name, nodeType: n.nodeType, hasAiConfig: !!n.aiConfig,
                aiOutputName: n.aiConfig?.outputName, aiPrompt: n.aiConfig?.prompt?.substring(0, 30),
                sqlQuery: n.sqlQuery?.substring(0, 30), sqlResultName: n.sqlResultName
            })));

            // 5. Build execution steps
            const steps: ExecutionStep[] = [];
            resolvedAncestors.forEach(t => {
                console.log('[PIPELINE] Building step:', { name: t.name, nodeType: t.nodeType, hasAiConfig: !!t.aiConfig, isPython: t.isPython });
                steps.push({
                    id: `${t.id}_exec`,
                    type: 'execution',
                    ancestor: t,
                    label: t.nodeName ? `${t.nodeName} > ${t.name}` : t.name,
                    pipelineType: t.nodeType
                });
                if (t.writesToDatabase) {
                    steps.push({
                        id: `${t.id}_write`,
                        type: 'write',
                        ancestor: t,
                        label: t.nodeName ? `${t.nodeName} > 💾 Write ${t.sqlExportTargetTableName || 'DB'}` : `💾 Write ${t.sqlExportTargetTableName || 'DB'}`,
                        pipelineType: 'export',
                        sourceAncestorName: t.name
                    });
                }
            });

            // Add final step(s) for target node
            // Handle hybrid AI+SQL/Python target nodes by creating separate steps (like ancestors)
            const targetNode = targetItem.node;
            const targetAiOutputName = targetNode.aiConfig?.prompt
                ? (targetNode.aiConfig.outputName || targetNode.sqlResultName || targetNode.pythonResultName || null)
                : null;

            // Step 1: If target has AI output, create a separate AI step
            if (targetAiOutputName) {
                steps.push({
                    id: 'final_step_ai',
                    type: 'final',
                    label: targetNode.question || targetNode.decision || targetNode.name
                        ? `${targetNode.question || targetNode.decision || targetNode.name} > ${targetAiOutputName}`
                        : targetAiOutputName,
                    pipelineType: 'ai',
                    aiConfig: targetNode.aiConfig
                });
            }

            // Step 2: If target also has SQL/Python output (different from AI), create that step too
            const targetSqlPyName = targetNode.sqlResultName || targetNode.pythonResultName;
            const targetHasSqlPy = targetSqlPyName && targetSqlPyName !== targetAiOutputName;
            if (targetHasSqlPy) {
                let targetNodeType = getNodeType(targetNode);
                // Don't classify as AI if we already have a separate AI step
                if (targetNodeType === 'ai') targetNodeType = targetNode.pythonCode ? 'python' : 'sql';
                if (targetNodeType !== 'email') {
                    steps.push({
                        id: 'final_step',
                        type: 'final',
                        label: targetNode.question || targetNode.decision || targetNode.name
                            ? `${targetNode.question || targetNode.decision || targetNode.name} > ${targetSqlPyName}`
                            : targetSqlPyName,
                        pipelineType: targetNodeType,
                    });
                }
            }

            // Fallback: if no AI and no SQL/Python result name, still create a final step
            if (!targetAiOutputName && !targetHasSqlPy) {
                const targetNodeType = getNodeType(targetNode);
                if (targetNodeType !== 'email') {
                    steps.push({
                        id: 'final_step',
                        type: 'final',
                        label: targetNode.sqlResultName || targetNode.pythonResultName || targetNode.aiConfig?.outputName || "Risultato Finale",
                        pipelineType: targetNodeType,
                        aiConfig: targetNode.aiConfig
                    });
                }
            }

            setExecutionPipeline(steps.map(s => ({ name: s.label, type: s.pipelineType, status: 'pending' })));
            setProgressStep(2);

            // 5. Execute pipeline server-side (data stays in server memory)
            const stepPayloads = steps.map(step => {
                const node = step.type === 'final' ? targetNode : step.ancestor;
                const nType = step.pipelineType;
                const deps = step.type === 'final'
                    ? resolveDependencies(node)
                    : (node?.pipelineDependencies || []);

                return {
                    id: step.id,
                    type: step.type,
                    label: step.label,
                    pipelineType: nType,
                    resultName: node?.aiConfig?.outputName || node?.sqlResultName || node?.pythonResultName || node?.name || step.label,
                    nodeId: node?.id,
                    sqlQuery: nType !== 'python' && nType !== 'ai' ? (node?.sqlQuery || node?.query) : undefined,
                    connectorId: node?.connectorId || node?.sqlConnectorId || node?.pythonConnectorId,
                    pythonCode: nType === 'python' ? node?.pythonCode : undefined,
                    pythonOutputType: nType === 'python' ? node?.pythonOutputType : undefined,
                    selectedDocuments: node?.selectedDocuments?.length > 0 ? node?.selectedDocuments : undefined,
                    aiConfig: nType === 'ai' ? (node?.aiConfig || step.aiConfig) : undefined,
                    sourceAncestorName: step.sourceAncestorName,
                    sqlExportTargetTableName: node?.sqlExportTargetTableName,
                    sqlExportTargetConnectorId: node?.sqlExportTargetConnectorId,
                    dependencies: deps.map((d: any) => ({
                        tableName: d.tableName,
                        query: d.query,
                        isPython: d.isPython,
                        pythonCode: d.pythonCode,
                        connectorId: d.connectorId,
                        pipelineDependencies: d.pipelineDependencies,
                        selectedDocuments: d.selectedDocuments,
                    })),
                    isPython: nType === 'python',
                    isAi: nType === 'ai',
                };
            });

            const pipelineResponse = await fetch('/api/internal/execute-pipeline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ treeId, steps: stepPayloads }),
            });

            if (!pipelineResponse.ok) {
                let errMsg = 'Pipeline execution failed';
                try { const err = await pipelineResponse.json(); errMsg = err.error || errMsg; } catch { /* */ }
                throw new Error(errMsg);
            }

            // Read NDJSON streaming progress from server
            const reader = pipelineResponse.body?.getReader();
            if (!reader) throw new Error('Stream non disponibile');

            const decoder = new TextDecoder();
            let buf = '';
            let pipelineError: string | null = null;

            while (true) {
                if (!isExecutingRef.current) { reader.cancel(); break; }
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const evt = JSON.parse(line);
                        if (evt.type === 'step-start') {
                            setExecutionPipeline(prev => prev.map((p, idx) =>
                                idx === evt.index ? { ...p, status: 'running' } : p
                            ));
                        } else if (evt.type === 'step-done') {
                            setExecutionPipeline(prev => prev.map((p, idx) =>
                                idx === evt.index ? {
                                    ...p,
                                    status: evt.success ? 'success' : 'error',
                                    executionTime: evt.executionTime,
                                    message: evt.error || evt.message || undefined,
                                } : p
                            ));
                            // Track final step failure
                            if (!evt.success && steps[evt.index]?.type === 'final') {
                                pipelineError = evt.error || 'Pipeline failed';
                            }
                        } else if (evt.type === 'done') {
                            if (!evt.success) pipelineError = evt.error || 'Pipeline failed';
                        }
                    } catch { /* skip malformed line */ }
                }
            }
            // Process remaining buffer
            if (buf.trim()) {
                try {
                    const evt = JSON.parse(buf);
                    if (evt.type === 'done' && !evt.success) pipelineError = evt.error;
                } catch { /* ignore */ }
            }

            if (pipelineError) throw new Error(pipelineError);

            setProgressStep(3);
            if (onSuccess) onSuccess();
        } catch (e: any) {
            console.error("Pipeline Error:", e);
            setError(e.message);
        } finally {
            setIsExecuting(false);
            isExecutingRef.current = false;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !isExecuting && !open && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <GitBranch className="h-5 w-5 text-amber-500" />
                        Aggiornamento Pipeline
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    {progressStep === 1 && (
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="text-sm font-medium">Analisi delle dipendenze...</span>
                        </div>
                    )}

                    {progressStep >= 2 && (
                        <div className="border rounded-md overflow-hidden bg-muted/20 max-h-[400px] overflow-y-auto">
                            {executionPipeline.map((step, idx) => (
                                <div key={idx} className={`flex items-center justify-between p-3 border-b last:border-0 text-sm ${step.status === 'running' ? 'bg-background shadow-sm' : ''}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-5 flex justify-center">
                                            {step.status === 'pending' && <div className="h-2 w-2 rounded-full bg-slate-300" />}
                                            {step.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                                            {step.status === 'success' && <Check className="h-4 w-4 text-emerald-600" />}
                                            {step.status === 'error' && <X className="h-4 w-4 text-red-600" />}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className={step.status === 'running' ? 'font-medium text-primary' : ''}>
                                                {step.name}
                                                {step.type === 'export' && <Upload className="inline h-3 w-3 ml-1 text-muted-foreground" />}
                                            </span>
                                            {step.message && <span className={`text-[10px] mt-1 ${step.status === 'error' ? 'text-red-500' : 'text-amber-600'}`}>{step.message}</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={
                                            step.type === 'python' ? 'secondary' :
                                                step.type === 'ai' ? 'secondary' :
                                                    step.type === 'sql' ? 'outline' :
                                                        step.type === 'sharepoint' ? 'destructive' :
                                                            step.type === 'email' ? 'default' :
                                                                'outline'
                                        } className={
                                            step.type === 'python' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                                step.type === 'ai' ? 'bg-violet-100 text-violet-700 border-violet-200' :
                                                    step.type === 'sql' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                                        step.type === 'sharepoint' ? 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100' :
                                                            step.type === 'email' ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100' :
                                                                ''
                                        }>
                                            {step.type.toUpperCase()}
                                        </Badge>
                                        {step.executionTime && <span className="text-[10px] text-muted-foreground font-mono">{step.executionTime}ms</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md flex gap-2 items-start mt-2">
                            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                            <div className="flex flex-col gap-1">
                                <span className="text-sm font-semibold text-red-700 dark:text-red-400">Errore Pipeline</span>
                                <span className="text-xs text-red-600 dark:text-red-500">{error}</span>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isExecuting}>
                        {progressStep === 3 ? 'Chiudi' : 'Annulla'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
