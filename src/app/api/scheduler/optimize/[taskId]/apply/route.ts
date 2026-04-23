/**
 * POST /api/scheduler/optimize/[taskId]/apply
 *
 * Persists the AI-suggested optimized SQL into the tree node identified by
 * { nodeId } in the request body. Replaces only that one node's `sqlQuery`
 * field — everything else in the tree stays untouched.
 *
 * Body: { nodeId: string, optimizedSql: string }
 *
 * Verifies that the user owns the task's company before mutating the tree
 * (multi-tenant guard). Does NOT re-run the equivalence check — that's the
 * job of the analyze endpoint; the client should only call apply after a
 * successful analyze with `equivalent: true`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

function patchSqlQuery(node: any, targetId: string, newSql: string): boolean {
    if (!node || typeof node !== 'object') return false;
    if ((node.id === targetId || node.nodeId === targetId) && typeof node.sqlQuery === 'string') {
        node.sqlQuery = newSql;
        return true;
    }
    if (node.options && typeof node.options === 'object') {
        for (const key of Object.keys(node.options)) {
            const child = node.options[key];
            if (Array.isArray(child)) {
                for (const c of child) {
                    if (patchSqlQuery(c, targetId, newSql)) return true;
                }
            } else if (patchSqlQuery(child, targetId, newSql)) {
                return true;
            }
        }
    }
    return false;
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
    const { taskId } = await ctx.params;
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string; companyId?: string } | undefined;
    if (!user?.companyId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as { nodeId?: string; optimizedSql?: string } | null;
    if (!body?.nodeId || typeof body.optimizedSql !== 'string' || body.optimizedSql.trim().length === 0) {
        return NextResponse.json({ error: 'Missing nodeId or optimizedSql' }, { status: 400 });
    }

    const task = await db.scheduledTask.findFirst({
        where: { id: taskId, companyId: user.companyId },
    });
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const cfg: any = task.config || {};
    if (!cfg.treeId) return NextResponse.json({ error: 'Task has no tree' }, { status: 400 });

    const tree = await db.tree.findFirst({
        where: { id: cfg.treeId, companyId: user.companyId },
    });
    if (!tree) return NextResponse.json({ error: 'Tree not found' }, { status: 404 });

    const treeJson = JSON.parse(tree.jsonDecisionTree);
    const ok = patchSqlQuery(treeJson, body.nodeId, body.optimizedSql);
    if (!ok) {
        return NextResponse.json(
            { error: `Node ${body.nodeId} not found in tree, or it has no sqlQuery field.` },
            { status: 404 },
        );
    }

    await db.tree.update({
        where: { id: tree.id },
        data: { jsonDecisionTree: JSON.stringify(treeJson) },
    });

    return NextResponse.json({ applied: true, nodeId: body.nodeId, treeId: tree.id });
}
