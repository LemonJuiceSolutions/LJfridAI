import { db } from '../src/lib/db';

async function checkGanttNode() {
    try {
        // Find the "Produzione" tree
        const trees = await db.tree.findMany({
            where: {
                name: {
                    contains: 'Produzione',
                    mode: 'insensitive'
                }
            }
        });

        console.log(`Found ${trees.length} trees matching "Produzione":`);

        for (const tree of trees) {
            console.log(`\n=== Tree: ${tree.name} ===`);
            console.log(`ID: ${tree.id}`);
            console.log(`Type: ${tree.type}`);

            // Parse the JSON decision tree
            const jsonTree = JSON.parse(tree.jsonDecisionTree);
            console.log('\nJSON Tree Structure:');
            console.log(JSON.stringify(jsonTree, null, 2));
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await db.$disconnect();
    }
}

checkGanttNode();
