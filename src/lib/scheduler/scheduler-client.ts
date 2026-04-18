/**
 * Scheduler Client — abstraction layer for Next.js API routes.
 *
 * Returns either:
 *  - LocalSchedulerClient  → wraps the in-process SchedulerService singleton
 *                            (used when SCHEDULER_SERVICE_URL is NOT set)
 *  - RemoteSchedulerClient → makes HTTP calls to the standalone scheduler-service
 *                            (used when SCHEDULER_SERVICE_URL is set, e.g. docker-compose)
 *
 * API routes should import getSchedulerClient() and never reference
 * SchedulerService directly, so the switch is transparent.
 */

import type { MissedTaskInfo } from './scheduler-service';

// ─────────────────────────────────────────────────────────────────────────────
// Shared interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ISchedulerClient {
  rescheduleTask(taskId: string): Promise<void>;
  triggerTask(taskId: string): Promise<void>;
  deleteTask(taskId: string): Promise<void>;
  reload(): Promise<void>;
  getMissedTasks(companyId?: string): Promise<{ recovering: boolean; missedTasks: MissedTaskInfo[] }>;
  processMissedTasks(
    executeIds: string[],
    skipIds: string[],
    executeAll?: boolean,
    missedCounts?: Map<string, number>,
  ): Promise<any>;
  waitForAutoRecovery(): Promise<void>;
  readonly autoRecoveryDone: boolean;
  // Synchronous execution that awaits completion — used by run-all so the
  // heavy work runs in the scheduler-service process (when configured),
  // not in the Next.js request handler.
  executeTask(taskId: string, opts?: { maxRetriesOverride?: number }): Promise<any>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Local client — thin wrapper around the in-process singleton
// ─────────────────────────────────────────────────────────────────────────────

class LocalSchedulerClient implements ISchedulerClient {
  private get svc() {
    // Lazy-import to avoid circular deps; singleton is already initialised by
    // instrumentation.node.ts before any API route is called.
    const { schedulerService } = require('./scheduler-service');
    return schedulerService;
  }

  get autoRecoveryDone() { return this.svc.autoRecoveryDone; }

  async rescheduleTask(taskId: string) { await this.svc.rescheduleTask(taskId); }
  async triggerTask(taskId: string) { this.svc.triggerTask(taskId).catch(console.error); }
  async deleteTask(taskId: string) { await this.svc.deleteTask(taskId); }
  async reload() { await this.svc.reload(); }

  async getMissedTasks(companyId?: string) {
    await this.svc.waitForAutoRecovery();
    const missedTasks = await this.svc.getMissedTasks(companyId);
    return { recovering: false, missedTasks };
  }

  async processMissedTasks(executeIds: string[], skipIds: string[], executeAll = false, missedCounts?: Map<string, number>) {
    return this.svc.processMissedTasks(executeIds, skipIds, executeAll, missedCounts);
  }

  async waitForAutoRecovery() { await this.svc.waitForAutoRecovery(); }

  async executeTask(taskId: string, opts?: { maxRetriesOverride?: number }) {
    return this.svc.executeTask(taskId, opts);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Remote client — HTTP calls to the standalone scheduler-service
// ─────────────────────────────────────────────────────────────────────────────

class RemoteSchedulerClient implements ISchedulerClient {
  private baseUrl: string;
  private secret: string;
  private reachable: boolean | null = null;
  private lastReachabilityCheck = 0;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    // Env name was renamed SCHEDULER_SERVICE_SECRET → SCHEDULER_INTERNAL_SECRET
    // to match the standalone service. Fall back to the old name so existing
    // deployments keep working until .env is updated.
    this.secret = process.env.SCHEDULER_INTERNAL_SECRET
      || process.env.SCHEDULER_SERVICE_SECRET
      || '';
  }

  /**
   * Quick health-probe with 1s timeout. Cached for 5s to avoid hammering
   * /health on every call. If the service is unreachable we fall back to
   * the local in-process scheduler instead of surfacing "fetch failed"
   * from dozens of concurrent API handlers.
   */
  private async isReachable(): Promise<boolean> {
    const now = Date.now();
    if (this.reachable !== null && now - this.lastReachabilityCheck < 5_000) {
      return this.reachable;
    }
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      this.reachable = res.ok;
    } catch {
      this.reachable = false;
    }
    this.lastReachabilityCheck = now;
    return this.reachable;
  }

  private async callOrFallback<T>(method: string, path: string, body: any, localFn: () => Promise<T>): Promise<T> {
    if (!(await this.isReachable())) {
      console.warn(`[scheduler-client] Remote ${this.baseUrl} unreachable — falling back to in-process scheduler. Start scheduler-service (port 3001) or unset SCHEDULER_SERVICE_URL to silence.`);
      return localFn();
    }
    try {
      return await this.call(method, path, body) as T;
    } catch (err: any) {
      console.warn(`[scheduler-client] Remote call ${method} ${path} failed: ${err.message} — falling back to local`);
      this.reachable = false; // force recheck next time
      return localFn();
    }
  }

  private async call(method: string, path: string, body?: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Scheduler-Secret': this.secret,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Scheduler remote error ${res.status}: ${err}`);
    }
    return res.json().catch(() => null);
  }

  private local() {
    // Lazy import to keep module graph clean; singleton is already spun up
    // by instrumentation unless SCHEDULER_SERVICE_URL is set, in which case
    // we lazy-init here on fallback.
    const { schedulerService } = require('./scheduler-service');
    return schedulerService;
  }

  get autoRecoveryDone(): boolean {
    // Best-effort synchronous check — use waitForAutoRecovery() for async guarantee
    return false;
  }

  async rescheduleTask(taskId: string) {
    await this.callOrFallback('POST', `/reschedule/${taskId}`, undefined, async () => {
      await this.local().rescheduleTask(taskId); return null;
    });
  }
  async triggerTask(taskId: string) {
    await this.callOrFallback('POST', `/trigger/${taskId}`, undefined, async () => {
      this.local().triggerTask(taskId).catch(console.error); return null;
    });
  }
  async deleteTask(taskId: string) {
    await this.callOrFallback('DELETE', `/task/${taskId}`, undefined, async () => {
      await this.local().deleteTask(taskId); return null;
    });
  }
  async reload() {
    await this.callOrFallback('POST', '/reload', undefined, async () => {
      await this.local().reload(); return null;
    });
  }

  async getMissedTasks(companyId?: string) {
    const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    return this.callOrFallback('GET', `/missed-tasks${qs}`, undefined, async () => {
      await this.local().waitForAutoRecovery();
      return { recovering: false, missedTasks: await this.local().getMissedTasks(companyId) };
    });
  }

  async processMissedTasks(executeIds: string[], skipIds: string[], executeAll = false, missedCounts?: Map<string, number>) {
    const counts = missedCounts ? Object.fromEntries(missedCounts) : undefined;
    return this.callOrFallback('POST', '/missed-tasks', { executeIds, skipIds, executeAll, missedCounts: counts }, async () => {
      return this.local().processMissedTasks(executeIds, skipIds, executeAll, missedCounts);
    });
  }

  async waitForAutoRecovery() {
    if (!(await this.isReachable())) {
      await this.local().waitForAutoRecovery();
      return;
    }
    const maxWaitMs = 15_000;
    const pollMs = 500;
    let waited = 0;
    while (waited < maxWaitMs) {
      try {
        const data = await this.call('GET', '/recovery-status');
        if (data?.done) return;
      } catch { /* scheduler might not be up yet */ }
      await new Promise(r => setTimeout(r, pollMs));
      waited += pollMs;
    }
  }

  async executeTask(taskId: string, opts?: { maxRetriesOverride?: number }) {
    // Synchronous — awaits completion in the scheduler-service process
    // when reachable, otherwise falls back to in-process execution so
    // run-all and retries don't fail with "fetch failed" during dev.
    return this.callOrFallback('POST', `/execute/${taskId}`, opts || {}, async () => {
      return this.local().executeTask(taskId, opts);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory — use this in API routes
// ─────────────────────────────────────────────────────────────────────────────

let _client: ISchedulerClient | null = null;

export function getSchedulerClient(): ISchedulerClient {
  if (_client) return _client;
  const url = process.env.SCHEDULER_SERVICE_URL;
  _client = url ? new RemoteSchedulerClient(url) : new LocalSchedulerClient();
  return _client;
}

// Reset cached client (useful in tests or when env changes)
export function resetSchedulerClient() { _client = null; }
