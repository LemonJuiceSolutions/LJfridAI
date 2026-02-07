import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
    const tree = await db.tree.findUnique({
        where: { id: 'RzX9nFJGQUs832cLVvecO' }
    });

    if (!tree) {
        console.log('Tree not found');
        return;
    }

    const json = JSON.parse(tree.jsonDecisionTree);

    // Find nodes by name
    const findNodes = (obj: any, results: any[] = []): any[] => {
        if (!obj || typeof obj !== 'object') return results;

        const name = obj.name || obj.sqlResultName || obj.pythonResultName;
        if (name) {
            results.push({
                name,
                id: obj.id,
                sqlQuery: obj.sqlQuery ? obj.sqlQuery.substring(0, 120) : null,
                pythonCode: obj.pythonCode ? obj.pythonCode.substring(0, 120) : null,
                pipelineDependencies: obj.pipelineDependencies ? obj.pipelineDependencies.map((d: any) => d.tableName) : [],
                sqlConnectorId: obj.sqlConnectorId
            });
        }

        if (obj.options) {
            for (const key of Object.keys(obj.options)) {
                findNodes(obj.options[key], results);
            }
        }
        return results;
    };

    const nodes = findNodes(json);
    console.log('Nodes in PRODUZIONE tree:', nodes.length);

    // Look for specific failing nodes
    const targetNames = ['PRODFIL', 'PRODFIL2', 'Budget', 'Aggregato', 'Fatturato', 'BDG', 'Gantt'];

    for (const n of nodes) {
        const isTarget = targetNames.some(t => n.name.includes(t));
        if (isTarget) {
            console.log('\n===', n.name, '===');
            if (n.sqlQuery) console.log('  SQL:', n.sqlQuery);
            if (n.pythonCode) console.log('  Python:', n.pythonCode);
            if (n.pipelineDependencies.length > 0) console.log('  Dependencies:', n.pipelineDependencies.join(', '));
            console.log('  ConnectorId:', n.sqlConnectorId || 'N/A');
        }
    }

    await db.$disconnect();
}

main().catch(console.error);
