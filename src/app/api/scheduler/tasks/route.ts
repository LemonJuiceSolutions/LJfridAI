/**
 * API Route: Scheduled Tasks
 * 
 * Handles CRUD operations for scheduled tasks:
 * - GET: List all scheduled tasks for a company
 * - POST: Create a new scheduled task
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { schedulerService } from '@/lib/scheduler/scheduler-service';
import { z } from 'zod';

// ============================================
// Validation Schemas
// ============================================

const createTaskSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  type: z.enum(['EMAIL_PREVIEW', 'EMAIL_SEND', 'SQL_PREVIEW', 'SQL_EXECUTE', 'DATA_SYNC', 'CUSTOM']),
  config: z.object({
    // Email config
    connectorId: z.string().optional(),
    to: z.string().optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    // SQL config
    query: z.string().optional(),
    connectorIdSql: z.string().optional(),
    // Data sync config
    sourceConnectorId: z.string().optional(),
    targetConnectorId: z.string().optional(),
    syncQuery: z.string().optional(),
    // Custom config
    customAction: z.string().optional(),
    customParams: z.record(z.any()).optional(),
  }),
  scheduleType: z.enum(['cron', 'interval', 'specific']),
  cronExpression: z.string().optional(),
  intervalMinutes: z.number().int().positive().optional(),
  daysOfWeek: z.string().optional(), // Comma-separated: "0,1,2,3,4,5,6"
  hours: z.string().optional(), // Comma-separated: "0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23"
  timezone: z.string().default('Europe/Rome'),
  maxRetries: z.number().int().min(0).default(3),
  retryDelayMinutes: z.number().int().positive().default(5),
});

// ============================================
// GET: List scheduled tasks
// ============================================

export async function GET(request: NextRequest) {
  try {
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
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const includeExecutions = searchParams.get('includeExecutions') === 'true';

    // Build where clause
    const where: any = { companyId: user.companyId };
    if (status) where.status = status;
    if (type) where.type = type;

    // Fetch tasks
    const tasks = await db.scheduledTask.findMany({
      where,
      include: {
        executions: includeExecutions ? {
          orderBy: { startedAt: 'desc' },
          take: 10
        } : false,
        creator: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Enrich with tree names
    const treeIds = [...new Set(
      tasks.map(t => (t.config as any)?.treeId).filter(Boolean)
    )] as string[];

    let treeNameMap: Record<string, string> = {};
    if (treeIds.length > 0) {
      const trees = await db.tree.findMany({
        where: { id: { in: treeIds } },
        select: { id: true, name: true }
      });
      treeNameMap = Object.fromEntries(trees.map(t => [t.id, t.name]));
    }

    const enrichedTasks = tasks.map(t => {
      const treeId = (t.config as any)?.treeId;
      return { ...t, treeName: treeId ? treeNameMap[treeId] || null : null };
    });

    return NextResponse.json({ tasks: enrichedTasks });
  } catch (error: any) {
    console.error('[API] Error fetching scheduled tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scheduled tasks', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================
// POST: Create scheduled task
// ============================================

export async function POST(request: NextRequest) {
  try {
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

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createTaskSchema.parse(body);

    // Validate schedule configuration
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

    if (validatedData.scheduleType === 'specific' && !validatedData.daysOfWeek && !validatedData.hours) {
      return NextResponse.json(
        { error: 'At least days of week or hours must be specified for specific schedule type' },
        { status: 400 }
      );
    }

    // Create task
    const task = await db.scheduledTask.create({
      data: {
        name: validatedData.name,
        description: validatedData.description,
        type: validatedData.type,
        config: validatedData.config as any,
        scheduleType: validatedData.scheduleType,
        cronExpression: validatedData.cronExpression,
        intervalMinutes: validatedData.intervalMinutes,
        daysOfWeek: validatedData.daysOfWeek,
        hours: validatedData.hours,
        timezone: validatedData.timezone,
        maxRetries: validatedData.maxRetries,
        retryDelayMinutes: validatedData.retryDelayMinutes,
        status: 'active',
        companyId: user.companyId,
        createdBy: user.id
      }
    });

    // Schedule the task
    await schedulerService.rescheduleTask(task.id);

    return NextResponse.json({ task }, { status: 201 });
  } catch (error: any) {
    console.error('[API] Error creating scheduled task:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create scheduled task', details: error.message },
      { status: 500 }
    );
  }
}
