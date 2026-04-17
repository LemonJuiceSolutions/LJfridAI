import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
    const trees = await db.tree.findMany();

    console.log('Searching all trees for email nodes...\n');

    for (const tree of trees) {
        const json = JSON.parse(tree.jsonDecisionTree);

        // Find all email nodes (have 'to' and 'subject' fields)
        const findEmails = (obj: any, path: string = 'root', results: any[] = []): any[] => {
            if (!obj || typeof obj !== 'object') return results;

            if (obj.to && obj.subject) {
                results.push({
                    id: obj.id,
                    to: obj.to,
                    subject: obj.subject,
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
                console.log('  Email ID:', e.id);
                console.log('  Subject:', e.subject);
                console.log('  To:', e.to);
                console.log('  Path:', e.path);
                console.log();
            }
        }
    }

    await db.$disconnect();
}

main().catch(console.error);
