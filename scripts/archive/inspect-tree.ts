// Dump raw tree JSON - find Pipeline Prodotto and NORM nodes
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const tree = await prisma.tree.findUnique({ where: { id: '4OtZT6m_2q7T7LpEpYoDC' } });
    if (!tree) { console.log('Not found'); return; }

    const json = JSON.parse(tree.jsonDecisionTree);

    function walkNodes(node: any, path: string = 'root') {
        if (!node || typeof node !== 'object') return;

        const name = node.question || node.decision || node.name;
        const sqlResultName = node.sqlResultName;
        const pythonResultName = node.pythonResultName;
        const hasSql = !!node.sqlQuery;
        const hasPython = !!node.pythonCode;

        if (name) {
            const allPipelines = [
                ...(node.sqlSelectedPipelines || []),
                ...(node.selectedPipelines || []),
                ...(node.pythonSelectedPipelines || [])
            ];

            // Only print nodes related to Pipeline Prodotto / PIPELINEUP / NORM / UP2ZHR
            const isRelevant = name.toLowerCase().includes('pipeline') ||
                name.toLowerCase().includes('prodotto') ||
                name.toLowerCase().includes('norm') ||
                name.toLowerCase().includes('up2zhr') ||
                sqlResultName?.toLowerCase().includes('pipelineup') ||
                pythonResultName?.toLowerCase().includes('pipelineup') ||
                sqlResultName?.toLowerCase().includes('up2zhr') ||
                allPipelines.some((p: string) => p.toLowerCase().includes('pipeline'));

            if (isRelevant) {
                console.log(`\n${'='.repeat(80)}`);
                console.log(`PATH: ${path}`);
                console.log(`NAME/QUESTION: ${name}`);
                console.log(`node.name: ${node.name}`);
                console.log(`node.question: ${node.question}`);
                console.log(`node.decision: ${node.decision}`);
                console.log(`ID: ${node.id || 'N/A'}`);
                if (sqlResultName) console.log(`SQL_RESULT_NAME: ${sqlResultName}`);
                if (pythonResultName) console.log(`PYTHON_RESULT_NAME: ${pythonResultName}`);
                console.log(`HAS_SQL: ${hasSql}, HAS_PYTHON: ${hasPython}`);
                if (allPipelines.length > 0) console.log(`SELECTED_PIPELINES: ${JSON.stringify(allPipelines)}`);

                if (node.pipelineDependencies && node.pipelineDependencies.length > 0) {
                    console.log(`PIPELINE_DEPENDENCIES:`);
                    node.pipelineDependencies.forEach((d: any, i: number) => {
                        console.log(`  [${i}] tableName="${d.tableName}" nodeName="${d.nodeName || 'N/A'}"`);
                    });
                }

                if (hasSql) {
                    console.log(`SQL_QUERY (first 300 chars): ${node.sqlQuery.substring(0, 300)}`);
                }
            }
        }

        // Recurse
        if (node.options && typeof node.options === 'object') {
            for (const key of Object.keys(node.options)) {
                const child = node.options[key];
                if (Array.isArray(child)) {
                    child.forEach((item: any, idx: number) => walkNodes(item, `${path}->${key}[${idx}]`));
                } else {
                    walkNodes(child, `${path}->${key}`);
                }
            }
        }
    }

    walkNodes(json);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
