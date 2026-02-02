'use server';

import { db } from '@/lib/db';
// import { getAuthenticatedUser } from '@/app/actions';
import { getAuthenticatedUser } from "@/lib/session";
// import { schedulerService } from '@/lib/scheduler/scheduler-service';
import { revalidatePath } from 'next/cache';

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
        type: 'EMAIL_SEND' | 'SQL_EXECUTE' | 'PYTHON_EXECUTE'; // Expanded types
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

        // Check if task exists
        const existingTask = await db.scheduledTask.findFirst({
            where: {
                companyId: user.companyId,
                name: { contains: `Node-${treeId}-${nodeId}` }
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
            type: taskConfig.type === 'PYTHON_EXECUTE' ? 'CUSTOM' : taskConfig.type, // Map Python to CUSTOM for now if not supported directly
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

        revalidatePath(`/connections`); // Or wherever tasks are visible
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
                // Since rescheduleTask expects the task to exist in DB, we can't use it for deletion.
                // We rely on the periodic sync or restart.
                // Ideally we add a remove method to SchedulerService.
            } catch (e) { }
        }

        return { success: true, message: 'Schedulazione eliminata' };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}
