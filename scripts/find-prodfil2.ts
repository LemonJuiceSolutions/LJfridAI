
import { db } from '@/lib/db';
import { executeSqlPreviewAction } from '@/app/actions';

async function findProdFil2() {
    const connectors = await db.connector.findMany({
        where: { type: 'SQL' }
    });

    console.log(`Checking ${connectors.length} SQL connectors for dbo.PRODFIL2`);

    for (const conn of connectors) {
        console.log(`Checking Connector: ${conn.name} (${conn.id})`);

        // Check PRODFIL2
        const resFil = await executeSqlPreviewAction(
            'SELECT TOP 1 * FROM dbo.PRODFIL2',
            conn.id,
            [],
            true // bypassAuth
        );

        if (resFil.data) {
            console.log(`✅ FOUND dbo.PRODFIL2 in ${conn.name} (${conn.id})`);
            return; // found it
        } else {
            console.log(`❌ Not in ${conn.name}: ${resFil.error?.substring(0, 100)}`);
        }
    }
}

findProdFil2().catch(console.error).finally(() => db.$disconnect());
