
import { db } from '@/lib/db';

async function refreshTaskPythonOutputs() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';
    console.log(`Refreshing Task Python Outputs: ${taskId}`);

    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) return console.error('Task not found');

    const config = task.config as any;
    const treeId = config.treeId;
    const tree = await db.tree.findUnique({ where: { id: treeId } });
    if (!tree) return console.error('Tree not found');

    const jsonTree = JSON.parse(tree.jsonDecisionTree);
    const currentOutputs = config.selectedPythonOutputs || [];

    if (currentOutputs.length === 0) {
        console.log('No selectedPythonOutputs to refresh.');
        return;
    }

    const newOutputs: any[] = [];

    // Helper to find node by ID or Name match
    const findNode = (root: any, target: any) => {
        let foundIdx: any = null;

        const traverse = (node: any) => {
            if (!node || typeof node !== 'object') return;

            // Match criteria:
            // 1. Exact ID match (if target has ID) -> target might not have ID if it was stale
            // 2. Name match (pythonResultName or name)

            const name = node.name || node.pythonResultName;
            const targetName = target.name || target.pythonResultName;

            if (name && targetName && name === targetName) {
                foundIdx = node;
                return; // found
            }

            // If target has ID, use that
            if (target.id && node.id === target.id) {
                foundIdx = node;
                return;
            }

            // Special check for our known charts if exact match fails
            if (targetName && targetName.includes('Gantt') && name && name.includes('Gantt')) {
                foundIdx = node;
                return;
            }
            // Manual ID Fallback for Gantt - Capacity - Sum
            if (targetName === 'Gantt - Capacity - Sum' && node.id === '4BbRgfc5') {
                foundIdx = node;
                return;
            }

            if (targetName && targetName.includes('BDG') && name && name.includes('BDG')) {
                foundIdx = node;
                return;
            }

            // Generic Traversal for Arrays and Objects
            for (const key in node) {
                const val = node[key];
                if (typeof val === 'object' && val !== null) {
                    if (!foundIdx) traverse(val);
                }
            }
        };

        traverse(root);
        return foundIdx;
    };

    for (const oldOutput of currentOutputs) {
        console.log(`Looking for fresh node for: ${oldOutput.name || oldOutput.pythonResultName}`);
        const freshNode = findNode(jsonTree, oldOutput);

        if (freshNode) {
            console.log(`  ✅ Found fresh node! ID: ${freshNode.id}`);
            console.log(`  Dependencies: ${JSON.stringify(freshNode.pipelineDependencies)}`);

            // Reconstruct the output object expected by scheduler
            // Usually it needs: id, name, type, pythonCode, pythonResultName, pipelineDependencies, connectorId
            newOutputs.push({
                ...freshNode, // Take everything from fresh node
                // Ensure critical fields are present
                pipelineDependencies: freshNode.pipelineDependencies,
                pythonCode: freshNode.pythonCode,
                type: freshNode.type || 'python', // Ensure type
                isPython: true
            });
        } else {
            console.log(`  ❌ Could not find fresh node. Keeping old one.`);
            newOutputs.push(oldOutput);
        }
    }

    // Update Task
    const newConfig = {
        ...config,
        selectedPythonOutputs: newOutputs
    };

    await db.scheduledTask.update({
        where: { id: taskId },
        data: {
            config: newConfig,
            nextRunAt: new Date(),
            failureCount: 0,
            lastError: null
        }
    });

    console.log('Task Config Updated with fresh Python Outputs.');
}

refreshTaskPythonOutputs().catch(console.error).finally(() => db.$disconnect());
