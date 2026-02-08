
import { db } from '../src/lib/db';

async function main() {
    const treeId = 'RzX9nFJGQUs832cLVvecO';
    console.log(`Searching for tree ${treeId}...`);

    const tree = await db.tree.findUnique({ where: { id: treeId } });
    if (!tree) {
        console.error('Tree not found!');
        return;
    }

    let treeJson = JSON.parse(tree.jsonDecisionTree);
    let parentFound = false;
    let childFound = false;
    let changesMade = false;

    const parentNodeId = '-A7oR6c8';
    const childNodeId = 'KhDnEWg8';
    const targetResultName = 'BDG vs POC vs FAT';

    // Helper to traverse and modify
    const traverseAndModify = (node: any) => {
        if (!node) return;

        // Check for Parent Node
        if (node.id === parentNodeId) {
            parentFound = true;
            if (node.pythonResultName === targetResultName) {
                console.log(`[FIX] Removing pythonResultName="${targetResultName}" from Parent Node (${parentNodeId})`);
                delete node.pythonResultName;
                changesMade = true;
            } else if (node.pythonResultName) {
                console.log(`[INFO] Parent Node (${parentNodeId}) has unexpected result name: "${node.pythonResultName}". Removing it.`);
                delete node.pythonResultName;
                changesMade = true;
            }
        }

        // Check for Child Node
        if (node.id === childNodeId) {
            childFound = true;
            if (node.pythonResultName !== targetResultName) {
                console.log(`[FIX] Improving pythonResultName on Child Node (${childNodeId}). Old: "${node.pythonResultName || '(none)'}" -> New: "${targetResultName}"`);
                node.pythonResultName = targetResultName;
                changesMade = true;
            } else {
                console.log(`[INFO] Child Node (${childNodeId}) already has correct pythonResultName.`);
            }
        }

        if (node.options) {
            for (const k in node.options) {
                const val = node.options[k];
                if (Array.isArray(val)) {
                    val.forEach(traverseAndModify);
                } else if (typeof val === 'object') {
                    traverseAndModify(val);
                }
            }
        }
    };

    traverseAndModify(treeJson);

    if (!parentFound) console.error(`[ERROR] Parent Node ${parentNodeId} NOT FOUND.`);
    if (!childFound) console.error(`[ERROR] Child Node ${childNodeId} NOT FOUND.`);

    if (changesMade) {
        console.log('Saving changes to database...');
        await db.tree.update({
            where: { id: treeId },
            data: { jsonDecisionTree: JSON.stringify(treeJson) }
        });
        console.log('Database updated successfully.');
    } else {
        console.log('No changes needed.');
    }
}

main().catch(console.error);
