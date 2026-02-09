
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

        if (obj.sqlResultName === target || obj.pythonResultName === target) {
            return { node: obj, path };
        }

        for (const [key, value] of Object.entries(obj)) {
            const found = findByResultName(value, target, `${path}.${key}`);
            if (found) return found;
        }
        return null;
    }

    const nodeProdotto = findByResultName(json, 'Prodotto');
    if (nodeProdotto) {
        console.log(`Found node Prodotto at: ${nodeProdotto.path}`);
        console.log(`Query: ${nodeProdotto.node.sqlQuery}`);
    } else {
        console.log('Node producing "Prodotto" not found');
    }

    const nodeProdfil = findByResultName(json, 'PRODFIL');
    if (nodeProdfil) {
        console.log(`Found node PRODFIL at: ${nodeProdfil.path}`);
        console.log(`Query: ${nodeProdfil.node.sqlQuery}`);
    } else {
        console.log('Node producing "PRODFIL" not found');
    }
}

main().catch(console.error);
