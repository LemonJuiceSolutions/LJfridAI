
import { db } from '../src/lib/db';

async function main() {
    const tree = await db.tree.findFirst({
        where: { name: 'PRODUZIONE' }
    });

    if (!tree) {
        console.error('Tree "PRODUZIONE" not found');
        return;
    }

    const json = JSON.parse(tree.jsonDecisionTree || '{}');

    // Find "Produzione e Fatturato" node
    function findBranch(node: any, target: string): any {
        if (!node) return null;
        if (node.option === target || node.question === target || node.name === target) return node;
        if (node.options) {
            for (const value of Object.values(node.options)) {
                const found = findBranch(value, target);
                if (found) return found;
            }
        }
        return null;
    }

    const branch = findBranch(json, 'Produzione e Fatturato');
    if (branch) {
        console.log(JSON.stringify(branch, null, 2));
    } else {
        console.log('Branch not found');
    }
}

main().catch(console.error);
