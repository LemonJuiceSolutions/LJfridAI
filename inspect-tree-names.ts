import { db } from './src/lib/db';

async function main() {
    const tree = await db.tree.findUnique({ where: { id: 'RzX9nFJGQUs832cLVvecO' } });
    if (!tree) return;

    const treeJson = JSON.parse(tree.jsonDecisionTree);

    const findNode = (n: any, id: string): any => {
        if (n.id === id) return n;
        if (n.options) {
            for (const k in n.options) {
                const found = findNode(n.options[k], id);
                if (found) return found;
            }
        }
        if (Array.isArray(n)) {
            for (const i of n) {
                const found = findNode(i, id);
                if (found) return found;
            }
        }
        return null;
    };

    const emailNode = findNode(treeJson, '4BbRgfc5');
    console.log('Email Body:', emailNode?.emailBody);

    console.log('\nSearching for chart/table names in tree...');
    const listNodes = (n: any): any[] => {
        let results: any[] = [];
        if (n.name || n.sqlResultName || n.pythonResultName) {
            results.push({
                id: n.id,
                name: n.name,
                sql: n.sqlResultName,
                py: n.pythonResultName,
                question: n.question
            });
        }
        if (n.options) {
            for (const k in n.options) {
                results = results.concat(listNodes(n.options[k]));
            }
        }
        if (Array.isArray(n)) {
            for (const i of n) {
                results = results.concat(listNodes(i));
            }
        }
        return results;
    };

    const allNodes = listNodes(treeJson);
    console.log('Nodes found:');
    allNodes.forEach(n => {
        console.log(`- ID: ${n.id} | Name: ${n.name} | SQL: ${n.sql} | PY: ${n.py} | Q: ${n.question}`);
    });

    await db.$disconnect();
}

main().catch(console.error);
