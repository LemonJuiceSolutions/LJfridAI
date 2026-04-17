/**
 * API Route: Global Scheduler Executions
 *
 * Fetches execution history across ALL tasks for the company
 * - GET: List executions with pagination, status and type filters
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    const where: any = {
      task: { companyId: user.companyId }
    };
    if (status) where.status = status;
    if (type) where.task = { ...where.task, type };

    const [executions, total] = await Promise.all([
      db.scheduledTaskExecution.findMany({
        where,
        include: {
          task: {
            select: {
              id: true,
              name: true,
              type: true,
              config: true,
            }
          }
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      db.scheduledTaskExecution.count({ where })
    ]);

    // Enrich with tree names
    const treeIds = [...new Set(
      executions.map((e: any) => (e.task?.config as any)?.treeId).filter(Boolean)
    )] as string[];

    let treeNameMap: Record<string, string> = {};
    if (treeIds.length > 0) {
      const trees = await db.tree.findMany({
        where: { id: { in: treeIds } },
        select: { id: true, name: true }
      });
      treeNameMap = Object.fromEntries(trees.map((t: any) => [t.id, t.name]));
    }

    const enrichedExecutions = executions.map((e: any) => {
      const cfg = (e.task?.config as any) || {};
      const treeId = cfg.treeId;

      // Mirror the logic in /api/scheduler/run-all so the two progress views
      // stay consistent: extract the leaf node name from the nodePath and a
      // "detail" line (email subject / SQL or Python result name).
      let nodeName: string | null = null;
      if (typeof cfg.nodePath === 'string') {
        const matches = cfg.nodePath.match(/\['([^']+)'\]/g);
        if (matches && matches.length > 0) {
          nodeName = matches[matches.length - 1].replace(/\['|'\]/g, '');
        }
      }
      let detail: string | null = null;
      const ttype = e.task?.type;
      if (ttype === 'EMAIL_SEND' || ttype === 'email_send') {
        detail = cfg.subject || cfg.emailSubject || null;
      } else {
        detail = cfg.sqlResultName || cfg.pythonResultName || cfg.name || null;
      }

      return {
        ...e,
        task: e.task ? {
          ...e.task,
          treeName: treeId ? treeNameMap[treeId] || null : null,
          nodeName,
          detail,
        } : e.task,
      };
    });

    return NextResponse.json({
      executions: enrichedExecutions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('[API] Error fetching global executions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch executions', details: error.message },
      { status: 500 }
    );
  }
}
