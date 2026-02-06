
import { db } from '@/lib/db';

async function searchTreeJson() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';
    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) return;
    const treeConfig = task.config as any;
    const tree = await db.tree.findUnique({ where: { id: treeConfig.treeId } });
    if (!tree) return;

    const jsonString = tree.jsonDecisionTree;

    console.log(`Searching Tree: ${tree.name}`);

    if (jsonString.includes('PRODFIL2')) {
        console.log('✅ Found string "PRODFIL2" in JSON');
    } else {
        console.log('❌ String "PRODFIL2" NOT found in JSON');
    }

    if (jsonString.includes('Capacity')) {
        console.log('✅ Found string "Capacity" in JSON');
    } else {
        console.log('❌ String "Capacity" NOT found in JSON');
    }

    // Dump the structure to see names
    const json = JSON.parse(jsonString);
    const dumpNames = (node: any, path: string) => {
        if (!node) return;
        console.log(`Node: name="${node.name}", nodeName="${node.nodeName}", id="${node.id}"`);
        if (node.options) {
            for (const key in node.options) {
                dumpNames(node.options[key], `${path}->${key}`);
            }
        }
    };
    dumpNames(json, 'root');
}

searchTreeJson().catch(console.error).finally(() => db.$disconnect());
