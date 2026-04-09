import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getSchedulerClient } from '@/lib/scheduler/scheduler-client';

/**
 * GET: Returns tasks in "needs_attention" status — all retries exhausted.
 *      Includes the last execution error so the user can diagnose the problem.
 *
 * POST: User acknowledges and re-triggers selected tasks (resets status to "active").
 */

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user?.companyId) {
    return NextResponse.json({ error: 'No company' }, { status: 400 });
  }

  const failedTasks = await db.scheduledTask.findMany({
    where: {
      companyId: user.companyId,
      status: 'needs_attention',
    },
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
      lastError: true,
      failureCount: true,
      maxRetries: true,
      lastRunAt: true,
      config: true,
      executions: {
        where: { status: 'failed_permanent' },
        orderBy: { startedAt: 'desc' },
        take: 1,
        select: {
          id: true,
          startedAt: true,
          completedAt: true,
          error: true,
          retryCount: true,
          durationMs: true,
        },
      },
    },
    orderBy: { lastRunAt: 'desc' },
  });

  // Enrich with tree names
  const treeIds = [...new Set(
    failedTasks
      .map(t => (t.config as any)?.treeId)
      .filter(Boolean) as string[]
  )];
  const treeNameMap: Record<string, string> = {};
  if (treeIds.length > 0) {
    const trees = await db.tree.findMany({
      where: { id: { in: treeIds } },
      select: { id: true, name: true },
    });
    for (const t of trees) {
      treeNameMap[t.id] = t.name;
    }
  }

  const enriched = failedTasks.map(t => ({
    ...t,
    treeName: (t.config as any)?.treeId ? treeNameMap[(t.config as any).treeId] || null : null,
    lastExecution: t.executions[0] || null,
    executions: undefined, // Don't leak the full array
  }));

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user?.companyId) {
    return NextResponse.json({ error: 'No company' }, { status: 400 });
  }

  const body = await req.json();
  const { retryIds = [], dismissIds = [] } = body as {
    retryIds: string[];
    dismissIds: string[];
  };

  const allIds = [...retryIds, ...dismissIds];
  if (allIds.length > 0) {
    // Verify ownership
    const count = await db.scheduledTask.count({
      where: { id: { in: allIds }, companyId: user.companyId },
    });
    if (count !== allIds.length) {
      return NextResponse.json({ error: 'Invalid task IDs' }, { status: 403 });
    }
  }

  // Re-activate and re-trigger selected tasks
  for (const id of retryIds) {
    await db.scheduledTask.update({
      where: { id },
      data: { status: 'active', lastError: null },
    });
    // Fire-and-forget execution
    getSchedulerClient().triggerTask(id).catch((err) => {
      console.error(`[Scheduler] Background retry for ${id} error:`, err);
    });
  }

  // Dismiss: reset to active but don't execute now (will run at next scheduled time)
  if (dismissIds.length > 0) {
    await db.scheduledTask.updateMany({
      where: { id: { in: dismissIds } },
      data: { status: 'active', lastError: null },
    });
  }

  return NextResponse.json(
    { accepted: true, retried: retryIds.length, dismissed: dismissIds.length },
    { status: 202 },
  );
}
