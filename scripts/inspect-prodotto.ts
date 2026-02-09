
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

    // Access root.options["Produzione e Fatturato"].0
    const branch = json.options["Produzione e Fatturato"];
    const node = Array.isArray(branch) ? branch[0] : branch;

    if (node) {
        console.log(`Node name: ${node.question || node.decision || node.name}`);
        console.log(`Result name: ${node.sqlResultName}`);
        console.log(`Query: ${node.sqlQuery}`);
    } else {
        console.log('Branch "Produzione e Fatturato" not found or empty');
    }
}

main().catch(console.error);
