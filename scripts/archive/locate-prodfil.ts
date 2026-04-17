
import { db } from '../src/lib/db';

async function main() {
    const tree = await db.tree.findFirst({
        where: { name: 'PRODUZIONE' }
    });

    if (!tree) {
        console.error('Tree "PRODUZIONE" not found');
        return;
    }

    const json = JSON.parse(tree.jsonDecisionTree || '{}');

    function findRecursive(node: any, path: string = 'root'): any {
        if (!node || typeof node !== 'object') return null;

        if (node.sqlResultName === 'PRODFIL') {
            return { node, path };
        }

        if (node.options) {
            for (const [key, value] of Object.entries(node.options)) {
                const found = findRecursive(value, `${path}.options["${key}"]`);
                if (found) return found;
            }
        }
        return null;
    }

    const result = findRecursive(json);
    if (result) {
        console.log(`Found node at path: ${result.path}`);
        console.log(`Node name: ${result.node.question || result.node.decision || result.node.name || 'Unnamed'}`);
        console.log(`JSON:\n${JSON.stringify(result.node, null, 2)}`);
    } else {
        console.log('Node producing "PRODFIL" not found');
    }
}

main().catch(console.error);
