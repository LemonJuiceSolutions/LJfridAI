
import { db } from '@/lib/db';
import { calculateNextRunForTask } from '@/lib/scheduler/scheduler-service';
import { DateTime } from 'luxon';

async function diagnoseNextRun() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';
    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });

    if (!task) return;

    const now = new Date();
    console.log("Current Time (System):", now.toISOString(), now.toLocaleString());

    // Recalculate what it SHOULD be
    const calculatedNext = calculateNextRunForTask(task, task.timezone || 'Europe/Rome');

    console.log("Calculated Next Run:", calculatedNext?.toISOString(), calculatedNext?.toLocaleString());

    // If calculated is very different from DB, why?
    // Maybe db has "lastRunAt" which affects calculation?
    if (task.lastRunAt) {
        console.log("Last Run DB:", task.lastRunAt.toISOString());
    }

    // Force update if needed?
    // If I reset it to NOW, it should run.
}

diagnoseNextRun();
