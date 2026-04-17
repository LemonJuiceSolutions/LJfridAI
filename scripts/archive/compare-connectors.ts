
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

    const nodeAaaa = findNodeByName(json, 'AAAA');
    const nodeProdfil2 = findNodeByName(json, 'PRODFIL2');

    console.log('--- NODE: AAAA ---');
    if (nodeAaaa) {
        console.log(`sqlConnectorId: ${nodeAaaa.sqlConnectorId}`);
        console.log(`sqlResultName: ${nodeAaaa.sqlResultName}`);
    } else {
        console.log('Node AAAA not found');
    }

    console.log('\n--- NODE: PRODFIL2 ---');
    if (nodeProdfil2) {
        console.log(`sqlConnectorId: ${nodeProdfil2.sqlConnectorId}`);
        console.log(`sqlResultName: ${nodeProdfil2.sqlResultName}`);
    } else {
        console.log('Node PRODFIL2 not found');
    }
}

main().catch(console.error);
