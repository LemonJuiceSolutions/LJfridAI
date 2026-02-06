
import { db } from '@/lib/db';

async function grepJsonString() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';
    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) return;
    const treeConfig = task.config as any;
    const tree = await db.tree.findUnique({ where: { id: treeConfig.treeId } });
    if (!tree) return;

    const jsonString = tree.jsonDecisionTree;

    const idx = jsonString.indexOf('PRODFIL2');
    if (idx !== -1) {
        const start = Math.max(0, idx - 200);
        const end = Math.min(jsonString.length, idx + 200);
        console.log('--- CONTEXT FOR PRODFIL2 ---');
        console.log(jsonString.substring(start, end));
        console.log('----------------------------');
    } else {
        console.log('PRODFIL2 not found');
    }

    const idx2 = jsonString.indexOf('Capacity');
    if (idx2 !== -1) {
        const start = Math.max(0, idx2 - 500); // More context for Python code
        const end = Math.min(jsonString.length, idx2 + 500);
        console.log('--- CONTEXT FOR CAPACITY ---');
        console.log(jsonString.substring(start, end));
        console.log('----------------------------');
    }
}

grepJsonString().catch(console.error).finally(() => db.$disconnect());
