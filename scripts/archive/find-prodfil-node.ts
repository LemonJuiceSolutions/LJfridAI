
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

        if (obj.sqlResultName === 'PRODFIL' || obj.pythonResultName === 'PRODFIL') {
            return obj;
        }

        for (const key of Object.keys(obj)) {
            const found = findRecursive(obj[key]);
            if (found) return found;
        }
        return null;
    }

    const node = findRecursive(json);
    if (node) {
        console.log(`Found node: ${node.question || node.decision || node.name || 'Unnamed'}`);
        console.log(`SQL Query: ${node.sqlQuery}`);
        console.log(`Python Code: ${node.pythonCode}`);
        console.log(`Result Name: ${node.sqlResultName || node.pythonResultName}`);
        console.log(`Connector ID: ${node.sqlConnectorId || node.pythonConnectorId}`);
    } else {
        console.log('Node producing "PRODFIL" not found');
        // Let's dump the whole tree keys to see what's going on
        // console.log(JSON.stringify(json, null, 2));
    }
}

main().catch(console.error);
