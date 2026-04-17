
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

        // Check for Normalizziamo per Zucchetti (hXm206kX)
        if (node.id === 'hXm206kX') {
            console.log(`Found target node: ${node.name} (${node.id})`);

            // Fix Pipeline Dependencies
            if (!node.pipelineDependencies || !Array.isArray(node.pipelineDependencies)) {
                node.pipelineDependencies = [];
            }

            // Check if dependency already exists
            const hasDep = node.pipelineDependencies.some((d: any) => d.tableName === 'Pipeline Prodotto');

            if (!hasDep) {
                console.log(`Adding missing dependency: Pipeline Prodotto`);
                node.pipelineDependencies.push({
                    tableName: 'Pipeline Prodotto',
                    isPython: true // It is a Python node
                });
                modified = true;
            } else {
                console.log(`Dependency 'Pipeline Prodotto' already exists.`);
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
