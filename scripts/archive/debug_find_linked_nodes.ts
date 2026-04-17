
import { db } from '../src/lib/db';

async function main() {
    console.log('Searching for Linked Nodes pointing to PRODUZIONE tree nodes...');
    const trees = await db.tree.findMany();

    // IDs of the nodes we just updated
    const targetNodeIds = ['NC9jpnnG', 'gye2BUuO', '9LiHu3E2', '-A7oR6c8', 'KhDnEWg8'];
    const productionTreeId = 'RzX9nFJGQUs832cLVvecO';

    for (const tree of trees) {
        if (tree.id === productionTreeId) continue; // Skip source tree
        if (!tree.jsonDecisionTree) continue;

        let treeJson = JSON.parse(tree.jsonDecisionTree);
        let found = false;

        const traverse = (node: any) => {
            if (!node) return;

            // Check for LINKED_TREE type or sourceTreeId property
            if (node.type === 'LINKED_TREE' || node.sourceTreeId === productionTreeId) {
                console.log(`\n--- FOUND LINKED NODE in tree ${tree.name} (${tree.id}) ---`);
                console.log('Node ID:', node.id);
                console.log('Type:', node.type);
                console.log('Source Tree ID:', node.sourceTreeId);
                console.log('Source Node ID:', node.sourceNodeId);

                if (targetNodeIds.includes(node.sourceNodeId)) {
                    console.log('  !!! POINTS TO TARGET DEPENDENCY NODE !!!');
                }
                found = true;
            }

            // Also check for selectedPipelines containing target names?
            // (If they are referenced by name string)

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
    }
}

main().catch(console.error);
