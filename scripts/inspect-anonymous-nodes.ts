
import { db } from '@/lib/db';

async function inspectAnonymousNodes() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';
    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) return;
    const treeConfig = task.config as any;
    const tree = await db.tree.findUnique({ where: { id: treeConfig.treeId } });
    if (!tree) return;

    const json = JSON.parse(tree.jsonDecisionTree);

    const findAndDump = (node: any, path: string) => {
        if (!node) return;

        // Direct check for properties to be precise
        if (node.sqlResultName === 'PRODFIL2') {
            console.log(`\n✅ FOUND PRODFIL2 NODE at ${path}`);
            console.log(JSON.stringify(node, null, 2));
        }

        if (node.pythonResultName && node.pythonResultName.includes('Capacity')) {
            console.log(`\n✅ FOUND GANTT NODE at ${path}`);
            console.log(JSON.stringify(node, null, 2));
        }

        if (node.options) {
            for (const key in node.options) {
                findAndDump(node.options[key], `${path}->${key}`);
            }
        }
    };

    findAndDump(json, 'root');
}

inspectAnonymousNodes().catch(console.error).finally(() => db.$disconnect());
