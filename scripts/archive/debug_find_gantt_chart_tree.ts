
import { db } from '../src/lib/db';

async function main() {
    console.log('Searching for "Gantt" or "Capacity" nodes with path...');
    const trees = await db.tree.findMany();

    const targetKeywords = ['Gantt', 'Capacity'];

    for (const tree of trees) {
        if (!tree.jsonDecisionTree) continue;
        const treeJson = JSON.parse(tree.jsonDecisionTree);

        const traverse = (node: any, path: string) => {
            if (!node) return;

            const name = node.name || '';
            const pythonResultName = node.pythonResultName || '';
            const question = node.question || '';
            const id = node.id || '';

            const match = targetKeywords.some(k =>
                name.includes(k) ||
                pythonResultName.includes(k) ||
                question.includes(k)
            );

            if (match) {
                console.log(`\n--- FOUND MATCHING NODE in tree ${tree.name} ---`);
                console.log('Path:', path);
                console.log('ID:', id);
                console.log('Name:', name);
                console.log('Python Result Name:', pythonResultName);
                console.log('Question:', question);

                if (node.options) {
                    console.log('  [Has Children/Options]');
                    for (const k in node.options) {
                        const childVal = node.options[k];
                        if (Array.isArray(childVal)) {
                            childVal.forEach((c: any) => console.log(`      -> Option "${k}" leads to node ${c.id} (${c.name || c.pythonResultName || 'unnamed'})`));
                        } else if (typeof childVal === 'object') {
                            console.log(`      -> Option "${k}" leads to node ${childVal.id} (${childVal.name || childVal.pythonResultName || 'unnamed'})`);
                        }
                    }
                } else {
                    console.log('  [Leaf Node / No Options]');
                }
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
