/**
 * API Route: Scheduled Task Details
 * 
 * Handles operations for individual scheduled tasks:
 * - GET: Get task details
 * - PUT: Update task
 * - DELETE: Delete task
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getSchedulerClient } from '@/lib/scheduler/scheduler-client';
import { z } from 'zod';

// ============================================
// Validation Schemas
// ============================================

const updateTaskSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  config: z.object({
    connectorId: z.string().optional(),
    to: z.string().optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    query: z.string().optional(),
    connectorIdSql: z.string().optional(),
    sourceConnectorId: z.string().optional(),
    targetConnectorId: z.string().optional(),
    syncQuery: z.string().optional(),
    customAction: z.string().optional(),
    customParams: z.record(z.any()).optional(),
  }).optional(),
  scheduleType: z.enum(['cron', 'interval', 'specific']).optional(),
  cronExpression: z.string().optional(),
  intervalMinutes: z.number().int().positive().optional(),
  daysOfWeek: z.string().optional(),
  hours: z.string().optional(),
  timezone: z.string().optional(),
  status: z.enum(['active', 'paused', 'disabled']).optional(),
  maxRetries: z.number().int().min(0).optional(),
  retryDelayMinutes: z.number().int().positive().optional(),
});

// ============================================
// GET: Get task details
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

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const includeExecutions = searchParams.get('includeExecutions') === 'true';
    const executionLimit = parseInt(searchParams.get('executionLimit') || '20');

    // Fetch task
    const task = await db.scheduledTask.findFirst({
      where: {
        id: id,
        companyId: user.companyId
      },
      include: {
        executions: includeExecutions ? {
          orderBy: { startedAt: 'desc' },
          take: executionLimit
        } : false,
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error: any) {
    console.error('[API] Error fetching scheduled task:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduled task', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================
// PUT: Update task
// ============================================

export async function PUT(
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
    const existingTask = await db.scheduledTask.findFirst({
      where: {
        id: id,
        companyId: user.companyId
      }
    });

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = updateTaskSchema.parse(body);

    // Validate schedule configuration if provided
    if (validatedData.scheduleType === 'cron' && !validatedData.cronExpression) {
      return NextResponse.json(
        { error: 'Cron expression is required for cron schedule type' },
        { status: 400 }
      );
    }

    if (validatedData.scheduleType === 'interval' && !validatedData.intervalMinutes) {
      return NextResponse.json(
        { error: 'Interval minutes is required for interval schedule type' },
        { status: 400 }
      );
    }

    // SECURITY: any connectorId referenced in `config` MUST belong to caller's company.
    // Prevents a user from pointing their own task at another tenant's connector.
    if (validatedData.config) {
      const connectorIds = [
        validatedData.config.connectorId,
        validatedData.config.connectorIdSql,
        validatedData.config.sourceConnectorId,
        validatedData.config.targetConnectorId,
      ].filter((x): x is string => typeof x === 'string' && x.length > 0);

      if (connectorIds.length > 0) {
        const owned = await db.connector.findMany({
          where: { id: { in: connectorIds }, companyId: user.companyId },
          select: { id: true },
        });
        const ownedSet = new Set(owned.map((c: any) => c.id));
        const foreign = connectorIds.filter(id => !ownedSet.has(id));
        if (foreign.length > 0) {
          console.warn(`[scheduler/tasks] connectorId cross-tenant attempt by user=${user.id}: ${foreign.join(',')}`);
          return NextResponse.json(
            { error: 'Connector non autorizzato per questo tenant' },
            { status: 403 }
          );
        }
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.description !== undefined) updateData.description = validatedData.description;
    if (validatedData.config !== undefined) updateData.config = validatedData.config as any;
    if (validatedData.scheduleType !== undefined) updateData.scheduleType = validatedData.scheduleType;
    if (validatedData.cronExpression !== undefined) updateData.cronExpression = validatedData.cronExpression;
    if (validatedData.intervalMinutes !== undefined) updateData.intervalMinutes = validatedData.intervalMinutes;
    if (validatedData.daysOfWeek !== undefined) updateData.daysOfWeek = validatedData.daysOfWeek;
    if (validatedData.hours !== undefined) updateData.hours = validatedData.hours;
    if (validatedData.timezone !== undefined) updateData.timezone = validatedData.timezone;
    if (validatedData.status !== undefined) updateData.status = validatedData.status;
    if (validatedData.maxRetries !== undefined) updateData.maxRetries = validatedData.maxRetries;
    if (validatedData.retryDelayMinutes !== undefined) updateData.retryDelayMinutes = validatedData.retryDelayMinutes;

    // Update task
    const task = await db.scheduledTask.update({
      where: { id: id },
      data: updateData
    });

    // Reschedule task if schedule changed
    if (validatedData.scheduleType || validatedData.cronExpression ||
      validatedData.intervalMinutes || validatedData.daysOfWeek ||
      validatedData.hours || validatedData.timezone) {
      await getSchedulerClient().rescheduleTask(task.id);
    }

    return NextResponse.json({ task });
  } catch (error: any) {
    console.error('[API] Error updating scheduled task:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update scheduled task', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE: Delete task
// ============================================

export async function DELETE(
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
    const existingTask = await db.scheduledTask.findFirst({
      where: {
        id: id,
        companyId: user.companyId
      }
    });

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Delete task (executions will be cascade deleted)
    await db.scheduledTask.delete({
      where: { id: id }
    });

    return NextResponse.json({ message: 'Task deleted successfully' });
  } catch (error: any) {
    console.error('[API] Error deleting scheduled task:', error);
    return NextResponse.json(
      { error: 'Failed to delete scheduled task', details: error.message },
      { status: 500 }
    );
  }
}
