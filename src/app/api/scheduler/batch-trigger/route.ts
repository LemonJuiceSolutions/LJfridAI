/**
 * TEMPORARY: Batch trigger all scheduled tasks sequentially.
 * Auth via X-Scheduler-Secret header (no session needed).
 * Uses the in-process SchedulerService directly (bypasses RemoteSchedulerClient).
 * DELETE THIS FILE after testing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { schedulerService } from '@/lib/scheduler/scheduler-service';

export const maxDuration = 600; // 10 min

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-scheduler-secret');
  if (secret !== (process.env.SCHEDULER_SERVICE_SECRET || 'change-me-in-production')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tasks = await db.scheduledTask.findMany({
    where: { status: 'active' },
    orderBy: { name: 'asc' },
  });

  const results: Array<{ name: string; type: string; dur: number; ok: boolean; err?: string }> = [];

  for (const task of tasks) {
    const start = Date.now();
    try {
      // Fire-and-forget trigger via in-process service
      schedulerService.triggerTask(task.id).catch(() => {});

      // Poll for completion
      let done = false;
      while (!done) {
        await new Promise(r => setTimeout(r, 3000));
        const updated = await db.scheduledTask.findUnique({
          where: { id: task.id },
          select: { lastRunAt: true, lastError: true },
        });
        if (updated?.lastRunAt && updated.lastRunAt.getTime() > start) {
          const dur = (Date.now() - start) / 1000;
          results.push({ name: task.name, type: task.type, dur, ok: !updated.lastError, err: updated.lastError || undefined });
          done = true;
        }
        if (Date.now() - start > 600_000) {
          results.push({ name: task.name, type: task.type, dur: 600, ok: false, err: 'TIMEOUT' });
          done = true;
        }
      }
    } catch (e: any) {
      results.push({ name: task.name, type: task.type, dur: (Date.now() - start) / 1000, ok: false, err: e.message });
    }
  }

  const totalTime = results.reduce((s, r) => s + r.dur, 0);
  return NextResponse.json({ results, totalTime, count: results.length });
}
