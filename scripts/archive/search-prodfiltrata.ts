
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

    function findByResultName(obj: any, target: string, path: string = 'root'): any {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.sqlResultName === target || obj.pythonResultName === target) return { node: obj, path };
        for (const [key, value] of Object.entries(obj)) {
            const found = findByResultName(value, target, `${path}.${key}`);
            if (found) return found;
        }
        return null;
    }

    const result = findByResultName(json, 'PRODFILTRATA');
    if (result) {
        console.log(`Found node at path: ${result.path}`);
        console.log(`Name: ${result.node.question || result.node.decision || result.node.name}`);
    } else {
        console.log('Node producing "PRODFILTRATA" not found');
    }
}

main().catch(console.error);
