
import { db } from '@/lib/db';

async function inspectTaskContext() {
    const taskId = 'cml9dn2z600098b6u6mncozlf'; // Mail S&OP
    console.log(`Inspecting Task Context: ${taskId}`);

    const task = await db.scheduledTask.findUnique({
        where: { id: taskId }
    });

    if (!task) {
        console.error('Task not found!');
        return;
    }

    const config = task.config as any;
    const contextTables = config.contextTables || [];

    console.log(`Found ${contextTables.length} context tables:`);
    contextTables.forEach((t: any) => {
        console.log(`- Name: "${t.name}"`);
        console.log(`  Type: ${t.isPython ? 'Python' : 'SQL'}`);
        console.log(`  ConnectorId: ${t.connectorId}`);
        if (t.sqlExportConfig) {
            console.log(`  SqlExport: Writes to ${t.sqlExportConfig.targetTableName}`);
        }
        // Check if Aggregato is here
        if (t.name === 'Aggregato') {
            console.log('  [FOUND Aggregato details]:');
            console.log('  Code length:', t.pythonCode?.length);
            console.log('  Output Type:', t.pythonOutputType);
            console.log('  Dependencies:', t.pipelineDependencies?.map((d: any) => d.tableName).join(', '));
        }
    });

    console.log(`[Task] Tree ID: ${config.treeId}`);

    if (config.treeId) {
        const tree = await db.tree.findUnique({ where: { id: config.treeId } });
        if (tree && tree.jsonDecisionTree) {
            try {
                const json = JSON.parse(tree.jsonDecisionTree);
                console.log(`[Live Tree] Found Tree: ${tree.name}`);

                // flattened traversal to find nodes
                const findNode = (node: any, name: string): unknown => {
                    if (!node) return null;
                    // Check various fields just in case
                    if (node.name === name || node.id === name || node.question === name || node.nodeName === name) return node;
                    if (node.options) {
                        for (const key in node.options) {
                            const found = findNode(node.options[key], name);
                            if (found) return found;
                        }
                    }
                    return null;
                };

                const prodottoNode = findNode(json, 'Prodotto') as any;
                if (prodottoNode) {
                    console.log(`[Live Tree] FOUND 'Prodotto' node! ID: ${prodottoNode.id}`);
                    console.log(`[Live Tree] Prodotto Connector: ${prodottoNode.connectorId}`);
                    console.log(`[Live Tree] Prodotto Query: ${prodottoNode.sqlQuery?.substring(0, 50)}...`);
                } else {
                    console.log(`[Live Tree] 'Prodotto' node NOT found in live tree either. Searching by ID...`);
                    // Maybe 'Prodotto' is the name but search uses ID?
                }

            } catch (e) {
                console.error('Error parsing tree JSON', e);
            }
        }
    }
}

inspectTaskContext()
    .catch(e => console.error(e))
    .finally(async () => {
        await db.$disconnect();
    });
