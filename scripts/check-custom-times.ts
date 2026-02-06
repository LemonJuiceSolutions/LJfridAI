
import { db } from '@/lib/db';

async function checkCustomTimes() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';

    const task = await db.scheduledTask.findUnique({
        where: { id: taskId }
    });

    if (!task) {
        console.log("Task not found!");
        return;
    }

    const config = task.config as any;
    console.log("=== Config Check ===");
    console.log("Schedule Type:", task.scheduleType);
    console.log("Interval Minutes:", task.intervalMinutes);
    console.log("Has customTimes in config?", !!config.customTimes);
    if (config.customTimes) {
        console.log("Custom Times Values:", JSON.stringify(config.customTimes));
    }
}

checkCustomTimes();
