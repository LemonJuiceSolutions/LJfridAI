import { db } from './src/lib/db';

async function main() {
    const tree = await db.tree.findUnique({ where: { id: 'RzX9nFJGQUs832cLVvecO' } });
    if (!tree) return;

    const treeJson = JSON.parse(tree.jsonDecisionTree);

    const findNode = (n: any, id: string): any => {
        if (n.id === id) return n;
        if (n.options) {
            for (const k in n.options) {
                if (Array.isArray(n.options[k])) {
                    for (const item of n.options[k]) {
                        const found = findNode(item, id);
                        if (found) return found;
                    }
                } else {
                    const found = findNode(n.options[k], id);
                    if (found) return found;
                }
            }
        }
        return null;
    };

    const emailNode = findNode(treeJson, '4BbRgfc5');
    console.log('--- FULL EMAIL NODE ---');
    console.log(JSON.stringify(emailNode, null, 2));

    await db.$disconnect();
}

main().catch(console.error);
