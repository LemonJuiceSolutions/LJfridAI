
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

        // Target the Gantt node
        if (node.id === 'mT4fz_HR') {
            console.log('Found Gantt node mT4fz_HR');
            const question = node.question || '';
            const resultName = node.pythonResultName || '';

            if (question && resultName) {
                const newName = `${question} > ${resultName}`;
                if (node.name !== newName) {
                    console.log(`Updating name from "${node.name}" to "${newName}"`);
                    node.name = newName;
                    updated = true;
                } else {
                    console.log(`Name is already correct: "${node.name}"`);
                }
            } else {
                console.log('Node missing question or pythonResultName, skipping update.');
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
