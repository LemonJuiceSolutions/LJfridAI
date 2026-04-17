
import { db } from '@/lib/db';

async function listAllConnectors() {
    const connectors = await db.connector.findMany({
        take: 20
    });
    console.log("All Connectors:");
    connectors.forEach(c => console.log(`- ${c.name} (${c.id}) Type: ${c.type}`));
}

listAllConnectors();
