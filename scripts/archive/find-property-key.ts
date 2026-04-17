
import { db } from '@/lib/db';

async function findPropertyKey() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';
    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) return;
    const treeConfig = task.config as any;
    const tree = await db.tree.findUnique({ where: { id: treeConfig.treeId } });
    if (!tree) return;

    const json = JSON.parse(tree.jsonDecisionTree);
    const search = 'df_cap_src = PRODFIL2';

    const traverse = (obj: any, path: string) => {
        if (!obj || typeof obj !== 'object') return;

        for (const key in obj) {
            const val = obj[key];
            if (typeof val === 'string' && val.includes(search)) {
                console.log(`\n!!! FOUND STRING MATCH !!!`);
                console.log(`Path: ${path}->${key}`);
                console.log(`Property Name: ${key}`);
                // Dump parent ID if possible
                console.log(`Node ID: ${obj.id}`);
            } else if (typeof val === 'object') {
                traverse(val, `${path}->${key}`);
            }
        }
    };

    traverse(json, 'root');
}

findPropertyKey().catch(console.error).finally(() => db.$disconnect());
