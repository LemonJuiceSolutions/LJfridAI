/**
 * Unified pipeline executor.
 *
 * Single source of truth for running ancestor → target chains. Used by:
 *   1. /api/internal/execute-pipeline (widget refresh, node preview dialog)
 *   2. scheduler-service.executeTask (cron / run-all)
 *   3. (future) edit-node-dialog Anteprima
 *
 * Accepts a flattened list of steps and runs them in order, accumulating
 * results in an in-memory Map. Emits progress events via the provided
 * `emit` callback (used by NDJSON streamers and pipelineReport collectors).
 *
 * Each step result mirrors what saveAncestorPreviewsBatchAction expects so
 * callers can persist a preview without duplicating shape massaging.
 */

import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';
import { exportTableToSqlAction } from '@/app/actions/sql';
import { generateText } from 'ai';
import { randomUUID } from 'crypto';
import { getOpenRouterSettingsAction } from '@/actions/openrouter';
import { getAiProviderAction, type AiProvider } from '@/actions/ai-settings';
import { getOpenRouterModel } from '@/ai/providers/openrouter-provider';
import { runClaudeCliSync } from '@/ai/providers/claude-cli-provider';
import {
    datasetRowCount,
    isPipelineDatasetRef,
    maybePersistDatasetRef,
    resolveDatasetRef,
} from '@/lib/pipeline-dataset-ref';

export interface PipelineStep {
    id: string;
    type: 'execution' | 'write' | 'final';
    label: string;
    pipelineType: string;
    resultName: string;
    nodeId?: string;
    sqlQuery?: string;
    connectorId?: string;
    pythonCode?: string;
    pythonOutputType?: string;
    selectedDocuments?: any[];
    aiConfig?: { prompt: string; model: string; outputType: string; outputName?: string };
    sourceAncestorName?: string;
    sqlExportTargetTableName?: string;
    sqlExportTargetConnectorId?: string;
    dependencies?: Array<{
        tableName: string;
        query?: string;
        isPython?: boolean;
        pythonCode?: string;
        connectorId?: string;
        pipelineDependencies?: any[];
        selectedDocuments?: any[];
        columns?: any;
    }>;
    isPython?: boolean;
    isAi?: boolean;
}

export interface PipelineEvent {
    type: 'step-start' | 'step-done' | 'done';
    index?: number;
    success?: boolean;
    executionTime?: number;
    error?: string;
    message?: string;
    rowCount?: number;
}

export interface PipelineReportEntry {
    name: string;
    type: string;
    status: 'success' | 'error' | 'skipped';
    error?: string;
    timestamp: string;
    durationMs?: number;
    nodePath?: string;
}

export interface PipelineRunResult {
    success: boolean;
    /** Server-side result map keyed by resultName (data never leaves server). */
    results: Map<string, any>;
    /** nodeId composite key map, useful for preview persistence. */
    nodeIdResults: Map<string, any>;
    /** Per-step report — same shape used by scheduler dialog and node Anteprima. */
    pipelineReport: PipelineReportEntry[];
}

// ─── AI helpers ───────────────────────────────────────────────────────────────

function stripMarkdownFences(text: string): string {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    return m ? m[1].trim() : text.trim();
}

function extractJson(text: string): string | null {
    const fenced = stripMarkdownFences(text);
    try { JSON.parse(fenced); return fenced; } catch { /* */ }
    const a = text.match(/\[[\s\S]*\]/);
    if (a) { try { JSON.parse(a[0]); return a[0]; } catch { /* */ } }
    const o = text.match(/\{[\s\S]*\}/);
    if (o) { try { JSON.parse(o[0]); return o[0]; } catch { /* */ } }
    return null;
}

function parseAiResult(text: string, outputType: string): any {
    switch (outputType) {
        case 'table': {
            const json = extractJson(text);
            if (json) {
                const p = JSON.parse(json);
                if (Array.isArray(p)) return p;
                if (p.data && Array.isArray(p.data)) return p.data;
                return [p];
            }
            return [{ risultato: text.trim() }];
        }
        case 'number': {
            const c = stripMarkdownFences(text);
            const m = c.match(/-?\d+([.,]\d+)?/);
            if (m) return parseFloat(m[0].replace(',', '.'));
            const f = text.match(/-?\d+([.,]\d+)?/);
            if (f) return parseFloat(f[0].replace(',', '.'));
            return 0;
        }
        case 'chart': {
            const json = extractJson(text);
            if (json) {
                const p = JSON.parse(json);
                if (p.type && p.data) return p;
                if (p.data && Array.isArray(p.data)) {
                    return {
                        type: 'bar-chart',
                        data: p.data,
                        xAxisKey: Object.keys(p.data[0] || {})[0],
                        dataKeys: Object.keys(p.data[0] || {}).slice(1),
                        title: p.title || 'Grafico AI',
                    };
                }
            }
            throw new Error('Grafico AI non valido');
        }
        case 'string':
        default:
            return text.trim();
    }
}

// ─── Step executors ───────────────────────────────────────────────────────────

async function executeStep(
    step: PipelineStep,
    index: number,
    startTime: number,
    results: Map<string, any>,
    nodeIdResults: Map<string, any>,
    allSteps: PipelineStep[],
    emit: (e: PipelineEvent) => void,
    pipelineReport: PipelineReportEntry[],
    executionId: string,
    bypassAuth: boolean = false,
): Promise<void> {
    const nType = step.pipelineType;
    const reportName = step.resultName || step.label || step.nodeId || `step-${index}`;

    // ── Python ──
    if (nType === 'python' && step.pythonCode) {
        const inputData: Record<string, any> = {};
        for (const [key, val] of results.entries()) {
            const data = val?.data ?? val;
            if (Array.isArray(data)) {
                inputData[key] = await maybePersistDatasetRef(key, data, executionId);
            } else if (data && typeof data === 'object' && (data as any).__datasetRef) {
                inputData[key] = data;
            }
        }

        let pyConnectorId = step.connectorId || '';
        if (!pyConnectorId && step.dependencies) {
            for (const d of step.dependencies) {
                if (d.connectorId) { pyConnectorId = d.connectorId; break; }
            }
        }
        if (!pyConnectorId) {
            for (const s of allSteps) {
                if (s.connectorId) { pyConnectorId = s.connectorId; break; }
            }
        }

        const pyResult = await executePythonPreviewAction(
            step.pythonCode,
            (step.pythonOutputType || 'table') as 'table' | 'variable' | 'chart' | 'html',
            inputData,
            step.dependencies || [],
            pyConnectorId,
            bypassAuth,
            step.selectedDocuments as string[] | undefined,
        );

        const elapsed = Date.now() - startTime;

        if (!pyResult.success) {
            const err = pyResult.error || 'Python execution failed';
            emit({ type: 'step-done', index, success: false, executionTime: elapsed, error: err });
            pipelineReport.push({
                name: reportName, type: 'Python', status: 'error',
                error: err, timestamp: new Date().toISOString(), durationMs: elapsed,
            });
            if (step.type === 'final') throw new Error(err);
            return;
        }

        const pyStored = pyResult.data && Array.isArray(pyResult.data)
            ? {
                ...pyResult,
                data: await maybePersistDatasetRef(step.resultName, pyResult.data, executionId),
            }
            : pyResult;
        results.set(step.resultName, pyStored);
        if (step.nodeId) nodeIdResults.set(`${step.nodeId}_py`, pyStored);

        const msg = (pyResult as any)._warning
            || (pyResult.data?.length === 0 ? 'Script completato, 0 righe' : undefined);
        emit({
            type: 'step-done', index, success: true,
            executionTime: elapsed, message: msg, rowCount: datasetRowCount(pyStored.data),
        });
        pipelineReport.push({
            name: reportName, type: 'Python', status: 'success',
            timestamp: new Date().toISOString(), durationMs: elapsed,
        });
        return;
    }

    // ── AI ──
    if (nType === 'ai' && step.aiConfig) {
        let prompt = step.aiConfig.prompt;
        prompt = prompt.replace(/\{\{TABELLA:([^}]+)\}\}/g, (_, name: string) => {
            const res = results.get(name);
            if (res) {
                const d = res.data ?? res;
                const rows = Array.isArray(d) ? d.slice(0, 100) : d;
                return JSON.stringify(rows);
            }
            return `[Tabella "${name}" non trovata]`;
        });
        prompt = prompt.replace(/\{\{VARIABILE:([^}]+)\}\}/g, (_, name: string) => {
            const res = results.get(name);
            if (res) return JSON.stringify(res.data ?? res);
            return `[Variabile "${name}" non trovata]`;
        });
        prompt = prompt.replace(/\{\{GRAFICO:([^}]+)\}\}/g, (_, name: string) => `[Grafico "${name}"]`);

        const providerSettings = await getAiProviderAction();
        const aiProvider: AiProvider = providerSettings.provider || 'openrouter';

        let aiResultText: string;

        if (aiProvider === 'claude-cli') {
            const cliResult = await runClaudeCliSync({
                model: 'claude-sonnet-4-6',
                systemPrompt: '',
                userPrompt: prompt,
            });
            aiResultText = cliResult.text;
        } else {
            const settings = await getOpenRouterSettingsAction();
            if (!settings.apiKey) {
                const elapsed = Date.now() - startTime;
                const err = 'OpenRouter API key non configurata';
                emit({ type: 'step-done', index, success: false, executionTime: elapsed, error: err });
                pipelineReport.push({
                    name: reportName, type: 'AI', status: 'error',
                    error: err, timestamp: new Date().toISOString(), durationMs: elapsed,
                });
                if (step.type === 'final') throw new Error(err);
                return;
            }
            const model = getOpenRouterModel(settings.apiKey, step.aiConfig.model);
            const genResult = await generateText({ model, prompt });
            aiResultText = genResult.text || '';
        }

        const parsed = parseAiResult(aiResultText, step.aiConfig.outputType);
        const data = Array.isArray(parsed) ? parsed : [parsed];

        results.set(step.resultName, { data });
        if (step.nodeId) nodeIdResults.set(`${step.nodeId}_ai`, { data });

        const elapsed = Date.now() - startTime;
        emit({
            type: 'step-done', index, success: true,
            executionTime: elapsed, message: `Risultato AI (${data.length} righe)`,
            rowCount: data.length,
        });
        pipelineReport.push({
            name: reportName, type: 'AI', status: 'success',
            timestamp: new Date().toISOString(), durationMs: elapsed,
        });
        return;
    }

    // ── Simulated actions ──
    if (nType === 'sharepoint' || nType === 'email' || nType === 'hubspot') {
        const elapsed = Date.now() - startTime;
        emit({
            type: 'step-done', index, success: true,
            executionTime: elapsed, message: `Anteprima ${nType} simulata`,
        });
        pipelineReport.push({
            name: reportName, type: nType, status: 'success',
            timestamp: new Date().toISOString(), durationMs: elapsed,
        });
        return;
    }

    // ── SQL (default) ──
    const deps = (step.dependencies || []).map(t => {
        const ancestorRes = results.get(t.tableName);
        const data = ancestorRes?.data ?? (Array.isArray(ancestorRes) ? ancestorRes : null);
        return { ...t, data, columns: ancestorRes?.columns || t.columns };
    });

    const sqlResult = await executeSqlPreviewAction(
        step.sqlQuery || '', step.connectorId || '', deps, bypassAuth,
    );

    const elapsed = Date.now() - startTime;

    if (sqlResult.error || !sqlResult.data) {
        const errMsg = sqlResult.error || 'Query failed';
        emit({ type: 'step-done', index, success: false, executionTime: elapsed, error: errMsg });
        pipelineReport.push({
            name: reportName, type: 'SQL', status: 'error',
            error: errMsg, timestamp: new Date().toISOString(), durationMs: elapsed,
        });
        if (step.type === 'final') throw new Error(errMsg);
        return;
    }

    const storedSqlData = await maybePersistDatasetRef(step.resultName, sqlResult.data, executionId);
    results.set(step.resultName, { data: storedSqlData });
    if (step.nodeId) nodeIdResults.set(`${step.nodeId}_sql`, { data: storedSqlData });

    const depWarnings = (sqlResult as any)?._depWarnings;
    const msg = depWarnings?.length
        ? `⚠️ ${depWarnings.length} dipendenza/e con problemi — risultato parziale`
        : undefined;

    emit({
        type: 'step-done', index, success: true,
        executionTime: elapsed, message: msg,
        rowCount: datasetRowCount(storedSqlData),
    });
    pipelineReport.push({
        name: reportName, type: 'SQL', status: 'success',
        timestamp: new Date().toISOString(), durationMs: elapsed,
    });
}

async function executeWriteStep(
    step: PipelineStep,
    index: number,
    startTime: number,
    results: Map<string, any>,
    emit: (e: PipelineEvent) => void,
    pipelineReport: PipelineReportEntry[],
    bypassAuth: boolean = false,
): Promise<void> {
    const reportName = step.label || `Write ${step.sqlExportTargetTableName || 'output'}`;
    const sourceData = await resolveDatasetRef(results.get(step.sourceAncestorName || '')?.data);
    const elapsed0 = () => Date.now() - startTime;

    if (!sourceData) {
        emit({ type: 'step-done', index, success: false, executionTime: elapsed0(), error: 'No data to write' });
        pipelineReport.push({
            name: reportName, type: 'export', status: 'error',
            error: 'No data to write', timestamp: new Date().toISOString(), durationMs: elapsed0(),
        });
        return;
    }

    const targetConnectorId = step.sqlExportTargetConnectorId || step.connectorId || '';
    const targetTableName = step.sqlExportTargetTableName || '';

    if (targetConnectorId && targetTableName) {
        const writeRes = await exportTableToSqlAction(
            targetConnectorId, targetTableName, sourceData, true, true, bypassAuth,
        );
        const elapsed = Date.now() - startTime;
        emit({
            type: 'step-done', index, success: writeRes.success, executionTime: elapsed,
            error: writeRes.success ? undefined : (writeRes.error || 'Write failed'),
        });
        pipelineReport.push({
            name: `💾 ${reportName}`, type: 'export',
            status: writeRes.success ? 'success' : 'error',
            error: writeRes.success ? undefined : (writeRes.error || 'Write failed'),
            timestamp: new Date().toISOString(), durationMs: elapsed,
        });
    } else {
        const elapsed = Date.now() - startTime;
        emit({ type: 'step-done', index, success: true, executionTime: elapsed });
        pipelineReport.push({
            name: `💾 ${reportName}`, type: 'export', status: 'success',
            timestamp: new Date().toISOString(), durationMs: elapsed,
        });
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Execute a flattened pipeline of steps. Single source of truth used by the
 * NDJSON streaming route, the scheduler service, and (eventually) the
 * in-node Anteprima dialog.
 *
 * The caller passes an `emit` callback to receive live progress events. For
 * non-streaming use cases (scheduler), pass `() => {}` and read the final
 * pipelineReport from the returned object.
 */
export async function runPipelineSteps(
    steps: PipelineStep[],
    emit: (event: PipelineEvent) => void,
    bypassAuth: boolean = false,
): Promise<PipelineRunResult> {
    const results = new Map<string, any>();
    const nodeIdResults = new Map<string, any>();
    const pipelineReport: PipelineReportEntry[] = [];
    const executionId = `pipeline-${Date.now()}-${randomUUID()}`;
    let pipelineSuccess = true;

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const startTime = Date.now();
        emit({ type: 'step-start', index: i });

        try {
            if (step.type === 'execution' || step.type === 'final') {
                await executeStep(step, i, startTime, results, nodeIdResults, steps, emit, pipelineReport, executionId, bypassAuth);
            } else if (step.type === 'write') {
                await executeWriteStep(step, i, startTime, results, emit, pipelineReport, bypassAuth);
            }
        } catch (e: any) {
            const elapsed = Date.now() - startTime;
            const errMsg = e?.message || 'Unknown error';
            emit({ type: 'step-done', index: i, success: false, executionTime: elapsed, error: errMsg });
            pipelineReport.push({
                name: step.resultName || step.label || step.nodeId || `step-${i}`,
                type: step.pipelineType || 'unknown',
                status: 'error',
                error: errMsg,
                timestamp: new Date().toISOString(),
                durationMs: elapsed,
            });
            if (step.type === 'final') {
                pipelineSuccess = false;
                break;
            }
        }
    }

    emit({ type: 'done', success: pipelineSuccess });

    return { success: pipelineSuccess, results, nodeIdResults, pipelineReport };
}

// ─── Server-side tree flattener + step builder ────────────────────────────────
// Mirrors the logic that PipelineExecutionDialog runs client-side, so any
// caller (route handler, scheduler, in-node Anteprima) can produce the SAME
// PipelineStep[] from a tree + target nodeId.

function getNodeType(node: any): 'sql' | 'python' | 'sharepoint' | 'email' | 'hubspot' | 'export' | 'ai' {
    if (node.aiConfig?.prompt) return 'ai';
    const isPython = node.isPython === true || (node.isPython === undefined && !!node.pythonCode && !node.sqlQuery);
    if (isPython || node.type === 'python') return 'python';
    if (node.type === 'sharepoint' || node.sharepointPath || node.sharepointAction || (node.name && node.name.toLowerCase().includes('sharepoint'))) return 'sharepoint';
    if (node.type === 'hubspot' || node.hubspotAction || node.hubspotObjectType) return 'hubspot';
    if (node.sqlQuery) return 'sql';
    if (node.type === 'email' || node.emailAction || node.emailTemplate) return 'email';
    if (node.aiConfig?.outputName) return 'ai';
    return 'sql';
}

interface FlatTreeItem { path: string; node: any; }

function flattenTree(
    root: any,
    allTrees: Array<{ id: string; jsonDecisionTree: any }>,
): FlatTreeItem[] {
    const out: FlatTreeItem[] = [];
    const walk = (node: any, path: string, visitedTrees: Set<string>) => {
        if (!node) return;
        if (node.subTreeRef) {
            const subId = node.subTreeRef;
            const linked = allTrees.find(t => t.id === subId);
            out.push({ path, node });
            if (linked && !visitedTrees.has(subId)) {
                const nv = new Set(visitedTrees); nv.add(subId);
                if (linked.jsonDecisionTree) walk(linked.jsonDecisionTree, `${path}.sub`, nv);
            }
            return;
        }
        out.push({ path, node });
        if (node.options) {
            Object.entries(node.options).forEach(([opt, child]) => {
                const optPath = `${path}.options['${opt.replace(/'/g, "\\'")}']`;
                if (Array.isArray(child)) {
                    child.forEach((c, i) => walk(c, `${optPath}[${i}]`, visitedTrees));
                } else {
                    walk(child, optPath, visitedTrees);
                }
            });
        }
    };
    walk(root, 'root', new Set());
    return out;
}

function resolveDependencies(node: any, flatTree: FlatTreeItem[], visited = new Set<string>()): any[] {
    const deps: any[] = [];
    const pipelines = [
        ...(node.pythonSelectedPipelines || []),
        ...(node.selectedPipelines || []),
        ...(node.sqlSelectedPipelines || []),
    ];
    const unique = Array.from(new Set(pipelines));
    unique.forEach((pName: any) => {
        if (visited.has(pName)) return;
        const sourceItem = flatTree.find(item => {
            const n = item.node;
            return n && typeof n === 'object' &&
                (n.pythonResultName === pName || n.sqlResultName === pName || n.name === pName ||
                 n.aiConfig?.outputName === pName);
        });
        if (!sourceItem) return;
        const sn = sourceItem.node;
        const nv = new Set(visited); nv.add(pName);
        const nType = getNodeType(sn);
        if (nType === 'email') return;

        const computedAi = sn.aiConfig?.outputName || (sn.aiConfig?.prompt ? (sn.sqlResultName || sn.pythonResultName) : null);
        if (computedAi === pName && sn.aiConfig?.prompt) {
            deps.push({
                tableName: pName, nodeId: sn.id, path: sourceItem.path, name: pName,
                nodeName: sn.question || sn.decision || sn.name,
                nodeType: 'ai', isPython: false, aiConfig: sn.aiConfig,
                pipelineDependencies: resolveDependencies(sn, flatTree, nv),
            });
            return;
        }

        let depIsPython = nType === 'python';
        if (sn.sqlResultName && sn.pythonResultName && sn.sqlQuery && sn.pythonCode) {
            depIsPython = sn.pythonResultName === pName && sn.sqlResultName !== pName;
        }
        deps.push({
            tableName: pName, nodeId: sn.id, path: sourceItem.path, name: pName,
            sqlResultName: sn.sqlResultName, pythonResultName: sn.pythonResultName,
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
            pipelineDependencies: resolveDependencies(sn, flatTree, nv),
            selectedDocuments: sn.selectedDocuments,
            sharepointPath: sn.sharepointPath, sharepointAction: sn.sharepointAction,
            emailAction: sn.emailAction, hubspotAction: sn.hubspotAction,
        });
    });
    return deps;
}

/**
 * Build the flattened PipelineStep[] for a target node. Mirrors what
 * PipelineExecutionDialog computes client-side, but server-side so the
 * same payload is used by widget refresh, scheduler, and in-node Anteprima.
 */
export function buildPipelineStepsForNode(
    rootTree: any,
    nodeId: string,
    allTrees: Array<{ id: string; jsonDecisionTree: any }> = [],
): PipelineStep[] {
    const flatTree = flattenTree(rootTree, allTrees);
    const targetItem = flatTree.find(it => it.node.id === nodeId);
    if (!targetItem) throw new Error(`Node ${nodeId} not found in tree`);
    const currentPath = targetItem.path;

    const physicalAncestors: any[] = [];
    flatTree.forEach(item => {
        const np = item.path;
        const node = item.node;
        let isAncestor = currentPath !== np && currentPath.startsWith(np + '.');
        if (!isAncestor && np.includes('.sub')) {
            const subRoot = np.split('.sub')[0];
            if (currentPath.startsWith(subRoot + '.options')) isAncestor = true;
        }
        if (!isAncestor) return;
        if (!(node.sqlResultName || node.pythonResultName || node.aiConfig?.outputName || node.aiConfig?.prompt)) return;
        const nType = getNodeType(node);
        if (nType === 'email') return;

        const resolvedDeps = resolveDependencies(node, flatTree);
        const commonName = node.question || node.decision || node.name;
        const aiOut = node.aiConfig?.outputName
            ? node.aiConfig.outputName
            : (node.aiConfig?.prompt ? (node.sqlResultName || node.pythonResultName || null) : null);

        if (aiOut && node.aiConfig?.prompt) {
            physicalAncestors.push({
                id: node.id, path: np, name: aiOut,
                nodeType: 'ai', isPython: false, aiConfig: node.aiConfig,
                pipelineDependencies: resolvedDeps, nodeName: commonName, writesToDatabase: false,
            });
        }

        const sqlName = node.sqlResultName;
        const pyName = node.pythonResultName;
        const hasSql = sqlName && sqlName !== aiOut;
        const hasPy = pyName && pyName !== aiOut;
        if (!hasSql && !hasPy) return;

        const isHybrid = !!(sqlName && pyName && node.sqlQuery && node.pythonCode);
        const writes = node.writesToDatabase || !!node.sqlExportAction;
        const exportTbl = node.sqlExportAction?.targetTableName || node.sqlExportTargetTableName;
        const exportCid = node.sqlExportAction?.targetConnectorId || node.sqlExportTargetConnectorId;

        if (isHybrid) {
            physicalAncestors.push({
                id: node.id, path: np, name: sqlName, sqlResultName: sqlName,
                sqlQuery: node.sqlQuery, query: node.sqlQuery, nodeType: 'sql',
                isPython: false, pythonCode: undefined, pythonOutputType: undefined,
                connectorId: node.sqlConnectorId || node.connectorId,
                pipelineDependencies: resolvedDeps, nodeName: commonName,
                writesToDatabase: writes, sqlExportTargetTableName: exportTbl, sqlExportTargetConnectorId: exportCid,
            });
            physicalAncestors.push({
                id: node.id, path: np, name: pyName, pythonResultName: pyName,
                sqlQuery: undefined, query: undefined, nodeType: 'python',
                isPython: true, pythonCode: node.pythonCode, pythonOutputType: node.pythonOutputType,
                connectorId: node.pythonConnectorId || node.connectorId,
                pipelineDependencies: resolvedDeps, nodeName: commonName,
                writesToDatabase: false, selectedDocuments: node.selectedDocuments,
            });
        } else {
            physicalAncestors.push({
                id: node.id, path: np, name: sqlName || pyName,
                sqlResultName: sqlName, pythonResultName: pyName,
                sqlQuery: node.sqlQuery, query: node.sqlQuery,
                nodeType: nType, isPython: nType === 'python',
                pythonCode: nType === 'python' ? node.pythonCode : undefined,
                connectorId: node.connectorId || node.sqlConnectorId || node.pythonConnectorId,
                pythonOutputType: node.pythonOutputType,
                pipelineDependencies: resolvedDeps, nodeName: commonName,
                writesToDatabase: writes, sqlExportTargetTableName: exportTbl, sqlExportTargetConnectorId: exportCid,
                selectedDocuments: node.selectedDocuments,
                sharepointPath: node.sharepointPath, sharepointAction: node.sharepointAction,
                emailAction: node.emailAction, hubspotAction: node.hubspotAction,
            });
        }
    });

    // Logical closure (collectAncestors) — DFS dependencies first.
    const visited = new Map<string, any>();
    const collect = (nodes: any[]) => {
        nodes.forEach(n => {
            if (n.pipelineDependencies?.length) collect(n.pipelineDependencies);
            const nameOrTbl = n.name || n.tableName;
            const key = n.path ? `${n.path}_${nameOrTbl}` : (n.nodeId ? `${n.nodeId}_${nameOrTbl}` : (n.id ? `${n.id}_${nameOrTbl}` : nameOrTbl));
            if (!visited.has(key)) {
                visited.set(key, {
                    ...n, id: n.id || n.nodeId,
                    nodeType: n.nodeType || (n.isPython ? 'python' : n.aiConfig ? 'ai' : 'sql'),
                });
            }
        });
    };
    collect(physicalAncestors);
    const resolvedAncestors = Array.from(visited.values());

    const steps: PipelineStep[] = [];
    resolvedAncestors.forEach((t: any) => {
        const ancestorDeps = (t.pipelineDependencies || []).map((d: any) => ({
            tableName: d.tableName,
            query: d.query,
            isPython: d.isPython,
            pythonCode: d.pythonCode,
            connectorId: d.connectorId,
            pipelineDependencies: d.pipelineDependencies,
            selectedDocuments: d.selectedDocuments,
        }));
        steps.push({
            id: `${t.id}_exec`,
            type: 'execution',
            label: t.nodeName ? `${t.nodeName} > ${t.name}` : t.name,
            pipelineType: t.nodeType,
            resultName: t.aiConfig?.outputName || t.sqlResultName || t.pythonResultName || t.name,
            nodeId: t.id,
            sqlQuery: t.nodeType !== 'python' && t.nodeType !== 'ai' ? (t.sqlQuery || t.query) : undefined,
            connectorId: t.connectorId || t.sqlConnectorId || t.pythonConnectorId,
            pythonCode: t.nodeType === 'python' ? t.pythonCode : undefined,
            pythonOutputType: t.nodeType === 'python' ? t.pythonOutputType : undefined,
            selectedDocuments: t.selectedDocuments?.length ? t.selectedDocuments : undefined,
            aiConfig: t.nodeType === 'ai' ? t.aiConfig : undefined,
            sqlExportTargetTableName: t.sqlExportTargetTableName,
            sqlExportTargetConnectorId: t.sqlExportTargetConnectorId,
            dependencies: ancestorDeps,
            isPython: t.nodeType === 'python',
            isAi: t.nodeType === 'ai',
        });
        if (t.writesToDatabase) {
            steps.push({
                id: `${t.id}_write`,
                type: 'write',
                label: t.nodeName ? `${t.nodeName} > 💾 Write ${t.sqlExportTargetTableName || 'DB'}` : `💾 Write ${t.sqlExportTargetTableName || 'DB'}`,
                pipelineType: 'export',
                resultName: t.name,
                sourceAncestorName: t.name,
                sqlExportTargetTableName: t.sqlExportTargetTableName,
                sqlExportTargetConnectorId: t.sqlExportTargetConnectorId,
            });
        }
    });

    // Final step(s) for the target node.
    const targetNode = targetItem.node;
    const targetAiOut = targetNode.aiConfig?.prompt
        ? (targetNode.aiConfig.outputName || targetNode.sqlResultName || targetNode.pythonResultName || null)
        : null;
    const targetSqlPy = targetNode.sqlResultName || targetNode.pythonResultName;
    const targetCommon = targetNode.question || targetNode.decision || targetNode.name;
    const targetDeps = resolveDependencies(targetNode, flatTree).map((d: any) => ({
        tableName: d.tableName, query: d.query, isPython: d.isPython,
        pythonCode: d.pythonCode, connectorId: d.connectorId,
        pipelineDependencies: d.pipelineDependencies, selectedDocuments: d.selectedDocuments,
    }));

    if (targetAiOut) {
        steps.push({
            id: 'final_step_ai', type: 'final',
            label: targetCommon ? `${targetCommon} > ${targetAiOut}` : targetAiOut,
            pipelineType: 'ai', resultName: targetAiOut, nodeId: targetNode.id,
            aiConfig: targetNode.aiConfig, dependencies: targetDeps,
        });
    }
    const targetHasSqlPy = targetSqlPy && targetSqlPy !== targetAiOut;
    if (targetHasSqlPy) {
        let nType: any = getNodeType(targetNode);
        if (nType === 'ai') nType = targetNode.pythonCode ? 'python' : 'sql';
        if (nType !== 'email') {
            steps.push({
                id: 'final_step', type: 'final',
                label: targetCommon ? `${targetCommon} > ${targetSqlPy}` : targetSqlPy,
                pipelineType: nType,
                resultName: targetNode.sqlResultName || targetNode.pythonResultName || targetSqlPy,
                nodeId: targetNode.id,
                sqlQuery: nType !== 'python' ? (targetNode.sqlQuery) : undefined,
                connectorId: targetNode.connectorId || targetNode.sqlConnectorId || targetNode.pythonConnectorId,
                pythonCode: nType === 'python' ? targetNode.pythonCode : undefined,
                pythonOutputType: nType === 'python' ? targetNode.pythonOutputType : undefined,
                selectedDocuments: targetNode.selectedDocuments?.length ? targetNode.selectedDocuments : undefined,
                dependencies: targetDeps,
                isPython: nType === 'python',
            });
        }
    }
    if (!targetAiOut && !targetHasSqlPy) {
        const nType = getNodeType(targetNode);
        if (nType !== 'email') {
            steps.push({
                id: 'final_step', type: 'final',
                label: targetNode.sqlResultName || targetNode.pythonResultName || targetNode.aiConfig?.outputName || 'Risultato Finale',
                pipelineType: nType,
                resultName: targetNode.sqlResultName || targetNode.pythonResultName || targetNode.aiConfig?.outputName || 'result',
                nodeId: targetNode.id,
                aiConfig: targetNode.aiConfig,
                connectorId: targetNode.connectorId || targetNode.sqlConnectorId || targetNode.pythonConnectorId,
                dependencies: targetDeps,
            });
        }
    }

    return steps;
}

/**
 * High-level entry point: given a tree + target nodeId, do the FULL pipeline
 * (load tree → flatten → build steps → execute → persist preview). Returns
 * the run result for non-streaming consumers (scheduler, batch jobs).
 *
 * For streaming (NDJSON), use the lower-level `buildPipelineStepsForNode` +
 * `runPipelineSteps` directly so progress events can be forwarded as they arrive.
 */
export async function runPipelineForNode(
    treeId: string,
    nodeId: string,
    options?: {
        emit?: (event: PipelineEvent) => void;
        skipPreviewSave?: boolean;
        bypassAuth?: boolean;
    },
): Promise<PipelineRunResult> {
    const { db } = await import('@/lib/db');
    const tree = await db.tree.findUnique({ where: { id: treeId } });
    if (!tree) throw new Error(`Tree ${treeId} not found`);

    const rootJson = typeof tree.jsonDecisionTree === 'string'
        ? JSON.parse(tree.jsonDecisionTree)
        : tree.jsonDecisionTree;

    // Load all trees in same company for sub-tree resolution.
    const allTrees = await db.tree.findMany({
        where: { companyId: tree.companyId },
        select: { id: true, jsonDecisionTree: true },
    });
    const parsedAllTrees = allTrees.map((t: { id: string; jsonDecisionTree: any }) => ({
        id: t.id,
        jsonDecisionTree: typeof t.jsonDecisionTree === 'string'
            ? JSON.parse(t.jsonDecisionTree)
            : t.jsonDecisionTree,
    }));

    const steps = buildPipelineStepsForNode(rootJson, nodeId, parsedAllTrees);
    const emit = options?.emit ?? (() => {});
    const result = await runPipelineSteps(steps, emit, options?.bypassAuth ?? false);

    if (!options?.skipPreviewSave) {
        try {
            const batch = await buildPreviewBatch(steps, result.results, result.nodeIdResults);
            if (batch.length > 0) {
                const { saveAncestorPreviewsBatchAction } = await import('@/app/actions/scheduler');
                await saveAncestorPreviewsBatchAction(treeId, batch);
            }
        } catch (e) {
            console.warn('[pipeline-runner] Preview save failed:', e);
        }
    }

    return result;
}

/**
 * Helper to build the preview-batch payload from a completed pipeline run,
 * matching the shape consumed by `saveAncestorPreviewsBatchAction`.
 */
export async function buildPreviewBatch(
    steps: PipelineStep[],
    results: Map<string, any>,
    nodeIdResults: Map<string, any>,
): Promise<any[]> {
    const batch: any[] = [];
    for (const step of steps) {
        if (step.type === 'write' || !step.nodeId) continue;
        const isPy = step.pipelineType === 'python';
        const isAi = step.pipelineType === 'ai';
        const compositeKey = `${step.nodeId}_${isAi ? 'ai' : isPy ? 'py' : 'sql'}`;
        const res = nodeIdResults.get(compositeKey) || results.get(step.resultName);
        if (!res) continue;

        let previewRes = res;
        if (isPipelineDatasetRef(res?.data)) {
            try {
                const rows = await resolveDatasetRef(res.data);
                previewRes = {
                    ...res,
                    data: Array.isArray(rows) ? rows.slice(0, 1000) : rows,
                    __truncatedForPreview: Array.isArray(rows) && rows.length > 1000,
                    __datasetRefPreview: {
                        rowCount: res.data.rowCount,
                        sizeBytes: res.data.sizeBytes,
                        columns: res.data.columns,
                    },
                };
            } catch {
                previewRes = {
                    ...res,
                    data: [],
                    __datasetRefPreviewError: true,
                };
            }
        } else if (res?.data && Array.isArray(res.data)) {
            try {
                const size = JSON.stringify(res.data).length;
                if (size > 5_000_000) {
                    previewRes = { ...res, data: res.data.slice(0, 1000), __truncatedForPreview: true };
                }
            } catch { /* ignore */ }
        }

        batch.push({
            nodeId: step.nodeId,
            isPython: isPy,
            isAi,
            pythonOutputType: step.pythonOutputType,
            aiResult: isAi ? (previewRes.data || previewRes) : undefined,
            aiOutputType: isAi ? step.aiConfig?.outputType : undefined,
            result: previewRes,
        });
    }
    return batch;
}
