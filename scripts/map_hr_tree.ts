
import { db } from '../src/lib/db';

async function main() {
    console.log(`Fetching HR tree...`);
    const tree = await db.tree.findFirst({
        where: { name: 'HR' }
    });

    if (!tree || !tree.jsonDecisionTree) {
        console.log('HR Tree not found');
        return;
    }

    const treeJson = JSON.parse(tree.jsonDecisionTree);
    console.log(`Analyzing HR Tree (${tree.id})`);

    const nodes: any[] = [];

    // We want to find who is parent of who, roughly.
    // And list all names.

    const traverse = (node: any, parentName: string) => {
        if (!node) return;

        const info = {
            id: node.id,
            name: node.name,
            parent: parentName,
            sqlResultName: node.sqlResultName,
            isPython: node.isPython
        };
        nodes.push(info);

        if (info.name === 'UP' || info.name === 'NORM' || info.name === 'UP2ZHR' || (node.sqlQuery && node.sqlQuery.includes('PIPELINEUP'))) {
            console.log(`[NODE] ${info.name} (ID: ${info.id}, Parent: ${parentName})`);
            if (node.sqlQuery) console.log(`   QUERY: ${node.sqlQuery.substring(0, 50)}...`);
        }

        if (node.options) {
            for (const key in node.options) {
                const val = node.options[key];
                if (Array.isArray(val)) {
                    val.forEach(n => traverse(n, node.name));
                } else if (typeof val === 'object') {
                    traverse(val, node.name);
                }
            }
        }
    };

    traverse(treeJson, 'ROOT');

    console.log('\nAll Found Node Names:');
    console.log(nodes.map(n => n.name).filter(n => n).sort().join(', '));

    // Check if PIPELINEUP exists as a name
    const pipelineUpNode = nodes.find(n => n.name === 'PIPELINEUP');
    if (pipelineUpNode) {
        console.log(`\n!!! Found node named PIPELINEUP !!! ID: ${pipelineUpNode.id}`);
    } else {
        console.log(`\nNode named 'PIPELINEUP' does NOT exist.`);
    }

    // Check UP node
    const upNode = nodes.find(n => n.name === 'UP');
    if (upNode) {
        console.log(`Found node 'UP'. ID: ${upNode.id}`);
    }
}

main().catch(console.error);
