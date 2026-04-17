
import { db } from '@/lib/db';

async function resetTask() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';
    console.log(`Resetting task ${taskId} to run now...`);

    await db.scheduledTask.update({
        where: { id: taskId },
        data: {
            nextRunAt: new Date(),
            status: 'active', // ensure active
            failureCount: 0
        }
    });

    console.log("Task reset. It should pick up within 1 minute (if server restarted).");
}

resetTask();
