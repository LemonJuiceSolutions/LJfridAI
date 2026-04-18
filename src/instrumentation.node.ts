
import { SchedulerService } from '@/lib/scheduler/scheduler-service';

export async function registerNode() {
    // If an external scheduler service is configured, skip the in-process scheduler.
    // The standalone scheduler-service/ process handles all task execution,
    // keeping the Next.js server free from long-running background work.
    if (process.env.SCHEDULER_SERVICE_URL) {
        console.log(`[INSTRUMENTATION] External scheduler detected at ${process.env.SCHEDULER_SERVICE_URL}. Skipping in-process scheduler init.`);
        return;
    }

    // Fire-and-forget scheduler init so request handlers (pages, APIs) do NOT
    // wait on task loading, cron registration, and auto-recovery — these can
    // take tens of seconds with many tasks. registerNode() must return fast,
    // otherwise Next.js delays serving the first request and the whole app
    // appears frozen except for the scheduler page.
    console.log('[INSTRUMENTATION] Scheduler init dispatched asynchronously');
    const scheduler = SchedulerService.getInstance();
    scheduler.init()
        .then(() => console.log('[INSTRUMENTATION] Scheduler Service initialized.'))
        .catch((error) => console.error('[INSTRUMENTATION] Failed to initialize Scheduler:', error));
}
