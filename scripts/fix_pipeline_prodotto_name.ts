
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

    let treeJson = JSON.parse(tree.jsonDecisionTree);
    let modified = false;

    // Recursive traversal to find and update the node
    const traverse = (node: any) => {
        if (!node) return;

        // Check for Pipeline Prodotto ID
        if (node.id === '4irAUgpf') {
            console.log(`Found target node: ${node.id}`);
            console.log(`Current Name: "${node.name}"`);

            if (node.name !== 'Pipeline Prodotto') {
                console.log(`Updating name to "Pipeline Prodotto"`);
                node.name = 'Pipeline Prodotto';
                modified = true;
            } else {
                console.log(`Name is already correct.`);
            }
        }

        if (node.options) {
            for (const key in node.options) {
                const val = node.options[key];
                if (Array.isArray(val)) {
                    val.forEach(traverse);
                } else if (typeof val === 'object') {
                    traverse(val);
                }
            }
        }
    };

    traverse(treeJson);

    if (modified) {
        console.log(`\nSaving updates to database...`);
        await db.tree.update({
            where: { id: tree.id },
            data: {
                jsonDecisionTree: JSON.stringify(treeJson)
            }
        });
        console.log(`Database updated successfully.`);
    } else {
        console.log(`\nNo changes needed.`);
    }
}

main().catch(console.error);
