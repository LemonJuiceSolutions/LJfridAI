
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

    function findRecursive(obj: any, target: string, path: string = 'root'): void {
        if (!obj || typeof obj !== 'object') return;

        if (obj.sqlResultName === target) {
            console.log(`Found sqlResultName "${target}" at ${path}`);
            console.log(`  isPython: ${obj.isPython}`);
            console.log(`  pythonCode: ${!!obj.pythonCode}`);
        }

        if (obj.pythonResultName === target) {
            console.log(`Found pythonResultName "${target}" at ${path}`);
            console.log(`  isPython: ${obj.isPython}`);
            console.log(`  pythonCode: ${!!obj.pythonCode}`);
        }

        for (const [key, value] of Object.entries(obj)) {
            findRecursive(value, target, `${path}.${key}`);
        }
    }

    console.log('Searching for HR2 result nodes...');
    findRecursive(json, 'HR2');

    console.log('\nSearching for PROD result nodes...');
    findRecursive(json, 'PROD');
}

main().catch(console.error);
