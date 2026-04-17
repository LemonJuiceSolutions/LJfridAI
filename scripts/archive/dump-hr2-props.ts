
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

    function findRecursive(obj: any, target: string): any {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.sqlResultName === target || obj.pythonResultName === target) return obj;
        for (const [key, value] of Object.entries(obj)) {
            const found = findRecursive(value, target);
            if (found) return found;
        }
        return null;
    }

    const node = findRecursive(json, 'HR2');
    if (node) {
        console.log('--- ALL PROPERTIES OF HR2 ---');
        for (const [key, value] of Object.entries(node)) {
            if (key !== 'options' && key !== 'sqlPreviewData' && key !== 'pythonPreviewResult') {
                console.log(`${key}: ${JSON.stringify(value)}`);
            }
        }
    } else {
        console.log('Node HR2 not found');
    }
}

main().catch(console.error);
