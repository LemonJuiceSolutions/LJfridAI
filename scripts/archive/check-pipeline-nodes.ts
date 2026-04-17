
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

    function findByResultName(obj: any, target: string): any {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.sqlResultName === target || obj.pythonResultName === target) return obj;
        for (const [key, value] of Object.entries(obj)) {
            const found = findByResultName(value, target);
            if (found) return found;
        }
        return null;
    }

    ['PRODFIL', 'PRODFIL2', 'HR2', 'Prodotto'].forEach(name => {
        const node = findByResultName(json, name);
        if (node) {
            console.log(`--- Node: ${name} ---`);
            console.log(`Name: ${node.question || node.decision || node.name}`);
            console.log(`isPython: ${node.isPython}`);
            console.log(`sqlResultName: ${node.sqlResultName}`);
            console.log(`pythonResultName: ${node.pythonResultName}`);
            console.log(`sqlQuery: ${node.sqlQuery?.substring(0, 100)}...`);
            console.log(`pythonCode: ${node.pythonCode ? 'Yes' : 'No'}`);
            console.log(`pythonSelectedPipelines: ${JSON.stringify(node.pythonSelectedPipelines)}`);
            console.log(`sqlSelectedPipelines: ${JSON.stringify(node.sqlSelectedPipelines)}`);
        } else {
            console.log(`--- Node: ${name} NOT FOUND ---`);
        }
    });
}

main().catch(console.error);
