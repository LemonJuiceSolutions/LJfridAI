
import { SchedulerService } from '@/lib/scheduler/scheduler-service';

export async function registerNode() {
    console.log('[INSTRUMENTATION] Registering Scheduler Service (Node.js)...');
    try {
        const scheduler = SchedulerService.getInstance();
        await scheduler.init();
        console.log('[INSTRUMENTATION] Scheduler Service initialized.');
    } catch (error) {
        console.error('[INSTRUMENTATION] Failed to initialize Scheduler:', error);
    }
}
