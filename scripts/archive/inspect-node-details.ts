
import { db } from '@/lib/db';

async function inspectNodeDetails() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';
    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) return;

    const treeConfig = task.config as any;
    const tree = await db.tree.findUnique({ where: { id: treeConfig.treeId } });
    if (!tree) return;

    const json = JSON.parse(tree.jsonDecisionTree);

    const findNode = (node: any, name: string): unknown => {
        if (!node) return null;
        if (node.name === name || node.id === name || node.question === name || node.nodeName === name) return node;
        if (node.options) {
            for (const key in node.options) {
                const found = findNode(node.options[key], name);
                if (found) return found;
            }
        }
        return null;
    };

    const node = findNode(json, 'Gantt - Capacity - Sum') || findNode(json, 'Gantt vs Capacity');
    console.log('Target Node properties:');
    console.log(JSON.stringify(node, null, 2));
}

inspectNodeDetails().catch(console.error).finally(() => db.$disconnect());
