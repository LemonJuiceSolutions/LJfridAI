import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const tree = await prisma.tree.findFirst({
        where: { name: 'PRODUZIONE' }
    });
    if (tree) {
        const jsonTree = JSON.parse(tree.jsonDecisionTree);

        function search(node: any, path: string = 'root') {
            if (!node) return;

            const hasSpecial = node.sharepointPath || node.sharepointAction ||
                node.emailAction || node.emailTemplate ||
                node.hubspotAction || node.type === 'sharepoint' ||
                node.type === 'email' || node.type === 'hubspot' ||
                (node.name && node.name.includes('SharePoint'));

            if (hasSpecial) {
                console.log(`\nSpecial Node at ${path}:`);
                console.log(`  Name: ${node.name || node.text}`);
                console.log(`  ID: ${node.id}`);
                console.log(`  Type: ${node.type}`);
                console.log(`  isPython: ${node.isPython}`);
                console.log(`  sharepointPath: ${node.sharepointPath}`);
                console.log(`  sharepointAction: ${node.sharepointAction}`);
                console.log(`  Has sqlQuery: ${!!node.sqlQuery}`);
                console.log(`  Has pythonCode: ${!!node.pythonCode}`);
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

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
