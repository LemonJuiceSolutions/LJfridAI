/**
 * Batch widget preview data loader.
 *
 * Accepts a list of { treeId, nodeId } pairs and returns all preview data
 * in a single response.  This replaces N individual getNodePreviewAction()
 * Server Action calls with one HTTP request.
 *
 * Response: { [treeId:nodeId]: previewData | null }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const companyId = (session?.user as any)?.companyId as string | undefined;
    if (!companyId) {
        return NextResponse.json({}, { status: 401 });
    }

    const body = await req.json();
    const widgets: Array<{ treeId: string; nodeId: string }> = body.widgets;
    if (!widgets || !Array.isArray(widgets) || widgets.length === 0) {
        return NextResponse.json({});
    }

    try {
        // Group by treeId to batch DB queries
        const byTree = new Map<string, string[]>();
        for (const w of widgets) {
            if (!byTree.has(w.treeId)) byTree.set(w.treeId, []);
            byTree.get(w.treeId)!.push(w.nodeId);
        }

        // SECURITY CRITICAL: filter treeIds to those owned by user's company
        // before reading preview cache (prevents cross-tenant data leak).
        const requestedTreeIds = Array.from(byTree.keys());
        const ownedTrees = await db.tree.findMany({
            where: { id: { in: requestedTreeIds }, companyId },
            select: { id: true },
        });
        const ownedTreeIds = new Set(ownedTrees.map((t: any) => t.id));

        // Load all preview cache entries in parallel (one query per tree)
        // Only for trees the user's company owns.
        const queries = Array.from(byTree.entries())
            .filter(([treeId]) => ownedTreeIds.has(treeId))
            .map(([treeId, nodeIds]) =>
                db.nodePreviewCache.findMany({
                    where: { treeId, nodeId: { in: nodeIds } },
                }).then((entries: any) => entries.map((e: any) => ({ ...e, treeId })))
            );

        const results = await Promise.all(queries);

        // Build response map
        const response: Record<string, any> = {};
        const MAX_ROWS = 2000;
        const DUCKDB_MARKER = '__duckdb__';

        // PERF: was calling resolveCacheEntry per-entry → one DuckDB query per
        // widget. A dashboard with 20 widgets opened 20 DuckDB connections and
        // fired 20 single-node queries, despite getBlobsForTree supporting
        // batched node IDs. Now: walk entries once to collect (tree → nodes,
        // fields), one batched DuckDB call per tree, then distribute results.

        type FieldName = 'sql_data' | 'python_data' | 'python_html' | 'python_chart_html' | 'python_chart_base64' | 'python_plotly' | 'exec_data' | 'ai_result';
        const needByTree = new Map<string, { nodeIds: Set<string>; fields: Set<FieldName> }>();
        const flatEntries: Array<{ treeId: string; nodeId: string; cached: any; key: string }> = [];

        for (const entries of results) {
            for (const entry of entries) {
                const key = `${entry.treeId}:${entry.nodeId}`;
                const cached = entry.data as any;
                if (!cached) { response[key] = null; continue; }
                flatEntries.push({ treeId: entry.treeId, nodeId: entry.nodeId, cached, key });

                const fields: FieldName[] = [];
                if (cached.sqlPreviewData === DUCKDB_MARKER) fields.push('sql_data');
                const p = cached.pythonPreviewResult;
                if (p) {
                    if (p.data === DUCKDB_MARKER) fields.push('python_data');
                    if (p.html === DUCKDB_MARKER) fields.push('python_html');
                    if (p.chartHtml === DUCKDB_MARKER) fields.push('python_chart_html');
                    if (p.chartBase64 === DUCKDB_MARKER) fields.push('python_chart_base64');
                    if (p.plotlyJson === DUCKDB_MARKER) fields.push('python_plotly');
                }
                if (cached.executionPreviewResult?.data === DUCKDB_MARKER) fields.push('exec_data');
                if (cached.aiResult === DUCKDB_MARKER) fields.push('ai_result');

                if (fields.length > 0) {
                    let slot = needByTree.get(entry.treeId);
                    if (!slot) { slot = { nodeIds: new Set(), fields: new Set() }; needByTree.set(entry.treeId, slot); }
                    slot.nodeIds.add(entry.nodeId);
                    for (const f of fields) slot.fields.add(f);
                }
            }
        }

        // One batched DuckDB read per tree (was N per dashboard).
        const blobsByTreeAndNode = new Map<string, Map<string, Map<FieldName, any>>>();
        if (needByTree.size > 0) {
            const { getBlobsForTree } = await import('@/lib/preview-cache/duckdb-store');
            await Promise.all(Array.from(needByTree.entries()).map(async ([treeId, slot]) => {
                try {
                    const m = await getBlobsForTree(treeId, Array.from(slot.nodeIds), Array.from(slot.fields));
                    blobsByTreeAndNode.set(treeId, m as Map<string, Map<FieldName, any>>);
                } catch (err: any) {
                    console.warn(`[widget-data-batch] DuckDB batched read failed for ${treeId}: ${err.message}`);
                }
            }));
        }

        // Distribute resolved blobs back into cached objects + truncate rows.
        for (const { treeId, nodeId, cached, key } of flatEntries) {
            const entry = blobsByTreeAndNode.get(treeId)?.get(nodeId);
            if (entry) {
                if (entry.has('sql_data')) cached.sqlPreviewData = entry.get('sql_data');
                const p = cached.pythonPreviewResult;
                if (p) {
                    if (entry.has('python_data')) p.data = entry.get('python_data');
                    if (entry.has('python_html')) p.html = entry.get('python_html');
                    if (entry.has('python_chart_html')) p.chartHtml = entry.get('python_chart_html');
                    if (entry.has('python_chart_base64')) p.chartBase64 = entry.get('python_chart_base64');
                    if (entry.has('python_plotly')) p.plotlyJson = entry.get('python_plotly');
                }
                if (entry.has('exec_data') && cached.executionPreviewResult) {
                    cached.executionPreviewResult.data = entry.get('exec_data');
                }
                if (entry.has('ai_result')) cached.aiResult = entry.get('ai_result');
            }

            if (Array.isArray(cached.sqlPreviewData) && cached.sqlPreviewData.length > MAX_ROWS) {
                cached._sqlTotalRows = cached.sqlPreviewData.length;
                cached.sqlPreviewData = cached.sqlPreviewData.slice(0, MAX_ROWS);
            }
            if (Array.isArray(cached.pythonPreviewResult?.data) && cached.pythonPreviewResult.data.length > MAX_ROWS) {
                cached.pythonPreviewResult._totalRows = cached.pythonPreviewResult.data.length;
                cached.pythonPreviewResult.data = cached.pythonPreviewResult.data.slice(0, MAX_ROWS);
            }

            response[key] = cached;
        }

        return NextResponse.json(response);
    } catch (e: any) {
        console.error('[widget-data-batch] Error:', e);
        return NextResponse.json({}, { status: 500 });
    }
}
