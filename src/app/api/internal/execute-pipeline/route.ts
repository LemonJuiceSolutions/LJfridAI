/**
 * Server-side pipeline executor with NDJSON streaming progress.
 *
 * Replaces the client-side orchestration loop in PipelineExecutionDialog.
 * All SQL/Python/AI results stay in server memory — no multi-MB JSON
 * round-trips through the browser.  The client only receives lightweight
 * progress events.
 *
 * Protocol (one JSON object per line):
 *   { type: "step-start",  index }
 *   { type: "step-done",   index, success, executionTime, message?, rowCount?, error? }
 *   { type: "done",        success, error? }
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';
import { exportTableToSqlAction } from '@/app/actions/sql';
import { saveAncestorPreviewsBatchAction } from '@/app/actions/scheduler';
import { generateText } from 'ai';
import { getOpenRouterSettingsAction } from '@/actions/openrouter';
import { getAiProviderAction, type AiProvider } from '@/actions/ai-settings';
import { getOpenRouterModel } from '@/ai/providers/openrouter-provider';
import { runClaudeCliSync } from '@/ai/providers/claude-cli-provider';

export const maxDuration = 300; // 5 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelineStep {
    id: string;
    type: 'execution' | 'write' | 'final';
    label: string;
    pipelineType: string;
    resultName: string;
    nodeId?: string;
    // SQL
    sqlQuery?: string;
    connectorId?: string;
    // Python
    pythonCode?: string;
    pythonOutputType?: string;
    selectedDocuments?: any[];
    // AI
    aiConfig?: { prompt: string; model: string; outputType: string; outputName?: string };
    // Export / Write
    sourceAncestorName?: string;
    sqlExportTargetTableName?: string;
    sqlExportTargetConnectorId?: string;
    // Dependencies (names + fallback fetch info)
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

// ---------------------------------------------------------------------------
// AI helpers (same logic as ancestor-executor.ts and ai-node/execute)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { treeId, steps } = body as { treeId: string; steps: PipelineStep[] };

    if (!treeId || !steps || !Array.isArray(steps)) {
        return Response.json({ error: 'Missing treeId or steps' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: Record<string, any>) => {
                try {
                    controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
                } catch { /* stream closed */ }
            };

            // Server-side result store — data never leaves the server
            const results = new Map<string, any>();
            const nodeIdResults = new Map<string, any>();
            let pipelineSuccess = true;

            // ----- Execute each step -----
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                const startTime = Date.now();
                send({ type: 'step-start', index: i });

                try {
                    if (step.type === 'execution' || step.type === 'final') {
                        await executeStep(step, i, startTime, results, nodeIdResults, steps, send);
                    } else if (step.type === 'write') {
                        await executeWriteStep(step, i, startTime, results, send);
                    }
                } catch (e: any) {
                    const elapsed = Date.now() - startTime;
                    send({
                        type: 'step-done', index: i, success: false,
                        executionTime: elapsed, error: e.message || 'Unknown error',
                    });
                    if (step.type === 'final') {
                        pipelineSuccess = false;
                        break;
                    }
                }
            }

            // ----- Save previews (server-side, no browser round-trip) -----
            try {
                const previewBatch = buildPreviewBatch(steps, results, nodeIdResults);
                if (previewBatch.length > 0) {
                    await saveAncestorPreviewsBatchAction(treeId, previewBatch);
                }
            } catch (e) {
                console.warn('[execute-pipeline] Preview save failed:', e);
            }

            // Invalidate widget discovery cache so new widgets appear immediately
            try {
                const { invalidateWidgetDiscoveryCache } = await import(
                    '@/app/api/internal/widget-discovery/route'
                );
                invalidateWidgetDiscoveryCache();
            } catch { /* best effort */ }

            send({ type: 'done', success: pipelineSuccess });
            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
        },
    });
}

// ---------------------------------------------------------------------------
// Step executors
// ---------------------------------------------------------------------------

async function executeStep(
    step: PipelineStep,
    index: number,
    startTime: number,
    results: Map<string, any>,
    nodeIdResults: Map<string, any>,
    allSteps: PipelineStep[],
    send: (e: Record<string, any>) => void,
) {
    const nType = step.pipelineType;

    // ── Python ──
    if (nType === 'python' && step.pythonCode) {
        const inputData: Record<string, any[]> = {};
        for (const [key, val] of results.entries()) {
            const data = val?.data ?? val;
            if (Array.isArray(data)) inputData[key] = data;
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
            undefined,
            step.selectedDocuments,
        );

        if (!pyResult.success) {
            send({
                type: 'step-done', index, success: false,
                executionTime: Date.now() - startTime,
                error: pyResult.error || 'Python execution failed',
            });
            if (step.type === 'final') throw new Error(pyResult.error || 'Python execution failed');
            return;
        }

        results.set(step.resultName, pyResult);
        if (step.nodeId) nodeIdResults.set(`${step.nodeId}_py`, pyResult);

        const msg = (pyResult as any)._warning
            || (pyResult.data?.length === 0 ? 'Script completato, 0 righe' : undefined);
        send({
            type: 'step-done', index, success: true,
            executionTime: Date.now() - startTime,
            message: msg,
            rowCount: pyResult.data?.length,
        });
        return;
    }

    // ── AI ──
    if (nType === 'ai' && step.aiConfig) {
        let prompt = step.aiConfig.prompt;

        // Interpolate template placeholders with pipeline data
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
        prompt = prompt.replace(
            /\{\{GRAFICO:([^}]+)\}\}/g,
            (_, name: string) => `[Grafico "${name}"]`,
        );

        // Resolve AI provider
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
                send({
                    type: 'step-done', index, success: false,
                    executionTime: Date.now() - startTime,
                    error: 'OpenRouter API key non configurata',
                });
                if (step.type === 'final') throw new Error('OpenRouter API key non configurata');
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

        send({
            type: 'step-done', index, success: true,
            executionTime: Date.now() - startTime,
            message: `Risultato AI (${data.length} righe)`,
            rowCount: data.length,
        });
        return;
    }

    // ── Simulated actions (SharePoint, Email, HubSpot) ──
    if (nType === 'sharepoint' || nType === 'email' || nType === 'hubspot') {
        send({
            type: 'step-done', index, success: true,
            executionTime: Date.now() - startTime,
            message: `Anteprima ${nType} simulata`,
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
        step.sqlQuery || '',
        step.connectorId || '',
        deps,
    );

    if (sqlResult.error || !sqlResult.data) {
        const errMsg = sqlResult.error || 'Query failed';
        send({
            type: 'step-done', index, success: false,
            executionTime: Date.now() - startTime, error: errMsg,
        });
        if (step.type === 'final') throw new Error(errMsg);
        return;
    }

    results.set(step.resultName, { data: sqlResult.data });
    if (step.nodeId) nodeIdResults.set(`${step.nodeId}_sql`, { data: sqlResult.data });

    // Surface dependency warnings
    const depWarnings = (sqlResult as any)?._depWarnings;
    const msg = depWarnings?.length
        ? `⚠️ ${depWarnings.length} dipendenza/e con problemi — risultato parziale`
        : undefined;

    send({
        type: 'step-done', index, success: true,
        executionTime: Date.now() - startTime,
        message: msg,
        rowCount: Array.isArray(sqlResult.data) ? sqlResult.data.length : undefined,
    });
}

async function executeWriteStep(
    step: PipelineStep,
    index: number,
    startTime: number,
    results: Map<string, any>,
    send: (e: Record<string, any>) => void,
) {
    const sourceData = results.get(step.sourceAncestorName || '')?.data;
    if (!sourceData) {
        send({
            type: 'step-done', index, success: false,
            executionTime: Date.now() - startTime, error: 'No data to write',
        });
        return;
    }

    const targetConnectorId = step.sqlExportTargetConnectorId || step.connectorId || '';
    const targetTableName = step.sqlExportTargetTableName || '';

    if (targetConnectorId && targetTableName) {
        const writeRes = await exportTableToSqlAction(
            targetConnectorId, targetTableName, sourceData, true,
        );
        send({
            type: 'step-done', index,
            success: writeRes.success,
            executionTime: Date.now() - startTime,
            error: writeRes.success ? undefined : (writeRes.error || 'Write failed'),
        });
    } else {
        send({
            type: 'step-done', index, success: true,
            executionTime: Date.now() - startTime,
        });
    }
}

// ---------------------------------------------------------------------------
// Preview batch builder
// ---------------------------------------------------------------------------

function buildPreviewBatch(
    steps: PipelineStep[],
    results: Map<string, any>,
    nodeIdResults: Map<string, any>,
): any[] {
    const batch: any[] = [];

    for (const step of steps) {
        if (step.type === 'write' || !step.nodeId) continue;

        const isPy = step.pipelineType === 'python';
        const isAi = step.pipelineType === 'ai';
        const compositeKey = `${step.nodeId}_${isAi ? 'ai' : isPy ? 'py' : 'sql'}`;
        const res = nodeIdResults.get(compositeKey) || results.get(step.resultName);

        if (!res) continue;

        // Truncate massive data arrays for DB preview storage (keep ≤ 1000 rows)
        let previewRes = res;
        if (res?.data && Array.isArray(res.data)) {
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
