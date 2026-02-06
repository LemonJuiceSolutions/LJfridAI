
import { db } from '@/lib/db';

async function inspectTaskConfigV2() {
    const taskId = 'cml9dn2z600098b6u6mncozlf'; // Mail S&OP

    console.log(`Inspecting Task: ${taskId}`);
    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) return console.error('Task not found');

    const config = task.config as any;
    const contextTables = config.contextTables || [];

    console.log(`Context Tables (${contextTables.length}):`);
    contextTables.forEach((t: any) => {
        console.log(`--------------------------------------------------`);
        console.log(`Name: ${t.name}`);
        console.log(`NodeId: ${t.nodeId || t.id}`);
        console.log(`Type: ${t.isPython ? 'Python' : 'SQL'}`);
        console.log(`ConnectorId: ${t.connectorId}`);
        console.log(`SQL Query Length: ${t.sqlQuery?.length}`);
        if (t.name === 'Prodotto' || t.name === 'PRODFIL2' || t.name === 'Consegne' || t.name === 'HR2Local' || t.name === 'Budget') {
            if (t.sqlQuery) {
                console.log(`Query Snippet: ${t.sqlQuery.substring(0, 100)}...`);
            }
        }
    });

    console.log(`--------------------------------------------------`);
}

inspectTaskConfigV2().catch(console.error).finally(() => db.$disconnect());
