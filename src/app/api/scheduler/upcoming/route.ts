/**
 * API Route: Upcoming Scheduled Tasks
 *
 * Fetches all active tasks with upcoming execution times
 * - GET: List active tasks ordered by nextRunAt ascending
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { email: session.user.email },
      include: { company: true }
    });

    if (!user?.companyId) {
      return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
    }

    const tasks = await db.scheduledTask.findMany({
      where: {
        companyId: user.companyId,
        status: 'active',
        nextRunAt: { not: null }
      },
      select: {
        id: true,
        name: true,
        type: true,
        config: true,
        scheduleType: true,
        cronExpression: true,
        intervalMinutes: true,
        daysOfWeek: true,
        hours: true,
        timezone: true,
        nextRunAt: true,
        lastRunAt: true,
        successCount: true,
        failureCount: true,
      },
      orderBy: { nextRunAt: 'asc' }
    });

    // Enrich with tree names
    const treeIds = [...new Set(
      tasks.map(t => (t.config as any)?.treeId).filter(Boolean)
    )] as string[];

    let treeNameMap: Record<string, string> = {};
    if (treeIds.length > 0) {
      const trees = await db.tree.findMany({
        where: { id: { in: treeIds } },
        select: { id: true, name: true }
      });
      treeNameMap = Object.fromEntries(trees.map(t => [t.id, t.name]));
    }

    const enrichedTasks = tasks.map(t => {
      const treeId = (t.config as any)?.treeId;
      return { ...t, treeName: treeId ? treeNameMap[treeId] || null : null };
    });

    return NextResponse.json({ tasks: enrichedTasks });
  } catch (error: any) {
    console.error('[API] Error fetching upcoming tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch upcoming tasks', details: error.message },
      { status: 500 }
    );
  }
}
