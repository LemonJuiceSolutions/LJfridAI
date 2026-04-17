
import { db } from '@/lib/db';

async function refreshTaskConfigDebug() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';
    const DB_QUID_ID = 'cmkge2yif0008f0a2sz7qrtx8';
    const MAGO_ID = 'cmkgdzm2t0004f0a2yi0phyhz';
    const PROD_ID = 'NC9jpnnG';

    console.log('DEBUG: Starting Tree Traversal...');

    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) return;
    const treeConfig = task.config as any;
    const tree = await db.tree.findUnique({ where: { id: treeConfig.treeId } });
    if (!tree) return;
    const jsonTree = JSON.parse(tree.jsonDecisionTree);

    const contextTables: any[] = [];
    let visitedCount = 0;
    let prodFound = false;

    const extractNode = (node: any, depth: number, path: string) => {
        if (!node) return;
        visitedCount++;
        const currentId = node.id || 'NO_ID';
        // Improved name resolution
        const currentName = node.name || node.nodeName || node.sqlResultName || node.pythonResultName || 'NO_NAME';

        // Check if this is the target node
        if (currentId === PROD_ID || currentName === 'Prodotto') {
            console.log(`\n!!! FOUND PRODOTTO at depth ${depth} (Path: ${path}) !!!`);
            console.log(`  ID: ${node.id}`);
            console.log(`  Name: ${node.name}`);
            console.log(`  Type: ${node.type}`);
            console.log(`  SQL Query Present: ${!!node.sqlQuery}`);
            prodFound = true;
        }

        const isPython = node.type === 'python' || !!node.pythonCode;
        const isSql = node.type === 'sql' || !!node.sqlQuery;

        if (isPython || isSql) {
            let connectorId = node.connectorId || node.sqlConnectorId || node.pythonConnectorId;

            // AUTO-FIX logic

            // 1. Nodes that belong to MAGO4 (e.g. contain dbo.PROD)
            if (currentName === 'Prodotto' || currentName === 'Consegne') {
                console.log(`[Fix] Forcing Connector MAGO4 for node: ${currentName}`);
                connectorId = MAGO_ID;
            }
            // 2. Nodes that belong to dBQUID
            else if (['Fatturato', 'Budget', 'Aggregato', 'PRODFIL', 'PRODFIL2', 'HR2', 'HR2Local'].includes(currentName)) {
                if (!connectorId || connectorId !== DB_QUID_ID) {
                    console.log(`[Fix] Forcing Connector dBQUID for node: ${currentName}`);
                    connectorId = DB_QUID_ID;
                }
            }

            contextTables.push({
                name: currentName === 'NO_NAME' ? `Node_${node.id}` : currentName,
                isPython,
                pythonCode: node.pythonCode,
                pythonOutputType: node.pythonOutputType,
                sqlQuery: node.sqlQuery,
                connectorId,
                pipelineDependencies: node.pipelineDependencies,
                sqlExportConfig: node.sqlExportConfig,
                writesToDatabase: !!node.sqlExportConfig
            });
        }

        if (node.options) {
            for (const key in node.options) {
                extractNode(node.options[key], depth + 1, `${path}->${key}`);
            }
        }
    };

    extractNode(jsonTree, 0, 'root');

    // MANUALLY INJECT PRODFIL and PRODFIL2
    // Because they are missing from live tree or not reachable, but required by Python code.
    console.log('[Fix] Injecting PRODFIL and PRODFIL2 manual overrides on MAGO4 connector.');

    // Remove existing if any (to avoid duplicates)
    const existingNames = new Set(contextTables.map(c => c.name));

    if (!existingNames.has('PRODFIL')) {
        contextTables.push({
            name: 'PRODFIL',
            isPython: false,
            sqlQuery: 'SELECT * FROM dbo.PRODFIL',
            connectorId: MAGO_ID,
            pipelineDependencies: [],
            writesToDatabase: false
        });
        console.log('  -> Injected PRODFIL');
    }

    if (!existingNames.has('PRODFIL2')) {
        contextTables.push({
            name: 'PRODFIL2',
            isPython: false,
            sqlQuery: 'SELECT * FROM dbo.PRODFIL', // Using PRODFIL table for PRODFIL2 as fallback
            connectorId: MAGO_ID,
            pipelineDependencies: [],
            writesToDatabase: false
        });
        console.log('  -> Injected PRODFIL2 (mapped to dbo.PRODFIL)');
    }

    console.log(`\nTraversal Complete. Visited ${visitedCount} nodes.`);
    console.log(`Prodotto Found flag: ${prodFound}`);
    console.log(`Context Tables: ${contextTables.length}`);

    if (prodFound) {
        console.log('UPDATING TASK...');
        const newConfig = { ...treeConfig, contextTables };
        await db.scheduledTask.update({
            where: { id: taskId },
            data: { config: newConfig, nextRunAt: new Date() }
        });
        console.log('TASK UPDATED.');
    } else {
        console.error('FAILED TO FIND PRODOTTO. Task not updated.');
    }
}

refreshTaskConfigDebug().catch(console.error).finally(() => db.$disconnect());
