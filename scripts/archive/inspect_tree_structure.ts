
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

    // Traverse treating keys in options as names
    const traverse = (node: any, name: string, parentName: string) => {
        if (!node) return;

        const id = node.id || 'N/A';
        const isPython = !!node.isPython;
        const sqlQuery = node.sqlQuery ? node.sqlQuery.replace(/\n/g, ' ').substring(0, 50) : '';
        const pythonCode = node.pythonCode ? 'HAS_CODE' : '';

        // Log if interesting
        if (name === 'Pipeline Prodotto' || name === 'Normalizziamo per Zucchetti' || (node.sqlQuery && node.sqlQuery.includes('PIPELINEUP'))) {
            console.log(`[NODE] Name: "${name}" | ID: ${id} | Parent: "${parentName}"`);
            if (node.sqlQuery) console.log(`   SQL: ${node.sqlQuery.substring(0, 50)}...`);
            if (node.pipelineDependencies) console.log(`   DEPS: ${JSON.stringify(node.pipelineDependencies)}`);
            if (node.pythonCode) console.log(`   PYTHON: HAS_CODE`);
            if (!node.sqlQuery && !node.pythonCode) console.log(`   NO CODE/QUERY (Condition/Switch?)`);
            if ((node.sqlQuery && node.sqlQuery.includes('PIPELINEUP'))) console.log(`   !!! QUERY REFERENCES PIPELINEUP !!!`);
        }

        if (node.options) {
            for (const key in node.options) {
                traverse(node.options[key], key, name);
            }
        }
    };

    // Root node usually doesn't have a lookup name in options, but has a question
    traverse(treeJson, "ROOT", "");
}

main().catch(console.error);
