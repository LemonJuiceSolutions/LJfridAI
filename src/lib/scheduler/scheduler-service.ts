

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
          successCount: result.success ? { increment: 1 } : undefined,
          failureCount: result.success ? 0 : { increment: 1 },
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
    // Optional: filter to only execute ancestors of specific nodes.
    // If null/empty, executes all in contextTables (safer for full context refresh)
    targetNodeNames?: string[],
    _bypassAuth: boolean = true // Added bypass flag
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    const pipelineReport: Array<{ name: string, type: string, status: 'success' | 'error' | 'skipped', error?: string, timestamp: string }> = [];
    if (!contextTables || contextTables.length === 0) return { results, pipelineReport };

    // 1. Build Dependency Graph
    const graph = new Map<string, string[]>();
    contextTables.forEach(t => {
      // Direct dependencies
      const deps = (t.pipelineDependencies || []).map((d: any) => d.tableName);
      graph.set(t.name, deps);
    });

    // 2. Radiological Sort (Topological)
    const visited = new Set<string>();
    const sorted: string[] = [];
    const visiting = new Set<string>(); // Cycle detection

    const visit = (node: string) => {
      if (visited.has(node)) return;
      if (visiting.has(node)) return; // Cycle detected, skip

      visiting.add(node);
      const deps = graph.get(node) || [];
      deps.forEach(d => visit(d));
      visiting.delete(node);
      visited.add(node);
      sorted.push(node);
    };

    contextTables.forEach(t => visit(t.name));

    // 3. Execute in Order
    for (const tableName of sorted) {
      const tableDef = contextTables.find(t => t.name === tableName);
      if (!tableDef) continue;

      // Skip if it doesn't have execution logic
      const hasLogic = (tableDef.isPython && tableDef.pythonCode) || (!tableDef.isPython && tableDef.sqlQuery);
      if (!hasLogic) continue;

      // Skip if explicitly excluded (not in target ancestors) - optimization
      // For now, we execute all in contextTables to be safe and mimicking "Full Refresh"

      logger.log(`[AncestorChain] Executing ancestor: ${tableName} (${tableDef.isPython ? 'Python' : 'SQL'})`);

      try {
        let resultData: any = null;

        // A. EXECUTE
        if (tableDef.isPython && tableDef.pythonCode) {
          // Prepare dependencies from RESULTS
          const deps = (tableDef.pipelineDependencies || []).map((d: any) => {
            // If we have a result for this dep, pass it?
            // executePythonPreviewAction expects dependencies definitions, not data directly?
            // Actually, executePythonPreviewAction in backend fetches data if it's a "pipeline" dependency type.
            // But if we already have data, we should probably pass it or let the action fetch it efficiently.
            // The action signature: (code, mode, vars, dependencies, connectorId)
            // 'dependencies' arg is definitions. The action will re-execute them?
            // NO. executePythonPreviewAction re-executes dependencies unless...
            // Wait, executePythonPreviewAction DOES recursive execution?
            // Checking 'executePythonPreviewAction' source would be good. 
            // But if it does, why do we need this chain?
            // 'executePythonPreviewAction' usually executes the provided dependencies. 
            // IF those dependencies are Python, it executes them.
            // IF those dependencies are SQL, it executes them.
            // BUT it doesn't handle "Write to Database" for them.

            return {
              tableName: d.tableName,
              query: d.query,
              isPython: d.isPython,
              pythonCode: d.pythonCode,
              connectorId: d.connectorId,
              pipelineDependencies: d.pipelineDependencies
            };
          });

          const res = await executePythonPreviewAction(
            tableDef.pythonCode,
            tableDef.pythonOutputType || 'table',
            {},
            deps,
            tableDef.connectorId,
            _bypassAuth
          );
          if (res.success) {
            if (tableDef.pythonOutputType === 'chart') {
              // Capture detailed chart results
              resultData = {
                type: 'chart',
                name: tableName,
                chartBase64: res.chartBase64,
                chartHtml: res.chartHtml,
                rechartsConfig: res.rechartsConfig,
                rechartsData: res.rechartsData,
                stdout: res.stdout
              };
            } else if (res.data) {
              resultData = res.data;
            } else if (res.variables) {
              resultData = res.variables;
            }
          } else {
            logger.error(`[AncestorChain] Error executing Python node ${tableName}: ${res.error}`);
          }
        } else if (tableDef.sqlQuery) {
          // SQL
          // Dependencies
          const deps = (tableDef.pipelineDependencies || []).map((d: any) => ({
            tableName: d.tableName,
            query: d.query,
            isPython: d.isPython,
            pythonCode: d.pythonCode,
            connectorId: d.connectorId
          }));

          const res = await executeSqlPreviewAction(
            tableDef.sqlQuery,
            tableDef.connectorId,
            deps,
            _bypassAuth
          );
          if (res.error) {
            logger.error(`[AncestorChain] Error executing SQL node ${tableName}: ${res.error}`);
          } else {
            resultData = res.data;
          }
        }

        if (resultData) {
          // Store under primary name
          results[tableName] = resultData;
          // Also store under all alternative names for lookup by placeholder
          const allNames = tableDef.allNames || [tableName];
          for (const altName of allNames) {
            if (altName !== tableName) {
              results[altName] = resultData;
            }
          }
          pipelineReport.push({ name: tableName, type: tableDef.isPython ? 'Python' : 'SQL', status: 'success', timestamp: new Date().toISOString() });
        } else {
          pipelineReport.push({ name: tableName, type: tableDef.isPython ? 'Python' : 'SQL', status: 'skipped', timestamp: new Date().toISOString() });
        }

        // B. WRITE TO DATABASE (The Missing Piece!)
        if (tableDef.writesToDatabase && tableDef.sqlExportConfig) {
          const { targetConnectorId, targetTableName } = tableDef.sqlExportConfig;
          if (targetConnectorId && targetTableName && resultData) {
            logger.log(`[AncestorChain] Writing ${tableName} to ${targetTableName}`);
            // Ensure data is array
            const dataArr = Array.isArray(resultData) ? resultData : [resultData];
            if (dataArr.length > 0) {
              await exportTableToSqlAction(
                targetConnectorId,
                targetTableName,
                dataArr,
                true // overwrite
              );
            }
          }
        }

      } catch (e: any) {
        logger.error(`[AncestorChain] Exception executing ${tableName}: ${e.message}`);
        pipelineReport.push({ name: tableName, type: tableDef.isPython ? 'Python' : 'SQL', status: 'error', error: e.message, timestamp: new Date().toISOString() });
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
          connectorId: current.sqlConnectorId || current.connectorId,
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
        isPython: !!node.pythonCode,
        connectorId: node.sqlConnectorId || node.connectorId,
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
    const collect = (node: any) => {
      if (!node || typeof node !== 'object') return;

      const allNames = [node.name, node.sqlResultName, node.pythonResultName].filter(Boolean) as string[];
      if (node.id && allNames.length > 0) {
        nodes.push({
          ...node,
          name: allNames[0],
          allNames,
          isPython: !!(node.pythonCode || node.pythonResultName)
        });
      }

      if (node.options && typeof node.options === 'object') {
        for (const key in node.options) {
          const val = node.options[key];
          if (Array.isArray(val)) {
            val.forEach(item => collect(item));
          } else {
            collect(val);
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

    // Map names to actual node objects (CASE-INSENSITIVE)
    const normalizedRequiredNames = allRequiredNames.map(n => n.toLowerCase().trim());
    const directlyRequiredNodes = globalNodes.filter(node =>
      node.allNames.some((name: string) => normalizedRequiredNames.includes(name.toLowerCase().trim()))
    );

    logger.log(`[EmailSend] Matched ${directlyRequiredNodes.length} directly required nodes: ${directlyRequiredNodes.map(n => n.name).join(', ')}`);

    // If the email node itself is a data producer, add it
    const emailNodeNames = [emailNode.name, emailNode.sqlResultName, emailNode.pythonResultName].filter(Boolean) as string[];
    if (emailNodeNames.length > 0 && !directlyRequiredNodes.some(n => n.id === emailNode.id)) {
      directlyRequiredNodes.push({
        ...emailNode,
        name: emailNodeNames[0],
        allNames: emailNodeNames
      });
    }

    logger.log(`[EmailSend] Matched ${directlyRequiredNodes.length} total entry points in the tree`);

    // 4. TRANSITIVE DEPENDENCY RESOLUTION
    const nodesToExecuteMap = new Map<string, any>();

    const resolveDeps = (node: any) => {
      if (nodesToExecuteMap.has(node.id)) return;
      nodesToExecuteMap.set(node.id, node);

      const deps = node.pipelineDependencies || [];
      for (const dep of deps) {
        // Find the node providing this dependency (by name)
        const depNode = globalNodes.find(n => n.allNames.includes(dep.tableName));
        if (depNode) {
          resolveDeps(depNode);
        }
      }
    };

    directlyRequiredNodes.forEach(node => resolveDeps(node));
    const availableInputTables = Array.from(nodesToExecuteMap.values());

    logger.log(`[EmailSend] Resolved transitive dependencies: ${availableInputTables.length} total nodes to execute (${availableInputTables.map(n => n.name).join(', ')})`);

    logger.log(`[EmailSend] Found ${availableInputTables.length} available nodes (including target)`);

    // 4. Execute ALL ancestors to refresh data (like UI's executeFullPipeline)
    const { results: ancestorResults, pipelineReport } = await this.executeAncestorChain(availableInputTables, undefined, true);
    logger.log(`[EmailSend] Ancestor chain completed with ${Object.keys(ancestorResults).length} results and ${pipelineReport.length} report entries`);

    // 5. Selected data is already extracted above
    const selectedTables: any[] = [];
    logger.log(`[EmailSend] Matching SQL tables. Placeholders in body: ${JSON.stringify(placeholderTableNames)}`);
    for (const table of availableInputTables) {
      if (table.isPython) {
        logger.log(`[EmailSend] Skipping Python node during SQL phase: ${table.name}`);
        continue; // Skip Python outputs
      }

      // Check if ANY of the node's names match the placeholders (Inclusive of all types for SQL nodes)
      const names = table.allNames || [table.name];
      const inBody = (tablesInBody || []).some((n: string) => names.includes(n)) ||
        placeholderTableNames.some((n: string) => names.includes(n)) ||
        placeholderChartNames.some((n: string) => names.includes(n)) ||
        placeholderVarNames.some((n: string) => names.includes(n));
      const asExcel = (tablesAsExcel || []).some((n: string) => names.includes(n));
      logger.log(`[EmailSend] SQL Table ${table.name} (Alternatives: ${names.join(',')}): inBody=${inBody}, asExcel=${asExcel}`);

      if (inBody || asExcel) {
        selectedTables.push({
          name: table.name,
          query: table.sqlQuery || `SELECT * FROM ${table.name}`,
          inBody,
          asExcel,
          pipelineDependencies: table.pipelineDependencies
        });
      }
    }

    // 7. Build selectedPythonOutputs payload
    const selectedPythonOutputs: any[] = [];
    logger.log(`[EmailSend] Matching Python outputs. Placeholders in body: ${JSON.stringify(allReferencedPythonNames)}`);
    for (const pythonNode of availableInputTables.filter(t => t.isPython)) {
      const names = pythonNode.allNames || [pythonNode.name];
      const inBody = (pythonOutputsInBody || []).some((n: string) => names.includes(n)) || allReferencedPythonNames.some((n: string) => names.includes(n));
      const asAttachment = (pythonOutputsAsAttachment || []).some((n: string) => names.includes(n));
      logger.log(`[EmailSend] Python Node ${pythonNode.name} (Alternatives: ${names.join(',')}): inBody=${inBody}, asAttachment=${asAttachment}`);

      if (inBody || asAttachment) {
        selectedPythonOutputs.push({
          name: pythonNode.name,
          code: pythonNode.pythonCode,
          outputType: pythonNode.pythonOutputType || 'table',
          connectorId: pythonNode.connectorId,
          inBody,
          asAttachment,
          pipelineDependencies: pythonNode.pipelineDependencies
        });
      }
    }

    // 8. Infer SQL connector ID
    let effectiveSqlConnectorId = '';
    if (selectedTables.length > 0) {
      const firstTable = availableInputTables.find(t => t.name === selectedTables[0].name);
      if (firstTable?.connectorId) {
        effectiveSqlConnectorId = firstTable.connectorId;
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
    await this.executeAncestorChain(allContext, undefined, true);


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
    await this.executeAncestorChain(allContext, undefined, true);


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

