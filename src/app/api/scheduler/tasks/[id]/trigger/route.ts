/**
 * API Route: Trigger Scheduled Task
 * 
 * Handles manual triggering of scheduled tasks:
 * - POST: Trigger task execution immediately
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { schedulerService } from '@/lib/scheduler/scheduler-service';

// ============================================
// POST: Trigger task execution
// ============================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user with company
    const user = await db.user.findUnique({
      where: { email: session.user.email },
      include: { company: true }
    });

    if (!user?.companyId) {
      return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
    }

    // Check if task exists and belongs to user's company
    const task = await db.scheduledTask.findFirst({
      where: {
        id: id,
        companyId: user.companyId
      }
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Fire-and-forget: trigger in background, respond immediately
    schedulerService.triggerTask(task.id).catch((err) => {
      console.error(`[Scheduler] Background triggerTask error for ${task.id}:`, err);
    });

    return NextResponse.json(
      { accepted: true, taskId: task.id, taskName: task.name },
      { status: 202 },
    );
  } catch (error: any) {
    console.error('[API] Error triggering scheduled task:', error);
    return NextResponse.json(
      { error: 'Failed to trigger scheduled task', details: error.message },
      { status: 500 }
    );
  }
}
