
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

    const nodeProdfil = findRecursive(json, 'PRODFIL');
    if (nodeProdfil) {
        console.log('--- PRODFIL (Escludo Chiusi) ---');
        console.log(`Query: ${nodeProdfil.sqlQuery}`);
    }

    const nodeProdfil2 = findRecursive(json, 'PRODFIL2');
    if (nodeProdfil2) {
        console.log('\n--- PRODFIL2 (Minuti Capacity) ---');
        console.log(`Query: ${nodeProdfil2.sqlQuery}`);
        console.log(`Selected Pipelines: ${JSON.stringify(nodeProdfil2.sqlSelectedPipelines)}`);
    }
}

main().catch(console.error);
