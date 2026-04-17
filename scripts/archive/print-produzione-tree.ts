import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const tree = await prisma.tree.findFirst({
        where: { name: 'PRODUZIONE' }
    });
    if (tree) {
        const json = JSON.parse(tree.jsonDecisionTree);
        console.log(JSON.stringify(json, null, 2).substring(0, 5000));
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
