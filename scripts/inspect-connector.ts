
import { db } from '@/lib/db';

async function inspectConnector() {
    const connectorId = 'cmkge2yif0008f0a2sz7qrtx8';
    console.log(`Inspecting Connector: ${connectorId}`);

    const connector = await db.connector.findUnique({
        where: { id: connectorId }
    });

    if (!connector) {
        console.error('Connector not found!');
        return;
    }

    console.log('Connector Name:', connector.name);
    console.log('Type:', connector.type);

    let config = {};
    try {
        config = JSON.parse(connector.config);
    } catch (e) {
        console.error('Failed to parse config JSON');
    }

    // Mask sensitive data
    const safeConfig = { ...config };
    if (safeConfig.password) safeConfig.password = '***MASKED***';

    console.log('Config:', JSON.stringify(safeConfig, null, 2));
}

inspectConnector()
    .catch(e => console.error(e))
    .finally(async () => {
        await db.$disconnect();
    });
