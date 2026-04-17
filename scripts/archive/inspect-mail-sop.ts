
import { db } from '@/lib/db';

async function inspectTask() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';

    const task = await db.scheduledTask.findUnique({
        where: { id: taskId }
    });

    if (!task) {
        console.log("Task not found!");
        return;
    }

    // Config details
    const config = task.config as any;
    console.log("FULL CONFIG:", JSON.stringify(config, null, 2));
}

inspectTask();
