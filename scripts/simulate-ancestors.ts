
import { db } from '../src/lib/db';

async function main() {
    const tree = await db.tree.findFirst({
        where: { name: 'PRODUZIONE' }
    });

    if (!tree) {
        console.error('Tree "PRODUZIONE" not found');
        return;
    }

    const root = JSON.parse(tree.jsonDecisionTree || '{}');
    const flatTree: any[] = [];

    function flatten(node: any, path: string = 'root') {
        if (!node || typeof node !== 'object') return;
        flatTree.push({ node, path });
        if (node.options) {
            for (const [key, value] of Object.entries(node.options)) {
                if (Array.isArray(value)) {
                    value.forEach((v, i) => flatten(v, `${path}.options["${key}"][${i}]`));
                } else {
                    flatten(value, `${path}.options["${key}"]`);
                }
            }
        }
    }

    flatten(root);

    const resolveDependencies = (node: any, visited: Set<string> = new Set()): any[] => {
        const deps: any[] = [];
        const pipelines = [...(node.pythonSelectedPipelines || []), ...(node.sqlSelectedPipelines || [])];

        pipelines.forEach(pName => {
            if (visited.has(pName)) return;

            const sourceItem = flatTree.find((item: any) => {
                const n = item.node;
                return n && typeof n === 'object' &&
                    ((n.pythonResultName === pName && n.pythonCode) || (n.sqlResultName === pName));
            });

            if (sourceItem) {
                const sn = sourceItem.node;
                const newVisited = new Set(visited);
                newVisited.add(pName);

                deps.push({
                    tableName: pName,
                    isPython: !!(sn.pythonResultName === pName),
                    pythonCode: sn.pythonResultName === pName ? sn.pythonCode : undefined,
                });
            }
        });
        return deps;
    };

    const currentPath = 'root.options["ConnessioneSharePoint"][0].options["ElaboraDati"][0].options["Minuti Capacity"].options["Chart"].options["Capacità e Saturazione"]';

    const ancestorItems: any[] = [];
    flatTree.forEach((item: any) => {
        const actualNode = item.node;
        const nodePath = item.path;
        const startsWithPath = currentPath.startsWith(nodePath);
        const charAfter = currentPath.charAt(nodePath.length);
        let isAncestor = currentPath !== nodePath && startsWithPath && (charAfter === '.' || charAfter === '[' || charAfter === '');

        if (isAncestor) {
            if (actualNode.sqlResultName) {
                ancestorItems.push({
                    name: actualNode.sqlResultName,
                    isPython: false,
                    pythonCode: undefined,
                });
            }
            if (actualNode.pythonResultName && actualNode.pythonCode) {
                ancestorItems.push({
                    name: actualNode.pythonResultName,
                    isPython: true,
                    pythonCode: actualNode.pythonCode,
                });
            }
        }
    });

    console.log('--- ANCESTORS FOR PATH ---');
    console.log(JSON.stringify(ancestorItems, null, 2));
}

main().catch(console.error);
