/**
 * API Route: Run All Scheduled Tasks
 *
 * POST — Starts sequential execution of ALL tasks. Returns immediately (202).
 *        Stores a run-all session in a global so GET can report live progress.
 * GET  — Returns current run-all progress (persists across page navigations).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { schedulerService } from '@/lib/scheduler/scheduler-service';

// ── In-memory run-all state (survives page navigations, lost on server restart) ──

export interface RunAllTaskStatus {
  taskId: string;
  taskName: string;
  taskType: string;
  treeName: string | null;
  treeId: string | null;
  nodeName: string | null;   // leaf node label from nodePath
  detail: string | null;     // email subject or db task name
  status: 'pending' | 'running' | 'success' | 'failure' | 'skipped';
  error?: string;
  message?: string;
  durationMs?: number;
  startedAt?: string;
}

interface RunAllState {
  id: string;               // unique run id
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'aborted';
  currentIndex: number;     // which task is executing now
  tasks: RunAllTaskStatus[];
  startedBy: string;
}

// SECURITY CRITICAL: per-company runs (was singleton — leaked state cross-tenant)
const runs = new Map<string, RunAllState>();

// ============================================
// GET: Poll current run-all progress
// ============================================

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId as string | undefined;
  if (!session?.user?.email || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentRun = runs.get(companyId);
  if (!currentRun) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    active: currentRun.status === 'running',
    run: currentRun,
  });
}

// ============================================
// POST: Start run-all (or abort if already running)
// ============================================

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const sessionCompanyId = (session?.user as any)?.companyId as string | undefined;
  if (!session?.user?.email || !sessionCompanyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  let currentRun = runs.get(sessionCompanyId);

  // Abort request
  if (body.action === 'abort') {
    if (currentRun && currentRun.status === 'running') {
      currentRun.status = 'aborted';
      currentRun.completedAt = new Date().toISOString();
      // Mark remaining pending tasks as skipped
      for (const t of currentRun.tasks) {
        if (t.status === 'pending') t.status = 'skipped';
      }
      return NextResponse.json({ aborted: true });
    }
    return NextResponse.json({ aborted: false, reason: 'No active run' });
  }

  // Already running for this company?
  if (currentRun?.status === 'running') {
    return NextResponse.json(
      { error: 'Un run-all è già in corso', runId: currentRun.id },
      { status: 409 },
    );
  }

  // Fetch user company
  const user = await db.user.findUnique({
    where: { email: session.user.email },
    include: { company: true },
  });
  if (!user?.companyId) {
    return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
  }

  // Get only scheduled tasks (specific days/hours or cron) — skip interval-based tasks
  const tasks = await db.scheduledTask.findMany({
    where: {
      companyId: user.companyId,
      OR: [
        { scheduleType: 'specific' },
        { cronExpression: { not: null } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    include: { executions: { take: 1, orderBy: { startedAt: 'desc' } } },
  });

  if (tasks.length === 0) {
    return NextResponse.json({ error: 'Nessun task programmato trovato (solo task con data/ora o giorno/ora)' }, { status: 404 });
  }

  // Build run state
  const runId = `run-${Date.now()}`;
  currentRun = {
    id: runId,
    startedAt: new Date().toISOString(),
    status: 'running',
    currentIndex: 0,
    startedBy: session.user.email,
    tasks: tasks.map((t: any) => {
      const cfg = (t.config as any) || {};
      // Extract leaf node name from nodePath (e.g. root.options['A'].options['Mail'] -> 'Mail')
      let nodeName: string | null = null;
      if (cfg.nodePath) {
        const matches = cfg.nodePath.match(/\['([^']+)'\]/g);
        if (matches && matches.length > 0) {
          nodeName = matches[matches.length - 1].replace(/\['|'\]/g, '');
        }
      }
      // Detail: email subject for EMAIL_SEND, or sqlResultName/pythonResultName for DB tasks
      let detail: string | null = null;
      if (t.type === 'EMAIL_SEND' || t.type === 'email_send') {
        detail = cfg.subject || cfg.emailSubject || null;
      } else {
        detail = cfg.sqlResultName || cfg.pythonResultName || cfg.name || null;
      }
      return {
        taskId: t.id,
        taskName: t.name,
        taskType: t.type,
        treeName: (t as any).treeName || null,
        treeId: cfg.treeId || null,
        nodeName,
        detail,
        status: 'pending' as const,
      };
    }),
  };
  // Persist per-company state (was singleton — leaked cross-tenant)
  runs.set(sessionCompanyId, currentRun);

  // Enrich with tree names
  const treeIds = [...new Set(tasks.map((t: any) => (t.config as any)?.treeId).filter(Boolean))];
  if (treeIds.length > 0) {
    const trees = await db.tree.findMany({
      where: { id: { in: treeIds } },
      select: { id: true, name: true },
    });
    const treeMap = new Map(trees.map((t: any) => [t.id, t.name]));
    for (const ts of currentRun.tasks) {
      const treeId = (tasks.find((t: any) => t.id === ts.taskId)?.config as any)?.treeId;
      if (treeId) ts.treeName = (treeMap.get(treeId) as string | undefined) || null;
    }
  }

  // Fire-and-forget: execute all tasks sequentially in background
  executeAllSequentially(currentRun, tasks).catch(err => {
    console.error('[run-all] Fatal error:', err);
    if (currentRun?.id === runId) {
      currentRun.status = 'aborted';
      currentRun.completedAt = new Date().toISOString();
    }
  });

  return NextResponse.json({ accepted: true, runId, totalTasks: tasks.length }, { status: 202 });
}

// ── Sequential executor ──

async function executeAllSequentially(run: RunAllState, tasks: any[]) {
  for (let i = 0; i < run.tasks.length; i++) {
    // Check abort
    if (run.status === 'aborted') break;

    const taskStatus = run.tasks[i];
    run.currentIndex = i;
    taskStatus.status = 'running';
    taskStatus.startedAt = new Date().toISOString();

    const taskStart = Date.now();

    try {
      // BUG fix: do NOT force-clear concurrency lock — was: (schedulerService as any)
      // .runningTasks?.delete(...) — risked double-execution of legitimately
      // running tasks. Now: respect lock; executeTask returns "skipped" if busy.
      // BUG fix: pass maxRetriesOverride per-call instead of mutating DB
      // (process crash between set 0 and restore would permanently disable retries).
      const result = await schedulerService.executeTask(taskStatus.taskId, { maxRetriesOverride: 0 });

      taskStatus.durationMs = Date.now() - taskStart;

      if (result.success) {
        taskStatus.status = 'success';
        taskStatus.message = result.message || result.data?.message || `OK (${taskStatus.durationMs}ms)`;
      } else {
        taskStatus.status = 'failure';
        taskStatus.error = result.error || 'Unknown error';
      }
    } catch (err: any) {
      taskStatus.status = 'failure';
      taskStatus.error = err.message;
      taskStatus.durationMs = Date.now() - taskStart;
    }

    // Abort check after task completes
    if ((run.status as string) === 'aborted') break;
  }

  if ((run.status as string) !== 'aborted') {
    run.status = 'completed';
  }
  run.completedAt = new Date().toISOString();
}
