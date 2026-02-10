/**
 * API Route: Scheduled Task Executions
 * 
 * Handles fetching execution history for a task:
 * - GET: List executions for a task
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

// ============================================
// GET: List executions
// ============================================

export async function GET(
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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = { taskId: id };
    if (status) where.status = status;

    // Fetch executions with pagination
    const [executions, total] = await Promise.all([
      db.scheduledTaskExecution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit
      }),
      db.scheduledTaskExecution.count({ where })
    ]);

    return NextResponse.json({
      executions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('[API] Error fetching executions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch executions', details: error.message },
      { status: 500 }
    );
  }
}
