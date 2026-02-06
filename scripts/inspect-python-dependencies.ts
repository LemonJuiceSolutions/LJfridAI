
import { db } from '@/lib/db';

async function inspectPythonDependencies() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';
    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) return;

    const config = task.config as any;
    const contextTables = config.contextTables || [];

    // Find the failing Python nodes
    // Note: Names might be tricky, checking by partial match or just dumping all Python nodes
    const pythonNodes = contextTables.filter((t: any) => t.isPython);

    console.log(`Found ${pythonNodes.length} Python nodes in Task Config.`);

    pythonNodes.forEach((node: any) => {
        console.log(`\nNode: ${node.name}`);
        console.log(`ID: ${node.nodeId || node.id}`);
        // Dependencies
        const deps = node.pipelineDependencies || [];
        console.log(`Dependencies: ${JSON.stringify(deps)}`);

        // Check for missing ones
        if (node.name.includes('Gantt') || node.name.includes('Capacity')) {
            const hasProdFil2 = deps.some((d: any) => d.tableName === 'PRODFIL2');
            console.log(`  -> Depends on PRODFIL2? ${hasProdFil2 ? 'YES' : 'NO'}`);
        }
        if (node.name.includes('BDG')) {
            const hasFatturato = deps.some((d: any) => d.tableName === 'Fatturato');
            console.log(`  -> Depends on Fatturato? ${hasFatturato ? 'YES' : 'NO'}`);
        }
    });
}

inspectPythonDependencies().catch(console.error).finally(() => db.$disconnect());
