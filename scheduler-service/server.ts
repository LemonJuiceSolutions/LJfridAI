/**
 * FridAI Scheduler Service — Express HTTP Management API
 *
 * Exposes an internal HTTP API so Next.js can command the scheduler:
 *   - POST /reload              → reload all tasks from DB
 *   - POST /reschedule/:id      → re-register a task's cron/interval
 *   - POST /trigger/:id         → fire-and-forget manual execution
 *   - DELETE /task/:id          → remove a task from runtime
 *   - GET  /missed-tasks        → get missed task slots for a company
 *   - POST /missed-tasks        → process (execute/skip) missed tasks
 *   - GET  /recovery-status     → whether auto-recovery is done
 *   - GET  /health              → liveness probe
 *
 * All endpoints require the X-Scheduler-Secret header matching
 * the SCHEDULER_INTERNAL_SECRET env var (shared with Next.js).
 */

import express, { Request, Response, NextFunction } from 'express';
import { SchedulerService } from '../src/lib/scheduler/scheduler-service';

// SECURITY: fail-closed on missing secret in production. In dev, allow a
// deterministic dev-only value (never accept the literal placeholder silently).
const INTERNAL_SECRET = (() => {
  const env = process.env.SCHEDULER_INTERNAL_SECRET;
  if (env && env !== 'change-me-in-production') return env;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SCHEDULER_INTERNAL_SECRET must be set in production');
  }
  console.warn('[scheduler] SCHEDULER_INTERNAL_SECRET not set — using dev-only fallback. DO NOT deploy like this.');
  return 'dev-only-change-me-' + Math.random().toString(36).slice(2, 10);
})();

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Health endpoint is public — no auth needed
  if (req.path === '/health') return next();

  const secret = req.headers['x-scheduler-secret'];
  if (!secret || secret !== INTERNAL_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

export async function startServer(scheduler: SchedulerService, port: number): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(authMiddleware);

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'fridai-scheduler',
      autoRecoveryDone: scheduler.autoRecoveryDone,
      uptime: process.uptime(),
    });
  });

  // ── Recovery status ─────────────────────────────────────────────────────────
  app.get('/recovery-status', (_req, res) => {
    res.json({ done: scheduler.autoRecoveryDone });
  });

  // ── Reload all tasks from DB ─────────────────────────────────────────────────
  app.post('/reload', async (_req, res) => {
    try {
      await scheduler.reload();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Reschedule a specific task ───────────────────────────────────────────────
  app.post('/reschedule/:id', async (req, res) => {
    try {
      await scheduler.rescheduleTask(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Manual trigger (fire-and-forget) ────────────────────────────────────────
  app.post('/trigger/:id', (req, res) => {
    scheduler.triggerTask(req.params.id).catch(err => {
      console.error(`[Server] Background trigger error for ${req.params.id}:`, err);
    });
    res.status(202).json({ accepted: true });
  });

  // ── Synchronous execute (awaits completion, returns result) ─────────────────
  // Used by /api/scheduler/run-all so the main Next.js process can orchestrate
  // 16 tasks sequentially WITHOUT holding CPU on the app event loop.
  app.post('/execute/:id', async (req, res) => {
    try {
      const maxRetriesOverride = req.body?.maxRetriesOverride;
      const result = await scheduler.executeTask(req.params.id,
        typeof maxRetriesOverride === 'number' ? { maxRetriesOverride } : undefined
      );
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Delete a task from runtime ───────────────────────────────────────────────
  app.delete('/task/:id', async (req, res) => {
    try {
      await scheduler.deleteTask(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Get missed tasks ─────────────────────────────────────────────────────────
  app.get('/missed-tasks', async (req, res) => {
    try {
      // Wait for auto-recovery to finish (avoids surfacing tasks prematurely)
      await scheduler.waitForAutoRecovery();
      const companyId = req.query.companyId as string | undefined;
      const missed = await scheduler.getMissedTasks(companyId);
      res.json({ recovering: false, missedTasks: missed });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Process missed tasks (execute/skip) ─────────────────────────────────────
  app.post('/missed-tasks', async (req, res) => {
    try {
      const { executeIds = [], skipIds = [], executeAll = false, missedCounts } = req.body;
      const countsMap = missedCounts ? new Map<string, number>(Object.entries(missedCounts)) : undefined;
      const results = await scheduler.processMissedTasks(executeIds, skipIds, executeAll, countsMap);
      res.json({ success: true, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => resolve());
    server.on('error', reject);
  });
}
