/**
 * GET /api/scheduler/optimize/list
 *
 * Returns the company's scheduled tasks ranked by recent average duration,
 * which is what the optimisation tab needs to surface "the slow ones first".
 *
 * Response shape:
 *   { tasks: Array<{ id, name, type, treeName, avgMs, runs, lastStatus }> }
 *
 * Filters out:
 *   - tasks with zero completed executions (nothing to compare against)
 *   - executions whose duration > 30 min (zombie records artificially inflate
 *     averages — see fix-stuck-executions migration)
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

const ZOMBIE_CUTOFF_MS = 30 * 60 * 1000;

// Friendly-name extraction — mirrors getTaskNodeName() / parseNodePath()
// from src/app/scheduler/page.tsx so the Ottimizzazione tab labels match
// the Schedulazioni / Registro Invii tabs the user is used to.
function parseNodePath(nodePath: string): string[] {
    if (nodePath.includes('.options[')) {
        const matches = nodePath.match(/\['([^']+)'\]/g);
        if (matches && matches.length > 0) return matches.map(m => m.replace(/\['|'\]/g, ''));
    }
    if (nodePath.includes('->')) return nodePath.split('->').filter(p => p !== 'root');
    return [];
}

function friendlyTaskName(task: { name: string; config: any; treeName: string | null }): string {
    const config = task.config || {};
    if (config.nodePath) {
        const parts = parseNodePath(config.nodePath);
        if (parts.length > 0) return parts[parts.length - 1];
    }
    if (config.subject) return config.subject;
    if (config.sqlResultName) return config.sqlResultName;
    if (config.pythonResultName) return config.pythonResultName;
    if (task.name.startsWith('Node-') && task.treeName) return task.treeName;
    return task.name;
}

export async function GET() {
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string; companyId?: string } | undefined;
    if (!user?.companyId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tasks = await db.scheduledTask.findMany({
        where: { companyId: user.companyId },
        select: { id: true, name: true, type: true, config: true },
        orderBy: { createdAt: 'asc' },
    });
    const treeIds = Array.from(new Set(
        tasks.map((t: { config: any }) => (t.config as any)?.treeId).filter(Boolean) as string[],
    ));
    const trees = await db.tree.findMany({
        where: { id: { in: treeIds }, companyId: user.companyId },
        select: { id: true, name: true },
    });
    const treeMap = new Map<string, string>(trees.map((t: { id: string; name: string }) => [t.id, t.name] as const));

    const recent = await db.scheduledTaskExecution.findMany({
        where: { taskId: { in: tasks.map((t: { id: string }) => t.id) } },
        orderBy: { startedAt: 'desc' },
        take: 1000,
        select: { taskId: true, startedAt: true, completedAt: true, status: true },
    });

    const stats = new Map<string, { total: number; count: number; lastStatus: string | null }>();
    for (const r of recent) {
        if (!r.completedAt) continue;
        const ms = r.completedAt.getTime() - r.startedAt.getTime();
        if (ms > ZOMBIE_CUTOFF_MS) continue;
        const s = stats.get(r.taskId) || { total: 0, count: 0, lastStatus: null };
        s.total += ms;
        s.count += 1;
        if (s.lastStatus === null) s.lastStatus = r.status;
        stats.set(r.taskId, s);
    }

    type TaskRecord = (typeof tasks)[number];
    const items = tasks
        .map((t: TaskRecord) => {
            const s = stats.get(t.id);
            const treeId = (t.config as any)?.treeId;
            const treeName = treeId ? treeMap.get(treeId) || null : null;
            return {
                id: t.id,
                rawName: t.name,
                name: friendlyTaskName({ name: t.name, config: t.config, treeName }),
                type: t.type,
                treeId: treeId || null,
                treeName,
                nodePath: (t.config as any)?.nodePath || null,
                avgMs: s ? Math.round(s.total / s.count) : null,
                runs: s ? s.count : 0,
                lastStatus: s ? s.lastStatus : null,
            };
        })
        .filter((it: { avgMs: number | null }) => it.avgMs !== null)
        .sort((a: { avgMs: number | null }, b: { avgMs: number | null }) => (b.avgMs || 0) - (a.avgMs || 0));

    return NextResponse.json({ tasks: items });
}
