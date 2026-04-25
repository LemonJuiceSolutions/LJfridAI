/**
 * API Route: Run All Scheduled Tasks
 *
 * POST — Starts sequential execution of ALL tasks. Returns immediately (202).
 *        Stores a run-all session in a global so GET can report live progress.
 *        Also persists run state to DB via ScheduledTaskExecution.result JSON
 *        so state survives cold starts and works across multiple instances.
 * GET  — Returns current run-all progress. Checks in-memory first (hot path),
 *        then falls back to reconstructing state from the DB (cold-start recovery).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getSchedulerClient } from '@/lib/scheduler/scheduler-client';

// ── Types ──

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
  // Per-task pipeline report (ancestor chain + target step). Populated when
  // the scheduler returns it. Lets the run-all dialog show the same expand
  // view that single-task trigger and node Anteprima already render.
  pipelineReport?: Array<{
    name: string;
    type: string;
    status: 'success' | 'error' | 'skipped';
    error?: string;
    timestamp: string;
    nodePath?: string;
  }>;
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

// ── In-memory cache for real-time progress during active runs ──
// SECURITY CRITICAL: per-company runs (was singleton — leaked state cross-tenant)
// NOTE: This map is the hot-path for live polling. On cold start / multi-instance,
// GET falls back to reconstructing state from ScheduledTaskExecution records.
const runs = new Map<string, RunAllState>();

// ── DB persistence helpers ──

/**
 * Persist the current run-all state snapshot to DB.
 * Uses upsert on a sentinel ScheduledTaskExecution keyed by `runId` so we
 * don't need schema changes. The full RunAllState is stored in `result` JSON.
 */
async function persistRunState(run: RunAllState, companyId: string): Promise<void> {
  try {
    // We store the run state as the `result` JSON on a sentinel execution row.
    // The `id` is deterministic from the runId so upserts work correctly.
    const sentinelId = `runall-${run.id}`;
    // Find any ScheduledTask in this company to anchor the execution record.
    // If none exists (shouldn't happen — we just queried tasks), skip persistence.
    const anyTask = await db.scheduledTask.findFirst({
      where: { companyId },
      select: { id: true },
    });
    if (!anyTask) return;

    await db.scheduledTaskExecution.upsert({
      where: { id: sentinelId },
      create: {
        id: sentinelId,
        taskId: anyTask.id,
        status: `run-all:${run.status}`,
        startedAt: new Date(run.startedAt),
        completedAt: run.completedAt ? new Date(run.completedAt) : null,
        result: {
          _isRunAll: true,
          companyId,
          runAllState: run,
        } as any,
      },
      update: {
        status: `run-all:${run.status}`,
        completedAt: run.completedAt ? new Date(run.completedAt) : null,
        result: {
          _isRunAll: true,
          companyId,
          runAllState: run,
        } as any,
      },
    });
  } catch (err) {
    console.error('[run-all] Failed to persist run state to DB:', err);
  }
}

/**
 * Reconstruct run-all state from DB for a given company (cold-start recovery).
 * Returns the most recent run-all record, or null if none found.
 */
async function recoverRunStateFromDb(companyId: string): Promise<RunAllState | null> {
  try {
    // Find the most recent run-all sentinel execution for this company.
    const recent = await db.scheduledTaskExecution.findFirst({
      where: {
        status: { startsWith: 'run-all:' },
        result: { path: ['_isRunAll'], equals: true },
      },
      orderBy: { startedAt: 'desc' },
    });
    if (!recent?.result) return null;

    const payload = recent.result as any;
    if (payload.companyId !== companyId) return null;

    const state = payload.runAllState as RunAllState | undefined;
    if (!state) return null;

    // If the DB says "running" but we have no in-memory state, the process
    // crashed mid-run. Mark it as aborted so the UI doesn't show a phantom run.
    if (state.status === 'running') {
      state.status = 'aborted';
      state.completedAt = state.completedAt || new Date().toISOString();
      for (const t of state.tasks) {
        if (t.status === 'pending' || t.status === 'running') {
          t.status = 'skipped';
        }
      }
      // Persist the corrected state back to DB
      await persistRunState(state, companyId);
    }

    return state;
  } catch (err) {
    console.error('[run-all] Failed to recover run state from DB:', err);
    return null;
  }
}

// ============================================
// GET: Poll current run-all progress
// ============================================

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const companyId = (session?.user as any)?.companyId as string | undefined;
  if (!session?.user?.email || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Hot path: check in-memory cache first (active runs on this instance)
  let currentRun = runs.get(companyId);

  // Cold-start recovery: if nothing in memory, try to reconstruct from DB
  if (!currentRun) {
    const recovered = await recoverRunStateFromDb(companyId);
    if (!recovered) {
      return NextResponse.json({ active: false });
    }
    // Cache the recovered state in memory for subsequent polls
    runs.set(companyId, recovered);
    currentRun = recovered;
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
      // Persist aborted state to DB
      await persistRunState(currentRun, sessionCompanyId);
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
      // Prefer the user-defined result name (the label typed in the editor) over
      // the parent option key, which is just the path bucket of the node.
      let nodeName: string | null =
        cfg.sqlResultName || cfg.pythonResultName || null;
      if (!nodeName && cfg.nodePath) {
        const matches = cfg.nodePath.match(/\['([^']+)'\]/g);
        if (matches && matches.length > 0) {
          nodeName = matches[matches.length - 1].replace(/\['|'\]/g, '');
        }
      }
      // Detail: email subject for EMAIL_SEND, or fallback to nodePath leaf for
      // DB tasks (so the second line still shows the path bucket as context).
      let detail: string | null = null;
      if (t.type === 'EMAIL_SEND' || t.type === 'email_send') {
        detail = cfg.subject || cfg.emailSubject || null;
      } else if (cfg.nodePath) {
        const matches = cfg.nodePath.match(/\['([^']+)'\]/g);
        if (matches && matches.length > 0) {
          const leaf = matches[matches.length - 1].replace(/\['|'\]/g, '');
          if (leaf !== nodeName) detail = leaf;
        }
      }
      if (!detail) detail = cfg.name || null;
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
  // Persist per-company state in memory (hot path) and DB (cold-start recovery)
  runs.set(sessionCompanyId, currentRun);
  await persistRunState(currentRun, sessionCompanyId);

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
  executeAllSequentially(currentRun, tasks, sessionCompanyId).catch(err => {
    console.error('[run-all] Fatal error:', err);
    if (currentRun?.id === runId) {
      currentRun.status = 'aborted';
      currentRun.completedAt = new Date().toISOString();
      persistRunState(currentRun, sessionCompanyId).catch(() => {});
    }
  });

  return NextResponse.json({ accepted: true, runId, totalTasks: tasks.length }, { status: 202 });
}

// ── Sequential executor ──

async function executeAllSequentially(run: RunAllState, tasks: any[], companyId: string) {
  // Two tuning knobs:
  //  - DELAY_MS: breathing room between tasks so Next.js can serve UI
  //    while a local scheduler pins CPU. With the standalone
  //    scheduler-service the heavy work is in another process, so the
  //    delay is pure idle time — default 0 when remote.
  //  - CONCURRENCY: how many tasks to execute at once. In-process = 1 to
  //    avoid choking the Next.js event loop. Remote service can safely
  //    handle 2-4 parallel tasks (bottleneck becomes the source MSSQL).
  // Run-all defaults: serial (1 task at a time), 1s breathing room between
  // tasks. Reduces MSSQL pool pressure and Python backend memory spikes.
  // Override via SCHEDULER_RUNALL_DELAY_MS / SCHEDULER_RUNALL_CONCURRENCY.
  const DELAY_MS = Math.max(
    0,
    Number(process.env.SCHEDULER_RUNALL_DELAY_MS) || 1000,
  );
  const CONCURRENCY = Math.max(
    1,
    Number(process.env.SCHEDULER_RUNALL_CONCURRENCY) || 1,
  );

  const total = run.tasks.length;
  let cursor = 0;

  const runOne = async (i: number) => {
    if ((run.status as string) === 'aborted') return;
    const taskStatus = run.tasks[i];
    // currentIndex = highest index reached so UI progress monotonically advances
    run.currentIndex = Math.max(run.currentIndex, i);
    taskStatus.status = 'running';
    taskStatus.startedAt = new Date().toISOString();

    const taskStart = Date.now();
    try {
      await new Promise(r => setImmediate(r));
      // Route through the client abstraction: when SCHEDULER_SERVICE_URL is
      // set, this hits the standalone scheduler-service over HTTP and the
      // heavy Python/SQL/email work runs in THAT process, leaving Next.js
      // free to serve pages.
      const result = await getSchedulerClient().executeTask(taskStatus.taskId, { maxRetriesOverride: 0 });

      taskStatus.durationMs = Date.now() - taskStart;
      // Forward the pipeline report so the dialog can show ancestor steps + target.
      const pipelineReport = (result.data as any)?.pipelineReport;
      if (Array.isArray(pipelineReport)) {
        taskStatus.pipelineReport = pipelineReport;
      }
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
    // Persist progress to DB after each task so state survives crashes
    await persistRunState(run, companyId);
  };

  // Worker-pool pattern: N workers drain a shared cursor. Each worker picks
  // the next task, runs it, sleeps DELAY_MS, repeats until cursor exhausted
  // or run is aborted. Bounded concurrency = predictable MSSQL pool load.
  const worker = async () => {
    while (true) {
      if ((run.status as string) === 'aborted') return;
      const i = cursor++;
      if (i >= total) return;
      await runOne(i);
      if (DELAY_MS > 0 && cursor < total) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()),
  );

  if ((run.status as string) !== 'aborted') {
    run.status = 'completed';
  }
  run.completedAt = new Date().toISOString();
  // Persist final state to DB
  await persistRunState(run, companyId);
}
