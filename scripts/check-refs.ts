
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

    function findRefs(obj: any, path: string = 'root'): void {
        if (!obj || typeof obj !== 'object') return;

        if (obj.ref) {
            console.log(`Found ref at ${path}: ${obj.ref}`);
        }

        for (const [key, value] of Object.entries(obj)) {
            findRefs(value, `${path}.${key}`);
        }
    }

    findRefs(json);
}

main().catch(console.error);
