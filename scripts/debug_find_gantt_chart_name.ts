
import { db } from '../src/lib/db';

async function main() {
    const treeId = 'RzX9nFJGQUs832cLVvecO'; // Tree PRODUZIONE
    console.log(`Searching for 'Gantt' in tree ${treeId}...`);

    const tree = await db.tree.findUnique({ where: { id: treeId } });
    if (!tree) {
        console.error('Tree not found!');
        return;
    }

    const treeJson = JSON.parse(tree.jsonDecisionTree);
    const targetName = 'Gantt';

    const traverse = (node: any, path: string = 'root') => {
        if (!node) return;

        const allNames = [node.name, node.sqlResultName, node.pythonResultName].filter(Boolean) as string[];
        const nodeName = allNames[0] || 'undefined';

        if (nodeName.includes(targetName) || (node.question && node.question.includes(targetName)) || JSON.stringify(node).includes(targetName)) {
            // Basic check if the node itself is relevant
            if (nodeName.includes(targetName) || node.question?.includes(targetName)) {
                console.log(`\nFOUND NODE MATCHING '${targetName}':`);
                console.log(`ID: ${node.id}`);
                console.log(`Path: ${path}`);
                console.log(`Name: ${node.name}`);
                console.log(`Python Result Name: ${node.pythonResultName}`);
                console.log(`SQL Result Name: ${node.sqlResultName}`);
                console.log(`Question: ${node.question}`);
                console.log(`Node Config: ${JSON.stringify(node, null, 2)}`);
            }
        }

        if (node.options) {
            for (const key in node.options) {
                const val = node.options[key];
                const childPath = `${path} > ${key}`;
                if (Array.isArray(val)) {
                    val.forEach((item, idx) => traverse(item, `${childPath}[${idx}]`));
                } else {
                    traverse(val, childPath);
                }
            }
        }
    };

    traverse(treeJson);
}

main().catch(console.error);
