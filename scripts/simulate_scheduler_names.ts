
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

    // Simulate getAllNodesFromTree
    const nodes: any[] = [];
    const collect = (node: any, currentPath: string = 'root') => {
        if (!node || typeof node !== 'object') return;

        const allNames = [node.name, node.sqlResultName, node.pythonResultName].filter(Boolean) as string[];
        const nodeName = allNames[0] || node.id || 'unknown';
        const nodePath = currentPath;

        console.log(`\nProcessing Node ID: ${node.id}`);
        console.log(`  Raw Name: "${node.name}"`);
        console.log(`  SQL Result: "${node.sqlResultName}"`);
        console.log(`  All Names: ${JSON.stringify(allNames)}`);
        console.log(`  Resolved Name: "${nodeName}"`);

        if (node.id && allNames.length > 0) {
            nodes.push({
                ...node,
                name: allNames[0],
                allNames
            });
        }

        if (node.options && typeof node.options === 'object') {
            for (const key in node.options) {
                const val = node.options[key];
                if (Array.isArray(val)) {
                    val.forEach(item => collect(item, currentPath + '>' + key));
                } else {
                    collect(val, currentPath + '>' + key);
                }
            }
        }
    };

    collect(treeJson);

    // Simulate Ancestor Chain logic for naming
    console.log('\n--- SIMULATED EXECUTION NAMES ---');
    const nodeNameMap = new Map<string, string>();
    nodes.forEach(t => {
        const normalizedName = t.name.toLowerCase().trim();
        nodeNameMap.set(normalizedName, t.name);
    });

    const targetNames = ['prodotto', 'fatturato', 'budget', 'aggregato'];

    // Check what names correspond to these keys (if they existed as simple names)
    // or check if key "produzione > prodotto" exists

    const keys = Array.from(nodeNameMap.keys());
    console.log(`Total Keys: ${keys.length}`);

    ['NC9jpnnG', 'gye2BUuO', '9LiHu3E2', '-A7oR6c8'].forEach(id => {
        const node = nodes.find(n => n.id === id);
        if (node) {
            console.log(`Node ${id} final name in context: "${node.name}"`);
        } else {
            console.log(`Node ${id} NOT FOUND in context`);
        }
    });
}

main().catch(console.error);
