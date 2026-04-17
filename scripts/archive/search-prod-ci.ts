
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

    console.log('Searching for "PROD" (case-insensitive) as result name in JSON...');

    // Find all occurrences of "sqlResultName": "PROD..." or "pythonResultName": "PROD..."
    const matches = jsonStr.matchAll(/"(sqlResultName|pythonResultName)":\s*"([^"]*PROD[^"]*)"/gi);

    for (const match of matches) {
        console.log(`Found result match: ${match[1]} = ${match[2]}`);
    }
}

main().catch(console.error);
