
import { db } from '@/lib/db';

async function verifyState() {
    console.log("=== Checking Deleted Tasks ===");
    const deletedIds = ['cml9urgv30001q7nrb0x23q8o', 'DTg58zCYU6WVKiCttxTU8'];
    const deletedCheck = await db.scheduledTask.findMany({
        where: { id: { in: deletedIds } }
    });

    if (deletedCheck.length === 0) {
        console.log("✅ Technical tasks are confirmed DELETED from DB.");
    } else {
        console.log("❌ WARNING: Technical tasks STILL EXIST in DB:", deletedCheck.map(t => t.id));
    }

    console.log("\n=== Checking Mail S&OP Task ===");
    const sopId = 'cml9dn2z600098b6u6mncozlf';
    const sopTask = await db.scheduledTask.findUnique({
        where: { id: sopId },
        include: {
            executions: { take: 3, orderBy: { startedAt: 'desc' } }
        }
    });

    if (sopTask) {
        console.log(`Status: ${sopTask.status}`);
        console.log(`Next Run At: ${sopTask.nextRunAt?.toISOString()} (Local: ${sopTask.nextRunAt?.toLocaleString()})`);
        console.log(`Last Run At: ${sopTask.lastRunAt?.toISOString()}`);
        console.log(`Config Interval: ${sopTask.intervalMinutes}`);
        console.log(`Recent Executions:`);
        sopTask.executions.forEach(e => {
            console.log(`- ${e.startedAt.toISOString()} [${e.status}] Err: ${e.error}`);
        });
    } else {
        console.log("❌ Mail S&OP task NOT FOUND.");
    }
}

verifyState();
