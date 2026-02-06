
import { db } from '@/lib/db';

async function listConnectors() {
    const connectors = await db.connector.findMany({
        where: { type: 'smtp' },
        take: 5
    });
    console.log("SMTP Connectors:");
    connectors.forEach(c => console.log(`- ${c.name} (${c.id})`));
}

listConnectors();
