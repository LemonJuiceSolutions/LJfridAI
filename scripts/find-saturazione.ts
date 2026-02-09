
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

    function findNodeByName(obj: any, target: string, path: string = 'root'): any {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.question === target || obj.decision === target || obj.name === target) return { node: obj, path };
        for (const [key, value] of Object.entries(obj)) {
            const found = findNodeByName(value, target, `${path}.${key}`);
            if (found) return found;
        }
        return null;
    }

    const result = findNodeByName(json, 'Dati Saturazione e Capacità');
    if (result) {
        console.log(`Found node at path: ${result.path}`);
        console.log(`SQL Selected Pipelines: ${JSON.stringify(result.node.sqlSelectedPipelines)}`);
        console.log(`Python Selected Pipelines: ${JSON.stringify(result.node.pythonSelectedPipelines)}`);
    } else {
        console.log('Node "Dati Saturazione e Capacità" not found');
        // Let's try searching for "Saturazione"
        const result2 = findNodeByName(json, 'Saturazione');
        if (result2) console.log(`Found "Saturazione" at: ${result2.path}`);
    }
}

main().catch(console.error);
