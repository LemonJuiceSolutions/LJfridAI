
import { db } from '../src/lib/db';

async function main() {
    console.log('Searching for dependency nodes (Prodotto, Fatturato, Budget, Aggregato)...');
    const trees = await db.tree.findMany();

    const targetKeywords = ['Prodotto', 'Fatturato', 'Budget', 'Aggregato'];

    for (const tree of trees) {
        if (!tree.jsonDecisionTree) continue;
        const treeJson = JSON.parse(tree.jsonDecisionTree);

        const traverse = (node: any, path: string) => {
            if (!node) return;

            const name = node.name || '';
            const pythonResultName = node.pythonResultName || '';
            const sqlResultName = node.sqlResultName || '';
            const question = node.question || '';
            const id = node.id || '';

            // Check if this node PRODUCES one of the target keywords (via SQL or Python result)
            // or if its name/question contains it.
            const match = targetKeywords.some(k =>
                name === k ||
                pythonResultName === k ||
                sqlResultName === k ||
                question === k
            );

            if (match) {
                console.log(`\n--- FOUND DEPENDENCY NODE in tree ${tree.name} ---`);
                console.log('Path:', path);
                console.log('ID:', id);
                console.log('Name:', name);
                console.log('SQL Result Name:', sqlResultName);
                console.log('Python Result Name:', pythonResultName);
                console.log('Question:', question);
                console.log('Full Config Keys:', Object.keys(node));
            }

            if (node.options) {
                for (const key in node.options) {
                    const val = node.options[key];
                    if (Array.isArray(val)) {
                        val.forEach(n => traverse(n, path + ' > ' + key));
                    } else if (typeof val === 'object') {
                        traverse(val, path + ' > ' + key);
                    }
                }
            }
        };

        // Start traversal from root
        traverse(treeJson, 'ROOT');
    }
}

main().catch(console.error);
