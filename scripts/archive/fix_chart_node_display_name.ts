
import { db } from '../src/lib/db';

async function main() {
    const treeId = 'RzX9nFJGQUs832cLVvecO'; // Tree PRODUZIONE
    const chartNodeId = 'KhDnEWg8'; // The child node with the python code
    const newName = 'BDG vs PROD vs FATTURATO > BDG vs POC vs FAT';

    console.log(`Fixing display name for node ${chartNodeId} in tree ${treeId}...`);

    try {
        const tree = await db.tree.findUnique({ where: { id: treeId } });
        if (!tree) {
            console.error('Tree not found!');
            return;
        }

        let treeJson = JSON.parse(tree.jsonDecisionTree);
        let updated = false;

        const updateNode = (node: any) => {
            if (!node) return;

            if (node.id === chartNodeId) {
                console.log(`Found target node ${node.id}`);
                console.log(`Current Name: ${node.name}`);
                console.log(`Current PythonResultName: ${node.pythonResultName}`);

                // Set the specific display name requested
                node.name = newName;
                updated = true;

                console.log(`Updated Name to: ${node.name}`);
            }

            if (node.options) {
                for (const key in node.options) {
                    const val = node.options[key];
                    if (Array.isArray(val)) {
                        val.forEach(item => updateNode(item));
                    } else {
                        updateNode(val);
                    }
                }
            }
        };

        updateNode(treeJson);

        if (updated) {
            await db.tree.update({
                where: { id: treeId },
                data: { jsonDecisionTree: JSON.stringify(treeJson) }
            });
            console.log('Successfully updated tree configuration in database.');
        } else {
            console.error('Target node not found in tree!');
        }

    } catch (e) {
        console.error('Error updating execution log name:', e);
    }
}

main().catch(console.error);
