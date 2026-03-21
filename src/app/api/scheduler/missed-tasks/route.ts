import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { schedulerService } from '@/lib/scheduler/scheduler-service';

/**
 * GET: Returns missed tasks (active tasks with nextRunAt in the past)
 * POST: Process missed tasks — execute selected, realign the rest
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

  const missedTasks = await schedulerService.getMissedTasks(user.companyId);

  // Enrich with tree names for human-readable display
  const treeIds = [...new Set(
    missedTasks
      .map(t => (t as any).config?.treeId)
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

  const enriched = missedTasks.map(t => ({
    ...t,
    treeName: (t as any).config?.treeId ? treeNameMap[(t as any).config.treeId] || null : null,
    config: (t as any).config || null,
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
  const { executeIds = [], skipIds = [], executeAll = false } = body as {
    executeIds: string[];
    skipIds: string[];
    executeAll?: boolean;
  };

  // Verify all task IDs belong to this company
  const allIds = [...executeIds, ...skipIds];
  if (allIds.length > 0) {
    const count = await db.scheduledTask.count({
      where: { id: { in: allIds }, companyId: user.companyId },
    });
    if (count !== allIds.length) {
      return NextResponse.json({ error: 'Invalid task IDs' }, { status: 403 });
    }
  }

  const results = await schedulerService.processMissedTasks(executeIds, skipIds, executeAll);
  return NextResponse.json({ results });
}
