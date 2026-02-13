
import { db } from '../src/lib/db';

async function main() {
    const tree = await db.tree.findFirst({
        where: { name: 'HR' }
    });

    if (!tree || !tree.jsonDecisionTree) {
        console.log('HR Tree not found');
        return;
    }

    console.log(tree.jsonDecisionTree.substring(0, 500));
}

main().catch(console.error);
