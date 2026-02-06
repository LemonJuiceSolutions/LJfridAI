
import { db } from '@/lib/db';

async function cleanupTasks() {
    // IDs identified from previous analysis as "Virtual Test Node" or "UNKNOWN NODE"
    const tasksToDelete = [
        'cml9urgv30001q7nrb0x23q8o', // TEST LIVE EMAIL (1 min) - Virtual Test Node
        'DTg58zCYU6WVKiCttxTU8'      // Test 1min Email - UNKNOWN NODE
    ];

    console.log(`Deleting ${tasksToDelete.length} technical tasks...`);

    const result = await db.scheduledTask.deleteMany({
        where: {
            id: { in: tasksToDelete }
        }
    });

    console.log(`Deleted ${result.count} tasks.`);
}

cleanupTasks();
