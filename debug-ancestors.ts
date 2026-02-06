import { db } from './src/lib/db';
import { SchedulerService } from './src/lib/scheduler/scheduler-service';

async function main() {
    const task = await db.scheduledTask.findUnique({
        where: { id: 'cml9dn2z600098b6u6mncozlf' }
    });

    if (!task) {
        console.log('Task not found');
        return;
    }

    const config = task.config as any;
    console.log('Task config:');
    console.log('- treeId:', config.treeId);
    console.log('- nodeId:', config.nodeId);
    console.log('- nodePath:', config.nodePath);

    // Load tree
    const tree = await db.tree.findUnique({ where: { id: config.treeId } });
    if (!tree) {
        console.log('Tree not found');
        return;
    }

    const treeJson = JSON.parse(tree.jsonDecisionTree);

    // Test finding node by ID
    const scheduler = (SchedulerService as any).getInstance();
    const emailNode = (scheduler as any).findNodeById(treeJson, config.nodeId);
    console.log('\nEmail node found:', !!emailNode);
    if (emailNode) {
        console.log('Email node question:', emailNode.question);
        console.log('Email node id:', emailNode.id);
    }

    // Test getting ancestors
    const ancestors = (scheduler as any).getAncestorsForNode(treeJson, config.nodeId);
    console.log('\nAncestors found:', ancestors.length);
    ancestors.forEach((a: any) => {
        console.log(`- ${a.name} (${a.isPython ? 'Python' : 'SQL'})`);
    });

    await db.$disconnect();
}

main().catch(console.error);
