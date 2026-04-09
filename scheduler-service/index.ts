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

// Resolve @/ aliases at runtime for tsx (matches tsconfig paths)
// tsx handles tsconfig paths automatically when running from the scheduler-service dir
process.chdir(__dirname);

import { SchedulerService } from '../src/lib/scheduler/scheduler-service';
import { startServer } from './server';

const PORT = parseInt(process.env.SCHEDULER_PORT || '3001', 10);

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
