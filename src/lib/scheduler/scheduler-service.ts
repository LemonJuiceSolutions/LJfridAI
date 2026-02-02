
import cron from 'node-cron';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { executePythonPreviewAction, exportTableToSqlAction } from '@/app/actions';
import { sendTestEmailWithDataAction, executeSqlPreviewAction, executeSqlAction } from '@/app/actions/connectors';
import _ from 'lodash';

// Basic logger
const logger = {
  log: (msg: string, ...args: any[]) => console.log(`[Scheduler] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[Scheduler] ${msg}`, ...args),
};

export type TaskType =
  | 'EMAIL_PREVIEW'
  | 'EMAIL_SEND'
  | 'SQL_PREVIEW'
  | 'SQL_EXECUTE'
  | 'PYTHON_EXECUTE'
  | 'DATA_SYNC'
  | 'CUSTOM';

export type ScheduleType = 'cron' | 'interval' | 'specific';

export interface ScheduledTaskConfig {
  // Common
  treeId?: string;
  nodeId?: string;
  nodePath?: string;

  // Specific
  [key: string]: any;
}

export interface TaskExecutionResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: any;
}

export class SchedulerService {
  private static instance: SchedulerService;
  // Map taskId -> cronJob or Array<cronJob>
  private tasks: Map<string, any> = new Map();
  private isInitialized = false;

  public static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  public async init() {
    if (this.isInitialized) return;
    logger.log('Initializing Scheduler Service...');
    await this.loadTasks();
    this.isInitialized = true;
    logger.log('Scheduler Service Initialized.');
  }

  public async reload() {
    logger.log('Reloading tasks...');
    this.stopAll();
    await this.loadTasks();
  }

  private async loadTasks() {
    try {
      // Load active tasks from DB
      const activeTasks = await db.scheduledTask.findMany({
        where: { status: 'active' }
      });

      logger.log(`Found ${activeTasks.length} active tasks.`);

      for (const task of activeTasks) {
        this.scheduleTask(task);
      }
    } catch (e) {
      logger.error('Failed to load tasks from DB:', e);
    }
  }
  public stopAll() {
    this.tasks.forEach(taskOrTasks => {
      if (Array.isArray(taskOrTasks)) {
        taskOrTasks.forEach(t => t.stop());
      } else {
        taskOrTasks.stop();
      }
    });
    this.tasks.clear();
  }

  // ... (loadTasks)

  private scheduleTask(task: any) {
    try {
      const config = typeof task.config === 'string' ? JSON.parse(task.config) : task.config;
      const customTimes = config?.customTimes as string[] | undefined;

      // Case 1: Custom HH:mm times
      if (customTimes && Array.isArray(customTimes) && customTimes.length > 0) {
        const jobs: any[] = [];

        for (const timeStr of customTimes) {
          // Format HH:mm
          const [hours, minutes] = timeStr.split(':');
          if (!hours || !minutes) continue;

          // Cron: Minute Hour * * * (Daily at specific time)
          // If we want to support daysOfWeek combined with custom times, we can use daysOfWeek from task
          const days = task.daysOfWeek || '*';
          const cronExpression = `${minutes} ${hours} * * ${days}`;

          const job = cron.schedule(cronExpression, async () => {
            logger.log(`Executing task (CustomTime ${timeStr}): ${task.name} (${task.id})`);
            await this.executeTask(task.id);
          }, {
            timezone: task.timezone || 'Europe/Rome'
          });
          jobs.push(job);
        }

        if (jobs.length > 0) {
          this.tasks.set(task.id, jobs);
          logger.log(`Scheduled task ${task.name} (${task.id}) with ${jobs.length} custom times: ${customTimes.join(', ')}`);
        }
        return;
      }

      // Case 2: Standard Cron/Interval
      let cronExpression = task.cronExpression;

      if (task.scheduleType === 'interval' && task.intervalMinutes) {
        // Simple interval: every X minutes
        cronExpression = `*/${task.intervalMinutes} * * * *`;
      } else if (task.scheduleType === 'specific') {
        // Specific days/hours
        // Format: Minute Hour DayOfMonth Month DayOfWeek
        // default to minute 0 of the hour
        const minutes = '0';
        const hours = task.hours || '*';
        const daysOfWeek = task.daysOfWeek || '*';
        cronExpression = `${minutes} ${hours} * * ${daysOfWeek}`;
      }

      if (!cronExpression) {
        logger.error(`Task ${task.id} (${task.name}) has no valid schedule.`);
        return;
      }

      // Create cron job
      const cronJob = cron.schedule(cronExpression, async () => {
        logger.log(`Executing task: ${task.name} (${task.id})`);
        await this.executeTask(task.id);
      }, {
        timezone: task.timezone || 'Europe/Rome'
      });

      this.tasks.set(task.id, cronJob);
      logger.log(`Scheduled task ${task.name} (${task.id}) with cron: ${cronExpression}`);

    } catch (e) {
      logger.error(`Failed to schedule task ${task.id}:`, e);
    }
  }

  public async executeTask(taskId: string): Promise<TaskExecutionResult> {
    logger.log(`Starting execution for task ${taskId}`);

    let executionId = '';

    try {
      // 1. Fetch Task
      const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
      if (!task) return { success: false, error: 'Task not found' };

      // 2. Create Execution Log (Pending)
      const execution = await db.scheduledTaskExecution.create({
        data: {
          taskId: taskId, // Fixed: use taskId instead of scheduledTaskId
          status: 'running',
          startedAt: new Date()
        }
      });
      executionId = execution.id;

      // 3. Execute Logic based on Type
      const result = await this.executeTaskByType(task, executionId);

      // 4. Update Execution Log (Success/Failure)
      await db.scheduledTaskExecution.update({
        where: { id: executionId },
        data: {
          status: result.success ? 'success' : 'failure',
          completedAt: new Date(),
          result: (result.data || result.message) as Prisma.InputJsonValue,
          error: result.error
        }
      });

      // 5. Update Task Stats
      await db.scheduledTask.update({
        where: { id: taskId },
        data: {
          lastRunAt: new Date(),
          nextRunAt: this.calculateNextRun(task as any),
          runCount: { increment: 1 },
          // Failure handling
          failureCount: result.success ? 0 : { increment: 1 }
        }
      });

      return result;

    } catch (e: any) {
      logger.error(`Execution failed for task ${taskId}:`, e);
      // Try to log failure if execution created
      if (executionId) {
        await db.scheduledTaskExecution.update({
          where: { id: executionId },
          data: {
            status: 'failure',
            completedAt: new Date(),
            error: e.message
          }
        }).catch(() => { });
      }
      return { success: false, error: e.message };
    }
  }

  private calculateNextRun(task: any): Date | null {
    try {
      const now = DateTime.now().setZone(task.timezone || 'Europe/Rome');
      let nextRun: DateTime | null = null;

      const config = typeof task.config === 'string' ? JSON.parse(task.config) : task.config;
      const customTimes = config?.customTimes as string[] | undefined;

      // 1. Custom Times (HH:mm)
      if (customTimes && Array.isArray(customTimes) && customTimes.length > 0) {
        let candidates: DateTime[] = [];
        for (const timeStr of customTimes) {
          const [h, m] = timeStr.split(':').map(Number);
          if (isNaN(h) || isNaN(m)) continue;

          // Candidate for today
          let candidate = now.set({ hour: h, minute: m, second: 0, millisecond: 0 });
          if (candidate <= now) {
            // If passed today, try tomorrow
            candidate = candidate.plus({ days: 1 });
          }
          candidates.push(candidate);
        }

        // If daysOfWeek applied to custom times (from scheduler logic):
        const daysOfWeek = task.daysOfWeek; // e.g. "1,3,5" or "*"
        if (daysOfWeek && daysOfWeek !== '*') {
          const allowedDays = daysOfWeek.split(',').map(Number);
          // Filter candidates by day
          // This is complex because we just added +1 day. Better:
          // Finding next run for pattern: Times + Days
          // Let's simplified: just find next valid Time on a valid Day.
          candidates = [];
          // Look ahead 14 days to be safe
          for (let d = 0; d < 14; d++) {
            const refDate = now.plus({ days: d });
            // Check if day is allowed (0-6, Luxon 1-7, cron 0-6 usually sun-sat)
            // Node-cron: 0-6 (Sun-Sat). Luxon: 1-7 (Mon-Sun).
            // Need to map. 
            // Let's assume user input follows cron 0-6.
            // Luxon weekday: 1=Mon...7=Sun.
            // Cron: 0=Sun, 1=Mon...6=Sat.
            // Mapping Luxon->Cron: val % 7. (7%7=0=Sun, 1%7=1=Mon)
            const cronDay = refDate.weekday % 7;
            if (!allowedDays.includes(cronDay)) continue;

            for (const timeStr of customTimes) {
              const [h, m] = timeStr.split(':').map(Number);
              const candidate = refDate.set({ hour: h, minute: m, second: 0, millisecond: 0 });
              if (candidate > now) {
                candidates.push(candidate);
              }
            }
            // Optimization: if we found candidates in this day, we stop looking further? 
            // No, we want absolute closest. But since we check ordered days, first match is closest.
            if (candidates.length > 0) break;
          }
        }

        if (candidates.length > 0) {
          // Sort and take first
          nextRun = candidates.sort((a, b) => a.toMillis() - b.toMillis())[0];
        }
      }
      // 2. Interval
      else if (task.scheduleType === 'interval' && task.intervalMinutes) {
        const lastRun = task.lastRunAt ? DateTime.fromJSDate(new Date(task.lastRunAt)).setZone(task.timezone || 'Europe/Rome') : now;
        // If last run was long ago, next run is ... now? or aligned?
        // Simple approach: LastRun + Interval. If < Now, then Now.
        // Or if strictly interval: LastRun + N*Interval > Now.
        nextRun = lastRun.plus({ minutes: task.intervalMinutes });
        if (nextRun <= now) {
          // Catch up
          const diff = now.diff(lastRun, 'minutes').minutes;
          const intervalsToAdd = Math.ceil(diff / task.intervalMinutes);
          nextRun = lastRun.plus({ minutes: intervalsToAdd * task.intervalMinutes });
        }
      }
      // 3. Specific Days/Hours
      else if (task.scheduleType === 'specific') {
        // Hours: "9,14"
        // Days: "1,3,5" (Cron 0-6)
        const hours = (task.hours || '0').split(',').map(Number);
        const days = (task.daysOfWeek || '*').split(',').map(Number); // if * handled separately

        const isDaily = task.daysOfWeek === '*' || !task.daysOfWeek;

        let candidates: DateTime[] = [];
        // Look ahead 14 days
        for (let d = 0; d < 14; d++) {
          const refDate = now.plus({ days: d });

          if (!isDaily) {
            const cronDay = refDate.weekday % 7;
            if (!days.includes(cronDay)) continue;
          }

          for (const h of hours) {
            // Minute 0 default
            const candidate = refDate.set({ hour: h, minute: 0, second: 0, millisecond: 0 });
            if (candidate > now) {
              candidates.push(candidate);
            }
          }
          if (candidates.length > 0) break;
        }
        if (candidates.length > 0) {
          nextRun = candidates.sort((a, b) => a.toMillis() - b.toMillis())[0];
        }
      }

      return nextRun ? nextRun.toJSDate() : null;
    } catch (e) {
      console.error('Error calcluating next run', e);
      return null;
    }
  }

  private async executeTaskByType(task: any, executionId: string): Promise<TaskExecutionResult> {
    const config = task.config as ScheduledTaskConfig;
    const type = task.type as TaskType;

    logger.log(`Executing logic for type: ${type}`);

    try {
      switch (type) {
        case 'EMAIL_SEND':
          return await this.executeEmailSend(config);
        case 'SQL_EXECUTE':
          return await this.executeSqlNode(config);
        case 'PYTHON_EXECUTE':
        case 'CUSTOM': // Mapped Custom to Python usually or generic
          if (config.pythonCode) {
            return await this.executePythonNode(config);
          }
          return { success: false, error: "Custom task missing handler" };

        default:
          return {
            success: false,
            error: `Unknown task type: ${task.type}`
          };
      }
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // --- NODE TYPE EXECUTORS ---

  private async executeEmailSend(config: ScheduledTaskConfig): Promise<TaskExecutionResult> {
    // Reconstruct params for sendTestEmailWithDataAction
    const {
      to, cc, bcc, subject, body, // strings
      connectorId, // SMTP
      contextTables, // Available inputs defined in context
      // Selections:
      selectedTableNames, // Array of strings (names of sql tables to include)
      selectedPythonNames, // Array of strings
    } = config;

    if (!connectorId) return { success: false, error: "Missing SMTP Connector ID" };

    // Filter contextTables to get the selected ones
    // Context table shape: { name, sqlQuery?, pythonCode?, ... }
    const allContext = (contextTables as any[]) || [];

    let selectedTablesPayload: any[] = [];
    if (config.selectedTables && Array.isArray(config.selectedTables)) {
      selectedTablesPayload = config.selectedTables.map((t: any) => {
        // Find def in context to get query if missing
        const def = allContext.find(c => c.name === t.name);
        return {
          name: t.name,
          query: t.query || def?.sqlQuery || '',
          inBody: t.inBody ?? true,
          asExcel: t.asExcel ?? false,
          pipelineDependencies: def?.pipelineDependencies
        };
      });
    }

    let selectedPythonPayload: any[] = [];
    if (config.selectedPythonOutputs && Array.isArray(config.selectedPythonOutputs)) {
      selectedPythonPayload = config.selectedPythonOutputs.map((p: any) => {
        const def = allContext.find(c => c.name === p.name);
        return {
          name: p.name,
          code: p.code || def?.pythonCode || '',
          outputType: p.outputType || def?.pythonOutputType || 'table',
          connectorId: p.connectorId || def?.connectorId,
          inBody: p.inBody ?? true,
          asAttachment: p.asAttachment ?? false,
          dependencies: def?.pipelineDependencies // Python dependencies
        };
      });
    }

    // Call Action
    const result = await sendTestEmailWithDataAction({
      connectorId,
      sqlConnectorId: config.sqlConnectorId || (selectedTablesPayload[0] ? allContext.find(c => c.name === selectedTablesPayload[0].name)?.connectorId : '') || '',

      to, cc, bcc, subject, bodyHtml: body || '',
      selectedTables: selectedTablesPayload,
      selectedPythonOutputs: selectedPythonPayload
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    return { success: true, message: result.message };
  }

  private async executeSqlNode(config: ScheduledTaskConfig): Promise<TaskExecutionResult> {
    // 1. Prepare Inputs
    const {
      query,
      connectorIdSql,
      sqlResultName,
      contextTables,
      selectedPipelines, // Names of dependencies
      treeId, nodeId, nodePath,
      sqlExportConfig
    } = config;

    if (!query || !connectorIdSql) return { success: false, error: "Missing Query or Connector" };

    // 2. Build Dependencies
    // Logic: map selectedPipelines to their inputs.
    const allContext = (contextTables as any[]) || [];
    const dependencies: any[] = (selectedPipelines as string[])?.map(name => {
      const def = allContext.find(c => c.name === name);
      if (!def) return null;
      return def;
    }).filter(Boolean) as any[] || [];

    // 3. Execute Query
    // Explicitly cast dependencies to any[] to satisfy TS
    const result = await executeSqlPreviewAction(query, connectorIdSql, dependencies);
    if (result.error) throw new Error(result.error);

    const data = result.data; // Array of rows

    // 4. Update Node Preview in Tree (Save Result)
    if (treeId && nodePath && sqlResultName) {
      await this.saveNodePreviewData(treeId, nodePath, {
        sqlPreviewData: data,
        sqlPreviewLastUpdate: new Date().toISOString()
      });
    }

    // 5. Export if configured
    if (sqlExportConfig && sqlExportConfig.targetConnectorId && sqlExportConfig.targetTableName) {
      // Perform Export
      // The source is the `data` we just got.
      const exportRes = await exportTableToSqlAction(
        sqlExportConfig.targetConnectorId,
        sqlExportConfig.targetTableName,
        data as any[], // Cast data to any[] (it is IRecordSet which is object-like rows)
        true // mode: overwrite (boolean true per action signature)
      );
      if (!exportRes.success) throw new Error(`Export failed: ${exportRes.error}`);
      return { success: true, message: `Executed & Exported to ${sqlExportConfig.targetTableName}` };
    }

    return { success: true, message: `Executed. returned ${data?.length || 0} rows.` };
  }

  private async executePythonNode(config: ScheduledTaskConfig): Promise<TaskExecutionResult> {
    const {
      pythonCode,
      pythonOutputType, // table, chart, etc
      pythonResultName,
      pythonConnectorId,
      contextTables,
      pythonSelectedPipelines,
      treeId, nodeId, nodePath,
      sqlExportConfig
    } = config;

    if (!pythonCode) return { success: false, error: "Missing Python Code" };

    // 1. Build Dependencies
    const allContext = (contextTables as any[]) || [];
    const dependencies = (pythonSelectedPipelines as string[])?.map(name => {
      const def = allContext.find(c => c.name === name);
      if (!def) return null;
      return {
        tableName: def.name,
        connectorId: def.connectorId,
        query: def.sqlQuery,
        isPython: def.isPython,
        pythonCode: def.pythonCode,
        pipelineDependencies: def.pipelineDependencies
      };
    }).filter(Boolean) as any[] || []; // Cast to any[]

    // 2. Execute Python
    // outputType default 'table' if we want data
    const runType = pythonOutputType || 'table';

    const result = await executePythonPreviewAction(
      pythonCode,
      runType,
      {}, // variables
      dependencies,
      pythonConnectorId
    );

    if (!result.success) throw new Error(result.error);

    // 3. Save Preview
    if (treeId && nodePath) {
      const updatePayload: any = {
        pythonPreviewLastUpdate: new Date().toISOString()
      };
      if (runType === 'table') {
        updatePayload.pythonPreviewResult = result.data; // rows
      } else if (runType === 'chart') {
        updatePayload.pythonPreviewResult = {
          chartBase64: result.chartBase64,
          chartHtml: result.chartHtml,
          widgetConfig: (result as any).widgetConfig
        };
      } else {
        // Variable
        updatePayload.pythonPreviewResult = result.variables;
      }

      await this.saveNodePreviewData(treeId, nodePath, updatePayload);
    }

    // 4. Export if configured (only if table data available)
    if (sqlExportConfig && sqlExportConfig.targetConnectorId && sqlExportConfig.targetTableName) {
      let dataToExport = result.data;
      if (!Array.isArray(dataToExport) || dataToExport.length === 0) {
        return { success: true, message: "Executed, but no data to export." };
      }

      const exportRes = await exportTableToSqlAction(
        sqlExportConfig.targetConnectorId,
        sqlExportConfig.targetTableName,
        dataToExport,
        true // mode: overwrite
      );
      if (!exportRes.success) throw new Error(`Export failed: ${exportRes.error}`);
      return { success: true, message: `Executed & Exported to ${sqlExportConfig.targetTableName}` };
    }

    return { success: true, message: "Python executed successfully" };
  }

  private async saveNodePreviewData(treeId: string, nodePath: string, updateData: any) {
    // We need to:
    // 1. Fetch tree
    // 2. Parse JSON
    // 3. Update node at path
    // 4. Save
    // This is racy if users are editing. But for background tasks it's acceptable.

    const tree = await db.tree.findUnique({ where: { id: treeId } });
    if (!tree || !tree.jsonDecisionTree) return;

    let json = JSON.parse(tree.jsonDecisionTree);

    // NodePath string like "root.children.uuid..."
    // Lodash set
    // We need to merge, not overwrite entire node, to keep other props
    const path = nodePath.replace(/^root\.?/, '');

    if (!path) {
      // Root update
      json = { ...json, ...updateData };
    } else {
      const existing = _.get(json, path);
      if (existing) {
        _.set(json, path, { ...existing, ...updateData });
      }
    }

    await db.tree.update({
      where: { id: treeId },
      data: { jsonDecisionTree: JSON.stringify(json) } // format?
    });
  }

  // --- Public Management Methods ---
  public async rescheduleTask(taskId: string) {
    // Remove existing
    const existing = this.tasks.get(taskId);
    if (existing) {
      existing.stop();
      this.tasks.delete(taskId);
    }

    // Load and schedule
    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (task && task.status === 'active') {
      this.scheduleTask(task);
    }
  }

  public async deleteTask(taskId: string) {
    const existing = this.tasks.get(taskId);
    if (existing) {
      existing.stop();
      this.tasks.delete(taskId);
    }
  }
}

export const schedulerService = SchedulerService.getInstance();
