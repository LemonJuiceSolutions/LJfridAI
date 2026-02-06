
import { db } from '@/lib/db';
import _ from 'lodash';

async function refreshTaskConfig() {
    const taskId = 'cml9dn2z600098b6u6mncozlf'; // Mail S&OP
    const DB_QUID_ID = 'cmkge2yif0008f0a2sz7qrtx8'; // Correct Connector

    console.log(`Refreshing Task Config: ${taskId}`);

    const task = await db.scheduledTask.findUnique({
        where: { id: taskId }
    });
    if (!task) return console.error('Task not found');

    const config = task.config as any;
    if (!config.treeId) return console.error('Task has no Tree ID');

    const tree = await db.tree.findUnique({ where: { id: config.treeId } });
    if (!tree) return console.error('Tree not found');

    const jsonTree = JSON.parse(tree.jsonDecisionTree);
    const contextTables: any[] = [];

    // Helper to extract node details
    const extractNode = (node: any) => {
        if (!node) return;

        // Check if it's a context node (SQL or Python)
        const isPython = node.type === 'python' || !!node.pythonCode;
        const isSql = node.type === 'sql' || !!node.sqlQuery;

        if (isPython || isSql) {
            // determine connector - Check both fields!
            let connectorId = node.connectorId || node.sqlConnectorId || node.pythonConnectorId;

            // AUTO-FIX: If connector is missing, or for specific nodes, force dBQUID
            const dbQuidNodes = ['Prodotto', 'Fatturato', 'Budget', 'Aggregato', 'PRODFIL', 'PRODFIL2', 'HR2'];

            if (dbQuidNodes.includes(node.name) || dbQuidNodes.includes(node.nodeName)) {
                if (!connectorId) {
                    console.log(`[Fix] Forcing Connector dBQUID for node: ${node.name || node.nodeName}`);
                    connectorId = DB_QUID_ID;
                }
            }

            console.log(`[Extract] Found valid node: ${node.name} (Type: ${isPython ? 'Python' : 'SQL'})`);

            contextTables.push({
                name: node.name || node.nodeName || `Node_${node.id}`,
                isPython: isPython,
                pythonCode: node.pythonCode,
                pythonOutputType: node.pythonOutputType,
                // Capture SQL Query!
                sqlQuery: node.sqlQuery,
                connectorId: connectorId,
                pipelineDependencies: node.pipelineDependencies,
                sqlExportConfig: node.sqlExportConfig,
                writesToDatabase: !!node.sqlExportConfig
            });
        }
        if (node.options) {
            for (const key in node.options) {
                extractNode(node.options[key]);
            }
        }
    };

    extractNode(jsonTree);

    console.log(`Found ${contextTables.length} context tables from live tree.`);

    // Verify Prodotto is there
    const prod = contextTables.find(c => c.name === 'Prodotto');
    if (prod) console.log('✅ Prodotto found in new context!');
    else console.error('❌ Prodotto still missing!');

    // Update Task
    const newConfig = {
        ...config,
        contextTables: contextTables
    };

    await db.scheduledTask.update({
        where: { id: taskId },
        data: {
            config: newConfig,
            nextRunAt: new Date(), // Force run now
            failureCount: 0,
            lastError: null
        }
    });

    console.log('Task updated successfully.');
}

refreshTaskConfig().catch(console.error).finally(() => db.$disconnect());
