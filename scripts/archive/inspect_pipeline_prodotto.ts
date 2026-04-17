
import { db } from '../src/lib/db';

async function main() {
    console.log(`Fetching HR tree...`);
    const tree = await db.tree.findFirst({
        where: { name: 'HR' }
    });

    if (!tree || !tree.jsonDecisionTree) {
        console.log('HR Tree not found');
        return;
    }

    const treeJson = JSON.parse(tree.jsonDecisionTree);

    const traverse = (node: any, keyName: string) => {
        if (!node) return;

        if (keyName === 'Pipeline Prodotto') {
            console.log(`[FOUND NODE] Key: "${keyName}"`);
            console.log(`   id: ${node.id}`);
            console.log(`   name: "${node.name}"`); // Check this specifically
            console.log(`   sqlResultName: "${node.sqlResultName}"`);
            console.log(`   pythonResultName: "${node.pythonResultName}"`);
            console.log(`   pythonCode: ${!!node.pythonCode}`);
            console.log(`   pipelineDependencies: ${JSON.stringify(node.pipelineDependencies)}`);
        }

        if (node.options) {
            for (const key in node.options) {
                traverse(node.options[key], key);
            }
        }
    };

    traverse(treeJson, 'ROOT');
}

main().catch(console.error);
