
import { db } from '../src/lib/db';

async function main() {
    console.log(`Fetching all trees...`);
    const trees = await db.tree.findMany();

    for (const tree of trees) {
        if (!tree.jsonDecisionTree) continue;

        // Raw check
        if (tree.jsonDecisionTree.includes('PIPELINEUP')) {
            console.log(`!!! FOUND 'PIPELINEUP' IN TREE: ${tree.name} (${tree.id}) !!!`);
        }
        if (tree.jsonDecisionTree.includes('UP2ZHR')) {
            console.log(`!!! FOUND 'UP2ZHR' IN TREE: ${tree.name} (${tree.id}) !!!`);
        }

        const treeJson = JSON.parse(tree.jsonDecisionTree);

        const traverse = (node: any, path: string = '') => {
            if (!node) return;

            const currentPath = path ? `${path} > ${node.name}` : node.name;

            // Check if name matches UP2ZHR or if SQL contains PIPELINEUP
            const hasKeyword = (node.name && node.name.includes('UP2ZHR')) ||
                (node.sqlQuery && node.sqlQuery.includes('PIPELINEUP')) ||
                (node.pythonCode && node.pythonCode.includes('PIPELINEUP'));

            if (hasKeyword) {
                console.log(`\n---------------------------------------------------`);
                console.log(`FOUND NODE MATCHING CRITERIA`);
                console.log(`Path: ${currentPath}`);
                console.log(`Name: "${node.name}"`);
                console.log(`ID: ${node.id}`);
                console.log(`isPython: ${node.isPython}`);
                console.log(`Query/Code:`);
                console.log(node.sqlQuery || node.pythonCode);
                console.log(`Pipeline Dependencies:`, JSON.stringify(node.pipelineDependencies, null, 2));
                console.log(`---------------------------------------------------`);
            }

            if (node.options) {
                for (const key in node.options) {
                    const val = node.options[key];
                    if (Array.isArray(val)) {
                        val.forEach((n) => traverse(n, currentPath));
                    } else if (typeof val === 'object') {
                        traverse(val, currentPath);
                    }
                }
            }
        };

        try {
            traverse(treeJson);
        } catch (e) {
            console.error(`Error traversing tree ${tree.id}:`, e);
        }
    }
}

main().catch(console.error);
