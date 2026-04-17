import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const trees = await prisma.tree.findMany();
    for (const tree of trees) {
        if (tree.jsonDecisionTree.includes('EstrazioneSharePoint')) {
            console.log(`\nFound target string in Tree: ${tree.name} (${tree.id})`);
            const jsonTree = JSON.parse(tree.jsonDecisionTree);

            function search(node: any, path: string = 'root') {
                if (!node) return;

                const nodeStr = JSON.stringify(node);
                if (nodeStr.includes('EstrazioneSharePoint')) {
                    console.log(`\nNode containing string at ${path}:`);
                    console.log(JSON.stringify(node, null, 2));
                }

                if (node.options) {
                    for (const [key, child] of Object.entries(node.options)) {
                        if (Array.isArray(child)) {
                            child.forEach((c, i) => search(c, `${path}.options['${key}'][${i}]`));
                        } else {
                            search(child, `${path}.options['${key}']`);
                        }
                    }
                }
            }
            search(jsonTree);
        }
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
