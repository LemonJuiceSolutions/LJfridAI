
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

    function findRecursive(obj: any): any {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.sqlResultName === 'PRODFIL' || obj.pythonResultName === 'PRODFIL') return obj;
        for (const key of Object.keys(obj)) {
            const found = findRecursive(obj[key]);
            if (found) return found;
        }
        return null;
    }

    const node = findRecursive(json);
    if (node) {
        console.log(`Node: ${node.question || node.decision || node.name || 'Unnamed'}`);
        console.log(`SQL Selected Pipelines: ${JSON.stringify(node.sqlSelectedPipelines)}`);
        console.log(`Python Selected Pipelines: ${JSON.stringify(node.pythonSelectedPipelines)}`);
    } else {
        console.log('Node producing "PRODFIL" not found');
    }
}

main().catch(console.error);
