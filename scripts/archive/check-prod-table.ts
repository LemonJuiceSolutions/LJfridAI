
import { db } from '@/lib/db';
import { executeSqlPreviewAction } from '@/app/actions';

async function checkProdTable() {
    const connectors = await db.connector.findMany({
        where: { type: 'SQL' }
    });

    console.log(`Checking ${connectors.length} SQL connectors for tables: dbo.PROD, dbo.PRODFIL2`);

    for (const conn of connectors) {
        console.log(`\nConnector: ${conn.name} (${conn.id})`);

        // Check PROD
        const resProd = await executeSqlPreviewAction(
            'SELECT TOP 1 * FROM dbo.PROD',
            conn.id,
            [],
            true // bypassAuth
        );

        if (resProd.data) {
            console.log('  ✅ dbo.PROD FOUND!');
        } else {
            console.log(`  ❌ dbo.PROD Error: ${resProd.error}`);
        }

        // Check PRODFIL2
        const resFil = await executeSqlPreviewAction(
            'SELECT TOP 1 * FROM dbo.PRODFIL2',
            conn.id,
            [],
            true // bypassAuth
        );

        if (resFil.data) {
            console.log('  ✅ dbo.PRODFIL2 FOUND!');
        } else {
            console.log(`  ❌ dbo.PRODFIL2 Error: ${resFil.error}`);
        }
    }
}

checkProdTable().catch(console.error).finally(() => db.$disconnect());
