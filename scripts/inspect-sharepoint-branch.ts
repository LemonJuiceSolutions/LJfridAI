
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

    // Access root.options["ConnessioneSharePoint"]
    const branch = json.options["ConnessioneSharePoint"];
    console.log(JSON.stringify(branch, null, 2));
}

main().catch(console.error);
