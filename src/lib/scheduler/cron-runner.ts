
export async function scheduleCronJob(expression: string, callback: () => void, options: any) {
    // Completely dynamic import to hide from Edge bundler static analysis
    const cron = (await import('node-cron')).default;
    return cron.schedule(expression, callback, options);
}

// export default cron; // Cannot export default if importing dynamically
