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
import { CACHE_TTL, cache, type DiscoveredWidget } from './cache';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).companyId) {
        return NextResponse.json([], { status: 401 });
    }

    const companyId = (session.user as any).companyId;

    // Check ?refresh=1 to force cache bypass
    const forceRefresh = req.nextUrl.searchParams.get('refresh') === '1';

    // Return cached result if fresh
    const cached = cache.get(companyId);
    if (!forceRefresh && cached && Date.now() - cached.ts < CACHE_TTL) {
        return NextResponse.json(cached.widgets);
    }

    try {
        const startTime = Date.now();

        // 1. Load tree IDs + names + pipelines in parallel
        //    Also load preview metadata — needed to know which trees have widgets
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

        const treeIds = treesLightweight.map(t => t.id);
        const treeNameMap = new Map(treesLightweight.map(t => [t.id, t.name]));

        // 2. Load preview metadata for all trees
        const allPreviews = treeIds.length > 0
            ? await db.nodePreviewCache.findMany({
                where: { treeId: { in: treeIds } },
                select: { treeId: true, nodeId: true, data: true },
            })
            : [];

        // Build preview map + collect which trees have preview entries
        const previewMap = new Map<string, Map<string, { hasSql: boolean; pythonType?: string }>>();
        const treesWithPreviews = new Set<string>();
        for (const entry of allPreviews) {
            if (!previewMap.has(entry.treeId)) previewMap.set(entry.treeId, new Map());
            treesWithPreviews.add(entry.treeId);
            const c = entry.data as any;
            if (!c) continue;
            previewMap.get(entry.treeId)!.set(entry.nodeId, {
                hasSql: !!c.sqlPreviewData,
                pythonType: c.pythonPreviewResult?.type || undefined,
            });
        }

        // 3. Load FULL tree JSON only for trees that might have widgets:
        //    - trees with preview entries (SQL/Python widgets)
        //    - all trees (needed for widgetConfig.isPublished scan)
        //    Optimization: load only trees with previews first, add others only
        //    if they could have published widgetConfigs (we check all — cheap JSON scan)
        const treesWithJson = treeIds.length > 0
            ? await db.tree.findMany({
                where: { id: { in: treeIds } },
                select: { id: true, jsonDecisionTree: true },
            })
            : [];
        const treeJsonMap = new Map(treesWithJson.map(t => [t.id, t.jsonDecisionTree]));

        // 4. Scan trees for widgets
        const widgets: DiscoveredWidget[] = [];

        for (const treeId of treeIds) {
            const treeName = treeNameMap.get(treeId) || '';
            const meta = previewMap.get(treeId) || new Map();
            const rawJson = treeJsonMap.get(treeId);
            if (!rawJson) continue;

            let jsonTree: any;
            try {
                jsonTree = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
            } catch { continue; }

            const visitedSubTrees = new Set<string>();

            const scanNode = (node: any) => {
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
                        } else if (typeof child === 'object') {
                            scanNode(child);
                        }
                    }
                }

                if (node.subTreeRef && !visitedSubTrees.has(node.subTreeRef)) {
                    visitedSubTrees.add(node.subTreeRef);
                    const subJson = treeJsonMap.get(node.subTreeRef);
                    if (subJson) {
                        try {
                            const parsed = typeof subJson === 'string' ? JSON.parse(subJson) : subJson;
                            if (parsed) scanNode(parsed);
                        } catch { /* skip */ }
                    }
                }
            };

            scanNode(jsonTree);
        }

        // 5. Pipeline widgets
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

        // Cache the result
        cache.set(companyId, { widgets, ts: Date.now() });

        console.log(`[widget-discovery] ${widgets.length} widgets in ${Date.now() - startTime}ms (cached for ${CACHE_TTL / 1000}s)`);

        return NextResponse.json(widgets);
    } catch (e: any) {
        console.error('[widget-discovery] Error:', e);
        return NextResponse.json([], { status: 500 });
    }
}
