import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
    const trees = await db.tree.findMany();

    console.log('Searching all trees for email action nodes...\n');

    for (const tree of trees) {
        const json = JSON.parse(tree.jsonDecisionTree);

        // Find all nodes with emailAction field
        const findEmails = (obj: any, path: string = 'root', results: any[] = []): any[] => {
            if (!obj || typeof obj !== 'object') return results;

            if (obj.emailAction || obj.nodeType === 'email') {
                results.push({
                    id: obj.id,
                    nodeType: obj.nodeType,
                    emailAction: obj.emailAction,
                    path
                });
            }

            if (obj.options) {
                for (const key of Object.keys(obj.options)) {
                    findEmails(obj.options[key], path + '->' + key, results);
                }
            }
            return results;
        };

        const emails = findEmails(json);

        if (emails.length > 0) {
            console.log('Tree:', tree.name, '(' + tree.id + ')');
            for (const e of emails) {
                console.log('  ID:', e.id);
                console.log('  NodeType:', e.nodeType);
                if (e.emailAction) {
                    console.log('  To:', e.emailAction.to);
                    console.log('  Subject:', e.emailAction.subject);
                }
                console.log('  Path:', e.path);
                console.log();
            }
        }
    }

    // Also check raw JSON for any node with ID containing 'BbRgfc'
    console.log('\n\nSearching for node ID containing BbRgfc5...');
    for (const tree of trees) {
        if (tree.jsonDecisionTree.includes('4BbRgfc5')) {
            console.log('Found in tree:', tree.name, '(' + tree.id + ')');
        }
    }

    await db.$disconnect();
}

main().catch(console.error);
