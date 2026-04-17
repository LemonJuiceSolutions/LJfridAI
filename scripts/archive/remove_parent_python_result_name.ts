
import { db } from '../src/lib/db';

async function main() {
    const treeId = 'RzX9nFJGQUs832cLVvecO';
    console.log(`Fetching tree ${treeId}...`);
    const tree = await db.tree.findUnique({ where: { id: treeId } });

    if (!tree || !tree.jsonDecisionTree) {
        console.error('Tree not found or no JSON');
        return;
    }

    let treeJson = JSON.parse(tree.jsonDecisionTree);
    let updated = false;

    const traverse = (node: any) => {
        if (!node) return;

        // Target the parent node that shouldn't have pythonResultName
        if (node.id === '-A7oR6c8') {
            console.log('Found parent node -A7oR6c8');
            if (node.pythonResultName) {
                console.log(`Removing pythonResultName: "${node.pythonResultName}" from parent node.`);
                delete node.pythonResultName;
                updated = true;
            } else {
                console.log('Parent node does not have pythonResultName.');
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

    if (updated) {
        console.log('Updating tree in database...');
        await db.tree.update({
            where: { id: treeId },
            data: {
                jsonDecisionTree: JSON.stringify(treeJson)
            }
        });
        console.log('Tree updated successfully.');
    } else {
        console.log('No changes needed.');
    }
}

main().catch(console.error);
