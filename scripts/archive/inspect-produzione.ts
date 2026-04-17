
import { db } from '../src/lib/db';

async function main() {
    const tree = await db.tree.findFirst({
        where: { name: 'PRODUZIONE' }
    });

    if (!tree) {
        console.error('Tree "PRODUZIONE" not found');
        return;
    }

    console.log(`Tree: ${tree.name} (ID: ${tree.id})`);

    const json = JSON.parse(tree.jsonDecisionTree || '{}');

    const nodes: any[] = [];

    function traverse(node: any, path: string = 'root') {
        if (!node) return;

        nodes.push({
            path,
            id: node.id,
            name: node.question || node.decision || node.option || 'Unnamed',
            sqlResultName: node.sqlResultName,
            pythonResultName: node.pythonResultName,
            pythonOutputType: node.pythonOutputType,
            pythonSelectedPipelines: node.pythonSelectedPipelines,
            sqlSelectedPipelines: node.sqlSelectedPipelines
        });

        if (node.options) {
            for (const [key, value] of Object.entries(node.options)) {
                traverse(value, `${path}.options.${key}`);
            }
        }
    }

    traverse(json);

    console.log('\n--- Nodes in PRODUZIONE Tree ---');
    nodes.forEach(n => {
        const results = [];
        if (n.sqlResultName) results.push(`SQL: ${n.sqlResultName}`);
        if (n.pythonResultName) results.push(`Python: ${n.pythonResultName}`);

        console.log(`[${n.path}] ${n.name} (ID: ${n.id})`);
        if (results.length > 0) console.log(`  -> Produces: ${results.join(', ')}`);
        if (n.pythonSelectedPipelines?.length > 0) console.log(`  <- Python Deps: ${n.pythonSelectedPipelines.join(', ')}`);
        if (n.sqlSelectedPipelines?.length > 0) console.log(`  <- SQL Deps: ${n.sqlSelectedPipelines.join(', ')}`);
    });
}

main().catch(console.error);
