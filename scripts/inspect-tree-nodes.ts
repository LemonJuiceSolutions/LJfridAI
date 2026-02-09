import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const trees = await prisma.tree.findMany();
    if (trees.length === 0) {
        console.log("No trees found in the database.");
        return;
    }

    const tree = trees[0];
    console.log(`Inspecting Tree: ${tree.name} (${tree.id})`);

    try {
        const jsonTree = JSON.parse(tree.jsonDecisionTree);

        function findNodesWithQueries(node: any, path: string = 'root') {
            if (!node) return;

            if (node.sqlQuery || node.pythonCode) {
                console.log(`\nNode at ${path}:`);
                console.log(`  Name: ${node.name || node.question || node.decision}`);
                console.log(`  ID: ${node.id}`);
                console.log(`  Type: ${node.type}`);
                console.log(`  isPython: ${node.isPython}`);
                console.log(`  Has sqlQuery: ${!!node.sqlQuery}`);
                console.log(`  Has pythonCode: ${!!node.pythonCode}`);
                console.log(`  Result names: SQL=${node.sqlResultName}, Python=${node.pythonResultName}`);
            }

            if (node.options) {
                for (const [key, child] of Object.entries(node.options)) {
                    if (Array.isArray(child)) {
                        child.forEach((c, i) => findNodesWithQueries(c, `${path}.options['${key}'][${i}]`));
                    } else {
                        findNodesWithQueries(child, `${path}.options['${key}']`);
                    }
                }
            }
        }

        findNodesWithQueries(jsonTree);

    } catch (e) {
        console.error("Failed to parse tree JSON:", e);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
