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

        for (const entries of results) {
            for (const entry of entries) {
                const key = `${entry.treeId}:${entry.nodeId}`;
                const cached = entry.data as any;
                if (!cached) { response[key] = null; continue; }

                // Truncate large data arrays for transport
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
        }

        return NextResponse.json(response);
    } catch (e: any) {
        console.error('[widget-data-batch] Error:', e);
        return NextResponse.json({}, { status: 500 });
    }
}
