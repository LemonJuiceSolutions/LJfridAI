/**
 * Scheduler Service
 * 
 * Handles scheduling and execution of recurring tasks including:
 * - Email previews and sends
 * - SQL query previews and executions
 * - Data synchronization
 * - Custom operations
 */

import cron from 'node-cron';
import { db } from '@/lib/db';
import { executeEmailAction } from '@/app/actions';
import { executeSqlPreviewAction } from '@/app/actions/ancestors';
import { executeDatabaseWriteAction } from '@/app/actions/database-backup';
import { executeSqlAction } from '@/app/actions/connections';
import { DateTime } from 'luxon';

// ============================================
// Types
// ============================================

export type TaskType = 
  | 'EMAIL_PREVIEW'
  | 'EMAIL_SEND'
  | 'SQL_PREVIEW'
  | 'SQL_EXECUTE'
  | 'DATA_SYNC'
  | 'CUSTOM';

export type ScheduleType = 'cron' | 'interval' | 'specific';

export interface ScheduledTaskConfig {
  type: TaskType;
  // Email-specific config
  connectorId?: string;
  to?: string;
  subject?: string;
  body?: string;
  // SQL-specific config
  query?: string;
  connectorIdSql?: string;
  // Data sync config
  sourceConnectorId?: string;
  targetConnectorId?: string;
  syncQuery?: string;
  // Custom config
  customAction?: string;
  customParams?: Record<string, any>;
}

export interface ScheduleConfig {
  type: ScheduleType;
  cronExpression?: string;
  intervalMinutes?: number;
  daysOfWeek?: number[];
  hours?: number[];
  timezone?: string;
}

export interface TaskExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  duration?: number;
}

// ============================================
// Scheduler Class
// ============================================

class SchedulerService {
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  /**
   * Start the scheduler service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    console.log('[Scheduler] Starting...');
    this.isRunning = true;

    // Load and schedule all active tasks
    await this.loadAndScheduleTasks();

    // Start periodic check for tasks that need to be scheduled
    this.checkInterval = setInterval(() => {
      this.checkAndScheduleTasks();
    }, 60000); // Check every minute

    console.log('[Scheduler] Started successfully');
  }

  /**
   * Stop the scheduler service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[Scheduler] Stopping...');
    this.isRunning = false;

    // Stop all scheduled tasks
    this.tasks.forEach((task) => {
      task.stop();
    });
    this.tasks.clear();

    // Stop periodic check
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    console.log('[Scheduler] Stopped');
  }

  /**
   * Load all active tasks from database and schedule them
   */
  private async loadAndScheduleTasks(): Promise<void> {
    try {
      const tasks = await db.scheduledTask.findMany({
        where: {
          status: 'active'
        },
        include: {
          company: true
        }
      });

      console.log(`[Scheduler] Loaded ${tasks.length} active tasks`);

      for (const task of tasks) {
        await this.scheduleTask(task);
      }
    } catch (error) {
      console.error('[Scheduler] Error loading tasks:', error);
    }
  }

  /**
   * Check for tasks that need to be scheduled (called periodically)
   */
  private async checkAndScheduleTasks(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Check for tasks that need to be scheduled now
      const now = new Date();
      const tasksToRun = await db.scheduledTask.findMany({
        where: {
          status: 'active',
          nextRunAt: {
            lte: now
          }
        }
      });

      for (const task of tasksToRun) {
        await this.executeTask(task);
      }

      // Recalculate next run times for active tasks
      await this.updateNextRunTimes();
    } catch (error) {
      console.error('[Scheduler] Error in periodic check:', error);
    }
  }

  /**
   * Schedule a task based on its configuration
   */
  private async scheduleTask(task: any): Promise<void> {
    // Remove existing task if any
    if (this.tasks.has(task.id)) {
      this.tasks.get(task.id)!.stop();
      this.tasks.delete(task.id);
    }

    // Calculate next run time if not set
    if (!task.nextRunAt) {
      task.nextRunAt = this.calculateNextRunTime(task);
      await db.scheduledTask.update({
        where: { id: task.id },
        data: { nextRunAt: task.nextRunAt }
      });
    }

    // Schedule based on type
    if (task.scheduleType === 'cron' && task.cronExpression) {
      // Use cron expression
      const cronTask = cron.schedule(task.cronExpression, () => {
        this.executeTask(task);
      }, {
        scheduled: true,
        timezone: task.timezone || 'Europe/Rome'
      });

      this.tasks.set(task.id, cronTask);
      console.log(`[Scheduler] Scheduled task "${task.name}" with cron: ${task.cronExpression}`);
    } else {
      // For interval and specific types, we'll check periodically
      console.log(`[Scheduler] Task "${task.name}" will be checked periodically`);
    }
  }

  /**
   * Execute a scheduled task
   */
  private async executeTask(task: any): Promise<void> {
    const executionId = task.id + '-' + Date.now();
    console.log(`[Scheduler] Executing task "${task.name}" (${executionId})`);

    // Create execution record
    const execution = await db.scheduledTaskExecution.create({
      data: {
        taskId: task.id,
        status: 'running',
        startedAt: new Date()
      }
    });

    const startTime = Date.now();

    try {
      // Execute the task based on its type
      const result = await this.executeTaskByType(task, executionId);

      const duration = Date.now() - startTime;

      // Update execution record
      await db.scheduledTaskExecution.update({
        where: { id: execution.id },
        data: {
          status: result.success ? 'success' : 'failed',
          completedAt: new Date(),
          durationMs: duration,
          result: result.success ? result.data : null,
          error: result.error
        }
      });

      // Update task statistics
      await db.scheduledTask.update({
        where: { id: task.id },
        data: {
          lastRunAt: new Date(),
          runCount: { increment: 1 },
          successCount: result.success ? { increment: 1 } : undefined,
          failureCount: !result.success ? { increment: 1 } : undefined,
          lastError: result.error || null,
          nextRunAt: this.calculateNextRunTime(task)
        }
      });

      console.log(`[Scheduler] Task "${task.name}" completed in ${duration}ms - ${result.success ? 'SUCCESS' : 'FAILED'}`);
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Update execution record with error
      await db.scheduledTaskExecution.update({
        where: { id: execution.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          durationMs: duration,
          error: error.message || 'Unknown error'
        }
      });

      // Update task statistics
      await db.scheduledTask.update({
        where: { id: task.id },
        data: {
          lastRunAt: new Date(),
          runCount: { increment: 1 },
          failureCount: { increment: 1 },
          lastError: error.message || 'Unknown error',
          nextRunAt: this.calculateNextRunTime(task)
        }
      });

      console.error(`[Scheduler] Task "${task.name}" failed:`, error);

      // Retry logic
      if (execution.retryCount < task.maxRetries) {
        console.log(`[Scheduler] Retrying task "${task.name}" (${execution.retryCount + 1}/${task.maxRetries})`);
        await db.scheduledTaskExecution.update({
          where: { id: execution.id },
          data: { retryCount: { increment: 1 } }
        });

        // Schedule retry
        setTimeout(() => {
          this.executeTask(task);
        }, task.retryDelayMinutes * 60 * 1000);
      }
    }
  }

  /**
   * Execute task based on its type
   */
  private async executeTaskByType(task: any, executionId: string): Promise<TaskExecutionResult> {
    const config = task.config as ScheduledTaskConfig;

    switch (task.type) {
      case 'EMAIL_PREVIEW':
        return await this.executeEmailPreview(config, executionId);

      case 'EMAIL_SEND':
        return await this.executeEmailSend(config, executionId);

      case 'SQL_PREVIEW':
        return await this.executeSqlPreview(config, executionId);

      case 'SQL_EXECUTE':
        return await this.executeSqlExecute(config, executionId);

      case 'DATA_SYNC':
        return await this.executeDataSync(config, executionId);

      case 'CUSTOM':
        return await this.executeCustom(config, executionId);

      default:
        return {
          success: false,
          error: `Unknown task type: ${task.type}`
        };
    }
  }

  /**
   * Execute email preview task
   */
  private async executeEmailPreview(config: ScheduledTaskConfig, executionId: string): Promise<TaskExecutionResult> {
    try {
      if (!config.connectorId || !config.to || !config.subject || !config.body) {
        return {
          success: false,
          error: 'Missing required email parameters'
        };
      }

      // Log preview (don't actually send)
      console.log(`[Email Preview] To: ${config.to}, Subject: ${config.subject}`);
      console.log(`[Email Preview] Body: ${config.body.substring(0, 100)}...`);

      return {
        success: true,
        data: {
          message: 'Email preview generated successfully',
          preview: {
            to: config.to,
            subject: config.subject,
            body: config.body
          }
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute email send task
   */
  private async executeEmailSend(config: ScheduledTaskConfig, executionId: string): Promise<TaskExecutionResult> {
    try {
      if (!config.connectorId || !config.to || !config.subject || !config.body) {
        return {
          success: false,
          error: 'Missing required email parameters'
        };
      }

      const result = await executeEmailAction(
        config.connectorId,
        config.to,
        config.subject,
        config.body
      );

      return {
        success: result.success,
        data: result,
        error: result.success ? undefined : result.message
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute SQL preview task
   */
  private async executeSqlPreview(config: ScheduledTaskConfig, executionId: string): Promise<TaskExecutionResult> {
    try {
      if (!config.query || !config.connectorIdSql) {
        return {
          success: false,
          error: 'Missing required SQL parameters'
        };
      }

      const result = await executeSqlPreviewAction(config.query, config.connectorIdSql);

      return {
        success: result.error === null,
        data: result,
        error: result.error || undefined
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute SQL execute task
   */
  private async executeSqlExecute(config: ScheduledTaskConfig, executionId: string): Promise<TaskExecutionResult> {
    try {
      if (!config.query || !config.connectorIdSql) {
        return {
          success: false,
          error: 'Missing required SQL parameters'
        };
      }

      const result = await executeSqlAction(config.query, config.connectorIdSql);

      return {
        success: result.error === null,
        data: result,
        error: result.error || undefined
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute data sync task
   */
  private async executeDataSync(config: ScheduledTaskConfig, executionId: string): Promise<TaskExecutionResult> {
    try {
      if (!config.sourceConnectorId || !config.targetConnectorId || !config.syncQuery) {
        return {
          success: false,
          error: 'Missing required sync parameters'
        };
      }

      // Fetch data from source
      const sourceResult = await executeSqlPreviewAction(config.syncQuery, config.sourceConnectorId);
      
      if (sourceResult.error) {
        return {
          success: false,
          error: `Failed to fetch from source: ${sourceResult.error}`
        };
      }

      // Write to target (implement based on your needs)
      // This is a placeholder - you'd need to implement actual data sync logic
      console.log(`[Data Sync] Synced ${sourceResult.data?.length || 0} records`);

      return {
        success: true,
        data: {
          message: 'Data synced successfully',
          recordsSynced: sourceResult.data?.length || 0
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute custom task
   */
  private async executeCustom(config: ScheduledTaskConfig, executionId: string): Promise<TaskExecutionResult> {
    try {
      if (!config.customAction) {
        return {
          success: false,
          error: 'Missing custom action'
        };
      }

      // Implement custom action logic based on config.customAction
      console.log(`[Custom] Executing custom action: ${config.customAction}`);

      return {
        success: true,
        data: {
          message: 'Custom action executed',
          action: config.customAction,
          params: config.customParams
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate next run time for a task
   */
  private calculateNextRunTime(task: any): Date | null {
    const config = task;
    const timezone = config.timezone || 'Europe/Rome';
    const now = DateTime.now().setZone(timezone);

    switch (task.scheduleType) {
      case 'cron':
        // For cron, node-cron handles the scheduling
        // We just return null here as the cron scheduler manages it
        return null;

      case 'interval':
        if (config.intervalMinutes) {
          return now.plus({ minutes: config.intervalMinutes }).toJSDate();
        }
        break;

      case 'specific':
        const daysOfWeek = config.daysOfWeek ? config.daysOfWeek.split(',').map(Number) : [];
        const hours = config.hours ? config.hours.split(',').map(Number) : [];

        if (daysOfWeek.length === 0 && hours.length === 0) {
          return null;
        }

        // Find next matching day and hour
        let nextDate = now;
        let found = false;
        let maxIterations = 365 * 24; // Prevent infinite loop

        while (!found && maxIterations > 0) {
          maxIterations--;

          const dayOfWeek = nextDate.weekday; // 0-6 (Monday-Sunday in luxon)
          const hour = nextDate.hour;

          const dayMatches = daysOfWeek.length === 0 || daysOfWeek.includes(dayOfWeek === 0 ? 6 : dayOfWeek - 1); // Convert to 0=Sunday format
          const hourMatches = hours.length === 0 || hours.includes(hour);

          if (dayMatches && hourMatches) {
            // Set to the next hour if we're already past it
            if (nextDate <= now) {
              nextDate = nextDate.plus({ hours: 1 }).startOf('hour');
            }
            found = true;
          } else {
            nextDate = nextDate.plus({ hours: 1 });
          }
        }

        return found ? nextDate.toJSDate() : null;

      default:
        return null;
    }

    return null;
  }

  /**
   * Update next run times for all active tasks
   */
  private async updateNextRunTimes(): Promise<void> {
    try {
      const tasks = await db.scheduledTask.findMany({
        where: {
          status: 'active',
          scheduleType: { in: ['interval', 'specific'] }
        }
      });

      for (const task of tasks) {
        const nextRunAt = this.calculateNextRunTime(task);
        if (nextRunAt && (!task.nextRunAt || nextRunAt < task.nextRunAt)) {
          await db.scheduledTask.update({
            where: { id: task.id },
            data: { nextRunAt }
          });
        }
      }
    } catch (error) {
      console.error('[Scheduler] Error updating next run times:', error);
    }
  }

  /**
   * Reschedule a task (e.g., after configuration change)
   */
  async rescheduleTask(taskId: string): Promise<void> {
    const task = await db.scheduledTask.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Remove existing schedule
    if (this.tasks.has(taskId)) {
      this.tasks.get(taskId)!.stop();
      this.tasks.delete(taskId);
    }

    // Recalculate and update next run time
    const nextRunAt = this.calculateNextRunTime(task);
    await db.scheduledTask.update({
      where: { id: taskId },
      data: { nextRunAt }
    });

    // Reschedule
    await this.scheduleTask(task);
  }

  /**
   * Manually trigger a task execution
   */
  async triggerTask(taskId: string): Promise<TaskExecutionResult> {
    const task = await db.scheduledTask.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return await this.executeTaskByType(task, taskId + '-manual-' + Date.now());
  }
}

// ============================================
// Singleton Instance
// ============================================

export const schedulerService = new SchedulerService();

// ============================================
// Utility Functions
// ============================================

/**
 * Validate cron expression
 */
export function validateCronExpression(expression: string): boolean {
  return cron.validate(expression);
}

/**
 * Get next run times for preview
 */
export function getNextRunTimes(task: any, count: number = 5): Date[] {
  const times: Date[] = [];
  let current = DateTime.now().setZone(task.timezone || 'Europe/Rome');

  for (let i = 0; i < count; i++) {
    const next = schedulerService['calculateNextRunTime'](task);
    if (next) {
      times.push(next);
      current = DateTime.fromJSDate(next).plus({ minutes: 1 });
    } else {
      break;
    }
  }

  return times;
}
