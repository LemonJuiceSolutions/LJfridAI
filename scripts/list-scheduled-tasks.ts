
import { db } from '@/lib/db';

// Helper to recursively find a node by ID
function findNodeNameRecursive(node: any, targetId: string): string | null {
    if (!node) return null;

    // Check current node
    if (node.id === targetId) {
        return node.question || node.decision || "Unnamed Node";
    }

    // Traverse options (children)
    if (node.options) {
        for (const key of Object.keys(node.options)) {
            const children = node.options[key]; // This can be an object or array?
            // In the preview: "ConnessioneSharePoint": [ ... ] (Array)
            // "Gantt": { ... } (Object?) Wait, preview showed:
            // "options": { "Gantt": { "question": ... } } -> So value is correct Node object directly?
            // BUT "ConnessioneSharePoint": [ { ... } ] -> Array?
            // Let's handle both.

            if (Array.isArray(children)) {
                for (const child of children) {
                    const found = findNodeNameRecursive(child, targetId);
                    if (found) return found;
                }
            } else if (typeof children === 'object') {
                const found = findNodeNameRecursive(children, targetId);
                if (found) return found;
            }
        }
    }

    return null;
}

async function listScheduledTasks() {
    const tasks = await db.scheduledTask.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { company: true }
    });

    if (tasks.length === 0) {
        console.log("No scheduled tasks found.");
        return;
    }

    // Fetch unique trees to avoid repeated queries
    const treeIds = [...new Set(tasks.map(t => (t.config as any)?.treeId || (t as any)['treeId']).filter(id => id))];
    const trees = await db.tree.findMany({
        where: { id: { in: treeIds as string[] } }
    });

    const treeMap = new Map();
    trees.forEach(t => {
        let root = null;
        try {
            const json = typeof t.jsonDecisionTree === 'string' ? JSON.parse(t.jsonDecisionTree) : t.jsonDecisionTree;
            root = json;
        } catch (e) {
            console.error(`Error parsing tree ${t.id}`, e);
        }

        treeMap.set(t.id, { name: t.name, root });
    });

    console.log("=== Active Scheduled Tasks (With Node Names) ===");

    for (const t of tasks) {
        if (t.status !== 'active') continue;

        const config = t.config as any;
        const treeId = config.treeId || (t as any)['treeId'];
        const nodeId = config.nodeId || (t as any)['nodeId'];

        const treeInfo = treeMap.get(treeId);
        let nodeName = "UNKNOWN NODE";

        if (treeInfo && treeInfo.root) {
            const foundName = findNodeNameRecursive(treeInfo.root, nodeId);
            if (foundName) {
                nodeName = foundName;
            } else if (nodeId && nodeId.length > 30) {
                nodeName = "Virtual Test Node " + nodeId.substring(0, 8) + "...";
            }
        } else {
            nodeName = "Tree Not Found / Invalid JSON";
        }

        console.log(`- TaskName: "${t.name}"`);
        console.log(`  Tree: "${treeInfo?.name || treeId}"`);
        console.log(`  Node: "${nodeName}" (ID: ${nodeId})`);
        console.log(`  Frequency: ${t.scheduleType} ${t.intervalMinutes ? `every ${t.intervalMinutes}m` : ''}`);
        console.log('---');
    }
}

listScheduledTasks();
