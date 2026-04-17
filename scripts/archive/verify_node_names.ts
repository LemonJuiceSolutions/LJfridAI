
import { db } from '../src/lib/db';

async function main() {
    const treeId = 'RzX9nFJGQUs832cLVvecO';
    console.log(`Fetching tree ${treeId}...`);
    const tree = await db.tree.findUnique({ where: { id: treeId } });

    if (!tree || !tree.jsonDecisionTree) {
        console.error('Tree not found');
        return;
    }

    const treeJson = JSON.parse(tree.jsonDecisionTree);
    const targetIds = ['NC9jpnnG', 'gye2BUuO', '9LiHu3E2', '-A7oR6c8'];

    const traverse = (node: any) => {
        if (!node) return;

        if (targetIds.includes(node.id)) {
            console.log(`\nNode ID: ${node.id}`);
            console.log(`Name: "${node.name}"`);
            console.log(`SQL Result Name: "${node.sqlResultName}"`);
            console.log(`Python Result Name: "${node.pythonResultName}"`);
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

    console.log('Traversing tree to check current names...');
    traverse(treeJson);
}

main().catch(console.error);
