/**
 * Widget discovery API — returns a lightweight list of available widgets.
 *
 * All heavy work (tree loading, JSON parsing, preview metadata lookup)
 * happens server-side.  The client receives only widget IDs and names
 * (~few KB total), avoiding multi-MB tree JSON serialization via RSC.
 *
 * Results are cached in-memory for 30s — repeat calls return in <1ms.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { CACHE_TTL, CACHE_SWR, cache, inflight, type DiscoveredWidget } from './cache';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).companyId) {
        return NextResponse.json([], { status: 401 });
    }

    const companyId = (session.user as any).companyId;

    // Check ?refresh=1 to force cache bypass
    const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1';

    // Cache lookup with stale-while-revalidate.
    //   age < CACHE_TTL  → return cached, no work.
    //   age < CACHE_SWR  → return cached NOW, trigger background rebuild.
    //   age ≥ CACHE_SWR  → block until rebuild (or join an existing inflight).
    const cached = cache.get(companyId);
    const age = cached ? Date.now() - cached.ts : Infinity;
    if (!forceRefresh && cached) {
        if (age < CACHE_TTL) {
            return NextResponse.json(cached.widgets);
        }
        if (age < CACHE_SWR) {
            // Stale — kick off rebuild without awaiting, serve stale instantly.
            if (!inflight.has(companyId)) {
                const p = buildWidgets(companyId)
                    .then(w => { cache.set(companyId, { widgets: w, ts: Date.now() }); return w; })
                    .catch(err => { console.error('[widget-discovery] SWR rebuild failed:', err); return cached.widgets; })
                    .finally(() => { inflight.delete(companyId); });
                inflight.set(companyId, p);
            }
            return NextResponse.json(cached.widgets);
        }
    }

    // Block path — join inflight if another request is already rebuilding.
    try {
        let widgets: DiscoveredWidget[];
        const existing = inflight.get(companyId);
        if (existing && !forceRefresh) {
            widgets = await existing;
        } else {
            const p = buildWidgets(companyId).finally(() => { inflight.delete(companyId); });
            inflight.set(companyId, p);
            widgets = await p;
            cache.set(companyId, { widgets, ts: Date.now() });
        }
        return NextResponse.json(widgets);
    } catch (e: any) {
        console.error('[widget-discovery] Error:', e);
        return NextResponse.json([], { status: 500 });
    }
}

async function buildWidgets(companyId: string): Promise<DiscoveredWidget[]> {
    const startTime = Date.now();

    // 1. Load tree IDs + names + pipelines in parallel.
    const [treesLightweight, pipelines] = await Promise.all([
        db.tree.findMany({
            where: { companyId },
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
        }),
        db.pipeline.findMany({
            where: { companyId },
            select: { id: true, nodes: true },
        }).catch(() => [] as any[]),
    ]);

    const treeIds = treesLightweight.map((t: any) => t.id);
    const treeNameMap = new Map(treesLightweight.map((t: any) => [t.id, t.name]));

    // 2. Load preview metadata — lightweight, only flags we need.
    const allPreviews = treeIds.length > 0
        ? await db.nodePreviewCache.findMany({
            where: { treeId: { in: treeIds } },
            select: { treeId: true, nodeId: true, data: true },
        })
        : [];

    const previewMap = new Map<string, Map<string, { hasSql: boolean; pythonType?: string }>>();
    for (const entry of allPreviews) {
        if (!previewMap.has(entry.treeId)) previewMap.set(entry.treeId, new Map());
        const c = entry.data as any;
        if (!c) continue;
        previewMap.get(entry.treeId)!.set(entry.nodeId, {
            hasSql: !!c.sqlPreviewData,
            pythonType: c.pythonPreviewResult?.type || undefined,
        });
    }

    // 3. Tree JSON: previous impl loaded one tree at a time, cleared the
    //    subtree cache between iterations (→ same subtree reparsed N times),
    //    and awaited on every recursion step without any real I/O. Observed:
    //    62s for 121 widgets on a company with many trees, blocking the event
    //    loop for everyone else. Now: parallel load, shared subtree cache,
    //    synchronous walk.
    const widgets: DiscoveredWidget[] = [];
    const treeJsonCache = new Map<string, any>();

    // Parallel-load all top-level tree JSONs once. Subtree refs are resolved
    // synchronously below using this same cache — no extra DB trips unless
    // a subTreeRef points to a tree we don't have yet.
    await Promise.all(treeIds.map(async (id: string) => {
        try {
            const row = await db.tree.findUnique({
                where: { id },
                select: { jsonDecisionTree: true },
            });
            if (!row?.jsonDecisionTree) return;
            const parsed = typeof row.jsonDecisionTree === 'string'
                ? JSON.parse(row.jsonDecisionTree)
                : row.jsonDecisionTree;
            treeJsonCache.set(id, parsed);
        } catch { /* skip broken tree */ }
    }));

    // Resolve a subTreeRef that wasn't in the initial batch (rare). Blocking
    // fallback kept for correctness; logged for visibility.
    async function resolveMissingSubtree(id: string): Promise<any | null> {
        if (treeJsonCache.has(id)) return treeJsonCache.get(id);
        const row = await db.tree.findUnique({
            where: { id },
            select: { jsonDecisionTree: true },
        }).catch(() => null);
        if (!row?.jsonDecisionTree) { treeJsonCache.set(id, null); return null; }
        try {
            const parsed = typeof row.jsonDecisionTree === 'string'
                ? JSON.parse(row.jsonDecisionTree) : row.jsonDecisionTree;
            treeJsonCache.set(id, parsed);
            return parsed;
        } catch { treeJsonCache.set(id, null); return null; }
    }

    for (const treeId of treeIds) {
        const treeName = treeNameMap.get(treeId) || '';
        const meta = previewMap.get(treeId) || new Map();
        const jsonTree = treeJsonCache.get(treeId);
        if (!jsonTree) continue;

        const visitedSubTrees = new Set<string>();
        // Collect subtree refs we need to fetch separately — rare tail case.
        const pendingSubtrees: string[] = [];

        const scanNode = (node: any): void => {
            if (!node || typeof node !== 'object') return;
            const nodeId = node.id;
            if (!nodeId) return;

            const nodeMeta = meta.get(nodeId);

            if (node.widgetConfig?.isPublished) {
                widgets.push({
                    widgetId: `tree-${treeId}-${nodeId}`,
                    name: node.widgetConfig.title || `Widget da ${treeName}`,
                    treeId, nodeId, type: 'node',
                });
            }

            if (node.sqlResultName && (node.sqlPreviewData || nodeMeta?.hasSql)) {
                widgets.push({
                    widgetId: `sql-preview-${treeId}-${nodeId}`,
                    name: `SQL: ${node.sqlResultName} (${treeName})`,
                    treeId, nodeId, type: 'sql',
                    resultName: node.sqlResultName,
                });
            }

            if (node.pythonResultName) {
                const pyType = nodeMeta?.pythonType || node.pythonPreviewResult?.type;
                if (pyType === 'chart' || pyType === 'table' || pyType === 'variable' || pyType === 'html') {
                    const typeLabel = pyType === 'chart' ? 'Grafico' :
                        pyType === 'table' ? 'Tabella' :
                            pyType === 'html' ? 'HTML' : 'Variabile';
                    widgets.push({
                        widgetId: `python-preview-${treeId}-${nodeId}`,
                        name: `Python ${typeLabel}: ${node.pythonResultName} (${treeName})`,
                        treeId, nodeId, type: 'python',
                        resultName: node.pythonResultName, pythonType: pyType,
                    });
                }
            }

            if (node.options && typeof node.options === 'object') {
                for (const child of Object.values(node.options)) {
                    if (Array.isArray(child)) {
                        for (const c of child) scanNode(c);
                    } else if (child && typeof child === 'object') {
                        scanNode(child);
                    }
                }
            }

            if (node.subTreeRef && !visitedSubTrees.has(node.subTreeRef)) {
                visitedSubTrees.add(node.subTreeRef);
                const sub = treeJsonCache.get(node.subTreeRef);
                if (sub === undefined) {
                    // Not in the initial parallel batch — queue for later fetch.
                    pendingSubtrees.push(node.subTreeRef);
                } else if (sub) {
                    scanNode(sub);
                }
            }
        };

        scanNode(jsonTree);

        // Drain any missing subtrees for this tree (rare path).
        while (pendingSubtrees.length > 0) {
            const id = pendingSubtrees.shift()!;
            const sub = await resolveMissingSubtree(id);
            if (sub) scanNode(sub);
        }
    }

    // 4. Pipeline widgets.
    for (const pipeline of pipelines) {
        try {
            const nodes = typeof pipeline.nodes === 'string'
                ? JSON.parse(pipeline.nodes) : pipeline.nodes;
            if (nodes) {
                for (const node of Object.values(nodes) as any[]) {
                    if (node.type === 'end' && node.isPublished) {
                        widgets.push({
                            widgetId: `pipeline-${pipeline.id}-${node.id}`,
                            name: node.name || 'Pipeline Widget',
                            treeId: pipeline.id, nodeId: node.id, type: 'pipeline',
                        });
                    }
                }
            }
        } catch { /* skip broken pipeline */ }
    }

    console.log(`[widget-discovery] ${widgets.length} widgets in ${Date.now() - startTime}ms (cache fresh ${CACHE_TTL / 1000}s, SWR ${CACHE_SWR / 1000}s)`);
    return widgets;
}
