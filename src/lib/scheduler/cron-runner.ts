
export async function scheduleCronJob(expression: string, callback: () => void, options: any) {
    // Completely dynamic import to hide from Edge bundler static analysis
    // node-cron is CommonJS, so in some environments it might not have 'default'
    const cronModule = await import('node-cron');
    const cron = cronModule.default || cronModule;

    if (!cron || typeof cron.schedule !== 'function') {
        console.error('Failed to load node-cron:', cronModule);
        throw new Error('node-cron module not loaded correctly');
    }
    try {
        const job = cron.schedule(expression, callback, options);
        // console.log(`[CronRunner] Scheduled job: "${expression}"`);
        return job;
    } catch (err: any) {
        console.error(`[CronRunner] Error scheduling cron job "${expression}":`, err);
        throw err;
    }
}

// export default cron; // Cannot export default if importing dynamically
