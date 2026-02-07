import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
    const trees = await db.tree.findMany();

    for (const tree of trees) {
        const json = JSON.parse(tree.jsonDecisionTree);

        // Find node by ID 4BbRgfc5
        const findNodeById = (obj: any, path: string = 'root'): any => {
            if (!obj || typeof obj !== 'object') return null;

            if (obj.id === '4BbRgfc5') {
                return { tree: tree.name, treeId: tree.id, node: obj, path };
            }

            if (obj.options) {
                for (const key of Object.keys(obj.options)) {
                    const found = findNodeById(obj.options[key], path + '->' + key);
                    if (found) return found;
                }
            }
            return null;
        };

        const result = findNodeById(json);

        if (result) {
            console.log('=== FOUND NODE 4BbRgfc5 ===');
            console.log('Tree:', result.tree);
            console.log('TreeId:', result.treeId);
            console.log('Path:', result.path);
            console.log('ID:', result.node.id);
            console.log('To:', result.node.to);
            console.log('Subject:', result.node.subject);
            console.log('Body:', result.node.body?.substring(0, 300));
            console.log('\nAttachments:');
            console.log(JSON.stringify(result.node.attachments, null, 2));
            break;
        }
    }

    await db.$disconnect();
}

main().catch(console.error);
