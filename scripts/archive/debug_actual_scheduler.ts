
import { db } from '../src/lib/db';
import { SchedulerService } from '../src/lib/scheduler/scheduler-service';

// Mock logger to avoid clutter
const logger = {
    log: (msg: string) => console.log('[LOG]', msg),
    error: (msg: string, ...args: any[]) => console.error('[ERROR]', msg, ...args),
    warn: (msg: string) => console.warn('[WARN]', msg)
};

async function main() {
    const treeId = 'RzX9nFJGQUs832cLVvecO';
    console.log(`Fetching tree ${treeId}...`);
    const tree = await db.tree.findUnique({ where: { id: treeId } });

    if (!tree || !tree.jsonDecisionTree) {
        console.error('Tree not found');
        return;
    }

    const treeJson = JSON.parse(tree.jsonDecisionTree);

    console.log('--- Instantiating SchedulerService ---');
    // @ts-ignore - bypassing logger injection if constructor requires it?
    // Checking constructor signature... 
    // It seems to not take arguments or use a singleton pattern?
    // Let's assume standard instantiation.
    const service = new SchedulerService();

    console.log('--- Executing getAllNodesFromTree ---');
    // Accessing private method via cast to any
    const nodes = (service as any).getAllNodesFromTree(treeJson);

    console.log(`Found ${nodes.length} nodes.`);

    // Check specific nodes
    const targetIds = ['NC9jpnnG', 'gye2BUuO', '9LiHu3E2', '-A7oR6c8'];

    nodes.forEach((n: any) => {
        if (targetIds.includes(n.id)) {
            console.log(`\nNode ID: ${n.id}`);
            console.log(`  Name property: "${n.name}"`);
            console.log(`  All Names: ${JSON.stringify(n.allNames)}`);
            console.log(`  SQL Result: "${n.sqlResultName}"`);
        }
    });

    console.log('\n--- Checking Ancestor Chain Logic (Graph) ---');
    // Call executeAncestorChain to see the log output (since we mocked logger)
    // We need to pass nodes.

    // Mock results for executeAncestorChain to avoid real execution if possible?
    // Actually executeAncestorChain executes code. We might want to avoid that side effect.
    // However, the graph building happens BEFORE execution.
    // We can rely on the LOG output from the service which we are capturing via console.

    // We can't easily capture the log from the service unless we inject our logger.
    // SchedulerService imports a global 'logger'.

    // So we'll just check the specific node names returned by getAllNodesFromTree. 
    // If those are correct, verify_node_names.ts was right and the problem is deeper.
}

main().catch(console.error);
