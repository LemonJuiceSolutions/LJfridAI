
import { SchedulerService } from '@/lib/scheduler/scheduler-service';

export async function registerNode() {
    // If an external scheduler service is configured, skip the in-process scheduler.
    // The standalone scheduler-service/ process handles all task execution,
    // keeping the Next.js server free from long-running background work.
    if (process.env.SCHEDULER_SERVICE_URL) {
        console.log(`[INSTRUMENTATION] External scheduler detected at ${process.env.SCHEDULER_SERVICE_URL}. Skipping in-process scheduler init.`);
        return;
    }

    console.log('[INSTRUMENTATION] Registering Scheduler Service (Node.js)...');
    try {
        const scheduler = SchedulerService.getInstance();
        await scheduler.init();
        console.log('[INSTRUMENTATION] Scheduler Service initialized.');
    } catch (error) {
        console.error('[INSTRUMENTATION] Failed to initialize Scheduler:', error);
    }
}
