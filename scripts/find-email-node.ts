import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
    const tree = await db.tree.findUnique({
        where: { id: 'RzX9nFJGQUs832cLVvecO' }
    });

    if (!tree) {
        console.log('Tree not found');
        return;
    }

    const json = JSON.parse(tree.jsonDecisionTree);

    // Find email node by ID 4BbRgfc5
    const findEmailNode = (obj: any, path: string = 'root'): any => {
        if (!obj || typeof obj !== 'object') return null;

        if (obj.id === '4BbRgfc5') {
            return { node: obj, path };
        }

        if (obj.to && obj.subject) {
            console.log('Found email node at', path, '- ID:', obj.id);
        }

        if (obj.options) {
            for (const key of Object.keys(obj.options)) {
                const found = findEmailNode(obj.options[key], path + '->' + key);
                if (found) return found;
            }
        }
        return null;
    };

    const result = findEmailNode(json);

    if (result) {
        console.log('\n=== Email Node Found ===');
        console.log('Path:', result.path);
        console.log('ID:', result.node.id);
        console.log('To:', result.node.to);
        console.log('Subject:', result.node.subject);
        console.log('Body snippet:', result.node.body?.substring(0, 200));
        console.log('\nAttachments config:');
        console.log(JSON.stringify(result.node.attachments, null, 2));
    } else {
        console.log('Email node 4BbRgfc5 not found');

        // List all email nodes
        const findAllEmails = (obj: any, results: any[] = []): any[] => {
            if (!obj || typeof obj !== 'object') return results;

            if (obj.to && obj.subject) {
                results.push({ id: obj.id, to: obj.to, subject: obj.subject });
            }

            if (obj.options) {
                for (const key of Object.keys(obj.options)) {
                    findAllEmails(obj.options[key], results);
                }
            }
            return results;
        };

        const emails = findAllEmails(json);
        console.log('All email nodes in tree:');
        for (const e of emails) {
            console.log('-', e.id, e.subject, '->', e.to);
        }
    }

    await db.$disconnect();
}

main().catch(console.error);
