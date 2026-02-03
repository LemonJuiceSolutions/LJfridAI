
import { db } from './src/lib/db';

async function checkSchedulerLogs() {
    console.log('Checking recent ScheduledTaskExecution logs...');
    try {
        const executions = await db.scheduledTaskExecution.findMany({
            take: 10,
            orderBy: { startedAt: 'desc' },
            include: { task: true }
        });

        console.log(`Found ${executions.length} recent executions:`);
        executions.forEach(exec => {
            console.log(`- [${exec.status}] Task: ${exec.task.name} (Type: ${exec.task.type})`);
            console.log(`  Started: ${exec.startedAt.toLocaleString()}`);
            console.log(`  Duration: ${exec.durationMs}ms`);
            if (exec.result) console.log(`  Result: ${JSON.stringify(exec.result)}`);
            if (exec.error) console.log(`  Error: ${exec.error}`);
        });

        console.log('\nChecking ScheduledTasks with nextRunAt...');
        const tasks = await db.scheduledTask.findMany({
            where: { status: 'active' },
            select: { name: true, type: true, nextRunAt: true, lastRunAt: true, cronExpression: true }
        });
        console.log(`Found ${tasks.length} active tasks:`);
        tasks.forEach(t => {
            console.log(`- ${t.name} (${t.type})`);
            console.log(`  Next Run: ${t.nextRunAt ? t.nextRunAt.toLocaleString() : 'NULL'}`);
            console.log(`  Last Run: ${t.lastRunAt ? t.lastRunAt.toLocaleString() : 'NULL'}`);
        });

    } catch (error) {
        console.error('Error querying database:', error);
    } finally {
        await db.$disconnect();
    }
}

checkSchedulerLogs();
