
import { db } from '@/lib/db';
import _ from 'lodash';

async function patchChartDependencies() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';
    console.log(`Patching Task: ${taskId}`);

    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) return console.error('Task not found');

    // We need to modify the Tree structure stored in 'config' (Wait, is it stored in config? Or does it verify against the live tree?)
    // The task has `config.contextTables` which we patched.
    // BUT the email action uses the `emailNode` options which come from the tree SNAPSHOT or LIVE TREE?

    // Checking `scheduler-service.ts`:
    // executeEmailSend(...) -> it likely uses the node definition passed to it.
    // The node definition comes from:
    // `const emailNode = findNode(tree, ...)`? 
    // No, the scheduler typically executes the task based on the SNAPSHOT in `config`.

    // Let's look at the `config` object structure more in depth.
    // The `config` object usually has `treeId` and maybe `jsonDecisionTree`?
    // If `config` ONLY has `contextTables`, then where does it get the Email Node definition?

    // IF the scheduler verifies against the LIVE tree, then I need to update the LIVE TREE in `db.tree`.
    // IF the scheduler uses a snapshot in `config`, I need to update `config`.

    // From previous logs: `const tree = await db.tree.findUnique...`
    // The scheduler loads the LIVE tree using `config.treeId`.
    // THEN it finds the start node.

    // SO I need to update the LIVE TREE (`db.tree`)!
    // My previous patch updated `ScheduledTask.config.contextTables`.
    // But the charts are failing because the CODE in the LIVE TREE nodes doesn't have the dependencies set.

    const treeConfig = task.config as any;
    const tree = await db.tree.findUnique({ where: { id: treeConfig.treeId } });
    if (!tree) return console.error('Tree not found');

    let jsonTree = JSON.parse(tree.jsonDecisionTree);
    let updated = false;

    const traverseAndPatch = (node: any, path: string) => {
        if (!node || typeof node !== 'object') return;

        // PATCH Logic
        if (node.pythonCode && node.pythonCode.includes('PRODFIL2')) {
            const deps = node.pipelineDependencies || [];
            const hasProdFil2 = deps.some((d: any) => d.tableName === 'PRODFIL2');

            if (!hasProdFil2) {
                console.log(`[Patching] Adding PRODFIL2 dependency to node at ${path} (ID: ${node.id})`);
                deps.push({
                    tableName: 'PRODFIL2',
                    query: 'SELECT * FROM dbo.PRODFIL',
                    connectorId: 'cmkgdzm2t0004f0a2yi0phyhz' // MAGO4
                });
                node.pipelineDependencies = deps;
                updated = true;
            }
        }

        if (node.pythonCode && node.pythonCode.includes('Fatturato')) {
            const deps = node.pipelineDependencies || [];
            const hasFatturato = deps.some((d: any) => d.tableName === 'Fatturato');

            if (!hasFatturato) {
                console.log(`[Patching] Adding Fatturato dependency to node at ${path} (ID: ${node.id})`);
                deps.push({
                    tableName: 'Fatturato'
                });
                node.pipelineDependencies = deps;
                updated = true;
            }
        }

        // Generic Traversal
        for (const key in node) {
            const val = node[key];
            if (typeof val === 'object' && val !== null) {
                if (key !== 'pipelineDependencies') { // Don't traverse into deps we just modified
                    traverseAndPatch(val, `${path}->${key}`);
                }
            }
        }
    };
    traverseAndPatch(jsonTree, 'root');

    if (updated) {
        console.log('Updating LIVE TREE with patched dependencies...');
        await db.tree.update({
            where: { id: tree.id },
            data: { jsonDecisionTree: JSON.stringify(jsonTree) }
        });
        console.log('Tree updated.');

        // Also trigger a task next run
        await db.scheduledTask.update({
            where: { id: taskId },
            data: { nextRunAt: new Date(), failureCount: 0, lastError: null }
        });
        console.log('Task scheduled.');
    } else {
        console.log('No patches needed.');
    }
}

patchChartDependencies().catch(console.error).finally(() => db.$disconnect());
