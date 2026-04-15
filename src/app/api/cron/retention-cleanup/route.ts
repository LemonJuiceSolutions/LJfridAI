import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const RETENTION_DAYS = 730; // 2 years

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET environment variable is not configured' },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get('CRON_SECRET') ?? req.headers.get('authorization');
  if (authHeader !== cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const retentionDate = new Date();
  retentionDate.setDate(retentionDate.getDate() - RETENTION_DAYS);

  try {
    const [executions, triggerLogs, agentConversations] = await Promise.all([
      db.scheduledTaskExecution.deleteMany({
        where: { startedAt: { lt: retentionDate } },
      }),
      db.triggerLog.deleteMany({
        where: { createdAt: { lt: retentionDate } },
      }),
      db.agentConversation.deleteMany({
        where: { updatedAt: { lt: retentionDate } },
      }),
    ]);

    const result = {
      retentionDays: RETENTION_DAYS,
      cutoffDate: retentionDate.toISOString(),
      deleted: {
        scheduledTaskExecutions: executions.count,
        triggerLogs: triggerLogs.count,
        agentConversations: agentConversations.count,
      },
    };

    console.log('[retention-cleanup] Cleanup completed:', result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[retention-cleanup] Cleanup failed:', error);
    return NextResponse.json(
      { error: 'Cleanup failed', details: String(error) },
      { status: 500 }
    );
  }
}
