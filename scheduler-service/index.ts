/**
 * FridAI Scheduler Service — Entry Point
 *
 * Standalone Node.js process that runs cron/interval tasks in isolation
 * from the Next.js server. Communicates with the main app via HTTP.
 *
 * Start: npx tsx index.ts (or via docker-compose with profile "scheduler")
 */

import 'dotenv/config';
import path from 'path';
import cron from 'node-cron';

// Resolve @/ aliases at runtime for tsx (matches tsconfig paths)
// tsx handles tsconfig paths automatically when running from the scheduler-service dir
process.chdir(__dirname);

import { SchedulerService } from '../src/lib/scheduler/scheduler-service';
import { startServer } from './server';

const PORT = parseInt(process.env.SCHEDULER_PORT || '3001', 10);

// GDPR Art. 5.1.e — daily retention cleanup. Calls the Next.js endpoint with
// CRON_SECRET so retention logic stays in one place (route already exists).
// NEXT_INTERNAL_URL points at the Next.js service inside the Docker network
// (defaults to http://app:9002).
function startRetentionCron() {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[Scheduler] CRON_SECRET not set — GDPR retention cron disabled.');
    return;
  }
  const targetUrl = (process.env.NEXT_INTERNAL_URL || 'http://app:9002').replace(/\/$/, '')
    + '/api/cron/retention-cleanup';

  cron.schedule('30 3 * * *', async () => {
    const start = Date.now();
    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      const text = await res.text().catch(() => '');
      const ms = Date.now() - start;
      if (res.ok) {
        console.log(`[Scheduler] retention-cleanup OK in ${ms}ms — ${text.slice(0, 200)}`);
      } else {
        console.error(`[Scheduler] retention-cleanup FAILED ${res.status} in ${ms}ms — ${text.slice(0, 200)}`);
      }
    } catch (err: any) {
      console.error('[Scheduler] retention-cleanup network error:', err?.message);
    }
  }, { timezone: 'Europe/Rome' });

  console.log(`[Scheduler] GDPR retention cron registered: 03:30 Europe/Rome → ${targetUrl}`);
}

async function main() {
  console.log('[Scheduler] Starting FridAI Scheduler Service...');
  console.log(`[Scheduler] DATABASE_URL: ${process.env.DATABASE_URL ? '✓ set' : '✗ MISSING'}`);
  console.log(`[Scheduler] PYTHON_BACKEND_URL: ${process.env.PYTHON_BACKEND_URL || 'http://localhost:5005'}`);

  if (!process.env.DATABASE_URL) {
    console.error('[Scheduler] FATAL: DATABASE_URL is not set. Exiting.');
    process.exit(1);
  }

  try {
    const scheduler = SchedulerService.getInstance();
    await scheduler.init();
    console.log('[Scheduler] SchedulerService initialized.');

    startRetentionCron();

    await startServer(scheduler, PORT);
    console.log(`[Scheduler] Management API listening on port ${PORT}`);
  } catch (err) {
    console.error('[Scheduler] Fatal startup error:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Scheduler] SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Scheduler] SIGINT received. Shutting down...');
  process.exit(0);
});

main();
