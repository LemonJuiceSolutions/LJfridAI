
import { db } from '@/lib/db';

async function inspectCodeLocation() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';
    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) return;
    const treeConfig = task.config as any;
    const tree = await db.tree.findUnique({ where: { id: treeConfig.treeId } });
    if (!tree) return;

    const json = JSON.parse(tree.jsonDecisionTree);

    const searchString = 'df_cap_src = PRODFIL2';

    const traverse = (node: any, path: string) => {
        if (!node) return;

        const str = JSON.stringify(node);
        if (str.includes(searchString)) {
            // It's in this branch.
            // Is it in this NODE directly?
            if (node.pythonCode && node.pythonCode.includes(searchString)) {
                console.log(`\n!!! FOUND CODE IN NODE !!!`);
                console.log(`Path: ${path}`);
                console.log(`ID: ${node.id}`);
                console.log(`Keys: ${Object.keys(node).join(', ')}`);
                return;
            }
            // maybe in options?
        }

        if (node.options) {
            for (const key in node.options) {
                traverse(node.options[key], `${path}->${key}`);
            }
        }
    };

    traverse(json, 'root');
}

inspectCodeLocation().catch(console.error).finally(() => db.$disconnect());
