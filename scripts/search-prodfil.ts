
import { db } from '../src/lib/db';

async function main() {
    const tree = await db.tree.findFirst({
        where: { name: 'PRODUZIONE' }
    });

    if (!tree) {
        console.error('Tree "PRODUZIONE" not found');
        return;
    }

    const jsonStr = tree.jsonDecisionTree || '{}';

    console.log('Searching for "PRODFIL" in JSON...');

    // Find all occurrences of "sqlResultName": "PRODFIL..." or "pythonResultName": "PRODFIL..."
    const matches = jsonStr.matchAll(/"(sqlResultName|pythonResultName)":\s*"([^"]*PRODFIL[^"]*)"/g);

    for (const match of matches) {
        console.log(`Found match: ${match[1]} = ${match[2]}`);
    }

    // Also look for nodes that use it
    const depsMatches = jsonStr.matchAll(/"(sqlSelectedPipelines|pythonSelectedPipelines)":\s*\[([^\]]*PRODFIL[^\]]*)\]/g);
    for (const match of depsMatches) {
        console.log(`Found dependency match in ${match[1]}: ${match[2]}`);
    }
}

main().catch(console.error);
