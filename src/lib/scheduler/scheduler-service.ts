

// import cron from 'node-cron'; // Removed static import
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { executePythonPreviewAction, exportTableToSqlAction, executeSqlPreviewAction } from '@/app/actions';
import { sendTestEmailWithDataAction, executeSqlAction } from '@/app/actions/connectors';
import _ from 'lodash';

import fs from 'fs';

// Basic logger
const logger = {
  log: (msg: string, ...args: any[]) => {
    const message = `[Scheduler] ${msg} ${args.map(a => JSON.stringify(a)).join(' ')}`;
    console.log(message);
    try {
      fs.appendFileSync('./scheduler_debug.log', `${new Date().toISOString()} ${message}\n`);
    } catch (e) { }
  },
  error: (msg: string, ...args: any[]) => {
    const message = `[Scheduler] ERROR: ${msg} ${args.map(a => JSON.stringify(a)).join(' ')}`;
    console.error(message);
    try {
      fs.appendFileSync('./scheduler_debug.log', `${new Date().toISOString()} ${message}\n`);
    } catch (e) { }
  },
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
  private runningTasks: Set<string> = new Set(); // Concurrency guard
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
        await this.scheduleTask(task);
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

  private async scheduleTask(task: any) {
    try {
      // Dynamic import of our isolated runner to avoid Edge runtime bundling node-cron directly
      const { scheduleCronJob } = await import('./cron-runner');

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

          const job = await scheduleCronJob(cronExpression, async () => {
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
      const cronJob = await scheduleCronJob(cronExpression, async () => {
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
    // Concurrency guard: skip if this task is already running
    if (this.runningTasks.has(taskId)) {
      logger.log(`⏭️ Task ${taskId} SKIPPED - still running from previous trigger`);
      return { success: false, error: 'Task already running, skipped.' };
    }

    this.runningTasks.add(taskId);
    const execStart = Date.now();
    logger.log(`▶️ Starting task ${taskId}`);

    let executionId = '';

    try {
      // 1. Fetch Task
      const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
      if (!task) return { success: false, error: 'Task not found' };

      // 2. Create Execution Log (Pending)
      const execution = await db.scheduledTaskExecution.create({
        data: {
          taskId: taskId,
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
          durationMs: Math.round(Date.now() - execution.startedAt.getTime()),
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
          successCount: result.success ? { increment: 1 } : undefined,
          failureCount: result.success ? undefined : { increment: 1 },
          lastError: result.success ? null : (result.error || 'Unknown error')
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
    } finally {
      this.runningTasks.delete(taskId);
      const elapsed = ((Date.now() - execStart) / 1000).toFixed(1);
      logger.log(`⏱️ Task ${taskId} finished in ${elapsed}s`);
    }
  }

  private calculateNextRun(task: any): Date | null {
    return calculateNextRunForTask(task, task.timezone || 'Europe/Rome');
  }


  private async executeTaskByType(task: any, executionId: string): Promise<TaskExecutionResult> {
    const config = task.config as ScheduledTaskConfig;
    const type = task.type as TaskType;

    logger.log(`Executing logic for type: ${type}`);

    try {
      switch (type) {
        case 'EMAIL_SEND':
          return await this.executeEmailSend(config);
        case 'SQL_PREVIEW':
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

  private async executeAncestorChain(
    contextTables: any[],
    targetNodeNames?: string[], // Optional: filter
    _bypassAuth: boolean = true,
    treeId?: string // Save ancestor previews to tree JSON + ScheduledTaskExecution
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    // Store results with normalized keys for lookup, but allow original keys too
    const resultsNormalized: Record<string, any> = {};
    const permanentTables = new Map<string, { connectorId: string, tableName: string }>();

    const pipelineReport: Array<{ name: string, type: string, status: 'success' | 'error' | 'skipped', error?: string, timestamp: string, nodePath?: string }> = [];
    if (!contextTables || contextTables.length === 0) return { results, pipelineReport };

    // 1. Build Dependency Graph (Case-Insensitive Normalization)
    const graph = new Map<string, string[]>();
    const nodeNameMap = new Map<string, string>(); // normalized -> original
    const aliasToCanonicalMap = new Map<string, string>(); // normalized alias -> normalized canonical name

    // First pass: Register all nodes and their aliases
    contextTables.forEach(t => {
      const canonicalOriginalName = t.name;
      const canonicalNormalizedName = t.name.toLowerCase().trim();

      nodeNameMap.set(canonicalNormalizedName, canonicalOriginalName);
      aliasToCanonicalMap.set(canonicalNormalizedName, canonicalNormalizedName);

      // Register aliases
      if (t.allNames && Array.isArray(t.allNames)) {
        t.allNames.forEach((alias: string) => {
          const aliasNorm = alias.toLowerCase().trim();
          aliasToCanonicalMap.set(aliasNorm, canonicalNormalizedName);
          // Also map alias to original name if not already set (though canonical is preferred)
          if (!nodeNameMap.has(aliasNorm)) {
            nodeNameMap.set(aliasNorm, canonicalOriginalName);
          }
        });
      }
    });

    // Second pass: Build graph using CANONICAL names
    contextTables.forEach(t => {
      const canonicalNormalizedName = t.name.toLowerCase().trim();

      // Resolve dependencies to their canonical names
      const distinctDeps = new Set<string>();
      (t.pipelineDependencies || []).forEach((d: any) => {
        const rawDep = d.tableName.toLowerCase().trim();
        const canonicalDep = aliasToCanonicalMap.get(rawDep);

        // Only add dependency if it exists in our context
        if (canonicalDep) {
          distinctDeps.add(canonicalDep);
        } else {
          // Optional: Log warning about missing dependency?
          // logger.warn(`[AncestorChain] Node ${t.name} depends on '${rawDep}' which is not in context.`);
        }
      });

      graph.set(canonicalNormalizedName, Array.from(distinctDeps));
    });

    // 2. Radiological Sort (Topological)
    const visited = new Set<string>();
    const sortedNormalized: string[] = [];
    const visiting = new Set<string>(); // Cycle detection

    const visit = (normalizedNode: string) => {
      // Resolve to canonical just in case, though input should be canonical
      const canonical = aliasToCanonicalMap.get(normalizedNode) || normalizedNode;

      if (visited.has(canonical)) return;
      if (visiting.has(canonical)) return; // Cycle detected

      visiting.add(canonical);
      const deps = graph.get(canonical) || [];

      // Visit dependencies first
      deps.forEach(d => {
        visit(d);
      });

      visiting.delete(canonical);
      visited.add(canonical);
      sortedNormalized.push(canonical); // Push CANONICAL name
    };

    // Visit all nodes in context
    contextTables.forEach(t => visit(t.name.toLowerCase().trim()));

    logger.log(`[AncestorChain] Execution Order: ${sortedNormalized.map(n => nodeNameMap.get(n)).join(' -> ')}`);

    // 3. Execute in Order
    for (const normalizedName of sortedNormalized) {
      const originalName = nodeNameMap.get(normalizedName);
      if (!originalName) continue;

      const tableDef = contextTables.find(t => t.name === originalName);
      if (!tableDef) continue;

      // Skip if it doesn't have execution logic
      const hasLogic = (tableDef.isPython && tableDef.pythonCode) || (!tableDef.isPython && tableDef.sqlQuery);
      if (!hasLogic) continue;

      logger.log(`[AncestorChain] Executing ancestor: ${originalName} (${tableDef.isPython ? 'Python' : 'SQL'})`);

      try {
        let resultData: any = null;

        // A. EXECUTE
        if (tableDef.isPython && tableDef.pythonCode) {
          // Pass ALL available results to Python (not just explicit deps)
          // This allows scripts to access any table computed earlier in the pipeline
          const inputData: Record<string, any> = {};

          // First, add all available results by their original names
          // IMPORTANT: Extract .data from result objects (matching button UI behavior)
          for (const [normKey, val] of Object.entries(resultsNormalized)) {
            const origName = nodeNameMap.get(normKey) || normKey;

            if (val !== undefined && val !== null) {
              if (Array.isArray(val)) {
                inputData[origName] = val;
              } else if (val && typeof val === 'object' && 'data' in val && Array.isArray(val.data)) {
                inputData[origName] = val.data;
              } else if (val && typeof val === 'object' && 'data' in val && val.data !== null && val.data !== undefined) {
                inputData[origName] = val.data;
              } else if (val && typeof val === 'object' && 'rechartsData' in val && Array.isArray((val as any).rechartsData)) {
                inputData[origName] = (val as any).rechartsData;
              } else if (val && typeof val === 'object' && 'variables' in val && (val as any).variables) {
                inputData[origName] = (val as any).variables;
              } else if (val && typeof val === 'object' && !('data' in val)) {
                inputData[origName] = val;
              } else if (val && typeof val === 'object' && ('chartBase64' in val || 'chartHtml' in val || 'rechartsConfig' in val)) {
                inputData[origName] = val;
              }
            }
          }
          logger.log(`[AncestorChain] Built inputData for ${originalName}: ${Object.keys(inputData).join(', ')}`);

          // Also add using explicit dependency names (might be aliased differently)
          (tableDef.pipelineDependencies || []).forEach((d: any) => {
            const depNorm = d.tableName.toLowerCase().trim();
            const val = resultsNormalized[depNorm];
            if (val !== undefined) {
              // Same extraction logic for explicit dependencies
              if (Array.isArray(val)) {
                inputData[d.tableName] = val;
              } else if (val && typeof val === 'object' && 'data' in val && Array.isArray(val.data)) {
                inputData[d.tableName] = val.data;
              } else if (val && typeof val === 'object' && 'data' in val && val.data !== null && val.data !== undefined) {
                inputData[d.tableName] = val.data;
              } else if (val && typeof val === 'object' && 'rechartsData' in val && Array.isArray((val as any).rechartsData)) {
                inputData[d.tableName] = (val as any).rechartsData;
              } else if (val && typeof val === 'object' && 'variables' in val && (val as any).variables) {
                inputData[d.tableName] = (val as any).variables;
              } else if (val && typeof val === 'object' && !('data' in val)) {
                inputData[d.tableName] = val;
              } else if (val && typeof val === 'object' && ('chartBase64' in val || 'chartHtml' in val || 'rechartsConfig' in val)) {
                inputData[d.tableName] = val;
              }
              // else: skip if data is null/undefined and no chart info
            }
          });

          // DEBUG: Log final inputData keys
          logger.log(`[AncestorChain] Final inputData for ${originalName}: ${Object.keys(inputData).join(', ')}`);

          // Prepare dependencies definitions
          // FIX: Strip nested pipelineDependencies to prevent recursive re-fetching.
          // The ancestor chain already pre-computed everything and put it in inputData.
          // If executePythonPreviewAction needs a dep not in inputData, it should use
          // the query/code to fetch it, but WITHOUT nested deps that would cause cascading failures.
          const deps = (tableDef.pipelineDependencies || []).map((d: any) => {
            return {
              tableName: d.tableName,
              query: d.query,
              isPython: d.isPython,
              pythonCode: d.pythonCode,
              connectorId: d.connectorId
              // NOTE: No pipelineDependencies! Prevents recursive re-fetching cascading failures.
            };
          });

          const res = await executePythonPreviewAction(
            tableDef.pythonCode,
            tableDef.pythonOutputType || 'table',
            inputData, // PASS DATA HERE
            deps,
            tableDef.connectorId,
            _bypassAuth
          );

          if (res.success) {
            // IMPORTANT: Store in SAME format as button UI - always wrap with .data property
            // Button does: ancestorResults[name] = { data: res.data, chartBase64: ..., variables: ... }
            resultData = {
              data: res.data,
              chartBase64: res.chartBase64,
              chartHtml: res.chartHtml,
              rechartsConfig: res.rechartsConfig,
              rechartsData: res.rechartsData,
              variables: res.variables,
              stdout: res.stdout
            };
          } else {
            logger.error(`[AncestorChain] Error executing Python node ${originalName}: ${res.error}`);
            pipelineReport.push({ name: originalName, type: 'Python', status: 'error', error: res.error, timestamp: new Date().toISOString(), nodePath: tableDef.nodePath || tableDef.nodeId });
          }
        } else if (tableDef.sqlQuery) {
          // SQL
          // FIX: The ancestor chain has ALREADY executed all nodes in order.
          // We ONLY need to pass pre-calculated data as deps. DO NOT pass query/pipelineDependencies
          // because executeSqlPreviewAction's flattenDependencies would try to re-execute them
          // recursively, which fails since temp tables from previous connections don't exist.
          // Instead: pass ALL available pre-calculated results as data-only deps.
          // OPTIMIZATION: Only inject deps that are actually referenced in the SQL query
          // This avoids re-materializing large tables (e.g. HR2 12K rows) for nodes that don't use them
          const sqlQueryLower = tableDef.sqlQuery.toLowerCase();
          const deps: any[] = [];
          let effectiveQuery = tableDef.sqlQuery;
          const addedDepNames = new Set<string>();

          // Helper for precise replacement (to avoid partial matches like PROD vs PRODFIL)
          const replaceRef = (sql: string, oldName: string, newName: string) => {
            const escaped = _.escapeRegExp(oldName);
            // Match FROM/JOIN followed by optional schema and the table name
            const pattern = `\\b(FROM|JOIN)\\s+((?:\\[[^\\]]+\\]|\\w+)\\.)?\\[?${escaped}\\]?\\b`;
            const regex = new RegExp(pattern, 'gi');
            return sql.replace(regex, (match, keyword, schema) => {
              return `${keyword} ${schema || ''}${newName}`;
            });
          };

          for (const [key, val] of Object.entries(results)) {
            const keyNorm = key.toLowerCase().trim();
            if (keyNorm !== normalizedName && !addedDepNames.has(key)) {
              // Precise Detection: Use regex with word boundaries
              const tableRegex = new RegExp(`\\b${_.escapeRegExp(keyNorm)}\\b`, 'i');
              if (!tableRegex.test(sqlQueryLower)) continue;

              // Permanent Table Reuse
              const perm = permanentTables.get(keyNorm);
              if (perm && perm.connectorId === tableDef.connectorId) {
                logger.log(`[AncestorChain] ${originalName}: Reusing permanent table ${perm.tableName} for dependency ${key}`);
                effectiveQuery = replaceRef(effectiveQuery, key, perm.tableName);
                addedDepNames.add(key);
                continue;
              }

              const dataToInject = Array.isArray(val) ? val :
                (val && typeof val === 'object' && 'data' in val && Array.isArray(val.data)) ? val.data : null;
              if (dataToInject && dataToInject.length > 0) {
                deps.push({
                  tableName: key,
                  data: dataToInject
                });
                addedDepNames.add(key);
              }
            }
          }
          logger.log(`[AncestorChain] SQL node ${originalName}: injected ${deps.length} deps (${deps.map((d: any) => d.tableName).join(', ')})`);

          const res = await executeSqlPreviewAction(
            effectiveQuery,
            tableDef.connectorId,
            deps,
            _bypassAuth
          );
          if (res.error) {
            logger.error(`[AncestorChain] Error executing SQL node ${originalName}: ${res.error}`);
            pipelineReport.push({ name: originalName, type: 'SQL', status: 'error', error: res.error, timestamp: new Date().toISOString(), nodePath: tableDef.nodePath || tableDef.nodeId });
          } else {
            resultData = res.data;

            // HYBRID NODE: If this SQL node also has Python chart code, run it too
            // This generates the chart using the SQL result as input data
            if (tableDef.pythonCode && tableDef.pythonOutputType && resultData) {
              logger.log(`[AncestorChain] Hybrid node ${originalName}: SQL done, now running Python chart code`);
              const pythonInputData: Record<string, any> = {};
              // Provide the SQL result under ALL alias names so Python code can reference any name
              const hybridAllNames = tableDef.allNames || [originalName];
              const sqlDataForPython = Array.isArray(resultData) ? resultData : [resultData];
              for (const alias of hybridAllNames) {
                pythonInputData[alias] = sqlDataForPython;
              }
              // Also provide all previous results using `results` map (which has alias keys)
              // This ensures Python code can reference deps by alias (e.g. "Budget" instead of "Fatturato > Budget")
              for (const [key, val] of Object.entries(results)) {
                if (pythonInputData[key] !== undefined) continue; // Skip self (already added above)
                if (val && typeof val === 'object' && 'data' in val && Array.isArray(val.data)) {
                  pythonInputData[key] = val.data;
                } else if (Array.isArray(val)) {
                  pythonInputData[key] = val;
                }
              }

              const pyRes = await executePythonPreviewAction(
                tableDef.pythonCode,
                tableDef.pythonOutputType,
                pythonInputData,
                [], // No deps needed - data already provided
                tableDef.connectorId,
                _bypassAuth
              );

              if (pyRes.success) {
                // Merge: wrap SQL data + Python chart into a single result object
                resultData = {
                  data: Array.isArray(resultData) ? resultData : [resultData],
                  chartBase64: pyRes.chartBase64,
                  chartHtml: pyRes.chartHtml,
                  rechartsConfig: pyRes.rechartsConfig,
                  rechartsData: pyRes.rechartsData,
                  variables: pyRes.variables,
                  stdout: pyRes.stdout
                };
                logger.log(`[AncestorChain] Hybrid node ${originalName}: Python chart generated successfully`);
              } else {
                logger.error(`[AncestorChain] Hybrid node ${originalName}: Python chart failed: ${pyRes.error}`);
                // Keep SQL-only result (resultData unchanged)
              }
            }
          }
        }

        if (resultData) {
          // Check if there's already a result for this name
          const existingResult = resultsNormalized[normalizedName];
          const newResultIsArray = Array.isArray(resultData);
          const existingResultIsArray = Array.isArray(existingResult);
          const existingHasDataArray = existingResult && typeof existingResult === 'object' && 'data' in existingResult && Array.isArray(existingResult.data);

          // PRIORITY LOGIC: SQL (array) results should override Python chart (object without data array)
          // This fixes the duplicate node name issue where HR2 Python chart blocks HR2 SQL
          let shouldStore = true;
          if (existingResult !== undefined) {
            if (newResultIsArray && !existingResultIsArray && !existingHasDataArray) {
              // New is array (SQL), existing is object without data array (Python chart) -> OVERRIDE
              logger.log(`[AncestorChain] Overriding ${originalName}: new SQL array replaces existing Python chart`);
            } else if (!newResultIsArray && (existingResultIsArray || existingHasDataArray)) {
              // New is object (Python chart), existing is array (SQL) or has data array -> DON'T OVERRIDE
              logger.log(`[AncestorChain] Keeping existing ${originalName}: SQL array preserved over Python chart`);
              shouldStore = false;
            }
          }

          if (shouldStore) {
            // Store under primary name
            results[originalName] = resultData;
            resultsNormalized[normalizedName] = resultData;

            // Also store under all alternative names
            const allNames = tableDef.allNames || [originalName];
            for (const altName of allNames) {
              if (altName !== originalName) {
                results[altName] = resultData;
                resultsNormalized[altName.toLowerCase().trim()] = resultData;
              }
            }
          }
          pipelineReport.push({ name: originalName, type: tableDef.isPython ? 'Python' : 'SQL', status: 'success', timestamp: new Date().toISOString(), nodePath: tableDef.nodePath || tableDef.nodeId });

          // --- INCREMENTAL PERSISTENCE (Real-Time Previews) ---
          if (treeId && shouldStore) {
            const nodeId = tableDef.nodeId || tableDef.id;
            if (nodeId) {
              logger.log(`[AncestorChain] [DEBUG] Starting incremental preview for ${originalName} (${nodeId})`);
              try {
                const { saveAncestorPreviewsBatchAction } = await import('@/app/actions/scheduler');
                await saveAncestorPreviewsBatchAction(treeId, [{
                  nodeId: nodeId,
                  isPython: !!tableDef.isPython,
                  pythonOutputType: tableDef.pythonOutputType,
                  result: resultData
                }]);
                logger.log(`[AncestorChain] [DEBUG] Incremental preview SAVED for ${originalName}`);
              } catch (err: any) {
                logger.error(`[AncestorChain] [DEBUG] Failed to save incremental preview for ${originalName}: ${err.message}`);
              }
            } else {
              logger.log(`[AncestorChain] [DEBUG] Skipping incremental preview for ${originalName} - missing nodeId`);
            }
          }
        } else {
          if (!pipelineReport.find(r => r.name === originalName)) {
            pipelineReport.push({ name: originalName, type: tableDef.isPython ? 'Python' : 'SQL', status: 'skipped', error: 'No result produced', timestamp: new Date().toISOString(), nodePath: tableDef.nodePath || tableDef.nodeId });
          }
        }

        // B. WRITE TO DATABASE
        // Fix: Check for export config using the actual field names from the node structure
        const targetTableName = tableDef.sqlExportTargetTableName || tableDef.sqlExportConfig?.targetTableName;
        const targetConnectorId = tableDef.sqlExportTargetConnectorId || tableDef.sqlExportConfig?.targetConnectorId || tableDef.connectorId;

        if (tableDef.writesToDatabase && targetTableName && targetConnectorId && resultData) {
          logger.log(`[AncestorChain] Writing ${originalName} to ${targetTableName}`);
          // Extract .data from Python result wrappers (which have { data, chartBase64, ... })
          const rawData = (resultData && typeof resultData === 'object' && 'data' in resultData && Array.isArray(resultData.data))
            ? resultData.data
            : resultData;
          const dataArr = Array.isArray(rawData) ? rawData : [rawData];
          if (dataArr.length > 0) {
            try {
              await exportTableToSqlAction(
                targetConnectorId,
                targetTableName,
                dataArr,
                true, // createTable
                true, // truncate
                true // isSystem (bypass auth)
              );
              // Store permanent table info for reuse in downstream nodes
              const nodeAllNames = tableDef.allNames || [originalName];
              for (const name of nodeAllNames) {
                permanentTables.set(name.toLowerCase().trim(), { connectorId: targetConnectorId, tableName: targetTableName });
              }

              pipelineReport.push({ name: `💾 Write ${targetTableName}`, type: 'export', status: 'success', timestamp: new Date().toISOString(), nodePath: tableDef.nodePath || tableDef.nodeId });
            } catch (exportErr: any) {
              logger.error(`[AncestorChain] Export failed for ${originalName} to ${targetTableName}: ${exportErr.message}`);
              pipelineReport.push({ name: `💾 Write ${targetTableName}`, type: 'export', status: 'error', error: exportErr.message, timestamp: new Date().toISOString(), nodePath: tableDef.nodePath || tableDef.nodeId });
            }
          }
        }

      } catch (e: any) {
        logger.error(`[AncestorChain] Exception executing ${originalName}: ${e.message}`);
        pipelineReport.push({ name: originalName, type: tableDef.isPython ? 'Python' : 'SQL', status: 'error', error: e.message, timestamp: new Date().toISOString(), nodePath: tableDef.nodePath || tableDef.nodeId });
      }
    }

    return { results, pipelineReport };
  }

  /**
   * Helper to find a node in the tree by path
   */
  private findNodeByPath(treeJson: any, path: string): any | null {
    if (!path || !treeJson) return null;

    const parts = path.split('->').filter(p => p !== 'root');
    let current = treeJson;

    for (const part of parts) {
      if (!current.options || !current.options[part]) {
        return null;
      }
      current = current.options[part];
    }

    return current;
  }

  /**
   * Helper to recursively find a node by ID in the tree
   */
  private findNodeById(node: any, targetId: string): any | null {
    if (!node || typeof node !== 'object') return null;

    // Check if this is the target node
    if (node.id === targetId) return node;

    // Recursively search in options
    if (node.options && typeof node.options === 'object') {
      for (const key in node.options) {
        const val = node.options[key];
        const found = this.findNodeById(val, targetId);
        if (found) return found;
      }
    }

    // Also search in arrays (some nodes might be in arrays)
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = this.findNodeById(item, targetId);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Helper to get all ancestor nodes (predecessors) for a given node
   */
  private getAncestorNodes(treeJson: any, nodePath: string): any[] {
    const ancestors: any[] = [];
    const parts = nodePath.split('->').filter(p => p !== 'root');

    let current = treeJson;
    let currentPath = 'root';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath += `->${part}`;

      if (current.options && current.options[part]) {
        current = current.options[part];

        // Extract relevant node info
        const allNames = [current.name, current.sqlResultName, current.pythonResultName].filter(Boolean) as string[];
        const nodeInfo: any = {
          name: allNames[0] || current.name,
          allNames: allNames,
          isPython: !!current.pythonCode,
          connectorId: current.pythonConnectorId || current.sqlConnectorId || current.connectorId,
          sqlQuery: current.sqlQuery,
          pythonCode: current.pythonCode,
          pythonOutputType: current.pythonOutputType,
          pythonResultName: current.pythonResultName,
          sqlResultName: current.sqlResultName,
          pipelineDependencies: current.pipelineDependencies || [],
          writesToDatabase: current.sqlExportTargetTableName ? true : false,
          sqlExportTargetTableName: current.sqlExportTargetTableName,
          sqlExportTargetConnectorId: current.sqlExportTargetConnectorId,
          nodeId: current.id
        };

        if (allNames.length > 0) {
          ancestors.push(nodeInfo);
        }
      }
    }

    return ancestors;
  }

  /**
   * Helper to get ancestors by finding the path to a node via its ID
   * This is used when nodePath is not available
   */
  private getAncestorsForNode(treeJson: any, targetNodeId: string): any[] {
    let foundAncestors: any[] = [];

    // Helper to find path and collect ancestors
    const findPath = (node: any, currentAncestors: any[]): boolean => {
      if (!node || typeof node !== 'object') return false;

      // If this is the target node, we found it! Save the ancestors list
      if (node.id === targetNodeId) {
        foundAncestors = currentAncestors;
        return true;
      }

      // Extract node info if it has a name
      const allNames = [node.name, node.sqlResultName, node.pythonResultName].filter(Boolean) as string[];
      const nodeInfo: any = allNames.length > 0 ? {
        name: allNames[0], // Primary name
        allNames: allNames, // Used for matching
        // IMPORTANT: Final robust classification
        // 1. If it's a CHART, it MUST be Python (SQL can't do charts directly)
        // 2. If it has a SQL query, it MUST be SQL (prioritize SQL over Python table/variable)
        // 3. Otherwise, check for Python code
        // CRITICAL: If has sqlQuery, ALWAYS treat as SQL (even if pythonOutputType=chart)
        // Charts don't produce table data, so children can't use them. SQL provides data.
        isPython: node.sqlQuery ? false : !!(node.pythonCode || node.pythonOutputType),
        connectorId: node.pythonConnectorId || node.sqlConnectorId || node.connectorId,
        sqlQuery: node.sqlQuery,
        pythonCode: node.pythonCode,
        pythonOutputType: node.pythonOutputType,
        pythonResultName: node.pythonResultName,
        sqlResultName: node.sqlResultName,
        pipelineDependencies: node.pipelineDependencies || [],
        writesToDatabase: node.sqlExportTargetTableName ? true : false,
        sqlExportTargetTableName: node.sqlExportTargetTableName,
        sqlExportTargetConnectorId: node.sqlExportTargetConnectorId,
        nodeId: node.id
      } : null;

      // Search in options (handling both object keys and arrays)
      if (node.options && typeof node.options === 'object') {
        for (const key in node.options) {
          const val = node.options[key];
          const newAncestors = nodeInfo ? [...currentAncestors, nodeInfo] : currentAncestors;

          // If the value is an array, search in each element
          if (Array.isArray(val)) {
            for (const item of val) {
              if (findPath(item, newAncestors)) {
                return true;
              }
            }
          } else {
            // Otherwise search directly
            if (findPath(val, newAncestors)) {
              return true;
            }
          }
        }
      }

      return false;
    };

    findPath(treeJson, []);
    return foundAncestors;
  }

  /**
   * Helper to flatten all nodes from the tree
   */
  private getAllNodesFromTree(treeJson: any): any[] {
    const nodes: any[] = [];
    const collect = (node: any, currentPath: string = 'root') => {
      if (!node || typeof node !== 'object') return;

      const allNames = [node.name, node.sqlResultName, node.pythonResultName].filter(Boolean) as string[];
      const nodeName = allNames[0] || node.id || 'unknown';
      const nodePath = currentPath;

      if (node.id && allNames.length > 0) {
        // Extract export config - handle both flat and nested structures
        const exportTargetTableName = node.sqlExportTargetTableName || node.sqlExportAction?.targetTableName;
        const exportTargetConnectorId = node.sqlExportTargetConnectorId || node.sqlExportAction?.targetConnectorId;
        const hasExportConfig = !!(exportTargetTableName && exportTargetConnectorId);

        nodes.push({
          ...node,
          name: allNames[0],
          allNames,
          nodePath, // Track the path to this node
          // IMPORTANT: Final robust classification
          // 1. If it's a CHART, it MUST be Python
          // 2. If it has a SQL query, it MUST be SQL
          // 3. Otherwise, check for Python code/result name
          // CRITICAL: If has sqlQuery, ALWAYS treat as SQL (even if pythonOutputType=chart)
          // Charts don't produce table data, so children can't use them. SQL provides data.
          isPython: node.sqlQuery ? false : !!(node.pythonCode || node.pythonResultName || node.pythonOutputType),
          connectorId: node.pythonConnectorId || node.sqlConnectorId || node.connectorId,
          // Ensure export fields are always present and correct
          writesToDatabase: hasExportConfig,
          sqlExportTargetTableName: exportTargetTableName,
          sqlExportTargetConnectorId: exportTargetConnectorId,
        });

        if (allNames[0] === 'HR2') {
          logger.log(`[DEBUG HR2] Node properties: isPython=${nodes[nodes.length - 1].isPython}, sqlQuery=${!!node.sqlQuery}, pythonCode=${!!node.pythonCode}, pythonResultName=${node.pythonResultName}, pythonOutputType=${node.pythonOutputType}, nodePath=${nodePath}`);
        }
      }

      if (node.options && typeof node.options === 'object') {
        for (const key in node.options) {
          const val = node.options[key];
          const childPath = `${nodePath} > ${key}`;
          if (Array.isArray(val)) {
            val.forEach((item, idx) => collect(item, `${childPath}[${idx}]`));
          } else {
            collect(val, childPath);
          }
        }
      }
    };
    collect(treeJson);
    return nodes;
  }

  private async executeEmailSend(config: ScheduledTaskConfig): Promise<TaskExecutionResult> {
    // SIMPLIFIED: Load LIVE data from tree instead of using snapshots
    logger.log(`[EmailSend] Loading LIVE tree data for task execution`);

    const { treeId, nodeId, nodePath, to, cc, bcc, subject, body, connectorId } = config;

    if (!connectorId) return { success: false, error: "Missing SMTP Connector ID" };
    if (!treeId) return { success: false, error: "Missing treeId" };

    // 1. Load LIVE tree from database
    const tree = await db.tree.findUnique({ where: { id: treeId } });
    if (!tree) return { success: false, error: "Tree not found" };

    const treeJson = JSON.parse(tree.jsonDecisionTree);

    // 2. Find the email node (Test) match
    let emailNode = this.findNodeByPath(treeJson, nodePath || '');
    if (!emailNode && nodeId) {
      logger.log(`[EmailSend] Path-based search failed, trying nodeId: ${nodeId}`);
      emailNode = this.findNodeById(treeJson, nodeId);
    }
    if (!emailNode) return { success: false, error: "Email node not found in tree" };

    // Support nested emailAction structure
    const emailAction = emailNode.emailAction || {};
    const emailConfig = {
      to: emailAction.to || emailNode.to || to || '',
      cc: emailAction.cc || emailNode.cc || cc || '',
      bcc: emailAction.bcc || emailNode.bcc || bcc || '',
      subject: emailAction.subject || emailNode.subject || subject || '',
      body: emailAction.body || emailNode.body || emailNode.emailBody || body || '',
      connectorId: emailAction.connectorId || emailNode.connectorId || connectorId || '',
      attachments: emailAction.attachments || {
        tablesInBody: emailNode.selectedTables || [],
        tablesAsExcel: emailNode.selectedTablesAsExcel || [],
        pythonOutputsInBody: emailNode.selectedPythonOutputs || [],
        pythonOutputsAsAttachment: emailNode.selectedPythonOutputsAsAttachment || [],
        mediaAsAttachment: emailNode.mediaAsAttachment || []
      }
    };

    logger.log(`[EmailSend] Found email node: ${emailNode.question || emailNode.name || emailNode.id}`);

    // Extract selections and placeholders early for discovery
    const emailAttachments = emailConfig.attachments;
    const tablesInBody = emailAttachments.tablesInBody || [];
    const tablesAsExcel = emailAttachments.tablesAsExcel || [];
    const pythonOutputsInBody = emailAttachments.pythonOutputsInBody || [];
    const pythonOutputsAsAttachment = emailAttachments.pythonOutputsAsAttachment || [];

    // Extract placeholder references from email body
    const bodyContent = emailConfig.body;
    const placeholderTableNames = (bodyContent.match(/\{\{TABELLA:([^}]+)\}\}/g) || []).map((m: string) => m.replace(/\{\{TABELLA:|\}\}/g, ''));
    const placeholderChartNames = (bodyContent.match(/\{\{GRAFICO:([^}]+)\}\}/g) || []).map((m: string) => m.replace(/\{\{GRAFICO:|\}\}/g, ''));
    const placeholderVarNames = (bodyContent.match(/\{\{VARIABILE:([^}]+)\}\}/g) || []).map((m: string) => m.replace(/\{\{VARIABILE:|\}\}/g, ''));

    // 3. IDENTIFY ALL REQUIRED NODES (Global Discovery)
    const allReferencedPythonNames = [...placeholderChartNames, ...placeholderVarNames, ...pythonOutputsInBody, ...pythonOutputsAsAttachment];
    const allReferencedSqlNames = [...placeholderTableNames, ...tablesInBody, ...tablesAsExcel];
    const allRequiredNames = Array.from(new Set([...allReferencedPythonNames, ...allReferencedSqlNames]));

    logger.log(`[EmailSend] Identified ${allRequiredNames.length} required names: ${allRequiredNames.join(', ')}`);

    // Get all potential nodes from the tree
    const globalNodes = this.getAllNodesFromTree(treeJson);
    logger.log(`[EmailSend] Flattened tree into ${globalNodes.length} named nodes. Available names: ${globalNodes.map(n => n.allNames.join('|')).join(', ')}`);

    // 4. FOR EMAIL TASKS: EXECUTE ALL TREE NODES (like the UI button does)
    // This ensures all data is fresh, including nodes that might not be in explicit pipelineDependencies
    // This mirrors exactly what happens when you press the "Send Email" button in the UI
    logger.log(`[EmailSend] Email task will execute ALL ${globalNodes.length} tree nodes to ensure fresh data`);

    const availableInputTables = globalNodes;
    logger.log(`[EmailSend] Total nodes to execute: ${availableInputTables.length} (${availableInputTables.map(n => n.name).join(', ')})`);

    // 6. Execute ALL ancestors to refresh data (like UI's executeFullPipeline)
    const { results: ancestorResults, pipelineReport } = await this.executeAncestorChain(availableInputTables, undefined, true, treeId);
    logger.log(`[EmailSend] Ancestor chain completed with ${Object.keys(ancestorResults).length} results and ${pipelineReport.length} report entries`);

    // 5. PREFER saved config if available (from taskConfigProvider snapshot)
    // This is more reliable than re-discovering from tree since the UI already computed these correctly
    let selectedTables: any[] = [];
    let selectedPythonOutputs: any[] = [];

    if (Array.isArray((config as any).selectedTables) && (config as any).selectedTables.length > 0) {
      logger.log(`[EmailSend] Using saved config.selectedTables (${(config as any).selectedTables.length} items)`);
      selectedTables = (config as any).selectedTables;
    }

    if (Array.isArray((config as any).selectedPythonOutputs) && (config as any).selectedPythonOutputs.length > 0) {
      logger.log(`[EmailSend] Using saved config.selectedPythonOutputs (${(config as any).selectedPythonOutputs.length} items)`);
      selectedPythonOutputs = (config as any).selectedPythonOutputs;
    }

    // Only re-discover from tree if saved config arrays are empty
    if (selectedTables.length === 0 && selectedPythonOutputs.length === 0) {
      logger.log(`[EmailSend] No saved config, falling back to tree discovery`);
      logger.log(`[EmailSend] Matching SQL tables. Placeholders in body: ${JSON.stringify(placeholderTableNames)}`);
      for (const table of availableInputTables) {
        if (table.isPython) {
          logger.log(`[EmailSend] Skipping Python node during SQL phase: ${table.name}`);
          continue; // Skip Python outputs
        }

        // Check if ANY of the node's names match the SQL-specific placeholders
        // NOTE: placeholderChartNames and placeholderVarNames are Python outputs, NOT SQL tables
        const names = table.allNames || [table.name];
        const inBody = (tablesInBody || []).some((n: string) => names.includes(n)) ||
          placeholderTableNames.some((n: string) => names.includes(n));
        const asExcel = (tablesAsExcel || []).some((n: string) => names.includes(n));
        logger.log(`[EmailSend] SQL Table ${table.name} (Alternatives: ${names.join(',')}): inBody=${inBody}, asExcel=${asExcel}`);

        if (inBody || asExcel) {
          // Use the matched alias name so it matches {{TABELLA:name}} placeholders in email body
          const matchedName = (tablesInBody || []).find((n: string) => names.includes(n)) ||
            placeholderTableNames.find((n: string) => names.includes(n)) ||
            (tablesAsExcel || []).find((n: string) => names.includes(n)) ||
            table.name;
          if (!selectedTables.some(t => t.name === matchedName)) {
            selectedTables.push({
              name: matchedName,
              query: table.sqlQuery || `SELECT * FROM ${table.name}`,
              inBody,
              asExcel,
              pipelineDependencies: table.pipelineDependencies
            });
          }
        }
      }

      // 7. Build selectedPythonOutputs payload
      // Include nodes that have pythonCode+pythonOutputType even if they also have sqlQuery (hybrid nodes produce both SQL data and Python charts)
      logger.log(`[EmailSend] Matching Python outputs. Placeholders in body: ${JSON.stringify(allReferencedPythonNames)}`);
      for (const pythonNode of availableInputTables.filter(t => t.isPython || (t.pythonCode && t.pythonOutputType))) {
        const names = pythonNode.allNames || [pythonNode.name];

        // Find the specific matched name from email config (prefer it over canonical name for placeholder matching)
        const matchedBodyName = allReferencedPythonNames.find((n: string) => names.includes(n)) ||
          (pythonOutputsInBody || []).find((n: string) => names.includes(n));
        const matchedAttachName = (pythonOutputsAsAttachment || []).find((n: string) => names.includes(n));

        const inBody = !!matchedBodyName;
        const asAttachment = !!matchedAttachName;
        logger.log(`[EmailSend] Python Node ${pythonNode.name} (Alternatives: ${names.join(',')}): inBody=${inBody}, asAttachment=${asAttachment}, matchedName=${matchedBodyName || matchedAttachName || 'none'}`);

        if (inBody || asAttachment) {
          // Use the matched alias name so it matches {{GRAFICO:name}} placeholders in email body
          const effectiveName = matchedBodyName || matchedAttachName || pythonNode.name;
          // Avoid duplicates (multiple nodes may share the same allName alias)
          if (!selectedPythonOutputs.some(p => p.name === effectiveName)) {
            selectedPythonOutputs.push({
              name: effectiveName,
              code: pythonNode.pythonCode,
              outputType: pythonNode.pythonOutputType || 'table',
              connectorId: pythonNode.connectorId,
              inBody,
              asAttachment,
              pipelineDependencies: pythonNode.pipelineDependencies
            });
          }
        }
      }
    }

    // 8. Infer SQL connector ID - PREFER saved config first
    let effectiveSqlConnectorId = '';

    // First check saved config (from taskConfigProvider snapshot)
    if ((config as any).sqlConnectorId) {
      effectiveSqlConnectorId = (config as any).sqlConnectorId;
      logger.log(`[EmailSend] Using saved config.sqlConnectorId: ${effectiveSqlConnectorId}`);
    }
    // Fallback to inferring from availableInputTables
    else if (selectedTables.length > 0) {
      const firstTable = availableInputTables.find(t => t.name === selectedTables[0].name);
      if (firstTable?.connectorId) {
        effectiveSqlConnectorId = firstTable.connectorId;
        logger.log(`[EmailSend] Inferred sqlConnectorId from tree: ${effectiveSqlConnectorId}`);
      }
    }

    logger.log(`[EmailSend] Sending email with ${selectedTables.length} SQL tables and ${selectedPythonOutputs.length} Python outputs`);

    // 9. Call the SAME function as UI's "Send Test Email" button
    const result = await sendTestEmailWithDataAction({
      connectorId: emailConfig.connectorId || connectorId,
      sqlConnectorId: effectiveSqlConnectorId,
      to: emailConfig.to,
      cc: emailConfig.cc,
      bcc: emailConfig.bcc,
      subject: emailConfig.subject,
      bodyHtml: bodyContent,
      selectedTables,
      selectedPythonOutputs,
      availableMedia: emailNode.media || [],
      availableLinks: emailNode.links || [],
      availableTriggers: emailNode.triggers || [],
      mediaAttachments: emailAttachments.mediaAsAttachment || [],
      preCalculatedResults: ancestorResults,
      pipelineReport,
      _bypassAuth: true
    });

    if (!result || !result.success) {
      throw new Error(result?.error || 'Email send failed');
    }

    return {
      success: true,
      message: `Email inviata a ${emailConfig.to} con ${selectedTables.length} SQL (${selectedTables.map(t => t.name).join(', ')}) e ${selectedPythonOutputs.length} Python (${selectedPythonOutputs.map(t => t.name).join(', ')})`
    };
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

    // 0. EXECUTE ANCESTORS (Full Pipeline Refresh)
    // Execute all context tables to ensure they are up to date and exported if needed
    logger.log(`[SqlNode] Starting ancestor chain execution.`);
    await this.executeAncestorChain(allContext, undefined, true, treeId);


    // 3. Execute Query
    // Explicitly cast dependencies to any[] to satisfy TS
    const result = await executeSqlPreviewAction(query, connectorIdSql, dependencies, true);
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

    // 0. EXECUTE ANCESTORS (Full Pipeline Refresh)
    logger.log(`[PythonNode] Starting ancestor chain execution.`);
    await this.executeAncestorChain(allContext, undefined, true, treeId);


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
      await this.scheduleTask(task);
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

export function calculateNextRunForTask(task: any, timezone: string, referenceDate?: Date): Date | null {
  try {
    const now = referenceDate
      ? DateTime.fromJSDate(referenceDate).setZone(timezone || 'Europe/Rome')
      : DateTime.now().setZone(timezone || 'Europe/Rome');
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
        // We use set() but we need to ensure we don't accidentally shift days if timezone offset changes roughly at midnight etc.
        // But Luxon handles setZone correctly.
        let candidate = now.set({ hour: h, minute: m, second: 0, millisecond: 0 });

        // If the candidate time is in the past for today, try tomorrow
        if (candidate <= now) {
          candidate = candidate.plus({ days: 1 });
        }
        candidates.push(candidate);
      }

      // If daysOfWeek applied to custom times (from scheduler logic):
      const daysOfWeek = task.daysOfWeek; // e.g. "1,3,5" or "*"
      if (daysOfWeek && daysOfWeek !== '*') {
        const allowedDays = daysOfWeek.split(',').map(Number);
        candidates = [];

        // Look ahead 14 days to be safe
        for (let d = 0; d < 14; d++) {
          const refDate = now.plus({ days: d });

          // Luxon weekday: 1=Mon...7=Sun.
          // Cron: 0=Sun...6=Sat.
          // Mapping:
          const cronDay = refDate.weekday % 7;

          if (!allowedDays.includes(cronDay)) continue;

          for (const timeStr of customTimes) {
            const [h, m] = timeStr.split(':').map(Number);
            const candidate = refDate.set({ hour: h, minute: m, second: 0, millisecond: 0 });

            if (candidate > now) {
              candidates.push(candidate);
            }
          }
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
      const lastRunStr = task.lastRunAt;
      const lastRun = lastRunStr ? DateTime.fromJSDate(new Date(lastRunStr)).setZone(timezone) : now;

      // If we never ran, next run is in X minutes from now? 
      // Or if it's new task, run immediately?
      // "lastRun" being 'now' if undefined means we simulate it just ran?
      // Logic: nextRun = lastRun + interval.

      nextRun = lastRun.plus({ minutes: task.intervalMinutes });

      if (nextRun <= now) {
        // Catch up
        const diff = now.diff(lastRun, 'minutes').minutes;
        // If diff is huge, we don't want to run 1000 times. We want next sync point.
        const intervalsToAdd = Math.ceil(diff / task.intervalMinutes);
        // If intervalsToAdd * interval == diff, then nextRun would be == now. 
        // We probably want strictly > now for next run?
        // Let's add 1 more if it lands exactly on now?
        // Actually typical scheduler: run if scheduled time <= now.
        // But here we return the DATE of execution.

        let multiplier = intervalsToAdd;
        // Ensure we are in future?
        if (lastRun.plus({ minutes: multiplier * task.intervalMinutes }) <= now) {
          multiplier++;
        }

        nextRun = lastRun.plus({ minutes: multiplier * task.intervalMinutes });
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
