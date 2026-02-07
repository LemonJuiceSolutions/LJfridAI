import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
    // Get the BDG email task
    const task = await db.scheduledTask.findFirst({
        where: {
            type: 'EMAIL_SEND',
            name: { contains: '4BbRgfc5' }  // The BDG task node ID
        }
    });

    if (!task) {
        console.log('BDG task not found');

        // List all email tasks
        const tasks = await db.scheduledTask.findMany({
            where: { type: 'EMAIL_SEND' }
        });
        console.log('Available EMAIL_SEND tasks:');
        for (const t of tasks) {
            console.log('-', t.id, t.name);
        }
        return;
    }

    const config = typeof task.config === 'string' ? JSON.parse(task.config) : task.config;

    console.log('Task:', task.name);
    console.log('TreeId:', config.treeId);
    console.log('NodeId:', config.nodeId);
    console.log('Subject:', config.subject);
    console.log();
    console.log('selectedTables:');
    for (const t of config.selectedTables || []) {
        console.log('  -', t.name);
        if (t.pipelineDependencies && t.pipelineDependencies.length > 0) {
            console.log('    Dependencies:', t.pipelineDependencies.map((d: any) => d.tableName).join(', '));
        }
    }
    console.log();
    console.log('selectedPythonOutputs:');
    for (const p of config.selectedPythonOutputs || []) {
        console.log('  -', p.name, '(', p.outputType, ')');
        if (p.pipelineDependencies && p.pipelineDependencies.length > 0) {
            console.log('    Dependencies:', p.pipelineDependencies.map((d: any) => d.tableName).join(', '));
        }
    }

    await db.$disconnect();
}

main().catch(console.error);
