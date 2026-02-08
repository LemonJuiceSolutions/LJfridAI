import { db } from '../src/lib/db';

async function main() {
    console.log('Searching for trees with "BDG vs POC vs FAT"...');
    const trees = await db.tree.findMany();

    let foundTreeId = '';
    let foundNodeId = '';
    let emailNodeId = '';

    for (const tree of trees) {
        if (!tree.jsonDecisionTree) continue;
        const treeJson = JSON.parse(tree.jsonDecisionTree);

        let hasChart = false;
        let hasEmail = false;

        const traverse = (node: any) => {
            if (!node) return;

            // Check for the chart node
            if (node.name === 'BDG vs POC vs FAT' || node.pythonResultName === 'BDG vs POC vs FAT') {
                console.log(`FOUND CHAIN NODE in tree ${tree.name} (${tree.id}):`, node.name);
                hasChart = true;
                foundTreeId = tree.id;
                foundNodeId = node.id;
            }

            // Check for email node (to see how it references the chart)
            if (node.type === 'EMAIL_SENDER' || node.type === 'action-email') { // Adjust type as needed
                hasEmail = true;
                // Check if this email references our chart
                if (JSON.stringify(node.options || {}).includes('BDG vs POC vs FAT')) {
                    console.log(`FOUND EMAIL NODE referencing chart in tree ${tree.name} (${tree.id})`);
                    emailNodeId = node.id;
                }
            }

            // Traverse children
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

    if (foundTreeId) {
        console.log(`\nTARGET TREE IDENTIFIED: ${foundTreeId}`);
        const tree = await db.tree.findUnique({ where: { id: foundTreeId } });
        const treeJson = JSON.parse(tree!.jsonDecisionTree);

        const targetNodeIds = ['-A7oR6c8', 'KhDnEWg8'];
        const findAndDumpNode = (n: any) => {
            if (!n) return;
            if (targetNodeIds.includes(n.id)) {
                console.log(`\n--- TARGET NODE (${n.id === '-A7oR6c8' ? 'PARENT' : 'CHILD'}) ---`);
                console.log('ID:', n.id);
                console.log('Name:', n.name);
                console.log('Python Result Name:', n.pythonResultName);
                if (n.id === '-A7oR6c8') {
                    // For parent, just dump keys to avoid huge output, or shallow dump
                    console.log('Keys:', Object.keys(n));
                    // Check specifically for pythonResultName existence
                    console.log('Has pythonResultName prop:', 'pythonResultName' in n);
                } else {
                    // For child, dump full config
                    console.log('Full Config:', JSON.stringify(n, null, 2));
                }
            }

            if (n.options) {
                for (const k in n.options) {
                    const val = n.options[k];
                    if (Array.isArray(val)) {
                        val.forEach(findAndDumpNode);
                    } else if (typeof val === 'object') {
                        findAndDumpNode(val);
                    }
                }
            }
        };

        findAndDumpNode(treeJson);
    } else {
        console.log('Could not find the chart node in any tree.');
    }
}

main().catch(console.error);
