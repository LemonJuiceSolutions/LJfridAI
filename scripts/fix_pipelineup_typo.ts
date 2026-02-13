
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

        // Check for the specific node ID or Name
        if (node.id === 'hXm206kX' || node.name === 'Normalizziamo per Zucchetti') {
            if (node.sqlQuery && node.sqlQuery.includes('PIPELINEUP')) {
                console.log(`Found target node: ${node.name} (${node.id})`);
                console.log(`Original Query: \n${node.sqlQuery}`);

                // Replace globally just in case, but usually once
                node.sqlQuery = node.sqlQuery.replace(/PIPELINEUP/g, '[Pipeline Prodotto]');

                console.log(`Updated Query: \n${node.sqlQuery}`);
                modified = true;
            }
        }

        if (node.options) {
            for (const key in node.options) {
                // Determine if array or object
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
        console.log(`\nNo changes needed. Node not found or already fixed.`);
    }
}

main().catch(console.error);
