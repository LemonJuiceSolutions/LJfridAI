'use server';

import { db } from '@/lib/db';
// import { getAuthenticatedUser } from '@/app/actions';
import { getAuthenticatedUser } from "@/lib/session";
import { invalidateServerTreeCache } from '@/lib/server-cache';
// import { schedulerService } from '@/lib/scheduler/scheduler-service';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';

/**
 * Get existing schedule for a node
 */
export async function getNodeScheduleAction(treeId: string, nodeId: string) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return { success: false, message: 'Non autenticato' };
        }

        // Find task where config contains the nodeId and treeId
        // Note: We use raw query or findFirst with equals for JSON if supported, 
        // or just search by name pattern if we standardize it, e.g. "Node Schedule - [treeId] - [nodeId]"
        // Using name pattern is faster/easier for lookup
        const namePattern = `Node-${treeId}-${nodeId}`;

        const task = await db.scheduledTask.findFirst({
            where: {
                companyId: user.companyId,
                name: { contains: namePattern }
            }
        });

        if (!task) {
            return { success: true, data: null };
        }

        return { success: true, data: task };
    } catch (error: any) {
        console.error('Error fetching node schedule:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Save (create or update) a schedule for a node
 */
export async function saveNodeScheduleAction(
    treeId: string,
    nodeId: string,
    nodePath: string,
    scheduleConfig: {
        enabled: boolean;
        scheduleType: 'interval' | 'specific' | 'cron';
        cronExpression?: string;
        intervalMinutes?: number;
        daysOfWeek?: string;
        hours?: string;
        timezone?: string;
    },
    taskConfig: {
        type: 'EMAIL_SEND' | 'SQL_EXECUTE' | 'SQL_PREVIEW' | 'PYTHON_EXECUTE'; // Expanded types
        [key: string]: any;
    }
) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return { success: false, message: 'Non autenticato' };
        }

        if (!user.companyId) {
            return { success: false, message: 'Società non trovata' };
        }

        // Dynamically import scheduler service to avoid bundling node-cron on client
        const { schedulerService } = await import('@/lib/scheduler/scheduler-service');

        const name = `Node-${treeId}-${nodeId} (${taskConfig.type})`;

        // Check if task exists (exact match on full name including type)
        const existingTask = await db.scheduledTask.findFirst({
            where: {
                companyId: user.companyId,
                name: name
            }
        });

        if (!scheduleConfig.enabled) {
            // If disabled and exists, delete it (or mark inactive, but deleting keeps DB cleaner for these ad-hoc node tasks)
            if (existingTask) {
                await db.scheduledTask.delete({
                    where: { id: existingTask.id }
                });

                // Also stop it in the scheduler service
                await schedulerService.rescheduleTask(existingTask.id).catch(() => { });
            }
            return { success: true, message: 'Schedulazione rimossa' };
        }

        const taskData = {
            name,
            companyId: user.companyId,
            type: taskConfig.type === 'PYTHON_EXECUTE' ? 'CUSTOM' : taskConfig.type, // PYTHON_EXECUTE mapped to CUSTOM (scheduler handles via pythonCode in config)
            config: {
                ...taskConfig,
                treeId,
                nodeId,
                nodePath
            },
            scheduleType: scheduleConfig.scheduleType,
            cronExpression: scheduleConfig.cronExpression,
            intervalMinutes: scheduleConfig.intervalMinutes,
            daysOfWeek: scheduleConfig.daysOfWeek,
            hours: scheduleConfig.hours,
            timezone: scheduleConfig.timezone || 'Europe/Rome',
            status: 'active',
            createdBy: user.id
        };

        if (existingTask) {
            await db.scheduledTask.update({
                where: { id: existingTask.id },
                data: taskData
            });
            // Trigger reschedule in service
            try {
                await schedulerService.rescheduleTask(existingTask.id);
            } catch (e) {
                console.warn('Could not reschedule task immediately:', e);
            }
        } else {
            const newTask = await db.scheduledTask.create({
                data: taskData
            });
            // Trigger schedule
            try {
                await schedulerService.rescheduleTask(newTask.id);
            } catch (e) {
                console.warn('Could not schedule new task immediately:', e);
            }
        }

        try { revalidatePath(`/connections`); } catch { /* scheduler context has no request */ }
        return { success: true, message: 'Schedulazione salvata' };

    } catch (error: any) {
        console.error('Error saving node schedule:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Delete a node schedule
 */
export async function deleteNodeScheduleAction(treeId: string, nodeId: string) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return { success: false, message: 'Non autenticato' };
        }

        const namePattern = `Node-${treeId}-${nodeId}`;
        const task = await db.scheduledTask.findFirst({
            where: {
                companyId: user.companyId,
                name: { contains: namePattern }
            }
        });

        if (task) {
            await db.scheduledTask.delete({
                where: { id: task.id }
            });
            // Attempt to remove from runtime scheduler
            try {
                const { schedulerService } = await import('@/lib/scheduler/scheduler-service');
                await schedulerService.deleteTask(task.id);
            } catch (e) {
                console.warn('Could not stop task in memory immediately:', e);
            }
        }

        return { success: true, message: 'Schedulazione eliminata' };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}

/**
 * Get execution history for a node's task
 */
export async function getNodeExecutionHistoryAction(treeId: string, nodeId: string) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return { success: false, message: 'Non autenticato' };
        }

        const namePattern = `Node-${treeId}-${nodeId}`;
        const task = await db.scheduledTask.findFirst({
            where: {
                companyId: user.companyId,
                name: { contains: namePattern }
            }
        });

        if (!task) {
            return { success: true, data: [] };
        }

        const executions = await db.scheduledTaskExecution.findMany({
            where: {
                taskId: task.id
            },
            orderBy: {
                startedAt: 'desc'
            },
            take: 20
        });

        return { success: true, data: executions };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}

/**
 * Save execution result for a node (creates implicit task if needed)
 */
export async function saveNodeExecutionResultAction(
    treeId: string,
    nodeId: string,
    result: any,
    status: 'success' | 'failed',
    error?: string,
    executionTime?: number
) {
    try {
        // We might be running in a background job context (e.g. system scheduler), 
        // so we can't always rely on getAuthenticatedUser().
        // However, this action is 'use server', so it's callable from client or other server actions.
        // If called from a background job (e.g. cron), we might need to bypass auth check or pass a system user.
        // For now, let's try to get user, if not, use a system identifier if possible or fail if strict.
        // BUT: executeChain logic might run on server without a session if triggered by scheduler service.
        // Let's check session first.

        let user: any;
        try {
            user = await getAuthenticatedUser();
        } catch (e) {
            // If no session, we might be system. 
            // We need companyId to find the task.
            // If we don't have user, we can try to find the Tree to get the companyId.
            // This requires an extra lookup.
        }

        let companyId = user?.companyId;
        let userId = user?.id;

        if (!companyId) {
            // Find tree to get company
            const tree = await db.tree.findUnique({ where: { id: treeId } });
            if (tree) {
                companyId = tree.companyId;
            }
        }

        if (!companyId) {
            console.error('Could not determine companyId for saving execution result', { treeId, nodeId });
            return { success: false, message: 'Company ID not found' };
        }

        const namePattern = `Node-${treeId}-${nodeId}`;

        // Find or create the task
        let task = await db.scheduledTask.findFirst({
            where: {
                companyId: companyId,
                name: { contains: namePattern }
            }
        });

        if (!task) {
            // Create a new "implicit" task for this node
            task = await db.scheduledTask.create({
                data: {
                    name: `Node-${treeId}-${nodeId} (Implicit)`,
                    companyId: companyId,
                    type: 'NODE_EXECUTION', // Use custom type for these
                    config: {
                        treeId,
                        nodeId
                    },
                    status: 'active', // Active but maybe no schedule
                    scheduleType: 'manual',
                    daysOfWeek: '',
                    hours: '',
                    intervalMinutes: null,
                    cronExpression: null,
                    createdBy: userId
                }
            });
        }

        // Create execution record
        const execution = await db.scheduledTaskExecution.create({
            data: {
                taskId: task.id,
                status: status,
                startedAt: new Date(Date.now() - (executionTime || 0)), // Approximate start
                completedAt: new Date(),
                durationMs: executionTime || 0,
                result: result,
                error: error
            }
        });

        // Update task stats
        await db.scheduledTask.update({
            where: { id: task.id },
            data: {
                lastRunAt: new Date(),
                runCount: { increment: 1 },
                successCount: status === 'success' ? { increment: 1 } : undefined,
                failureCount: status === 'failed' ? { increment: 1 } : undefined,
                lastError: error || null
            }
        });

        try { revalidatePath(`/connections`); } catch { /* scheduler context has no request */ }
        return { success: true, executionId: execution.id };

    } catch (error: any) {
        console.error('Error saving node execution result:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Get the last execution result for a node
 */
export async function getLastNodeExecutionResultAction(treeId: string, nodeId: string) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return { success: false, message: 'Non autenticato' };
        }

        const namePattern = `Node-${treeId}-${nodeId}`;

        // Find the task
        const task = await db.scheduledTask.findFirst({
            where: {
                companyId: user.companyId,
                name: { contains: namePattern }
            }
        });

        if (!task) {
            return { success: true, data: null };
        }

        // Get last successful execution with a result
        const lastExecution = await db.scheduledTaskExecution.findFirst({
            where: {
                taskId: task.id,
                status: 'success',
                result: { not: Prisma.DbNull }
            },
            orderBy: {
                completedAt: 'desc'
            }
        });

        return { success: true, data: lastExecution };
    } catch (error: any) {
        console.error('Error fetching last node execution:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Batch-save ancestor previews to both tree JSON and ScheduledTaskExecution.
 * Called after executeAncestorChain (server) or executeFullPipeline (client)
 * to persist all ancestor node previews in a single tree JSON write.
 */
export async function saveAncestorPreviewsBatchAction(
    treeId: string,
    ancestorPreviews: Array<{
        nodeId: string;
        isPython: boolean;
        pythonOutputType?: string;
        result: any;
    }>
): Promise<{ success: boolean; savedCount: number }> {
    try {
        if (!treeId || !ancestorPreviews || ancestorPreviews.length === 0) {
            return { success: true, savedCount: 0 };
        }

        // Auth: try user first, fall back to tree-based company lookup
        let companyId: string | undefined;
        try {
            const user = await getAuthenticatedUser();
            companyId = user?.companyId;
        } catch { /* scheduler context - no session */ }

        // 1. Load tree JSON once
        const tree = await db.tree.findUnique({ where: { id: treeId } });
        if (!tree || !tree.jsonDecisionTree) {
            return { success: false, savedCount: 0 };
        }

        if (!companyId) {
            companyId = tree.companyId ?? undefined;
        }

        const json = JSON.parse(tree.jsonDecisionTree);

        // Recursive findNodeById (same logic as scheduler-service.ts)
        const findNodeById = (node: any, targetId: string): any => {
            if (!node || typeof node !== 'object') return null;
            if (node.id === targetId) return node;
            if (node.options && typeof node.options === 'object') {
                for (const key in node.options) {
                    const val = node.options[key];
                    if (Array.isArray(val)) {
                        for (const item of val) {
                            const found = findNodeById(item, targetId);
                            if (found) return found;
                        }
                    } else {
                        const found = findNodeById(val, targetId);
                        if (found) return found;
                    }
                }
            }
            // Also search in children arrays (alternative tree structure)
            if (node.children && Array.isArray(node.children)) {
                for (const child of node.children) {
                    const found = findNodeById(child, targetId);
                    if (found) return found;
                }
            }
            return null;
        };

        // 2. Update each ancestor's preview in the parsed JSON
        let savedCount = 0;
        const nowMs = Date.now(); // Epoch ms, same format as UI's Date.now()

        for (const preview of ancestorPreviews) {
            if (!preview.nodeId || preview.result == null) continue;

            const node = findNodeById(json, preview.nodeId);
            if (!node) continue;

            let nodeUpdated = false;
            const res = preview.result;

            // 0. AI Result: update aiConfig.lastResult
            if ((preview as any).isAi && node.aiConfig) {
                node.aiConfig.lastResult = (preview as any).aiResult;
                node.aiConfig.lastRunAt = nowMs;
                nodeUpdated = true;
            }

            // 1. SQL Preview Data (Check for array data)
            // FIX: Only write to sqlPreviewData when this is NOT a Python result on a hybrid node.
            // On hybrid nodes (both sqlQuery and pythonCode), the Python result must NOT overwrite
            // the SQL preview data, otherwise both previews show identical data.
            const isHybridNode = !!(node.sqlQuery && node.pythonCode);
            const shouldWriteSqlPreview = !preview.isPython || !isHybridNode;

            const sqlData = Array.isArray(res)
                ? res
                : (res && typeof res === 'object' && 'data' in res && Array.isArray(res.data))
                    ? res.data
                    : (res && typeof res === 'object' && 'rechartsData' in res && Array.isArray(res.rechartsData))
                        ? res.rechartsData
                        : null;

            if (sqlData && shouldWriteSqlPreview) {
                node.sqlPreviewData = sqlData;
                node.sqlPreviewTimestamp = nowMs;
                nodeUpdated = true;
            }

            // 2. Python Preview Result (Check for chart, variable, or isPython flag)
            const hasPythonChart = res && typeof res === 'object' && (res.chartBase64 || res.chartHtml || res.rechartsConfig);
            const hasPythonVariables = res && typeof res === 'object' && res.variables;

            if (preview.isPython || hasPythonChart || hasPythonVariables) {
                const outputType = preview.pythonOutputType || 'table';
                // Preserve existing plotlyStyleOverrides and plotlyJson from current node
                const existingPreview = node.pythonPreviewResult;
                const preservedFields = {
                    ...(existingPreview?.plotlyStyleOverrides ? { plotlyStyleOverrides: existingPreview.plotlyStyleOverrides } : {}),
                    ...(existingPreview?.plotlyJson && !res.plotlyJson ? { plotlyJson: existingPreview.plotlyJson } : {}),
                    ...(existingPreview?.htmlStyleOverrides ? { htmlStyleOverrides: existingPreview.htmlStyleOverrides } : {}),
                };

                if (hasPythonChart || outputType === 'chart') {
                    node.pythonPreviewResult = {
                        type: 'chart',
                        chartBase64: res.chartBase64,
                        chartHtml: res.chartHtml,
                        rechartsConfig: res.rechartsConfig,
                        rechartsData: res.rechartsData,
                        rechartsStyle: res.rechartsStyle,
                        plotlyJson: res.plotlyJson,
                        data: res.data,
                        timestamp: nowMs,
                        ...preservedFields,
                    };
                    nodeUpdated = true;
                } else if (outputType === 'html' && res.html) {
                    node.pythonPreviewResult = {
                        type: 'html',
                        html: res.html,
                        data: res.data,
                        timestamp: nowMs,
                        ...preservedFields,
                    };
                    nodeUpdated = true;
                } else if (hasPythonVariables || outputType === 'variable') {
                    node.pythonPreviewResult = {
                        type: 'variable',
                        variables: res.variables || res,
                        timestamp: nowMs,
                        ...preservedFields,
                    };
                    nodeUpdated = true;
                } else if (preview.isPython) {
                    // Pure Python table
                    const data = res?.data || (Array.isArray(res) ? res : null);
                    if (data) {
                        node.pythonPreviewResult = {
                            type: 'table',
                            data: Array.isArray(data) ? data : undefined,
                            timestamp: nowMs,
                            ...preservedFields,
                        };
                        nodeUpdated = true;
                    }
                }
            }

            // 3. Generic Execution Result (for Email, SharePoint, HubSpot, etc.)
            if (!nodeUpdated && res != null) {
                // If not already updated by SQL or Python logic, save as generic execution result
                node.executionPreviewResult = {
                    data: res,
                    timestamp: nowMs,
                };
                nodeUpdated = true;
            }

            if (nodeUpdated) savedCount++;
        }

        // 3. Save tree JSON once (only if we actually updated something)
        if (savedCount > 0) {
            await db.tree.update({
                where: { id: treeId },
                data: { jsonDecisionTree: JSON.stringify(json) }
            });
            // Invalidate server-side cache so widgets get fresh data
            invalidateServerTreeCache(treeId);
        }

        // 4. Save to ScheduledTaskExecution for each ancestor (for PipelineOutputWidget)
        for (const preview of ancestorPreviews) {
            if (!preview.nodeId || preview.result == null) continue;
            try {
                await saveNodeExecutionResultAction(
                    treeId,
                    preview.nodeId,
                    preview.result,
                    'success',
                    undefined,
                    0
                );
            } catch (err: any) {
                console.warn(`[saveAncestorPreviews] Failed to save execution for node ${preview.nodeId}:`, err.message);
            }
        }

        return { success: true, savedCount };
    } catch (error: any) {
        console.error('[saveAncestorPreviews] Error:', error);
        return { success: false, savedCount: 0 };
    }
}

/**
 * Get all schedules for a node (one per task type).
 * Returns a map keyed by task type, e.g. { EMAIL_SEND: task, SQL_PREVIEW: task }
 */
export async function getAllNodeSchedulesAction(treeId: string, nodeId: string) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return { success: false, message: 'Non autenticato', data: {} as Record<string, any> };
        }

        const namePrefix = `Node-${treeId}-${nodeId}`;

        const tasks = await db.scheduledTask.findMany({
            where: {
                companyId: user.companyId,
                name: { startsWith: namePrefix }
            }
        });

        const scheduleMap: Record<string, any> = {};
        for (const task of tasks) {
            // Extract type from name: "Node-xxx-yyy (SQL_PREVIEW)" -> "SQL_PREVIEW"
            const match = task.name.match(/\(([^)]+)\)$/);
            if (match) {
                scheduleMap[match[1]] = task;
            }
        }

        return { success: true, data: scheduleMap };
    } catch (error: any) {
        console.error('Error fetching all node schedules:', error);
        return { success: false, message: error.message, data: {} as Record<string, any> };
    }
}

/**
 * Delete a specific schedule for a node by task type
 */
export async function deleteNodeScheduleByTypeAction(treeId: string, nodeId: string, taskType: string) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return { success: false, message: 'Non autenticato' };
        }

        const name = `Node-${treeId}-${nodeId} (${taskType})`;
        const task = await db.scheduledTask.findFirst({
            where: {
                companyId: user.companyId,
                name: name
            }
        });

        if (task) {
            await db.scheduledTask.delete({
                where: { id: task.id }
            });
            // Try to stop in runtime scheduler
            try {
                const { schedulerService } = await import('@/lib/scheduler/scheduler-service');
                await schedulerService.rescheduleTask(task.id).catch(() => { });
            } catch (e) { }
        }

        return { success: true, message: 'Schedulazione eliminata' };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}


/**
 * Get ALL schedules for a tree (to display indicators in VisualTree)
 * Returns a set of nodeIds that have at least one active schedule
 */
export async function getTreeSchedulesAction(treeId: string) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return { success: false, message: 'Non autenticato', data: [] };
        }

        const namePrefix = `Node-${treeId}-`;

        const tasks = await db.scheduledTask.findMany({
            where: {
                companyId: user.companyId,
                name: { startsWith: namePrefix },
                status: 'active'
            },
            select: {
                name: true,
                config: true,
                type: true,
                scheduleType: true
            }
        });

        const scheduledNodeIds = new Set<string>();

        for (const task of tasks) {
            // diverse strategie per estrarre il nodeId
            let nodeId: string | undefined;

            // 1. Dal config (metodo più affidabile se popolato)
            if (task.config && typeof task.config === 'object' && 'nodeId' in task.config) {
                nodeId = (task.config as any).nodeId;
            }

            // 2. Dal nome (backup)
            if (!nodeId) {
                // Format: Node-{treeId}-{nodeId} ({TYPE})
                // Remove prefix
                const withoutPrefix = task.name.substring(namePrefix.length);
                // Remove suffix type part
                const typeIndex = withoutPrefix.lastIndexOf(' (');
                if (typeIndex > 0) {
                    nodeId = withoutPrefix.substring(0, typeIndex);
                } else {
                    nodeId = withoutPrefix;
                }
            }

            // Fix: Exclude implicit execution tracking tasks and manual tasks
            // We only want to show the icon if there is an actual recurring schedule
            if (nodeId && task.type !== 'NODE_EXECUTION' && task.scheduleType !== 'manual') {
                scheduledNodeIds.add(nodeId);
            }
        }

        return { success: true, data: Array.from(scheduledNodeIds) };
    } catch (error: any) {
        console.error('Error fetching tree schedules:', error);
        return { success: false, message: error.message, data: [] };
    }
}

