
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

async function createScheduledTask() {
    const treeId = 'RzX9nFJGQUs832cLVvecO';
    const nodeId = uuidv4();
    const connectorId = 'cmkge8559000ef0a2ud9a940o'; // Mail

    // Fetch Company ID from Tree
    const tree = await db.tree.findUnique({ where: { id: treeId } });
    if (!tree || !tree.companyId) {
        console.error("Tree not found or missing companyId");
        return;
    }
    const companyId = tree.companyId;

    const config = {
        connectorId: connectorId,
        to: 'cto@progettoquid.it',
        subject: 'Live Scheduler Test (1 Minute)',
        body: 'This is a test email sent every minute by the scheduler.',
        selectedTables: [],
        selectedPythonOutputs: [],
        treeId: treeId, // Moved inside config
        nodeId: nodeId  // Moved inside config
    };

    try {
        const task = await db.scheduledTask.create({
            data: {
                name: 'TEST LIVE EMAIL (1 min)',
                type: 'EMAIL_SEND',
                scheduleType: 'interval',
                intervalMinutes: 1,
                status: 'active',
                config: config,
                // treeId: treeId,  <-- REMOVED
                // nodeId: nodeId,  <-- REMOVED
                timezone: 'Europe/Rome',
                nextRunAt: new Date(),
                companyId: companyId
            }
        });

        console.log(`Created Scheduled Task: ${task.id}`);
        console.log(`Tree: ${treeId}`);
        console.log(`Node: ${nodeId}`);
    } catch (e) {
        console.error('Error creating task:', e);
    }
}

createScheduledTask();
