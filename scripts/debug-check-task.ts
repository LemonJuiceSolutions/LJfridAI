
import { db } from '@/lib/db';

async function checkTaskStatus() {
    const taskId = 'cml9urgv30001q7nrb0x23q8o';

    const task = await db.scheduledTask.findUnique({
        where: { id: taskId },
        include: {
            executions: {
                take: 1,
                orderBy: { startedAt: 'desc' }
            }
        }
    });

    if (!task) {
        console.log("Task not found!");
        return;
    }

    console.log("=== Task Status After Fix ===");
    console.log(`Last Run: ${task.lastRunAt}`);
    console.log(`Next Run: ${task.nextRunAt}`);
    console.log(`Success Count: ${task.successCount}`);
    console.log(`Latest Exec Status: ${task.executions[0]?.status}`);
    console.log(`Latest Exec Result: ${JSON.stringify(task.executions[0]?.result)}`);
}

checkTaskStatus();
