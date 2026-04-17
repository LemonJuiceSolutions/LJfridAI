
import { db } from '../src/lib/db';

async function main() {
    const connector = await db.connector.findUnique({
        where: { id: 'cmkge2yif0008f0a2sz7qrtx8' }
    });

    if (connector) {
        console.log(`Connector Name: ${connector.name}`);
        console.log(`Connector Type: ${connector.type}`);
        console.log(`Config: ${connector.config}`);
    } else {
        console.log('Connector not found');
    }
}

main().catch(console.error);
