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

    // Recursively find all nodes
    const findNodes = (obj: any, path: string = 'root', results: any[] = []): any[] => {
        if (!obj || typeof obj !== 'object') return results;

        const name = obj.name || obj.sqlResultName || obj.pythonResultName;
        if (name || obj.id) {
            results.push({
                path,
                name: name || obj.id,
                id: obj.id,
                type: obj.pythonCode ? 'Python' : (obj.sqlQuery ? 'SQL' : (obj.to ? 'Email' : 'Other')),
                sqlQuery: obj.sqlQuery ? obj.sqlQuery.substring(0, 60) + '...' : null,
                pythonCode: obj.pythonCode ? obj.pythonCode.substring(0, 60) + '...' : null,
                pipelineDependencies: obj.pipelineDependencies || [],
                to: obj.to,
                subject: obj.subject
            });
        }

        if (obj.options) {
            for (const key of Object.keys(obj.options)) {
                findNodes(obj.options[key], path + '->' + key, results);
            }
        }
        return results;
    };

    const nodes = findNodes(json);
    console.log('All nodes in tree:', nodes.length);
    console.log();

    for (const n of nodes) {
        console.log('---', n.name, '(', n.type, ')');
        console.log('    Path:', n.path);
        console.log('    ID:', n.id);
        if (n.pipelineDependencies.length > 0) {
            console.log('    Dependencies:', n.pipelineDependencies.map((d: any) => d.tableName || d.name).join(', '));
        }
        if (n.to) {
            console.log('    Email to:', n.to);
            console.log('    Subject:', n.subject);
        }
        console.log();
    }

    await db.$disconnect();
}

main().catch(console.error);
