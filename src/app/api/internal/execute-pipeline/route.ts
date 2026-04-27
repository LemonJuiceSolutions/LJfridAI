/**
 * Server-side pipeline executor with NDJSON streaming progress.
 *
 * Thin HTTP wrapper around `runPipelineSteps` from @/lib/pipeline-runner.
 * The heavy lifting lives in the lib so the scheduler service and node
 * Anteprima dialog can reuse the exact same execution path.
 *
 * Two body modes:
 *   1. { treeId, nodeId }       — server flattens the tree and builds steps
 *   2. { treeId, steps[] }      — caller already built steps (legacy)
 *
 * Protocol (one JSON object per line):
 *   { type: "step-start",  index }
 *   { type: "step-done",   index, success, executionTime, message?, rowCount?, error? }
 *   { type: "done",        success, error? }
 */
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { saveAncestorPreviewsBatchAction } from '@/app/actions/scheduler';
import {
    runPipelineSteps,
    buildPreviewBatch,
    buildPipelineStepsForNode,
    type PipelineStep,
} from '@/lib/pipeline-runner';

export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const companyId = (session?.user as any)?.companyId as string | undefined;
    if (!session?.user || !companyId) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
        treeId,
        nodeId,
        steps: incomingSteps,
        overrideTargetScript,
        overrideTargetOutputType,
    } = body as {
        treeId: string;
        nodeId?: string;
        steps?: PipelineStep[];
        // Run the saved tree pipeline but swap the target node's pythonCode
        // with this string. Used by the in-node Anteprima auto-execute so the
        // chat-modified script runs through the SAME ancestor chain as the
        // saved version, without persisting changes first.
        overrideTargetScript?: string;
        overrideTargetOutputType?: string;
    };

    if (!treeId) {
        return Response.json({ error: 'Missing treeId' }, { status: 400 });
    }
    if (!nodeId && (!incomingSteps || !Array.isArray(incomingSteps))) {
        return Response.json({ error: 'Provide either nodeId or steps[]' }, { status: 400 });
    }

    // ── Resolve steps (server-side flatten when only nodeId provided) ──
    let steps: PipelineStep[];
    if (nodeId) {
        const tree = await db.tree.findFirst({ where: { id: treeId, companyId } });
        if (!tree) return Response.json({ error: 'Tree not found' }, { status: 404 });
        const rootJson = typeof tree.jsonDecisionTree === 'string'
            ? JSON.parse(tree.jsonDecisionTree) : tree.jsonDecisionTree;
        const others = await db.tree.findMany({
            where: { companyId: tree.companyId },
            select: { id: true, jsonDecisionTree: true },
        });
        const parsedAll = others.map((t: { id: string; jsonDecisionTree: any }) => ({
            id: t.id,
            jsonDecisionTree: typeof t.jsonDecisionTree === 'string'
                ? JSON.parse(t.jsonDecisionTree) : t.jsonDecisionTree,
        }));
        try {
            steps = buildPipelineStepsForNode(rootJson, nodeId, parsedAll);
        } catch (e: any) {
            return Response.json({ error: e?.message || 'Failed to build pipeline' }, { status: 400 });
        }
        // Override the target step's script/outputType in-memory so the
        // unsaved chat draft runs through the same ancestor chain.
        if (overrideTargetScript || overrideTargetOutputType) {
            for (let i = steps.length - 1; i >= 0; i--) {
                if (steps[i].type === 'final') {
                    if (overrideTargetScript) steps[i].pythonCode = overrideTargetScript;
                    if (overrideTargetOutputType) {
                        steps[i].pythonOutputType = overrideTargetOutputType;
                        if (overrideTargetOutputType !== 'sql' && overrideTargetOutputType !== 'ai') {
                            steps[i].pipelineType = 'python';
                            steps[i].isPython = true;
                            steps[i].sqlQuery = undefined;
                        }
                    }
                    break;
                }
            }
        }
    } else {
        steps = incomingSteps as PipelineStep[];
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: Record<string, any>) => {
                try {
                    controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
                } catch { /* stream closed */ }
            };

            // Emit the full step list up-front so the client can render every
            // node (label + type) in the "pending" state immediately, then flip
            // to running/success/error as `step-start` / `step-done` events arrive.
            send({
                type: 'pipeline-init',
                steps: steps.map((s, i) => ({
                    index: i,
                    label: s.label,
                    type: s.pipelineType,
                    nodeId: s.nodeId,
                    isWrite: s.type === 'write',
                    isFinal: s.type === 'final',
                })),
            });

            const { results, nodeIdResults } = await runPipelineSteps(steps, send);

            try {
                const previewBatch = await buildPreviewBatch(steps, results, nodeIdResults);
                if (previewBatch.length > 0) {
                    await saveAncestorPreviewsBatchAction(treeId, previewBatch);
                }
            } catch (e) {
                console.warn('[execute-pipeline] Preview save failed:', e);
            }

            try {
                const { invalidateWidgetDiscoveryCache } = await import(
                    '@/app/api/internal/widget-discovery/cache'
                );
                invalidateWidgetDiscoveryCache();
            } catch { /* best effort */ }

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
