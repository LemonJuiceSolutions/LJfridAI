

// import cron from 'node-cron'; // Removed static import
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { CronExpressionParser } from 'cron-parser';
import { executeSqlPreview, executePythonPreview, exportTableToSql, saveAncestorPreviews } from './scheduler-actions';
import { sendTestEmailWithDataAction } from '@/app/actions/connectors';
import escapeRegExp from 'lodash/escapeRegExp';
import get from 'lodash/get';
import set from 'lodash/set';

import fs from 'fs';

// PERF: file logging gated behind SCHEDULER_DEBUG=1 env var.
// Was: every log line did sync fs.appendFileSync — blocked event loop in
// scheduler hot path. Also leaks PII via JSON.stringify of task configs.
const FILE_LOG = process.env.SCHEDULER_DEBUG === '1';

function fileLog(line: string) {
  if (!FILE_LOG) return;
  // Async, fire-and-forget — does not block event loop
  fs.promises.appendFile('./scheduler_debug.log', line).catch(() => {});
}

const logger = {
  log: (msg: string, ...args: any[]) => {
    const message = `[Scheduler] ${msg} ${args.map(a => JSON.stringify(a)).join(' ')}`;
    console.log(message);
    fileLog(`${new Date().toISOString()} ${message}\n`);
  },
  error: (msg: string, ...args: any[]) => {
    const message = `[Scheduler] ERROR: ${msg} ${args.map(a => JSON.stringify(a)).join(' ')}`;
    console.error(message);
    fileLog(`${new Date().toISOString()} ${message}\n`);
  },
  warn: (msg: string, ...args: any[]) => {
    const message = `[Scheduler] WARN: ${msg} ${args.map(a => JSON.stringify(a)).join(' ')}`;
    console.warn(message);
    fileLog(`${new Date().toISOString()} ${message}\n`);
  },
};

export type TaskType =
  | 'EMAIL_PREVIEW'
  | 'EMAIL_SEND'
  | 'SQL_PREVIEW'
  | 'SQL_EXECUTE'
  | 'PYTHON_EXECUTE'
  | 'DATA_SYNC'
  | 'CUSTOM'
  | 'NODE_EXECUTION';

export type ScheduleType = 'cron' | 'interval' | 'specific';

export interface ScheduledTaskConfig {
  // Common
  treeId?: string;
  nodeId?: string;
  nodePath?: string;

  // Specific
  [key: string]: any;
}

export interface MissedTaskInfo {
  id: string;
  name: string;
  type: string;
  cronExpression: string | null;
  description: string | null;
  lastRunAt: Date | null;
  missedSlots: Date[];
  totalMissed: number;
  oldestMissed: Date | null;
  newestMissed: Date | null;
  config: any;
}

interface ProcessMissedResult {
  id: string;
  name: string;
  action: 'executed' | 'skipped';
  executedCount?: number;
  success?: boolean;
  error?: string;
}

/**
 * Enumerates all cron occurrences between `start` and `end` for the given
 * cron expressions, respecting the timezone. Returns sorted Date array.
 */
function enumerateCronSlots(
  cronExprs: string[],
  start: Date,
  end: Date,
  tz: string,
  maxSlots: number,
): Date[] {
  const slots: Date[] = [];
  for (const expr of cronExprs) {
    try {
      const interval = CronExpressionParser.parse(expr, {
        currentDate: start,
        endDate: end,
        tz,
      });
      while (interval.hasNext() && slots.length < maxSlots) {
        try {
          const nextDate = interval.next().toDate();
          if (nextDate > end) break;
          slots.push(nextDate);
        } catch {
          break;
        }
      }
    } catch {
      // invalid cron expression — skip silently
    }
  }
  slots.sort((a, b) => a.getTime() - b.getTime());
  return slots;
}

export interface TaskExecutionResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: any;
}

export class SchedulerService {
  private static instance: SchedulerService;
  // Map taskId -> cronJob or Array<cronJob>
  private tasks: Map<string, any> = new Map();
  private runningTasks: Set<string> = new Set(); // Concurrency guard
  private isInitialized = false;
  private _autoRecoveryDone = false;
  private _autoRecoveryPromise: Promise<void> | null = null;

  /** True once the startup auto-recovery of missed tasks has finished. */
  public get autoRecoveryDone(): boolean {
    return this._autoRecoveryDone;
  }

  /** Returns a promise that resolves when auto-recovery is complete.
   *  Callers can `await` this to avoid surfacing missed-task dialogs prematurely.
   *  If init() hasn't been called yet (e.g. dev mode, late instrumentation),
   *  waits up to 15s for it to start, then proceeds anyway. */
  public async waitForAutoRecovery(): Promise<void> {
    if (this._autoRecoveryDone) return;
    if (this._autoRecoveryPromise) {
      await this._autoRecoveryPromise;
      return;
    }
    // init() hasn't been called yet — wait up to 15s for it to start
    const maxWaitMs = 15_000;
    const pollMs = 500;
    let waited = 0;
    while (!this._autoRecoveryDone && !this._autoRecoveryPromise && waited < maxWaitMs) {
      await new Promise(r => setTimeout(r, pollMs));
      waited += pollMs;
    }
    // If the promise appeared while waiting, await it
    if (this._autoRecoveryPromise) {
      await this._autoRecoveryPromise;
    }
  }

  public static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  public async init() {
    if (this.isInitialized) return;
    logger.log('Initializing Scheduler Service...');

    // Chiudi eventuali esecuzioni zombie rimaste in stato "running"
    // da un precedente crash del processo (record senza completedAt).
    try {
      const { count } = await db.scheduledTaskExecution.updateMany({
        where: { completedAt: null, status: 'running' },
        data: {
          status: 'failed',
          completedAt: new Date(),
          error: 'Processo terminato inaspettatamente (zombie record chiuso al riavvio)',
        },
      });
      if (count > 0) logger.warn(`Chiuse ${count} esecuzioni zombie rimaste da sessione precedente.`);
    } catch (e: any) {
      logger.error('Errore nella pulizia zombie:', e.message);
    }

    await this.loadTasks();
    this.isInitialized = true;
    logger.log('Scheduler Service Initialized.');

    // Auto-recover missed tasks in background (fire-and-forget).
    // Runs silently — if a task succeeds, the user never sees a popup.
    // If all retries fail, executeTask() sets status → 'needs_attention'
    // and the FailedTasksDialog will surface it to the user.
    this._autoRecoveryPromise = this.autoRecoverMissedTasks()
      .catch((err) => {
        logger.error('Auto-recovery of missed tasks failed:', err);
      })
      .finally(() => {
        this._autoRecoveryDone = true;
        this._autoRecoveryPromise = null;
        logger.log('🏁 Auto-recovery phase complete.');
      });
  }

  /**
   * Automatically executes all missed tasks on startup.
   * Each task runs once (not N times per missed slot) to avoid flooding.
   * Runs with full retry logic (exponential backoff).
   */
  private async autoRecoverMissedTasks() {
    try {
      const allMissed = await this.getMissedTasks();
      if (allMissed.length === 0) {
        logger.log('🟢 No missed tasks to recover.');
        return;
      }

      // Cap concurrency so auto-recovery cannot fork-bomb the Python backend
      // and saturate CPU during startup. 2 parallel is a reasonable floor —
      // heavy SQL/Python tasks already hold pool connections per execution.
      const MAX_CONCURRENCY = Math.max(1, Number(process.env.SCHEDULER_RECOVERY_CONCURRENCY) || 2);
      logger.log(`🔄 Auto-recovering ${allMissed.length} missed tasks (max ${MAX_CONCURRENCY} parallel)...`);

      type Outcome = { status: 'fulfilled'; value: { id: string; name: string; result: { success: boolean; error?: string } } }
        | { status: 'rejected'; reason: any; name?: string };
      const results: Outcome[] = [];
      let cursor = 0;

      async function worker(self: SchedulerService) {
        while (cursor < allMissed.length) {
          const missed = allMissed[cursor++];
          try {
            logger.log(`🔄 Auto-recovering: ${missed.name} (${missed.id}) — ${missed.totalMissed} missed slots`);
            const result = await self.executeTask(missed.id);
            await self.realignTaskNextRun(missed.id);
            results.push({ status: 'fulfilled', value: { id: missed.id, name: missed.name, result } });
          } catch (reason: any) {
            results.push({ status: 'rejected', reason, name: missed.name });
          }
        }
      }

      const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, allMissed.length) }, () => worker(this));
      await Promise.all(workers);

      let recovered = 0;
      let failed = 0;
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.result.success) {
          recovered++;
          logger.log(`✅ Auto-recovered: ${r.value.name}`);
        } else {
          failed++;
          const reason = r.status === 'rejected' ? r.reason?.message : r.value.result.error;
          const name = r.status === 'fulfilled' ? r.value.name : (r.name || 'unknown');
          logger.error(`❌ Auto-recovery failed: ${name} — ${reason}`);
        }
      }

      logger.log(`🏁 Auto-recovery complete: ${recovered} recovered, ${failed} failed (will surface in FailedTasksDialog)`);
    } catch (err) {
      logger.error('autoRecoverMissedTasks error:', err);
    }
  }

  public async reload() {
    logger.log('Reloading tasks...');
    this.stopAll();
    await this.loadTasks();
  }

  private async loadTasks() {
    try {
      // Load active tasks from DB
      const activeTasks = await db.scheduledTask.findMany({
        where: { status: 'active' }
      });

      logger.log(`Found ${activeTasks.length} active tasks.`);

      for (const task of activeTasks) {
        await this.scheduleTask(task);
      }
    } catch (e) {
      logger.error('Failed to load tasks from DB:', e);
    }
  }

  /**
   * Returns missed tasks with all the cron slots that were missed.
   *
   * Strategy: for each active task with a computable schedule, enumerate all
   * expected cron occurrences between `lastRunAt` and `now`, then batch-fetch
   * actual executions and cross-reference. Slots without a matching execution
   * (within ±2 min tolerance) are reported as missed.
   *
   * This works regardless of whether `nextRunAt` has already been realigned
   * to the future (e.g. after a server restart).
   */
  public async getMissedTasks(companyId?: string): Promise<MissedTaskInfo[]> {
    const now = new Date();
    const TOLERANCE_MS = 2 * 60 * 1000; // ±2 min
    const MAX_SLOTS_PER_TASK = 100;

    // 1. Fetch all active tasks that have run at least once
    const where: any = {
      status: 'active',
      lastRunAt: { not: null },
    };
    if (companyId) where.companyId = companyId;

    const tasks = await db.scheduledTask.findMany({
      where,
      select: {
        id: true, name: true, type: true, nextRunAt: true, lastRunAt: true,
        cronExpression: true, description: true, scheduleType: true,
        intervalMinutes: true, daysOfWeek: true, hours: true,
        timezone: true, config: true, createdAt: true,
      },
    });

    // 2. Pre-filter to tasks with a computable schedule and enumerate expected slots
    type TaskWithSlots = typeof tasks[number] & { expectedSlots: Date[] };
    const tasksWithSlots: TaskWithSlots[] = [];

    for (const task of tasks) {
      const cronExprs = this.getEffectiveCronExpressions(task);
      if (cronExprs.length === 0) continue;

      const tz = task.timezone || 'Europe/Rome';
      const windowStart = task.lastRunAt!; // guaranteed non-null by query
      const slots = enumerateCronSlots(cronExprs, windowStart, now, tz, MAX_SLOTS_PER_TASK);
      if (slots.length === 0) continue;

      tasksWithSlots.push({ ...task, expectedSlots: slots });
    }

    if (tasksWithSlots.length === 0) return [];

    // 3. Batch-fetch all executions for candidate tasks in one query
    const earliestWindow = tasksWithSlots.reduce(
      (min, t) => (t.lastRunAt! < min ? t.lastRunAt! : min),
      tasksWithSlots[0].lastRunAt!,
    );
    const taskIds = tasksWithSlots.map(t => t.id);

    const allExecs = await db.scheduledTaskExecution.findMany({
      where: {
        taskId: { in: taskIds },
        startedAt: { gte: earliestWindow, lte: now },
      },
      select: { taskId: true, startedAt: true },
      orderBy: { startedAt: 'asc' },
    });

    // Group execution timestamps by taskId for O(1) lookup
    const execsByTask = new Map<string, number[]>();
    for (const exec of allExecs) {
      const arr = execsByTask.get(exec.taskId);
      const ts = exec.startedAt.getTime();
      if (arr) arr.push(ts);
      else execsByTask.set(exec.taskId, [ts]);
    }

    // 4. Cross-reference expected slots vs actual executions
    const result: MissedTaskInfo[] = [];

    for (const task of tasksWithSlots) {
      const execTimes = execsByTask.get(task.id) || [];
      const missedSlots = task.expectedSlots.filter((slot: any) => {
        const slotMs = slot.getTime();
        return !execTimes.some(execMs => Math.abs(execMs - slotMs) <= TOLERANCE_MS);
      });

      if (missedSlots.length === 0) continue;

      result.push({
        id: task.id,
        name: task.name,
        type: task.type,
        cronExpression: task.cronExpression,
        description: task.description,
        lastRunAt: task.lastRunAt,
        missedSlots,
        totalMissed: missedSlots.length,
        oldestMissed: missedSlots[0],
        newestMissed: missedSlots[missedSlots.length - 1],
        config: task.config,
      });
    }

    result.sort((a, b) => (a.oldestMissed?.getTime() || 0) - (b.oldestMissed?.getTime() || 0));
    return result;
  }

  /**
   * Derives the effective cron expression(s) for a task, covering all schedule types:
   * - customTimes (HH:mm array from config)
   * - explicit cronExpression
   * - interval (every N minutes)
   * - specific days/hours
   */
  private getEffectiveCronExpressions(task: {
    cronExpression: string | null;
    scheduleType: string;
    intervalMinutes: number | null;
    daysOfWeek: string | null;
    hours: string | null;
    config: any;
  }): string[] {
    const config = typeof task.config === 'string' ? JSON.parse(task.config) : task.config;
    const customTimes = config?.customTimes as string[] | undefined;

    if (customTimes && Array.isArray(customTimes) && customTimes.length > 0) {
      const days = task.daysOfWeek || '*';
      return customTimes
        .map(t => { const [h, m] = t.split(':'); return h && m ? `${m} ${h} * * ${days}` : null; })
        .filter(Boolean) as string[];
    }
    if (task.cronExpression) return [task.cronExpression];
    if (task.scheduleType === 'interval' && task.intervalMinutes) return [`*/${task.intervalMinutes} * * * *`];
    if (task.scheduleType === 'specific') return [`0 ${task.hours || '*'} * * ${task.daysOfWeek || '*'}`];
    return [];
  }

  /**
   * Process missed tasks: execute selected ones, realign the rest.
   *
   * @param executeIds  Task IDs to execute now
   * @param skipIds     Task IDs to skip (just realign nextRunAt)
   * @param executeAll  If true, runs each task N times (once per missed slot, capped at 50)
   * @param missedCounts  Optional map of taskId → missed slot count (avoids re-querying)
   */
  public async processMissedTasks(
    executeIds: string[],
    skipIds: string[],
    executeAll: boolean = false,
    missedCounts?: Map<string, number>,
  ) {
    const results: ProcessMissedResult[] = [];

    // If executeAll is requested but no counts provided, compute them once
    let counts = missedCounts;
    if (executeAll && !counts && executeIds.length > 0) {
      const missed = await this.getMissedTasks();
      counts = new Map(missed.map(m => [m.id, m.totalMissed]));
    }

    // Execute selected tasks
    for (const id of executeIds) {
      try {
        const repetitions = executeAll ? Math.min(counts?.get(id) || 1, 50) : 1;
        let successCount = 0;
        let lastError: string | undefined;

        for (let i = 0; i < repetitions; i++) {
          try {
            const r = await this.executeTask(id);
            if (r.success) successCount++;
            else lastError = r.error;
          } catch (e: any) {
            lastError = e.message;
          }
        }

        // Realign nextRunAt to the next future slot
        await this.realignTaskNextRun(id);

        results.push({
          id, name: '', action: 'executed',
          executedCount: repetitions,
          success: successCount > 0,
          error: lastError,
        });
      } catch (e: any) {
        results.push({ id, name: '', action: 'executed', success: false, error: e.message });
      }
    }

    // Realign skipped tasks
    for (const id of skipIds) {
      try {
        const name = await this.realignTaskNextRun(id, true); // Update lastRunAt to 'now' so skipped slots are cleared
        results.push({ id, name: name || '', action: 'skipped' });
      } catch (e: any) {
        results.push({ id, name: '', action: 'skipped', error: e.message });
      }
    }

    return results;
  }

  /**
   * Realigns a task's nextRunAt to the next future cron slot.
   * Returns the task name for convenience.
   *
   * @param updateLastRun If true, also sets lastRunAt to the current time.
   *                      This is important when skipping missed slots to move
   *                       the "missed" window forward.
   */
  private async realignTaskNextRun(taskId: string, updateLastRun: boolean = false): Promise<string | null> {
    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) return null;
    const nextRun = calculateNextRunForTask(task, task.timezone || 'Europe/Rome');
    if (nextRun) {
      await db.scheduledTask.update({
        where: { id: taskId },
        data: {
          nextRunAt: nextRun,
          lastRunAt: updateLastRun ? new Date() : undefined
        }
      });
    }
    return task.name;
  }
  public stopAll() {
    this.tasks.forEach(taskOrTasks => {
      if (Array.isArray(taskOrTasks)) {
        taskOrTasks.forEach(t => t.stop());
      } else {
        taskOrTasks.stop();
      }
    });
    this.tasks.clear();
  }

  // ... (loadTasks)

  private async scheduleTask(task: any) {
    try {
      // Dynamic import of our isolated runner to avoid Edge runtime bundling node-cron directly
      const { scheduleCronJob } = await import('./cron-runner');

      const config = typeof task.config === 'string' ? JSON.parse(task.config) : task.config;
      const customTimes = config?.customTimes as string[] | undefined;

      // Case 1: Custom HH:mm times
      if (customTimes && Array.isArray(customTimes) && customTimes.length > 0) {
        const jobs: any[] = [];

        for (const timeStr of customTimes) {
          // Format HH:mm
          const [hours, minutes] = timeStr.split(':');
          if (!hours || !minutes) continue;

          // Cron: Minute Hour * * * (Daily at specific time)
          // If we want to support daysOfWeek combined with custom times, we can use daysOfWeek from task
          const days = task.daysOfWeek || '*';
          const cronExpression = `${minutes} ${hours} * * ${days}`;

          const job = await scheduleCronJob(cronExpression, async () => {
            logger.log(`Executing task (CustomTime ${timeStr}): ${task.name} (${task.id})`);
            await this.executeTask(task.id);
          }, {
            timezone: task.timezone || 'Europe/Rome'
          });
          jobs.push(job);
        }

        if (jobs.length > 0) {
          this.tasks.set(task.id, jobs);
          logger.log(`Scheduled task ${task.name} (${task.id}) with ${jobs.length} custom times: ${customTimes.join(', ')}`);
        }
        return;
      }

      // Case 2: Standard Cron/Interval
      let cronExpression = task.cronExpression;

      if (task.scheduleType === 'interval' && task.intervalMinutes) {
        // Simple interval: every X minutes
        cronExpression = `*/${task.intervalMinutes} * * * *`;
      } else if (task.scheduleType === 'specific') {
        // Specific days/hours
        // Format: Minute Hour DayOfMonth Month DayOfWeek
        // default to minute 0 of the hour
        const minutes = '0';
        const hours = task.hours || '*';
        const daysOfWeek = task.daysOfWeek || '*';
        cronExpression = `${minutes} ${hours} * * ${daysOfWeek}`;
      }

      if (!cronExpression) {
        logger.error(`Task ${task.id} (${task.name}) has no valid schedule.`);
        return;
      }

      // Create cron job
      const cronJob = await scheduleCronJob(cronExpression, async () => {
        logger.log(`Executing task: ${task.name} (${task.id})`);
        await this.executeTask(task.id);
      }, {
        timezone: task.timezone || 'Europe/Rome'
      });

      this.tasks.set(task.id, cronJob);
      logger.log(`Scheduled task ${task.name} (${task.id}) with cron: ${cronExpression}`);

    } catch (e) {
      logger.error(`Failed to schedule task ${task.id}:`, e);
    }
  }

  public async triggerTask(taskId: string): Promise<TaskExecutionResult> {
    return this.executeTask(taskId);
  }

  public async executeTask(taskId: string, options?: { maxRetriesOverride?: number }): Promise<TaskExecutionResult> {
    // Concurrency guard: skip if this task is already running
    if (this.runningTasks.has(taskId)) {
      logger.log(`⏭️ Task ${taskId} SKIPPED - still running from previous trigger`);
      return { success: false, error: 'Task already running, skipped.' };
    }

    this.runningTasks.add(taskId);
    const execStart = Date.now();
    logger.log(`▶️ Starting task ${taskId}`);

    let executionId = '';

    try {
      // 1. Fetch Task
      const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
      if (!task) return { success: false, error: 'Task not found' };

      // BUG fix: per-call override (was: callers mutated DB to disable retries
      // — if process crashed before restore, retries permanently disabled).
      const maxRetries = options?.maxRetriesOverride ?? task.maxRetries ?? 3;
      const retryDelayMin = task.retryDelayMinutes ?? 5;

      // 2. Create Execution Log (Pending)
      const execution = await db.scheduledTaskExecution.create({
        data: {
          taskId: taskId,
          status: 'running',
          startedAt: new Date()
        }
      });
      executionId = execution.id;

      // 3. Execute with automatic retries + exponential backoff
      let result: TaskExecutionResult = { success: false, error: 'No execution attempted' };
      let attempt = 0;

      while (attempt <= maxRetries) {
        if (attempt > 0) {
          // Exponential backoff: retryDelay * 2^(attempt-1), capped at 30 min
          const delayMs = Math.min(retryDelayMin * 60_000 * Math.pow(2, attempt - 1), 30 * 60_000);
          logger.log(`🔄 Retry ${attempt}/${maxRetries} for task ${task.name} (${taskId}) in ${Math.round(delayMs / 1000)}s`);

          // Update execution log to reflect retry state
          await db.scheduledTaskExecution.update({
            where: { id: executionId },
            data: { status: 'retrying', retryCount: attempt, error: result.error },
          }).catch(() => { });

          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        try {
          result = await this.executeTaskByType(task, executionId);
          if (result.success) {
            logger.log(`✅ Task ${task.name} succeeded${attempt > 0 ? ` on retry ${attempt}` : ''}`);
            break;
          }
        } catch (e: any) {
          result = { success: false, error: e.message };
        }

        logger.log(`❌ Task ${task.name} attempt ${attempt + 1} failed: ${result.error}`);
        attempt++;
      }

      // 4. Determine final status
      const finalStatus = result.success
        ? 'success'
        : attempt > maxRetries
          ? 'failed_permanent' // All retries exhausted — needs user attention
          : 'failure';

      // 5. Update Execution Log
      await db.scheduledTaskExecution.update({
        where: { id: executionId },
        data: {
          status: finalStatus,
          completedAt: new Date(),
          durationMs: Math.round(Date.now() - execution.startedAt.getTime()),
          result: (result.data || result.message) as Prisma.InputJsonValue,
          error: result.error,
          retryCount: Math.min(attempt, maxRetries),
        }
      });

      // 6. Update Task Stats
      const isPermFailure = finalStatus === 'failed_permanent';
      await db.scheduledTask.update({
        where: { id: taskId },
        data: {
          lastRunAt: new Date(),
          nextRunAt: this.calculateNextRun(task as any),
          runCount: { increment: 1 },
          successCount: result.success ? { increment: 1 } : undefined,
          failureCount: result.success ? undefined : { increment: 1 },
          lastError: result.success ? null : (result.error || 'Unknown error'),
          // Mark task as needs_attention if all retries failed — user must intervene
          status: isPermFailure ? 'needs_attention' : task.status,
        }
      });

      return result;

    } catch (e: any) {
      logger.error(`Execution failed for task ${taskId}:`, e);
      // Try to log failure if execution created
      if (executionId) {
        await db.scheduledTaskExecution.update({
          where: { id: executionId },
          data: {
            status: 'failure',
            completedAt: new Date(),
            error: e.message
          }
        }).catch(() => { });
      }
      return { success: false, error: e.message };
    } finally {
      this.runningTasks.delete(taskId);
      const elapsed = ((Date.now() - execStart) / 1000).toFixed(1);
      logger.log(`⏱️ Task ${taskId} finished in ${elapsed}s`);
    }
  }

  private calculateNextRun(task: any): Date | null {
    return calculateNextRunForTask(task, task.timezone || 'Europe/Rome');
  }


  private async executeTaskByType(task: any, executionId: string): Promise<TaskExecutionResult> {
    const config = { ...(task.config as ScheduledTaskConfig), companyId: task.companyId } as ScheduledTaskConfig;
    const type = task.type as TaskType;

    logger.log(`Executing logic for type: ${type}`);

    try {
      switch (type) {
        case 'EMAIL_SEND':
          return await this.executeEmailSend(config);
        case 'SQL_PREVIEW':
        case 'SQL_EXECUTE':
          return await this.executeSqlNode(config);
        case 'PYTHON_EXECUTE':
        case 'CUSTOM': // Mapped Custom to Python usually or generic
          if (config.pythonCode) {
            return await this.executePythonNode(config);
          }
          return { success: false, error: "Custom task missing handler" };

        case 'NODE_EXECUTION':
          return await this.executeGenericNode(config);

        default:
          return {
            success: false,
            error: `Unknown task type: ${task.type}`
          };
      }
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // --- NODE TYPE EXECUTORS ---

  private async executeAncestorChain(
    contextTables: any[],
    targetNodeNames?: string[], // Optional: filter
    _bypassAuth: boolean = true,
    treeId?: string, // Save ancestor previews to tree JSON + ScheduledTaskExecution
    companyId?: string, // Pass company for SharePoint token resolution
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    // Store results with normalized keys for lookup, but allow original keys too
    const resultsNormalized: Record<string, any> = {};
    const permanentTables = new Map<string, { connectorId: string, tableName: string }>();

    const pipelineReport: Array<{ name: string, type: string, status: 'success' | 'error' | 'skipped', error?: string, timestamp: string, nodePath?: string }> = [];
    if (!contextTables || contextTables.length === 0) return { results, pipelineReport };

    // 1. Build Dependency Graph (Case-Insensitive Normalization)
    const graph = new Map<string, string[]>();
    const nodeNameMap = new Map<string, string>(); // normalized -> original
    const aliasToCanonicalMap = new Map<string, string>(); // normalized alias -> normalized canonical name

    // First pass: Register all nodes and their aliases
    contextTables.forEach(t => {
      const canonicalOriginalName = t.name;
      const canonicalNormalizedName = t.name.toLowerCase().trim();

      nodeNameMap.set(canonicalNormalizedName, canonicalOriginalName);
      aliasToCanonicalMap.set(canonicalNormalizedName, canonicalNormalizedName);

      // Register aliases
      if (t.allNames && Array.isArray(t.allNames)) {
        t.allNames.forEach((alias: string) => {
          const aliasNorm = alias.toLowerCase().trim();
          aliasToCanonicalMap.set(aliasNorm, canonicalNormalizedName);
          // Also map alias to original name if not already set (though canonical is preferred)
          if (!nodeNameMap.has(aliasNorm)) {
            nodeNameMap.set(aliasNorm, canonicalOriginalName);
          }
        });
      }
    });

    // Second pass: Build graph using CANONICAL names
    contextTables.forEach(t => {
      const canonicalNormalizedName = t.name.toLowerCase().trim();

      // Resolve dependencies to their canonical names
      const distinctDeps = new Set<string>();
      (t.pipelineDependencies || []).forEach((d: any) => {
        const rawDep = d.tableName.toLowerCase().trim();
        const canonicalDep = aliasToCanonicalMap.get(rawDep);

        // Only add dependency if it exists in our context
        if (canonicalDep) {
          distinctDeps.add(canonicalDep);
        } else {
          // Optional: Log warning about missing dependency?
          // logger.warn(`[AncestorChain] Node ${t.name} depends on '${rawDep}' which is not in context.`);
        }
      });

      graph.set(canonicalNormalizedName, Array.from(distinctDeps));
    });

    // 2. Radiological Sort (Topological)
    const visited = new Set<string>();
    const sortedNormalized: string[] = [];
    const visiting = new Set<string>(); // Cycle detection

    const visit = (normalizedNode: string) => {
      // Resolve to canonical just in case, though input should be canonical
      const canonical = aliasToCanonicalMap.get(normalizedNode) || normalizedNode;

      if (visited.has(canonical)) return;
      if (visiting.has(canonical)) return; // Cycle detected

      visiting.add(canonical);
      const deps = graph.get(canonical) || [];

      // Visit dependencies first
      deps.forEach(d => {
        visit(d);
      });

      visiting.delete(canonical);
      visited.add(canonical);
      sortedNormalized.push(canonical); // Push CANONICAL name
    };

    // Visit all nodes in context
    contextTables.forEach(t => visit(t.name.toLowerCase().trim()));

    logger.log(`[AncestorChain] Execution Order: ${sortedNormalized.map(n => nodeNameMap.get(n)).join(' -> ')}`);

    // FIX: Build nodeId -> tableDef map for unambiguous lookup (prevents preview corruption from name collisions)
    const nodeIdToTableDef = new Map<string, any>();
    contextTables.forEach(t => {
      const nId = t.nodeId || t.id;
      if (nId) nodeIdToTableDef.set(nId, t);
    });

    // Detect duplicate names (warning for debugging)
    const nameCount = new Map<string, number>();
    contextTables.forEach(t => {
      const n = t.name?.toLowerCase().trim();
      if (n) nameCount.set(n, (nameCount.get(n) || 0) + 1);
    });
    for (const [name, count] of nameCount) {
      if (count > 1) {
        logger.log(`[AncestorChain] WARNING: Duplicate node name detected: "${name}" appears ${count} times. This can cause preview corruption.`);
      }
    }

    // 3. Execute in Order
    for (const normalizedName of sortedNormalized) {
      const originalName = nodeNameMap.get(normalizedName);
      if (!originalName) continue;

      const tableDef = contextTables.find(t => t.name === originalName);
      if (!tableDef) continue;

      // Skip if it doesn't have execution logic
      const hasLogic = (tableDef.isPython && tableDef.pythonCode) || (!tableDef.isPython && tableDef.sqlQuery) || (tableDef.type === 'email') || (tableDef.type === 'sharepoint') || (tableDef.type === 'hubspot');
      if (!hasLogic) continue;

      const _ancestorKind = tableDef.type || (tableDef.isPython ? 'Python' : 'SQL');
      logger.log(`[AncestorChain] Executing ancestor: ${originalName} (${_ancestorKind})`);

      // PERF instrumentation — reports per-ancestor wall time so slow
      // schedulers can be diagnosed from the logs without extra tooling.
      const _ancestorStart = Date.now();
      const _logDone = (rowCount?: number) => {
        const dur = Date.now() - _ancestorStart;
        const rows = typeof rowCount === 'number' ? ` rows=${rowCount}` : '';
        logger.log(`[AncestorChain] ⏱ ${originalName} (${_ancestorKind}) took ${dur}ms${rows}`);
      };

      try {
        let resultData: any = null;

        // A. EXECUTE
        if (tableDef.isPython && tableDef.pythonCode) {
          // Pass ALL available results to Python (not just explicit deps)
          // This allows scripts to access any table computed earlier in the pipeline
          const inputData: Record<string, any> = {};

          // Helper: extract usable data from a result value
          const extractData = (val: any): any | undefined => {
            if (val === undefined || val === null) return undefined;
            if (Array.isArray(val)) return val;
            if (typeof val === 'object' && 'data' in val && Array.isArray(val.data)) return val.data;
            if (typeof val === 'object' && 'data' in val && val.data !== null && val.data !== undefined) return val.data;
            if (typeof val === 'object' && 'rechartsData' in val && Array.isArray((val as any).rechartsData)) return (val as any).rechartsData;
            if (typeof val === 'object' && 'variables' in val && (val as any).variables) return (val as any).variables;
            if (typeof val === 'object' && !('data' in val)) return val;
            if (typeof val === 'object' && ('chartBase64' in val || 'chartHtml' in val || 'rechartsConfig' in val)) return val;
            return undefined;
          };

          // FIX: Add EXPLICIT pipeline dependencies FIRST so that the primary dependency
          // becomes 'df' in Python (the backend maps the first table to 'df').
          // This matches the behavior of the node preview button, which only passes
          // the configured dependencies.
          const explicitDepNames = new Set<string>();
          (tableDef.pipelineDependencies || []).forEach((d: any) => {
            const depNorm = d.tableName.toLowerCase().trim();
            const val = resultsNormalized[depNorm];
            if (val !== undefined) {
              const extracted = extractData(val);
              if (extracted !== undefined) {
                inputData[d.tableName] = extracted;
                explicitDepNames.add(depNorm);
              }
            }
          });

          // Then add all remaining available results by their original names
          for (const [normKey, val] of Object.entries(resultsNormalized)) {
            if (explicitDepNames.has(normKey)) continue; // Already added as explicit dep
            const origName = nodeNameMap.get(normKey) || normKey;
            const extracted = extractData(val);
            if (extracted !== undefined) {
              inputData[origName] = extracted;
            }
          }

          // Determine the dfTarget: the first explicit dependency name.
          // The Python backend maps dfTable → 'df'. Without this, it falls back to
          // the LAST table in inputData, which may be a failed/empty result.
          const firstExplicitDep = (tableDef.pipelineDependencies || [])[0]?.tableName;
          const dfTarget = firstExplicitDep && inputData[firstExplicitDep] !== undefined
            ? firstExplicitDep
            : undefined;

          // DEBUG: Log final inputData keys
          const inputKeys = Object.keys(inputData);
          logger.log(`[AncestorChain] Final inputData for ${originalName}: [${inputKeys.join(', ')}] (df → ${dfTarget || inputKeys[0] || 'none'})`);

          // Prepare dependencies definitions
          // FIX: Strip nested pipelineDependencies to prevent recursive re-fetching.
          // The ancestor chain already pre-computed everything and put it in inputData.
          // If executePythonPreviewAction needs a dep not in inputData, it should use
          // the query/code to fetch it, but WITHOUT nested deps that would cause cascading failures.
          const deps = (tableDef.pipelineDependencies || []).map((d: any) => {
            return {
              tableName: d.tableName,
              query: d.query,
              isPython: d.isPython,
              pythonCode: d.pythonCode,
              connectorId: d.connectorId
              // NOTE: No pipelineDependencies! Prevents recursive re-fetching cascading failures.
            };
          });

          // Resolve connectorId for the Python phase: prefer python-specific,
          // then SQL, then a dep with a connector, finally look up each dep's
          // source node in contextTables (tree-wide) for its connectorId.
          // Without this, query_db() is not injected in the Python sandbox
          // (NameError at runtime).
          let resolvedPyCid = tableDef.pythonConnectorId || tableDef.connectorId || tableDef.sqlConnectorId || '';
          if (!resolvedPyCid) {
            for (const d of deps) {
              if (d.connectorId) { resolvedPyCid = d.connectorId; break; }
            }
          }
          if (!resolvedPyCid) {
            // Last resort: scan contextTables for any SQL dep with a connector.
            for (const d of (tableDef.pipelineDependencies || [])) {
              const src = contextTables.find(t => t.name === d.tableName);
              const cid = src?.pythonConnectorId || src?.connectorId || src?.sqlConnectorId;
              if (cid) { resolvedPyCid = cid; break; }
            }
          }
          if (!resolvedPyCid) {
            // Still nothing — fall back to any SQL connector in the tree so
            // query_db() at least gets injected (the sandbox still enforces
            // companyId on the server side).
            const anySqlCtx = contextTables.find(t => !t.isPython && (t.connectorId || t.sqlConnectorId));
            if (anySqlCtx) resolvedPyCid = anySqlCtx.connectorId || anySqlCtx.sqlConnectorId || '';
          }
          if (!resolvedPyCid) {
            logger.warn(`[AncestorChain] ${originalName}: no connectorId resolvable — query_db() will NOT be injected`);
          } else {
            logger.log(`[AncestorChain] ${originalName}: resolved connectorId=${resolvedPyCid.slice(0, 10)}...`);
          }
          const res = await executePythonPreview(
            tableDef.pythonCode,
            tableDef.pythonOutputType || 'table',
            inputData, // PASS DATA HERE
            deps,
            resolvedPyCid,
            tableDef.selectedDocuments?.length > 0 ? tableDef.selectedDocuments : undefined,
            dfTarget, // FIX: Explicitly tell Python backend which table to map to 'df'
            companyId, // Pass company for SharePoint token resolution
          );

          if (res.success) {
            // IMPORTANT: Store in SAME format as button UI - always wrap with .data property
            // Button does: ancestorResults[name] = { data: res.data, chartBase64: ..., variables: ... }
            resultData = {
              data: res.data,
              chartBase64: res.chartBase64,
              chartHtml: res.chartHtml,
              rechartsConfig: res.rechartsConfig,
              rechartsData: res.rechartsData,
              plotlyJson: res.plotlyJson,
              html: res.html,
              variables: res.variables,
              stdout: res.stdout
            };
          } else {
            logger.error(`[AncestorChain] Error executing Python node ${originalName}: ${res.error}`);
            pipelineReport.push({ name: originalName, type: 'Python', status: 'error', error: res.error, timestamp: new Date().toISOString(), nodePath: tableDef.nodePath || tableDef.nodeId });
          }
        } else if (tableDef.sqlQuery) {
          // SQL
          // FIX: The ancestor chain has ALREADY executed all nodes in order.
          // We ONLY need to pass pre-calculated data as deps. DO NOT pass query/pipelineDependencies
          // because executeSqlPreviewAction's flattenDependencies would try to re-execute them
          // recursively, which fails since temp tables from previous connections don't exist.
          // Instead: pass ALL available pre-calculated results as data-only deps.
          // OPTIMIZATION: Only inject deps that are actually referenced in the SQL query
          // This avoids re-materializing large tables (e.g. HR2 12K rows) for nodes that don't use them
          const sqlQueryLower = tableDef.sqlQuery.toLowerCase();
          const deps: any[] = [];
          let effectiveQuery = tableDef.sqlQuery;
          const addedDepNames = new Set<string>();

          // Helper for precise replacement (to avoid partial matches like PROD vs PRODFIL)
          const replaceRef = (sql: string, oldName: string, newName: string) => {
            const escaped = escapeRegExp(oldName);
            // Match FROM/JOIN followed by optional schema and the table name
            const pattern = `\\b(FROM|JOIN)\\s+((?:\\[[^\\]]+\\]|\\w+)\\.)?\\[?${escaped}\\]?\\b`;
            const regex = new RegExp(pattern, 'gi');
            return sql.replace(regex, (match, keyword, schema) => {
              return `${keyword} ${schema || ''}${newName}`;
            });
          };

          for (const [key, val] of Object.entries(results)) {
            const keyNorm = key.toLowerCase().trim();
            if (keyNorm !== normalizedName && !addedDepNames.has(key)) {
              // Precise Detection: Use regex with word boundaries
              const tableRegex = new RegExp(`\\b${escapeRegExp(keyNorm)}\\b`, 'i');
              if (!tableRegex.test(sqlQueryLower)) continue;

              // Permanent Table Reuse
              const perm = permanentTables.get(keyNorm);
              if (perm && perm.connectorId === tableDef.connectorId) {
                logger.log(`[AncestorChain] ${originalName}: Reusing permanent table ${perm.tableName} for dependency ${key}`);
                effectiveQuery = replaceRef(effectiveQuery, key, perm.tableName);
                addedDepNames.add(key);
                continue;
              }

              const dataToInject = Array.isArray(val) ? val :
                (val && typeof val === 'object' && 'data' in val && Array.isArray(val.data)) ? val.data : null;
              if (dataToInject) {
                if (dataToInject.length === 0) {
                  logger.log(`[AncestorChain] WARNING: Dependency "${key}" for node "${originalName}" has 0 rows — injecting empty table to prevent JOIN failure`);
                }
                deps.push({
                  tableName: key,
                  data: dataToInject
                });
                addedDepNames.add(key);
              }
            }
          }
          logger.log(`[AncestorChain] SQL node ${originalName}: injected ${deps.length} deps (${deps.map((d: any) => d.tableName).join(', ')})`);

          const res = await executeSqlPreview(
            effectiveQuery,
            tableDef.connectorId,
            deps,
            companyId, // tenant scope so nodes without explicit connectorId still resolve
          );
          if (res.error) {
            logger.error(`[AncestorChain] Error executing SQL node ${originalName}: ${res.error}`);
            pipelineReport.push({ name: originalName, type: 'SQL', status: 'error', error: res.error, timestamp: new Date().toISOString(), nodePath: tableDef.nodePath || tableDef.nodeId });
          } else {
            resultData = res.data;

            // HYBRID NODE: If this SQL node also has Python chart code, run it too
            // This generates the chart using the SQL result as input data
            if (tableDef.pythonCode && tableDef.pythonOutputType && resultData) {
              logger.log(`[AncestorChain] Hybrid node ${originalName}: SQL done, now running Python chart code`);
              const pythonInputData: Record<string, any> = {};
              // Provide the SQL result under ALL alias names so Python code can reference any name
              const hybridAllNames = tableDef.allNames || [originalName];
              const sqlDataForPython = Array.isArray(resultData) ? resultData : [resultData];
              for (const alias of hybridAllNames) {
                pythonInputData[alias] = sqlDataForPython;
              }
              // Also provide all previous results using `results` map (which has alias keys)
              // This ensures Python code can reference deps by alias (e.g. "Budget" instead of "Fatturato > Budget")
              for (const [key, val] of Object.entries(results)) {
                if (pythonInputData[key] !== undefined) continue; // Skip self (already added above)
                if (val && typeof val === 'object' && 'data' in val && Array.isArray(val.data)) {
                  pythonInputData[key] = val.data;
                } else if (Array.isArray(val)) {
                  pythonInputData[key] = val;
                }
              }

              // FIX: For hybrid nodes, use pythonConnectorId for the Python phase (e.g. HubSpot token),
              // NOT the SQL connectorId. getAllNodesFromTree sets connectorId = sqlConnectorId for SQL-having
              // nodes, but Python code may need a different connector (e.g. HubSpot API).
              const hybridPyConnectorId = tableDef.pythonConnectorId || tableDef.connectorId;
              const pyRes = await executePythonPreview(
                tableDef.pythonCode,
                tableDef.pythonOutputType,
                pythonInputData,
                [], // No deps needed - data already provided
                hybridPyConnectorId,
                tableDef.selectedDocuments?.length > 0 ? tableDef.selectedDocuments : undefined
              );

              if (pyRes.success) {
                // Merge: wrap SQL data + Python chart into a single result object
                resultData = {
                  data: Array.isArray(resultData) ? resultData : [resultData],
                  chartBase64: pyRes.chartBase64,
                  chartHtml: pyRes.chartHtml,
                  rechartsConfig: pyRes.rechartsConfig,
                  rechartsData: pyRes.rechartsData,
                  plotlyJson: pyRes.plotlyJson,
                  html: pyRes.html,
                  variables: pyRes.variables,
                  stdout: pyRes.stdout
                };
                logger.log(`[AncestorChain] Hybrid node ${originalName}: Python chart generated successfully`);

                // FIX: For hybrid nodes where sqlResultName != pythonResultName, the Python code
                // may produce DIFFERENT data than the SQL (e.g. SQL=CommesseMago, Python=CommesseHubSpot).
                // Store the Python result data separately under pythonResultName so downstream UNION ALL
                // queries get the correct distinct data for each source instead of SQL data for both.
                const hybridPythonName = tableDef.pythonResultName;
                const hybridSqlName = tableDef.sqlResultName;
                if (hybridPythonName && hybridSqlName && hybridPythonName !== hybridSqlName && Array.isArray(pyRes.data) && pyRes.data.length > 0) {
                  logger.log(`[AncestorChain] Hybrid ${originalName}: storing Python result (${pyRes.data.length} rows) separately under '${hybridPythonName}'`);
                  results[hybridPythonName] = pyRes.data;
                  resultsNormalized[hybridPythonName.toLowerCase().trim()] = pyRes.data;
                }
              } else {
                logger.error(`[AncestorChain] Hybrid node ${originalName}: Python chart failed: ${pyRes.error}`);
                // Keep SQL-only result (resultData unchanged)
              }
            }
          }
        }

        if (resultData) {
          // Check if there's already a result for this name
          const existingResult = resultsNormalized[normalizedName];
          const newResultIsArray = Array.isArray(resultData);
          const existingResultIsArray = Array.isArray(existingResult);
          const existingHasDataArray = existingResult && typeof existingResult === 'object' && 'data' in existingResult && Array.isArray(existingResult.data);

          // PRIORITY LOGIC: SQL (array) results should override Python chart (object without data array)
          // This fixes the duplicate node name issue where HR2 Python chart blocks HR2 SQL
          let shouldStore = true;
          if (existingResult !== undefined) {
            if (newResultIsArray && !existingResultIsArray && !existingHasDataArray) {
              // New is array (SQL), existing is object without data array (Python chart) -> OVERRIDE
              logger.log(`[AncestorChain] Overriding ${originalName}: new SQL array replaces existing Python chart`);
            } else if (!newResultIsArray && (existingResultIsArray || existingHasDataArray)) {
              // New is object (Python chart), existing is array (SQL) or has data array -> DON'T OVERRIDE
              logger.log(`[AncestorChain] Keeping existing ${originalName}: SQL array preserved over Python chart`);
              shouldStore = false;
            }
          }

          if (shouldStore) {
            // Store under primary name
            results[originalName] = resultData;
            resultsNormalized[normalizedName] = resultData;

            // Also store under all alternative names
            // EXCEPTION: skip aliases that were already stored separately with Python-specific data
            // (e.g. pythonResultName for hybrid nodes where SQL and Python produce different datasets)
            const allNames = tableDef.allNames || [originalName];
            const hybridPythonName = tableDef.pythonResultName;
            for (const altName of allNames) {
              if (altName !== originalName) {
                // Skip if this alias already has separately stored Python data (don't overwrite it)
                if (hybridPythonName && altName === hybridPythonName && results[altName] !== undefined) {
                  logger.log(`[AncestorChain] Skipping alias '${altName}' — already stored with separate Python data`);
                  continue;
                }
                results[altName] = resultData;
                resultsNormalized[altName.toLowerCase().trim()] = resultData;
              }
            }
          }
          pipelineReport.push({ name: originalName, type: tableDef.isPython ? 'Python' : 'SQL', status: 'success', timestamp: new Date().toISOString(), nodePath: tableDef.nodePath || tableDef.nodeId });

          // --- INCREMENTAL PERSISTENCE (Real-Time Previews) ---
          if (treeId && shouldStore) {
            const nodeId = tableDef.nodeId || tableDef.id;
            if (nodeId) {
              logger.log(`[AncestorChain] [DEBUG] Starting incremental preview for ${originalName} (${nodeId})`);
              try {
                await saveAncestorPreviews(treeId, [{
                  nodeId: nodeId,
                  isPython: !!tableDef.isPython,
                  pythonOutputType: tableDef.pythonOutputType,
                  result: resultData
                }]);
                logger.log(`[AncestorChain] [DEBUG] Incremental preview SAVED for ${originalName}`);
              } catch (err: any) {
                logger.error(`[AncestorChain] [DEBUG] Failed to save incremental preview for ${originalName}: ${err.message}`);
              }
            } else {
              logger.log(`[AncestorChain] [DEBUG] Skipping incremental preview for ${originalName} - missing nodeId`);
            }
          }
        } else {
          if (!pipelineReport.find(r => r.name === originalName)) {
            pipelineReport.push({ name: originalName, type: tableDef.isPython ? 'Python' : 'SQL', status: 'skipped', error: 'No result produced', timestamp: new Date().toISOString(), nodePath: tableDef.nodePath || tableDef.nodeId });
          }
        }

        // B. WRITE TO DATABASE
        // Fix: Check for export config using the actual field names from the node structure
        const targetTableName = tableDef.sqlExportTargetTableName || tableDef.sqlExportConfig?.targetTableName;
        const targetConnectorId = tableDef.sqlExportTargetConnectorId || tableDef.sqlExportConfig?.targetConnectorId || tableDef.connectorId;

        if (tableDef.writesToDatabase && targetTableName && targetConnectorId && resultData) {
          logger.log(`[AncestorChain] Writing ${originalName} to ${targetTableName}`);
          // Extract .data from Python result wrappers (which have { data, chartBase64, ... })
          const rawData = (resultData && typeof resultData === 'object' && 'data' in resultData && Array.isArray(resultData.data))
            ? resultData.data
            : resultData;
          const dataArr = Array.isArray(rawData) ? rawData : [rawData];
          if (dataArr.length > 0) {
            try {
              await exportTableToSql(
                targetConnectorId,
                targetTableName,
                dataArr,
                true, // createTable
                true, // truncate
              );
              // Store permanent table info for reuse in downstream nodes
              const nodeAllNames = tableDef.allNames || [originalName];
              for (const name of nodeAllNames) {
                permanentTables.set(name.toLowerCase().trim(), { connectorId: targetConnectorId, tableName: targetTableName });
              }

              pipelineReport.push({ name: `💾 Write ${targetTableName}`, type: 'export', status: 'success', timestamp: new Date().toISOString(), nodePath: tableDef.nodePath || tableDef.nodeId });
            } catch (exportErr: any) {
              logger.error(`[AncestorChain] Export failed for ${originalName} to ${targetTableName}: ${exportErr.message}`);
              pipelineReport.push({ name: `💾 Write ${targetTableName}`, type: 'export', status: 'error', error: exportErr.message, timestamp: new Date().toISOString(), nodePath: tableDef.nodePath || tableDef.nodeId });
            }
          }
        }

        // PERF: emit per-ancestor timing once everything above has finished.
        // Pull row count from the two shapes we produce:
        //  - SQL:   resultData = array
        //  - Python: resultData = { data: array, chartBase64, ... }
        {
          const rowsArr = Array.isArray(resultData)
            ? resultData
            : (resultData && typeof resultData === 'object' && Array.isArray((resultData as any).data))
              ? (resultData as any).data
              : null;
          _logDone(rowsArr ? rowsArr.length : undefined);
        }

      } catch (e: any) {
        logger.error(`[AncestorChain] Exception executing ${originalName}: ${e.message}`);
        pipelineReport.push({ name: originalName, type: tableDef.isPython ? 'Python' : 'SQL', status: 'error', error: e.message, timestamp: new Date().toISOString(), nodePath: tableDef.nodePath || tableDef.nodeId });
        _logDone();
      }
    }

    return { results, pipelineReport };
  }

  /**
   * Helper to find a node in the tree by path
   */
  private findNodeByPath(treeJson: any, path: string): any | null {
    if (!path || !treeJson) return null;

    const parts = path.split('->').filter(p => p !== 'root');
    let current = treeJson;

    for (const part of parts) {
      if (!current.options || !current.options[part]) {
        return null;
      }
      current = current.options[part];
    }

    return current;
  }

  /**
   * Helper to recursively find a node by ID in the tree
   */
  private findNodeById(node: any, targetId: string): any | null {
    if (!node || typeof node !== 'object') return null;

    // Check if this is the target node
    if (node.id === targetId) return node;

    // Recursively search in options
    if (node.options && typeof node.options === 'object') {
      for (const key in node.options) {
        const val = node.options[key];
        const found = this.findNodeById(val, targetId);
        if (found) return found;
      }
    }

    // Also search in arrays (some nodes might be in arrays)
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = this.findNodeById(item, targetId);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Helper to get all ancestor nodes (predecessors) for a given node
   */
  private getAncestorNodes(treeJson: any, nodePath: string): any[] {
    const ancestors: any[] = [];
    const parts = nodePath.split('->').filter(p => p !== 'root');

    let current = treeJson;
    let currentPath = 'root';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath += `->${part}`;

      if (current.options && current.options[part]) {
        current = current.options[part];

        // Extract relevant node info
        const allNames = [current.name, current.sqlResultName, current.pythonResultName, current.aiConfig?.outputName].filter(Boolean) as string[];
        const nodeInfo: any = {
          name: allNames[0] || current.name,
          allNames: allNames,
          // FIX: Consistent classification with getAllNodesFromTree - SQL takes priority over Python
          // This ensures hybrid nodes (both sqlQuery and pythonCode) enter the SQL branch in executeAncestorChain,
          // which has proper hybrid handling (runs SQL first, then Python chart code)
          isPython: current.sqlQuery ? false : !!current.pythonCode,
          isAi: !!(current.aiConfig?.enabled && current.aiConfig?.outputName && !current.sqlQuery && !current.pythonCode),
          connectorId: current.sqlQuery
            ? (current.sqlConnectorId || current.connectorId || current.pythonConnectorId)
            : (current.pythonConnectorId || current.sqlConnectorId || current.connectorId),
          sqlQuery: current.sqlQuery,
          pythonCode: current.pythonCode,
          pythonOutputType: current.pythonOutputType,
          pythonResultName: current.pythonResultName,
          sqlResultName: current.sqlResultName,
          aiConfig: current.aiConfig,
          pipelineDependencies: (current.pipelineDependencies && current.pipelineDependencies.length > 0)
            ? current.pipelineDependencies
            : ((current.pythonSelectedPipelines || current.selectedPipelines || []).length
              ? (current.pythonSelectedPipelines || current.selectedPipelines).map((name: string) => ({ tableName: name }))
              : []),
          writesToDatabase: current.sqlExportTargetTableName ? true : false,
          sqlExportTargetTableName: current.sqlExportTargetTableName,
          sqlExportTargetConnectorId: current.sqlExportTargetConnectorId,
          nodeId: current.id
        };

        if (allNames.length > 0) {
          ancestors.push(nodeInfo);
        }
      }
    }

    return ancestors;
  }

  /**
   * Helper to get ancestors by finding the path to a node via its ID
   * This is used when nodePath is not available
   */
  private getAncestorsForNode(treeJson: any, targetNodeId: string): any[] {
    let foundAncestors: any[] = [];

    // Helper to find path and collect ancestors
    const findPath = (node: any, currentAncestors: any[]): boolean => {
      if (!node || typeof node !== 'object') return false;

      // If this is the target node, we found it! Save the ancestors list
      if (node.id === targetNodeId) {
        foundAncestors = currentAncestors;
        return true;
      }

      // Extract node info if it has a name
      const allNames = [node.name, node.sqlResultName, node.pythonResultName, node.aiConfig?.outputName].filter(Boolean) as string[];
      const nodeInfo: any = allNames.length > 0 ? {
        name: allNames[0], // Primary name
        allNames: allNames, // Used for matching
        // IMPORTANT: Final robust classification
        isPython: node.sqlQuery ? false : !!(node.pythonCode || node.pythonOutputType),
        isAi: !!(node.aiConfig?.enabled && node.aiConfig?.outputName && !node.sqlQuery && !node.pythonCode),
        connectorId: node.sqlQuery
          ? (node.sqlConnectorId || node.connectorId || node.pythonConnectorId)
          : (node.pythonConnectorId || node.sqlConnectorId || node.connectorId),
        sqlQuery: node.sqlQuery,
        pythonCode: node.pythonCode,
        pythonOutputType: node.pythonOutputType,
        pythonResultName: node.pythonResultName,
        sqlResultName: node.sqlResultName,
        aiConfig: node.aiConfig,
        pipelineDependencies: node.pipelineDependencies ||
          ((node.pythonSelectedPipelines || node.selectedPipelines || []).length
            ? (node.pythonSelectedPipelines || node.selectedPipelines).map((name: string) => ({ tableName: name }))
            : []),
        writesToDatabase: node.sqlExportTargetTableName ? true : false,
        sqlExportTargetTableName: node.sqlExportTargetTableName,
        sqlExportTargetConnectorId: node.sqlExportTargetConnectorId,
        nodeId: node.id
      } : null;

      // Search in options (handling both object keys and arrays)
      if (node.options && typeof node.options === 'object') {
        for (const key in node.options) {
          const val = node.options[key];
          const newAncestors = nodeInfo ? [...currentAncestors, nodeInfo] : currentAncestors;

          // If the value is an array, search in each element
          if (Array.isArray(val)) {
            for (const item of val) {
              if (findPath(item, newAncestors)) {
                return true;
              }
            }
          } else {
            // Otherwise search directly
            if (findPath(val, newAncestors)) {
              return true;
            }
          }
        }
      }

      return false;
    };

    findPath(treeJson, []);
    return foundAncestors;
  }

  /**
   * Helper to flatten all nodes from the tree
   */
  private getAllNodesFromTree(treeJson: any): any[] {
    const nodes: any[] = [];
    const collect = (node: any, currentPath: string = 'root') => {
      if (!node || typeof node !== 'object') return;

      const allNames = [node.name, node.sqlResultName, node.pythonResultName, node.aiConfig?.outputName].filter(Boolean) as string[];
      const nodeName = allNames[0] || node.id || 'unknown';
      const nodePath = currentPath;

      if (node.id && allNames.length > 0) {
        // Extract export config - handle both flat and nested structures
        const exportTargetTableName = node.sqlExportTargetTableName || node.sqlExportAction?.targetTableName;
        const exportTargetConnectorId = node.sqlExportTargetConnectorId || node.sqlExportAction?.targetConnectorId;
        const hasExportConfig = !!(exportTargetTableName && exportTargetConnectorId);

        // Convert pythonSelectedPipelines/selectedPipelines to pipelineDependencies if the latter is missing
        // pythonSelectedPipelines is ["WIPSQL"], selectedPipelines is ["CommesseMago", ...]
        // pipelineDependencies is [{tableName: "WIPSQL"}, ...]
        const selectedPipes = node.pythonSelectedPipelines || node.selectedPipelines || [];
        const effectivePipelineDeps = (node.pipelineDependencies && node.pipelineDependencies.length > 0)
          ? node.pipelineDependencies
          : (selectedPipes.length
            ? selectedPipes.map((name: string) => ({ tableName: name }))
            : []);

        nodes.push({
          ...node,
          name: allNames[0],
          allNames,
          nodePath, // Track the path to this node
          isPython: node.sqlQuery ? false : !!(node.pythonCode || node.pythonResultName || node.pythonOutputType),
          isAi: !!(node.aiConfig?.enabled && node.aiConfig?.outputName && !node.sqlQuery && !node.pythonCode),
          aiConfig: node.aiConfig,
          // For SQL nodes (isPython=false), prefer sqlConnectorId to avoid using a non-SQL connector (e.g. HubSpot)
          connectorId: node.sqlQuery
            ? (node.sqlConnectorId || node.connectorId || node.pythonConnectorId)
            : (node.pythonConnectorId || node.sqlConnectorId || node.connectorId),
          // Ensure export fields are always present and correct
          writesToDatabase: hasExportConfig,
          sqlExportTargetTableName: exportTargetTableName,
          sqlExportTargetConnectorId: exportTargetConnectorId,
          pipelineDependencies: effectivePipelineDeps,
        });

        if (allNames[0] === 'HR2') {
          logger.log(`[DEBUG HR2] Node properties: isPython=${nodes[nodes.length - 1].isPython}, sqlQuery=${!!node.sqlQuery}, pythonCode=${!!node.pythonCode}, pythonResultName=${node.pythonResultName}, pythonOutputType=${node.pythonOutputType}, nodePath=${nodePath}`);
        }
      }

      if (node.options && typeof node.options === 'object') {
        for (const key in node.options) {
          const val = node.options[key];
          const childPath = `${nodePath} > ${key}`;
          if (Array.isArray(val)) {
            val.forEach((item, idx) => collect(item, `${childPath}[${idx}]`));
          } else {
            collect(val, childPath);
          }
        }
      }
    };
    collect(treeJson);
    return nodes;
  }

  private async executeEmailSend(config: ScheduledTaskConfig): Promise<TaskExecutionResult> {
    // SIMPLIFIED: Load LIVE data from tree instead of using snapshots
    logger.log(`[EmailSend] Loading LIVE tree data for task execution`);

    const { treeId, nodeId, nodePath, to, cc, bcc, subject, body, connectorId, companyId: emailCompanyId } = config;

    if (!connectorId) return { success: false, error: "Missing SMTP Connector ID" };
    if (!treeId) return { success: false, error: "Missing treeId" };

    // 1. Load LIVE tree from database
    const tree = await db.tree.findUnique({ where: { id: treeId } });
    if (!tree) return { success: false, error: "Tree not found" };

    const treeJson = JSON.parse(tree.jsonDecisionTree);

    // Hydrate with preview data from NodePreviewCache (style overrides, etc.)
    try {
      const { hydrateTreeWithPreviews } = await import('@/lib/preview-cache');
      await hydrateTreeWithPreviews(treeId, treeJson);
    } catch (e: any) {
      logger.warn(`[EmailSend] Failed to hydrate preview cache: ${e.message}`);
    }

    // 2. Find the email node (Test) match
    let emailNode = this.findNodeByPath(treeJson, nodePath || '');
    if (!emailNode && nodeId) {
      logger.log(`[EmailSend] Path-based search failed, trying nodeId: ${nodeId}`);
      emailNode = this.findNodeById(treeJson, nodeId);
    }
    if (!emailNode) return { success: false, error: "Email node not found in tree" };

    // Support nested emailAction structure
    const emailAction = emailNode.emailAction || {};
    const emailConfig = {
      to: emailAction.to || emailNode.to || to || '',
      cc: emailAction.cc || emailNode.cc || cc || '',
      bcc: emailAction.bcc || emailNode.bcc || bcc || '',
      subject: emailAction.subject || emailNode.subject || subject || '',
      body: emailAction.body || emailNode.body || emailNode.emailBody || body || '',
      connectorId: emailAction.connectorId || emailNode.connectorId || connectorId || '',
      attachments: emailAction.attachments || {
        tablesInBody: emailNode.selectedTables || [],
        tablesAsExcel: emailNode.selectedTablesAsExcel || [],
        pythonOutputsInBody: emailNode.selectedPythonOutputs || [],
        pythonOutputsAsAttachment: emailNode.selectedPythonOutputsAsAttachment || [],
        mediaAsAttachment: emailNode.mediaAsAttachment || []
      }
    };

    logger.log(`[EmailSend] Found email node: ${emailNode.question || emailNode.name || emailNode.id}`);

    // Extract selections and placeholders early for discovery
    const emailAttachments = emailConfig.attachments;
    const tablesInBody = emailAttachments.tablesInBody || [];
    const tablesAsExcel = emailAttachments.tablesAsExcel || [];
    const pythonOutputsInBody = emailAttachments.pythonOutputsInBody || [];
    const pythonOutputsAsAttachment = emailAttachments.pythonOutputsAsAttachment || [];

    // Extract placeholder references from email body
    const bodyContent = emailConfig.body;
    const placeholderTableNames = (bodyContent.match(/\{\{TABELLA:([^}]+)\}\}/g) || []).map((m: string) => m.replace(/\{\{TABELLA:|\}\}/g, ''));
    const placeholderChartNames = (bodyContent.match(/\{\{GRAFICO:([^}]+)\}\}/g) || []).map((m: string) => m.replace(/\{\{GRAFICO:|\}\}/g, ''));
    const placeholderVarNames = (bodyContent.match(/\{\{VARIABILE:([^}]+)\}\}/g) || []).map((m: string) => m.replace(/\{\{VARIABILE:|\}\}/g, ''));
    // Also handle {{HTML:name}} placeholders (used for Python HTML outputs embedded in body)
    const placeholderHtmlNames = (bodyContent.match(/\{\{HTML:([^}]+)\}\}/g) || []).map((m: string) => m.replace(/\{\{HTML:|\}\}/g, ''));

    // 3. IDENTIFY ALL REQUIRED NODES (Global Discovery)
    const allReferencedPythonNames = [...placeholderChartNames, ...placeholderVarNames, ...placeholderHtmlNames, ...pythonOutputsInBody, ...pythonOutputsAsAttachment];
    const allReferencedSqlNames = [...placeholderTableNames, ...tablesInBody, ...tablesAsExcel];
    const allRequiredNames = Array.from(new Set([...allReferencedPythonNames, ...allReferencedSqlNames]));

    logger.log(`[EmailSend] Identified ${allRequiredNames.length} required names: ${allRequiredNames.join(', ')}`);

    // Get all potential nodes from the tree
    const globalNodes = this.getAllNodesFromTree(treeJson);
    logger.log(`[EmailSend] Flattened tree into ${globalNodes.length} named nodes. Available names: ${globalNodes.map(n => n.allNames.join('|')).join(', ')}`);

    // 4. FOR EMAIL TASKS: Execute ONLY the ancestor pipeline of the email node
    // This matches how the UI works: when you press "Send Email" on a node, it executes
    // only the ancestors (parent nodes + their pipeline dependencies), NOT the entire tree.
    // Previously this executed ALL tree nodes, which was 3-10x slower than necessary.
    const ancestorNodes = this.getAncestorsForNode(treeJson, nodeId || '');

    // Resolve transitive pipeline dependencies: ancestors + their deps + deps of deps.
    // This ensures we execute exactly the nodes needed, like the UI does.
    const requiredNames = new Set<string>();

    // Seed with ancestor names and email-required names
    for (const node of ancestorNodes) {
      for (const name of (node.allNames || [node.name])) {
        if (name) requiredNames.add(name.toLowerCase().trim());
      }
    }
    for (const name of allRequiredNames) {
      requiredNames.add(name.toLowerCase().trim());
    }

    // Build a name→node lookup from globalNodes for transitive resolution
    const nodeByName = new Map<string, any>();
    for (const n of globalNodes) {
      for (const nm of (n.allNames || [n.name])) {
        if (nm) nodeByName.set(nm.toLowerCase().trim(), n);
      }
    }

    // Transitively resolve pipeline dependencies (BFS)
    let frontier = [...requiredNames];
    while (frontier.length > 0) {
      const nextFrontier: string[] = [];
      for (const name of frontier) {
        const node = nodeByName.get(name);
        if (!node) continue;
        const deps = node.pipelineDependencies || [];
        for (const dep of deps) {
          const depName = (dep.tableName || dep.name || '').toLowerCase().trim();
          if (depName && !requiredNames.has(depName)) {
            requiredNames.add(depName);
            nextFrontier.push(depName);
          }
        }
      }
      frontier = nextFrontier;
    }

    // Filter globalNodes to only include required ones
    const availableInputTables = globalNodes.filter(n => {
      const nodeNames = (n.allNames || [n.name]).map((nm: string) => nm?.toLowerCase().trim());
      return nodeNames.some((nm: string) => requiredNames.has(nm));
    });

    // If ancestor-based filtering resulted in fewer nodes than required, fall back to all
    if (availableInputTables.length === 0) {
      logger.log(`[EmailSend] WARNING: No ancestor nodes found, falling back to ALL ${globalNodes.length} nodes`);
      availableInputTables.push(...globalNodes);
    }

    logger.log(`[EmailSend] Executing ${availableInputTables.length}/${globalNodes.length} nodes (ancestor pipeline only): ${availableInputTables.map(n => n.name).join(', ')}`);

    // 6. Execute ancestor pipeline to refresh data (like UI's executeFullPipeline)
    const { results: ancestorResults, pipelineReport } = await this.executeAncestorChain(availableInputTables, undefined, true, treeId, emailCompanyId);
    logger.log(`[EmailSend] Ancestor chain completed with ${Object.keys(ancestorResults).length} results and ${pipelineReport.length} report entries`);

    // 6b. CHECK: block email ONLY if a node REQUIRED by the email failed.
    // Non-required nodes (not referenced in body/attachments/placeholders) can fail without blocking.
    const allErrors = pipelineReport.filter((r: any) => r.status === 'error');
    if (allErrors.length > 0) {
      // Build a set of required names (case-insensitive) for matching
      const requiredNamesLower = new Set(allRequiredNames.map(n => n.toLowerCase().trim()));
      const criticalErrors = allErrors.filter((r: any) => {
        const rName = (r.name || '').toLowerCase().trim();
        return requiredNamesLower.has(rName);
      });

      if (criticalErrors.length > 0) {
        const failedNodes = criticalErrors.map((r: any) => `${r.name} (${r.type}): ${r.error || 'unknown'}`).join('; ');
        const errorMsg = `Pipeline con ${criticalErrors.length} fallimento/i critico/i. Nodi falliti: ${failedNodes}. Email non inviata.`;
        logger.error(`[EmailSend] ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      // Log non-critical failures as warnings
      const nonCritical = allErrors.filter((r: any) => !requiredNamesLower.has((r.name || '').toLowerCase().trim()));
      if (nonCritical.length > 0) {
        logger.warn(`[EmailSend] ${nonCritical.length} nodo/i non-critico/i fallito/i (non bloccano l'email): ${nonCritical.map((r: any) => r.name).join(', ')}`);
      }
    }

    // 5. PREFER saved config if available (from taskConfigProvider snapshot)
    // This is more reliable than re-discovering from tree since the UI already computed these correctly
    let selectedTables: any[] = [];
    let selectedPythonOutputs: any[] = [];

    if (Array.isArray((config as any).selectedTables) && (config as any).selectedTables.length > 0) {
      logger.log(`[EmailSend] Using saved config.selectedTables (${(config as any).selectedTables.length} items)`);
      selectedTables = (config as any).selectedTables;
    }

    if (Array.isArray((config as any).selectedPythonOutputs) && (config as any).selectedPythonOutputs.length > 0) {
      logger.log(`[EmailSend] Using saved config.selectedPythonOutputs (${(config as any).selectedPythonOutputs.length} items)`);
      selectedPythonOutputs = (config as any).selectedPythonOutputs;
    }

    // Only re-discover from tree if saved config arrays are empty
    if (selectedTables.length === 0 && selectedPythonOutputs.length === 0) {
      logger.log(`[EmailSend] No saved config, falling back to tree discovery`);
      logger.log(`[EmailSend] Matching SQL tables. Placeholders in body: ${JSON.stringify(placeholderTableNames)}`);
      for (const table of availableInputTables) {
        if (table.isPython) {
          logger.log(`[EmailSend] Skipping Python node during SQL phase: ${table.name}`);
          continue; // Skip Python outputs
        }

        // Check if ANY of the node's names match the SQL-specific placeholders
        // NOTE: placeholderChartNames and placeholderVarNames are Python outputs, NOT SQL tables
        const names = table.allNames || [table.name];
        const inBody = (tablesInBody || []).some((n: string) => names.includes(n)) ||
          placeholderTableNames.some((n: string) => names.includes(n));
        const asExcel = (tablesAsExcel || []).some((n: string) => names.includes(n));
        logger.log(`[EmailSend] SQL Table ${table.name} (Alternatives: ${names.join(',')}): inBody=${inBody}, asExcel=${asExcel}`);

        if (inBody || asExcel) {
          // Use the matched alias name so it matches {{TABELLA:name}} placeholders in email body
          const matchedName = (tablesInBody || []).find((n: string) => names.includes(n)) ||
            placeholderTableNames.find((n: string) => names.includes(n)) ||
            (tablesAsExcel || []).find((n: string) => names.includes(n)) ||
            table.name;
          if (!selectedTables.some(t => t.name === matchedName)) {
            selectedTables.push({
              name: matchedName,
              query: table.sqlQuery || `SELECT * FROM ${table.name}`,
              inBody,
              asExcel,
              pipelineDependencies: table.pipelineDependencies
            });
          }
        }
      }

      // 7. Build selectedPythonOutputs payload
      // Include nodes that have pythonCode+pythonOutputType even if they also have sqlQuery (hybrid nodes produce both SQL data and Python charts)
      logger.log(`[EmailSend] Matching Python outputs. Placeholders in body: ${JSON.stringify(allReferencedPythonNames)}`);
      for (const pythonNode of availableInputTables.filter(t => t.isPython || (t.pythonCode && t.pythonOutputType))) {
        const names = pythonNode.allNames || [pythonNode.name];

        // Find the specific matched name from email config (prefer it over canonical name for placeholder matching)
        const matchedBodyName = allReferencedPythonNames.find((n: string) => names.includes(n)) ||
          (pythonOutputsInBody || []).find((n: string) => names.includes(n));
        const matchedAttachName = (pythonOutputsAsAttachment || []).find((n: string) => names.includes(n));

        const inBody = !!matchedBodyName;
        const asAttachment = !!matchedAttachName;
        logger.log(`[EmailSend] Python Node ${pythonNode.name} (Alternatives: ${names.join(',')}): inBody=${inBody}, asAttachment=${asAttachment}, matchedName=${matchedBodyName || matchedAttachName || 'none'}`);

        if (inBody || asAttachment) {
          // Use the matched alias name so it matches {{GRAFICO:name}} placeholders in email body
          const effectiveName = matchedBodyName || matchedAttachName || pythonNode.name;
          // Avoid duplicates (multiple nodes may share the same allName alias)
          if (!selectedPythonOutputs.some(p => p.name === effectiveName)) {
            selectedPythonOutputs.push({
              name: effectiveName,
              code: pythonNode.pythonCode,
              outputType: pythonNode.pythonOutputType || 'table',
              connectorId: pythonNode.connectorId,
              inBody,
              asAttachment,
              pipelineDependencies: pythonNode.pipelineDependencies,
              plotlyStyleOverrides: pythonNode.pythonPreviewResult?.plotlyStyleOverrides,
              htmlStyleOverrides: pythonNode.pythonPreviewResult?.htmlStyleOverrides,
            });
          }
        }
      }
    }

    // 8. Infer SQL connector ID - PREFER saved config first
    let effectiveSqlConnectorId = '';

    // First check saved config (from taskConfigProvider snapshot)
    if ((config as any).sqlConnectorId) {
      effectiveSqlConnectorId = (config as any).sqlConnectorId;
      logger.log(`[EmailSend] Using saved config.sqlConnectorId: ${effectiveSqlConnectorId}`);
    }
    // Fallback to inferring from availableInputTables
    if (!effectiveSqlConnectorId && selectedTables.length > 0) {
      // Try matching by name first
      const firstTable = availableInputTables.find(t => t.name === selectedTables[0].name);
      if (firstTable?.connectorId) {
        effectiveSqlConnectorId = firstTable.connectorId;
        logger.log(`[EmailSend] Inferred sqlConnectorId from table name match: ${effectiveSqlConnectorId}`);
      }
    }
    // Fallback: try matching by allNames/alias (e.g. "JoinCommesse" might be in allNames)
    if (!effectiveSqlConnectorId && selectedTables.length > 0) {
      for (const st of selectedTables) {
        const matchingNode = availableInputTables.find(t =>
          (t.allNames || [t.name]).some((n: string) => n === st.name) && t.connectorId
        );
        if (matchingNode?.connectorId) {
          effectiveSqlConnectorId = matchingNode.connectorId;
          logger.log(`[EmailSend] Inferred sqlConnectorId from allNames match "${st.name}" -> node "${matchingNode.name}": ${effectiveSqlConnectorId}`);
          break;
        }
      }
    }
    // Last resort: use the first non-Python node's connector from the tree
    if (!effectiveSqlConnectorId) {
      const firstSqlNode = availableInputTables.find(t => !t.isPython && t.connectorId);
      if (firstSqlNode?.connectorId) {
        effectiveSqlConnectorId = firstSqlNode.connectorId;
        logger.log(`[EmailSend] Inferred sqlConnectorId from first SQL node "${firstSqlNode.name}": ${effectiveSqlConnectorId}`);
      }
    }

    logger.log(`[EmailSend] Sending email with ${selectedTables.length} SQL tables and ${selectedPythonOutputs.length} Python outputs`);

    // Extract htmlStyleOverrides - search email node first, then all tree nodes (Python HTML nodes store overrides in pythonPreviewResult)
    let htmlStyleOverrides = emailNode.pythonPreviewResult?.htmlStyleOverrides
      || (emailNode as any).htmlStyleOverrides
      || (config as any).htmlStyleOverrides
      || undefined;
    if (!htmlStyleOverrides) {
      for (const treeNode of globalNodes) {
        const nodeOverrides = treeNode.pythonPreviewResult?.htmlStyleOverrides || treeNode.htmlStyleOverrides;
        if (nodeOverrides && typeof nodeOverrides === 'object' && Object.keys(nodeOverrides).length > 0) {
          htmlStyleOverrides = nodeOverrides;
          logger.log(`[EmailSend] Found htmlStyleOverrides on node "${treeNode.name}"`);
          break;
        }
      }
    }

    // 9. Call the SAME function as UI's "Send Test Email" button
    const result = await sendTestEmailWithDataAction({
      connectorId: emailConfig.connectorId || connectorId,
      sqlConnectorId: effectiveSqlConnectorId,
      to: emailConfig.to,
      cc: emailConfig.cc,
      bcc: emailConfig.bcc,
      subject: emailConfig.subject,
      bodyHtml: bodyContent,
      selectedTables,
      selectedPythonOutputs,
      availableMedia: emailNode.media || [],
      availableLinks: emailNode.links || [],
      availableTriggers: emailNode.triggers || [],
      mediaAttachments: emailAttachments.mediaAsAttachment || [],
      preCalculatedResults: ancestorResults,
      // Only pass critical errors (nodes required by the email) — non-critical failures should not block sending
      pipelineReport: pipelineReport.filter((r: any) => {
        if (r.status !== 'error') return true; // keep success/skipped entries
        const rName = (r.name || '').toLowerCase().trim();
        return allRequiredNames.some(n => n.toLowerCase().trim() === rName);
      }),
      htmlStyleOverrides,
      _bypassAuth: true
    });

    if (!result || !result.success) {
      throw new Error(result?.error || 'Email send failed');
    }

    return {
      success: true,
      message: `Email inviata a ${emailConfig.to} con ${selectedTables.length} SQL (${selectedTables.map(t => t.name).join(', ')}) e ${selectedPythonOutputs.length} Python (${selectedPythonOutputs.map(t => t.name).join(', ')})`
    };
  }

  /**
   * NODE_EXECUTION: Generic node executor.
   * Loads the tree, finds the node by ID, detects its type, builds a config, and dispatches.
   */
  private async executeGenericNode(config: ScheduledTaskConfig): Promise<TaskExecutionResult> {
    const { treeId, nodeId } = config;
    if (!treeId || !nodeId) return { success: false, error: 'NODE_EXECUTION requires treeId and nodeId' };

    // 1. Load tree
    const tree = await db.tree.findUnique({ where: { id: treeId } });
    if (!tree) return { success: false, error: `Tree ${treeId} not found` };
    const treeJson = JSON.parse(tree.jsonDecisionTree);

    // 2. Find the target node
    const targetNode = this.findNodeById(treeJson, nodeId);
    if (!targetNode) return { success: false, error: `Node ${nodeId} not found in tree ${treeId}` };

    logger.log(`[NodeExecution] Found node "${targetNode.question || targetNode.name || nodeId}" — detecting type`);

    // 3. Detect node type and dispatch
    if (targetNode.emailAction || targetNode.to) {
      // It's an email node — build EMAIL_SEND config
      const emailAction = targetNode.emailAction || {};
      const enrichedConfig: ScheduledTaskConfig = {
        ...config,
        to: emailAction.to || targetNode.to || '',
        cc: emailAction.cc || targetNode.cc || '',
        bcc: emailAction.bcc || targetNode.bcc || '',
        subject: emailAction.subject || targetNode.subject || '',
        body: emailAction.body || targetNode.body || targetNode.emailBody || '',
        connectorId: emailAction.connectorId || targetNode.connectorId || '',
      };
      logger.log(`[NodeExecution] Dispatching as EMAIL_SEND`);
      return await this.executeEmailSend(enrichedConfig);
    }

    if (targetNode.pythonCode) {
      // It's a Python node — build PYTHON_EXECUTE config
      logger.log(`[NodeExecution] Dispatching as PYTHON_EXECUTE`);

      // Collect context tables from tree for ancestor chain
      const globalNodes = this.getAllNodesFromTree(treeJson);
      const ancestorNodes = this.getAncestorsForNode(treeJson, nodeId);
      const requiredNames = new Set<string>();
      for (const node of ancestorNodes) {
        for (const name of (node.allNames || [node.name])) {
          if (name) requiredNames.add(name.toLowerCase().trim());
        }
      }
      // BFS transitive pipeline deps
      const nodeByName = new Map<string, any>();
      for (const n of globalNodes) {
        for (const nm of (n.allNames || [n.name])) {
          if (nm) nodeByName.set(nm.toLowerCase().trim(), n);
        }
      }
      let frontier = [...requiredNames];
      while (frontier.length > 0) {
        const nextFrontier: string[] = [];
        for (const name of frontier) {
          const node = nodeByName.get(name);
          if (!node) continue;
          for (const dep of (node.pipelineDependencies || [])) {
            const depName = (dep.tableName || dep.name || '').toLowerCase().trim();
            if (depName && !requiredNames.has(depName)) {
              requiredNames.add(depName);
              nextFrontier.push(depName);
            }
          }
        }
        frontier = nextFrontier;
      }
      const contextTables = globalNodes.filter(n => {
        const names = (n.allNames || [n.name]).map((nm: string) => nm?.toLowerCase().trim());
        return names.some((nm: string) => requiredNames.has(nm));
      });

      const enrichedConfig: ScheduledTaskConfig = {
        ...config,
        pythonCode: targetNode.pythonCode,
        pythonOutputType: targetNode.pythonOutputType || 'table',
        pythonResultName: targetNode.pythonResultName || targetNode.sqlResultName,
        connectorId: targetNode.pythonConnectorId || targetNode.connectorId,
        contextTables,
        selectedPipelines: targetNode.pythonSelectedPipelines || targetNode.selectedPipelines || [],
      };
      return await this.executePythonNode(enrichedConfig);
    }

    if (targetNode.sqlQuery) {
      // It's a SQL node — build SQL_EXECUTE config
      logger.log(`[NodeExecution] Dispatching as SQL_EXECUTE`);

      const globalNodes = this.getAllNodesFromTree(treeJson);
      const ancestorNodes = this.getAncestorsForNode(treeJson, nodeId);
      const requiredNames = new Set<string>();
      for (const node of ancestorNodes) {
        for (const name of (node.allNames || [node.name])) {
          if (name) requiredNames.add(name.toLowerCase().trim());
        }
      }
      const nodeByName = new Map<string, any>();
      for (const n of globalNodes) {
        for (const nm of (n.allNames || [n.name])) {
          if (nm) nodeByName.set(nm.toLowerCase().trim(), n);
        }
      }
      let sqlFrontier = [...requiredNames];
      while (sqlFrontier.length > 0) {
        const nextFrontier: string[] = [];
        for (const name of sqlFrontier) {
          const node = nodeByName.get(name);
          if (!node) continue;
          for (const dep of (node.pipelineDependencies || [])) {
            const depName = (dep.tableName || dep.name || '').toLowerCase().trim();
            if (depName && !requiredNames.has(depName)) {
              requiredNames.add(depName);
              nextFrontier.push(depName);
            }
          }
        }
        sqlFrontier = nextFrontier;
      }
      const contextTables = globalNodes.filter(n => {
        const names = (n.allNames || [n.name]).map((nm: string) => nm?.toLowerCase().trim());
        return names.some((nm: string) => requiredNames.has(nm));
      });

      const enrichedConfig: ScheduledTaskConfig = {
        ...config,
        query: targetNode.sqlQuery,
        sqlResultName: targetNode.sqlResultName,
        connectorIdSql: targetNode.sqlConnectorId || targetNode.connectorId,
        contextTables,
        selectedPipelines: targetNode.selectedPipelines || [],
        sqlExportConfig: targetNode.sqlExportConfig,
      };
      return await this.executeSqlNode(enrichedConfig);
    }

    return { success: false, error: `Node ${nodeId} has no recognizable type (no emailAction, pythonCode, or sqlQuery)` };
  }

  private async executeSqlNode(config: ScheduledTaskConfig): Promise<TaskExecutionResult> {
    // 1. Prepare Inputs
    const {
      query,
      sqlResultName,
      contextTables,
      selectedPipelines, // Names of dependencies
      treeId, nodeId, nodePath,
      sqlExportConfig,
      companyId: sqlCompanyId,
    } = config;

    // Resolve connectorIdSql: use explicit value, or infer from first SQL dependency, or from export config
    let connectorIdSql = config.connectorIdSql;
    if (!connectorIdSql && contextTables && Array.isArray(contextTables)) {
      const firstSqlDep = (contextTables as any[]).find(t => t.connectorId && !t.isPython);
      if (firstSqlDep) {
        connectorIdSql = firstSqlDep.connectorId;
        logger.log(`[SqlNode] Inferred connectorIdSql from dependency "${firstSqlDep.name}": ${connectorIdSql}`);
      }
    }
    if (!connectorIdSql && sqlExportConfig?.targetConnectorId) {
      connectorIdSql = sqlExportConfig.targetConnectorId;
      logger.log(`[SqlNode] Inferred connectorIdSql from export config: ${connectorIdSql}`);
    }

    if (!query || !connectorIdSql) return { success: false, error: "Missing Query or Connector" };

    // 2. Build Dependencies & Execute Ancestors
    const allContext = (contextTables as any[]) || [];

    // EXECUTE ANCESTORS (Full Pipeline Refresh)
    // Execute all context tables to ensure they are up to date and exported if needed
    logger.log(`[SqlNode] Starting ancestor chain execution.`);
    const { results: ancestorResults } = await this.executeAncestorChain(allContext, undefined, true, treeId, sqlCompanyId);

    // Build data-only dependencies from ancestor results (NOT original query definitions).
    // Passing original deps with query/pipelineDependencies would cause executeSqlPreviewAction
    // to re-execute them recursively, which fails because temp tables from the ancestor chain
    // connection no longer exist. Instead, pass pre-calculated data so it just creates temp tables.
    const dependencies: any[] = ((selectedPipelines as string[]) || []).map(name => {
      const val = ancestorResults[name];
      const dataArr = Array.isArray(val) ? val :
        (val && typeof val === 'object' && 'data' in val && Array.isArray(val.data)) ? val.data : [];
      return { tableName: name, data: dataArr };
    }).filter(d => d.data);

    logger.log(`[SqlNode] Built ${dependencies.length} data-only deps from ancestor results: ${dependencies.map(d => `${d.tableName}(${d.data.length} rows)`).join(', ')}`);

    // 3. Execute Query with pre-calculated data deps
    const result = await executeSqlPreview(query, connectorIdSql, dependencies, sqlCompanyId);
    if (result.error) throw new Error(result.error);

    const data = result.data; // Array of rows

    // 4. Save SQL Preview to NodePreviewCache (avoids OOM from tree JSON load/stringify)
    if (treeId && nodeId && sqlResultName) {
      try {
        const existingCacheEntry = await db.nodePreviewCache.findUnique({
          where: { treeId_nodeId: { treeId, nodeId } },
        });
        const existingCacheData = (existingCacheEntry?.data as any) || {};
        const cacheData = {
          ...existingCacheData,
          sqlPreviewData: data,
          sqlPreviewTimestamp: Date.now(),
        };
        const { saveNodePreview } = await import('@/lib/preview-cache');
        await saveNodePreview(treeId, nodeId, cacheData);
        const { invalidateServerTreeCache } = await import('@/lib/server-cache');
        invalidateServerTreeCache(treeId);
      } catch (saveErr: any) {
        logger.error(`[SqlNode] Failed to save SQL preview to cache: ${saveErr.message}`);
      }
    }

    // 5. Export if configured
    if (sqlExportConfig && sqlExportConfig.targetConnectorId && sqlExportConfig.targetTableName) {
      // Perform Export — must pass isSystem=true so it skips getServerSession/headers()
      // which would fail outside a Next.js request context (scheduler background)
      const exportRes = await exportTableToSql(
        sqlExportConfig.targetConnectorId,
        sqlExportConfig.targetTableName,
        data as any[],
        true,  // createTableIfNotExists
        true,  // truncate
      );
      if (!exportRes.success) throw new Error(`Export failed: ${exportRes.error}`);
      return { success: true, message: `Executed & Exported to ${sqlExportConfig.targetTableName}` };
    }

    return { success: true, message: `Executed. returned ${data?.length || 0} rows.` };
  }

  private async executePythonNode(config: ScheduledTaskConfig): Promise<TaskExecutionResult> {
    const {
      pythonCode,
      pythonOutputType, // table, chart, etc
      pythonResultName,
      pythonConnectorId,
      contextTables,
      pythonSelectedPipelines,
      selectedDocuments,
      treeId, nodeId, nodePath,
      sqlExportConfig,
      companyId,
    } = config;

    if (!pythonCode) return { success: false, error: "Missing Python Code" };

    // 1. Execute Ancestors & Build Dependencies from results
    const allContext = (contextTables as any[]) || [];

    // EXECUTE ANCESTORS (Full Pipeline Refresh)
    logger.log(`[PythonNode] Starting ancestor chain execution.`);
    const { results: ancestorResults } = await this.executeAncestorChain(allContext, undefined, true, treeId, companyId);

    // Build inputData from ancestor results (NOT re-executing queries).
    // Passing original deps with query/pythonCode would cause executePythonPreviewAction
    // to re-execute them recursively, which fails for the same reason as SQL nodes.
    const inputData: Record<string, any[]> = {};
    for (const [key, val] of Object.entries(ancestorResults)) {
      const dataArr = Array.isArray(val) ? val :
        (val && typeof val === 'object' && 'data' in val && Array.isArray((val as any).data)) ? (val as any).data : null;
      if (dataArr) {
        inputData[key] = dataArr;
      }
    }

    logger.log(`[PythonNode] Built inputData from ancestor results: ${Object.entries(inputData).map(([k, v]) => `${k}(${v.length} rows)`).join(', ')}`);

    // 2. Execute Python with pre-calculated data (no recursive deps)
    const runType = pythonOutputType || 'table';

    // Resolve connectorId: prefer node's own, then fall back to ANY connector
    // referenced by an ancestor table. Required for query_db() injection.
    let resolvedCid: string = pythonConnectorId || '';
    if (!resolvedCid && Array.isArray(allContext)) {
      for (const ctx of allContext) {
        const cid = ctx?.pythonConnectorId || ctx?.connectorId || ctx?.sqlConnectorId;
        if (cid) { resolvedCid = cid; break; }
      }
    }

    const result = await executePythonPreview(
      pythonCode,
      runType,
      inputData, // Pre-calculated data from ancestor chain
      [], // No recursive deps needed — data already in inputData
      resolvedCid || pythonConnectorId,
      selectedDocuments?.length > 0 ? selectedDocuments : undefined,
      undefined, // dfTarget
      companyId, // pass companyId for SharePoint token resolution
    );

    if (!result.success) throw new Error(result.error);

    // 3. Save Preview to NodePreviewCache (preserve existing style overrides)
    if (treeId && nodeId) {
      try {
        // Load existing cache entry (lightweight, no tree JSON load)
        const existingCacheEntry = await db.nodePreviewCache.findUnique({
          where: { treeId_nodeId: { treeId, nodeId } },
        });
        const existingCacheData = (existingCacheEntry?.data as any) || {};
        const existingPreview = existingCacheData.pythonPreviewResult;

        const preservedFields = {
          ...(existingPreview?.plotlyStyleOverrides ? { plotlyStyleOverrides: existingPreview.plotlyStyleOverrides } : {}),
          ...(existingPreview?.plotlyJson && !result.plotlyJson ? { plotlyJson: existingPreview.plotlyJson } : {}),
          ...(existingPreview?.htmlStyleOverrides ? { htmlStyleOverrides: existingPreview.htmlStyleOverrides } : {}),
        };

        let pythonPreviewResult: any;
        if (runType === 'table') {
          pythonPreviewResult = { type: 'table', data: result.data, timestamp: Date.now(), ...preservedFields };
        } else if (runType === 'chart') {
          pythonPreviewResult = {
            type: 'chart',
            chartBase64: result.chartBase64,
            chartHtml: result.chartHtml,
            rechartsConfig: (result as any).rechartsConfig,
            rechartsData: (result as any).rechartsData,
            rechartsStyle: (result as any).rechartsStyle,
            plotlyJson: result.plotlyJson,
            widgetConfig: (result as any).widgetConfig,
            timestamp: Date.now(),
            ...preservedFields,
          };
        } else if (runType === 'html') {
          pythonPreviewResult = {
            type: 'html',
            html: (result as any).html,
            data: result.data,
            timestamp: Date.now(),
            ...preservedFields,
          };
        } else {
          pythonPreviewResult = { type: 'variable', variables: result.variables, timestamp: Date.now(), ...preservedFields };
        }

        const cacheData = { ...existingCacheData, pythonPreviewResult };

        const { saveNodePreview } = await import('@/lib/preview-cache');
        await saveNodePreview(treeId, nodeId, cacheData);

        const { invalidateServerTreeCache } = await import('@/lib/server-cache');
        invalidateServerTreeCache(treeId);
      } catch (saveErr: any) {
        logger.error(`[PythonPreview] Failed to save to cache: ${saveErr.message}`);
      }
    }

    // 4. Export if configured (only if table data available)
    if (sqlExportConfig && sqlExportConfig.targetConnectorId && sqlExportConfig.targetTableName) {
      const dataToExport = result.data;
      if (!Array.isArray(dataToExport) || dataToExport.length === 0) {
        return { success: true, message: "Executed, but no data to export." };
      }

      const exportRes = await exportTableToSql(
        sqlExportConfig.targetConnectorId,
        sqlExportConfig.targetTableName,
        dataToExport,
        true,  // createTableIfNotExists
        true,  // truncate
      );
      if (!exportRes.success) throw new Error(`Export failed: ${exportRes.error}`);
      return { success: true, message: `Executed & Exported to ${sqlExportConfig.targetTableName}` };
    }

    return { success: true, message: "Python executed successfully" };
  }

  private async saveNodePreviewData(treeId: string, nodePath: string, updateData: any) {
    // We need to:
    // 1. Fetch tree
    // 2. Parse JSON
    // 3. Update node at path
    // 4. Save
    // This is racy if users are editing. But for background tasks it's acceptable.

    const tree = await db.tree.findUnique({ where: { id: treeId } });
    if (!tree || !tree.jsonDecisionTree) return;

    let json = JSON.parse(tree.jsonDecisionTree);

    // NodePath string like "root.children.uuid..."
    // Lodash set
    // We need to merge, not overwrite entire node, to keep other props
    const path = nodePath.replace(/^root\.?/, '');

    if (!path) {
      // Root update
      json = { ...json, ...updateData };
    } else {
      const existing = get(json, path);
      if (existing) {
        set(json, path, { ...existing, ...updateData });
      }
    }

    await db.tree.update({
      where: { id: treeId },
      data: { jsonDecisionTree: JSON.stringify(json) } // format?
    });
  }

  // --- Public Management Methods ---
  public async rescheduleTask(taskId: string) {
    // Remove existing
    const existing = this.tasks.get(taskId);
    if (existing) {
      existing.stop();
      this.tasks.delete(taskId);
    }

    // Load and schedule
    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (task && task.status === 'active') {
      await this.scheduleTask(task);
    }
  }

  public async deleteTask(taskId: string) {
    const existing = this.tasks.get(taskId);
    if (existing) {
      existing.stop();
      this.tasks.delete(taskId);
    }
  }
}

export const schedulerService = SchedulerService.getInstance();

export function calculateNextRunForTask(task: any, timezone: string, referenceDate?: Date): Date | null {
  try {
    const now = referenceDate
      ? DateTime.fromJSDate(referenceDate).setZone(timezone || 'Europe/Rome')
      : DateTime.now().setZone(timezone || 'Europe/Rome');
    let nextRun: DateTime | null = null;

    const config = typeof task.config === 'string' ? JSON.parse(task.config) : task.config;
    const customTimes = config?.customTimes as string[] | undefined;

    // 1. Custom Times (HH:mm)
    if (customTimes && Array.isArray(customTimes) && customTimes.length > 0) {
      let candidates: DateTime[] = [];
      for (const timeStr of customTimes) {
        const [h, m] = timeStr.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) continue;

        // Candidate for today
        // We use set() but we need to ensure we don't accidentally shift days if timezone offset changes roughly at midnight etc.
        // But Luxon handles setZone correctly.
        let candidate = now.set({ hour: h, minute: m, second: 0, millisecond: 0 });

        // If the candidate time is in the past for today, try tomorrow
        if (candidate <= now) {
          candidate = candidate.plus({ days: 1 });
        }
        candidates.push(candidate);
      }

      // If daysOfWeek applied to custom times (from scheduler logic):
      const daysOfWeek = task.daysOfWeek; // e.g. "1,3,5" or "*"
      if (daysOfWeek && daysOfWeek !== '*') {
        const allowedDays = daysOfWeek.split(',').map(Number);
        candidates = [];

        // Look ahead 14 days to be safe
        for (let d = 0; d < 14; d++) {
          const refDate = now.plus({ days: d });

          // Luxon weekday: 1=Mon...7=Sun.
          // Cron: 0=Sun...6=Sat.
          // Mapping:
          const cronDay = refDate.weekday % 7;

          if (!allowedDays.includes(cronDay)) continue;

          for (const timeStr of customTimes) {
            const [h, m] = timeStr.split(':').map(Number);
            const candidate = refDate.set({ hour: h, minute: m, second: 0, millisecond: 0 });

            if (candidate > now) {
              candidates.push(candidate);
            }
          }
          if (candidates.length > 0) break;
        }
      }

      if (candidates.length > 0) {
        // Sort and take first
        nextRun = candidates.sort((a, b) => a.toMillis() - b.toMillis())[0];
      }
    }
    // 2. Interval
    else if (task.scheduleType === 'interval' && task.intervalMinutes) {
      const lastRunStr = task.lastRunAt;
      const lastRun = lastRunStr ? DateTime.fromJSDate(new Date(lastRunStr)).setZone(timezone) : now;

      // If we never ran, next run is in X minutes from now? 
      // Or if it's new task, run immediately?
      // "lastRun" being 'now' if undefined means we simulate it just ran?
      // Logic: nextRun = lastRun + interval.

      nextRun = lastRun.plus({ minutes: task.intervalMinutes });

      if (nextRun <= now) {
        // Catch up
        const diff = now.diff(lastRun, 'minutes').minutes;
        // If diff is huge, we don't want to run 1000 times. We want next sync point.
        const intervalsToAdd = Math.ceil(diff / task.intervalMinutes);
        // If intervalsToAdd * interval == diff, then nextRun would be == now. 
        // We probably want strictly > now for next run?
        // Let's add 1 more if it lands exactly on now?
        // Actually typical scheduler: run if scheduled time <= now.
        // But here we return the DATE of execution.

        let multiplier = intervalsToAdd;
        // Ensure we are in future?
        if (lastRun.plus({ minutes: multiplier * task.intervalMinutes }) <= now) {
          multiplier++;
        }

        nextRun = lastRun.plus({ minutes: multiplier * task.intervalMinutes });
      }
    }
    // 3. Specific Days/Hours
    else if (task.scheduleType === 'specific') {
      // Hours: "9,14"
      // Days: "1,3,5" (Cron 0-6)
      const hours = (task.hours || '0').split(',').map(Number);
      const days = (task.daysOfWeek || '*').split(',').map(Number); // if * handled separately

      const isDaily = task.daysOfWeek === '*' || !task.daysOfWeek;

      const candidates: DateTime[] = [];
      // Look ahead 14 days
      for (let d = 0; d < 14; d++) {
        const refDate = now.plus({ days: d });

        if (!isDaily) {
          const cronDay = refDate.weekday % 7;
          if (!days.includes(cronDay)) continue;
        }

        for (const h of hours) {
          // Minute 0 default
          const candidate = refDate.set({ hour: h, minute: 0, second: 0, millisecond: 0 });
          if (candidate > now) {
            candidates.push(candidate);
          }
        }
        if (candidates.length > 0) break;
      }
      if (candidates.length > 0) {
        nextRun = candidates.sort((a, b) => a.toMillis() - b.toMillis())[0];
      }
    }

    return nextRun ? nextRun.toJSDate() : null;
  } catch (e) {
    console.error('Error calcluating next run', e);
    return null;
  }
}
