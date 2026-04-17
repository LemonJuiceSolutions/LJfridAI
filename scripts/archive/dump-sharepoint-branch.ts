
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

    function dumpBranch(node: any, path: string = 'root'): void {
        if (!node || typeof node !== 'object') return;

        const label = node.question || node.decision || node.name || 'Unnamed';
        const result = node.sqlResultName || node.pythonResultName || 'None';
        const sqlDeps = JSON.stringify(node.sqlSelectedPipelines || []);
        const pyDeps = JSON.stringify(node.pythonSelectedPipelines || []);

        console.log(`[${path}] ${label}`);
        console.log(`  -> Result: ${result}`);
        if (sqlDeps !== '[]') console.log(`  <- SQL Deps: ${sqlDeps}`);
        if (pyDeps !== '[]') console.log(`  <- Python Deps: ${pyDeps}`);

        if (node.options) {
            for (const [key, value] of Object.entries(node.options)) {
                if (Array.isArray(value)) {
                    value.forEach((v, i) => dumpBranch(v, `${path}.options["${key}"][${i}]`));
                } else {
                    dumpBranch(value, `${path}.options["${key}"]`);
                }
            }
        }
    }

    const branch = json.options["ConnessioneSharePoint"];
    if (Array.isArray(branch)) {
        branch.forEach((v, i) => dumpBranch(v, `root.options["ConnessioneSharePoint"][${i}]`));
    } else {
        dumpBranch(branch, `root.options["ConnessioneSharePoint"]`);
    }
}

main().catch(console.error);
