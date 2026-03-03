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
import { executeSqlPreviewAction, executePythonPreviewAction, exportTableToSqlAction, getTreeAction, getTreesAction } from '@/app/actions';
import { saveAncestorPreviewsBatchAction } from '@/app/actions/scheduler';
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

                if (isAncestor && (node.sqlResultName || node.pythonResultName || (node.aiConfig?.outputName))) {
                    const nType = getNodeType(node);
                    if (nType === 'email') return; // Exclude email nodes from the list

                    const resolvedDeps = resolveDependencies(node);
                    const commonNodeName = node.question || node.decision || node.name;

                    // AI output: ALWAYS create a separate AI entry if the node has AI prompt
                    // Use outputName if set, otherwise fallback to sqlResultName/pythonResultName
                    const aiOutputName = node.aiConfig?.outputName
                        ? node.aiConfig.outputName
                        : (node.aiConfig?.prompt ? (node.sqlResultName || node.pythonResultName || null) : null);
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

            // 5. Execute Sequence
            const ancestorResults: Record<string, any> = {};
            // FIX: Track results by composite key (nodeId + type) to prevent preview corruption
            // when nodes share the same name (different nodes) or same nodeId (hybrid SQL+Python nodes)
            const nodeIdResults: Record<string, any> = {};
            for (const step of steps) {
                if (!isExecutingRef.current) break;
                // Trust the step's pipelineType from construction — it already accounts for hybrid AI+SQL nodes.
                // Only override to AI as a fallback if the step was misclassified (ancestor nodes without explicit type).
                const stepNode = step.type === 'final' ? targetNode : step.ancestor;
                let runtimeType = step.pipelineType;
                if (runtimeType !== 'ai' && runtimeType !== 'python' && runtimeType !== 'sql') {
                    // Only check runtime AI override for ambiguous types
                    const runtimeIsAi = !!(stepNode?.aiConfig?.outputName && stepNode?.aiConfig?.prompt &&
                        stepNode.aiConfig.outputName === (stepNode.name || stepNode.aiConfig.outputName));
                    if (runtimeIsAi) runtimeType = 'ai';
                }
                setExecutionPipeline(prev => prev.map(p => p.name === step.label ? { ...p, status: 'running', type: runtimeType as any } : p));
                const startTime = Date.now();
                let success = false;
                let stepError: string | null = null;
                let stepMessage: string | null = null;

                try {
                    if (step.type === 'execution' || step.type === 'final') {
                        const node = step.type === 'final' ? targetNode : step.ancestor;
                        // Trust the step's pipelineType — hybrid nodes already have separate AI and SQL/Python steps.
                        const nType = (step as any).pipelineType as string;

                        // Priority 1: Python execution — use nType (pipelineType) to determine execution branch.
                        // FIX: Previously `if (node.pythonCode)` made Python always win on hybrid nodes.
                        // Using nType respects: isPython flag for ancestor steps, getNodeType() for final step.
                        if (nType === 'python' && node.pythonCode) {
                            const inputData: Record<string, any[]> = {};
                            for (const [key, val] of Object.entries(ancestorResults)) {
                                if (val && val.data && Array.isArray(val.data)) {
                                    inputData[key] = val.data;
                                }
                            }

                            // Calculate dependencies: For final step, we must resolve them dynamically
                            // For ancestors, they are already resolved and stored in pipelineDependencies during collection
                            const executionDeps = step.type === 'final' ? resolveDependencies(node) : (node.pipelineDependencies || []);

                            const res = await executePythonPreviewAction(
                                node.pythonCode,
                                node.pythonOutputType || 'table',
                                inputData,
                                executionDeps.map((d: any) => ({
                                    tableName: d.tableName,
                                    query: d.query,
                                    isPython: d.isPython,
                                    pythonCode: d.pythonCode,
                                    connectorId: d.connectorId,
                                    pipelineDependencies: d.pipelineDependencies,
                                    selectedDocuments: d.selectedDocuments
                                })),
                                node.connectorId || node.pythonConnectorId,
                                undefined,
                                node.selectedDocuments?.length > 0 ? node.selectedDocuments : undefined
                            );
                            if (res.success) {
                                success = true;
                                ancestorResults[node.sqlResultName || node.pythonResultName || node.name] = res;
                                if (node.id) nodeIdResults[`${node.id}_py`] = res;
                            } else {
                                stepError = res.error || "Execution failed";
                            }
                        }
                        // Priority 2: AI node — re-execute via /api/ai-node/execute
                        else if (nType === 'ai') {
                            const aiCfg = node.aiConfig;
                            if (!aiCfg?.prompt || !aiCfg?.model || !aiCfg?.outputType) {
                                stepError = "Configurazione AI mancante (prompt/model/outputType). Configura l'agente AI nel nodo.";
                            } else {
                                // Interpolate placeholders with pipeline data
                                let interpolatedPrompt = aiCfg.prompt;
                                interpolatedPrompt = interpolatedPrompt.replace(
                                    /\{\{TABELLA:([^}]+)\}\}/g,
                                    (_: string, name: string) => {
                                        const res = ancestorResults[name];
                                        if (res?.data) {
                                            const rows = Array.isArray(res.data) ? res.data.slice(0, 100) : res.data;
                                            return JSON.stringify(rows);
                                        }
                                        return `[Tabella "${name}" non trovata]`;
                                    }
                                );
                                interpolatedPrompt = interpolatedPrompt.replace(
                                    /\{\{VARIABILE:([^}]+)\}\}/g,
                                    (_: string, name: string) => {
                                        const res = ancestorResults[name];
                                        if (res?.data) return JSON.stringify(res.data);
                                        return `[Variabile "${name}" non trovata]`;
                                    }
                                );
                                interpolatedPrompt = interpolatedPrompt.replace(
                                    /\{\{GRAFICO:([^}]+)\}\}/g,
                                    (_: string, name: string) => `[Grafico "${name}"]`
                                );

                                // Call AI execution endpoint (streaming)
                                setExecutionPipeline(prev => prev.map(p =>
                                    p.name === step.label ? { ...p, message: 'Esecuzione AI in corso...' } : p
                                ));
                                const aiResponse = await fetch('/api/ai-node/execute', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        prompt: interpolatedPrompt,
                                        model: aiCfg.model,
                                        outputType: aiCfg.outputType,
                                    }),
                                });

                                if (!aiResponse.ok) {
                                    let errMsg = `Errore AI (${aiResponse.status})`;
                                    try { const errData = await aiResponse.json(); errMsg = errData.error || errMsg; } catch { /* */ }
                                    stepError = errMsg;
                                } else {
                                    // Read streaming response
                                    const reader = aiResponse.body?.getReader();
                                    if (!reader) {
                                        stepError = 'Stream AI non disponibile';
                                    } else {
                                        const decoder = new TextDecoder();
                                        let buf = '';
                                        let aiResult: any = null;
                                        let aiErr: string | null = null;

                                        while (true) {
                                            const { done, value } = await reader.read();
                                            if (done) break;
                                            buf += decoder.decode(value, { stream: true });
                                            const lines = buf.split('\n');
                                            buf = lines.pop() || '';
                                            for (const line of lines) {
                                                if (!line.trim()) continue;
                                                try {
                                                    const evt = JSON.parse(line);
                                                    if (evt.type === 'step') {
                                                        setExecutionPipeline(prev => prev.map(p =>
                                                            p.name === step.label ? { ...p, message: evt.label } : p
                                                        ));
                                                    } else if (evt.type === 'result') {
                                                        if (evt.success) aiResult = evt.result;
                                                        else aiErr = evt.error || 'Errore AI sconosciuto';
                                                    }
                                                } catch { /* skip malformed line */ }
                                            }
                                        }
                                        // Process remaining buffer
                                        if (buf.trim()) {
                                            try {
                                                const evt = JSON.parse(buf);
                                                if (evt.type === 'result') {
                                                    if (evt.success) aiResult = evt.result;
                                                    else aiErr = evt.error;
                                                }
                                            } catch { /* ignore */ }
                                        }

                                        if (aiResult !== null && aiResult !== undefined) {
                                            success = true;
                                            const data = Array.isArray(aiResult) ? aiResult : [aiResult];
                                            const resultName = aiCfg.outputName || node.name;
                                            ancestorResults[resultName] = { data };
                                            if (node.id) nodeIdResults[`${node.id}_ai`] = { data };
                                            stepMessage = `Risultato AI (${data.length} righe)`;
                                        } else {
                                            stepError = aiErr || 'Nessun risultato AI prodotto';
                                        }
                                    }
                                }
                            }
                        }
                        // Priority 3: Specialized actions
                        else if (nType === 'sharepoint') {
                            success = true;
                            stepMessage = "Anteprima SharePoint simulata (azione reale saltata)";
                        } else if (nType === 'email') {
                            success = true;
                            stepMessage = "Anteprima invio mail simulata (invio reale saltato)";
                        } else if (nType === 'hubspot') {
                            success = true;
                            stepMessage = "Anteprima HubSpot simulata (azione reale saltata)";
                        }
                        // Priority 3: Default SQL execution
                        else {
                            const deps = step.type === 'final' ? resolveDependencies(node) : node.pipelineDependencies || [];
                            const inputTables = deps.map((t: any) => ({
                                tableName: t.tableName,
                                query: t.query,
                                isPython: t.isPython,
                                pythonCode: t.pythonCode,
                                connectorId: t.connectorId,
                                pipelineDependencies: t.pipelineDependencies,
                                data: ancestorResults[t.tableName]?.data || ancestorResults[t.tableName]?.rechartsData
                            }));
                            const res = await executeSqlPreviewAction(node.sqlQuery || node.query, node.connectorId || node.sqlConnectorId, inputTables);
                            if (res.data) {
                                success = true;
                                ancestorResults[node.sqlResultName || node.name] = { data: res.data };
                                if (node.id) nodeIdResults[`${node.id}_sql`] = { data: res.data };
                            } else {
                                stepError = res.error || "Query failed";
                            }
                        }
                    } else if (step.type === 'write') {
                        const ancestor = step.ancestor;
                        const sourceData = ancestorResults[ancestor.name]?.data;
                        if (sourceData) {
                            const targetConnectorId = ancestor.sqlExportTargetConnectorId || ancestor.connectorId;
                            const targetTableName = ancestor.sqlExportTargetTableName;
                            if (targetConnectorId && targetTableName) {
                                const writeRes = await exportTableToSqlAction(targetConnectorId, targetTableName, sourceData, true);
                                if (writeRes.success) success = true;
                                else stepError = writeRes.error || "Write failed";
                            } else {
                                success = true; // Skip if no config
                            }
                        } else {
                            stepError = "No data to write";
                        }
                    }

                    if (success) {
                        setExecutionPipeline(prev => prev.map(p => p.name === step.label ? { ...p, status: 'success', executionTime: Date.now() - startTime, message: stepMessage || undefined } : p));
                    } else {
                        setExecutionPipeline(prev => prev.map(p => p.name === step.label ? { ...p, status: 'error', message: stepError || 'Errore' } : p));
                        throw new Error(stepError || "Pipeline failed");
                    }
                } catch (e: any) {
                    setExecutionPipeline(prev => prev.map(p => p.name === step.label ? { ...p, status: 'error', message: e.message } : p));
                    throw e;
                }
            }

            // 6. Save Previews
            const previewBatch: any[] = [];
            for (const step of steps) {
                if (step.type === 'write') continue;
                const node = step.type === 'final' ? targetNode : step.ancestor;

                // AI nodes: save lastResult back to the node's aiConfig
                if ((step as any).pipelineType === 'ai') {
                    const aiResultKey = node.aiConfig?.outputName || node.name;
                    const aiRes = nodeIdResults[`${node.id}_ai`] || ancestorResults[aiResultKey];
                    if (aiRes && node.id) {
                        previewBatch.push({
                            nodeId: node.id,
                            isPython: false,
                            isAi: true,
                            aiResult: aiRes.data,
                            aiOutputType: node.aiConfig?.outputType,
                            result: aiRes
                        });
                    }
                    continue;
                }

                // FIX: Use step's pipelineType (not pythonCode presence) for composite key and classification.
                const isPy = (step as any).pipelineType === 'python';
                const compositeKey = node.id ? `${node.id}_${isPy ? 'py' : 'sql'}` : null;
                const res = (compositeKey && nodeIdResults[compositeKey]) || ancestorResults[node.sqlResultName || node.pythonResultName || node.name];
                if (res) {
                    previewBatch.push({
                        nodeId: node.id,
                        isPython: isPy,
                        pythonOutputType: node.pythonOutputType,
                        result: res
                    });
                }
            }
            if (previewBatch.length > 0) {
                const saveResult = await saveAncestorPreviewsBatchAction(treeId, previewBatch);
                if (!saveResult.success) {
                    console.warn('[PIPELINE] Preview save failed, widgets may show stale data');
                }
            }

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
                                            {step.message && <span className="text-[10px] text-red-500 mt-1">{step.message}</span>}
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
