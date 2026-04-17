
import { schedulerService } from '@/lib/scheduler/scheduler-service';

async function forceRun() {
    const taskId = 'cml9urgv30001q7nrb0x23q8o';
    console.log(`Force executing task ${taskId}...`);

    try {
        // We need to initialize the service first to ensure it loads configs if needed
        // Actually checking executeTask implementation: it loads task from DB.
        // So no full init needed, but let's see.

        const result = await schedulerService.executeTask(taskId);
        console.log("Execution Result:", result);
    } catch (e) {
        console.error("Force Run Error:", e);
    }
}

forceRun();
