
import { db } from '@/lib/db';

async function fixMailSop() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';

    const task = await db.scheduledTask.findUnique({
        where: { id: taskId }
    });

    if (!task) {
        console.log("Task not found!");
        return;
    }

    const config = task.config as any;
    if (config.customTimes) {
        console.log("Removing customTimes...");
        delete config.customTimes;

        await db.scheduledTask.update({
            where: { id: taskId },
            data: {
                config: config,
                nextRunAt: new Date(), // Reset to run now
                status: 'active',
                failureCount: 0
            }
        });
        console.log("✅ Fixed: Removed customTimes and reset nextRunAt.");
    } else {
        console.log("customTimes already removed.");
    }
}

fixMailSop();
