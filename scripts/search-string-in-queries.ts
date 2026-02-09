
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

        if (obj.sqlQuery && obj.sqlQuery.includes(target)) {
            console.log(`Found "${target}" in sqlQuery at ${path}`);
            console.log(`Node: ${obj.question || obj.decision || obj.name}`);
        }

        if (obj.pythonCode && obj.pythonCode.includes(target)) {
            console.log(`Found "${target}" in pythonCode at ${path}`);
            console.log(`Node: ${obj.question || obj.decision || obj.name}`);
        }

        for (const [key, value] of Object.entries(obj)) {
            findRecursive(value, target, `${path}.${key}`);
        }
    }

    console.log('Searching for "PRODFILTRATA" in all queries...');
    findRecursive(json, 'PRODFILTRATA');
}

main().catch(console.error);
