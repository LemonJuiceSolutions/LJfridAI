
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

    function findNodeByName(obj: any, target: string): any {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.sqlResultName === target || obj.question === target || obj.decision === target || obj.name === target) return obj;
        for (const [key, value] of Object.entries(obj)) {
            const found = findNodeByName(value, target);
            if (found) return found;
        }
        return null;
    }

    const node = findNodeByName(json, 'AAAA');
    if (node) {
        console.log(JSON.stringify(node, null, 2));
    } else {
        console.log('Node AAAA not found');
    }
}

main().catch(console.error);
