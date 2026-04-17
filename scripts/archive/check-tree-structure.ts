
import { db } from '@/lib/db';

async function checkTreeStructure() {
    const treeId = 'RzX9nFJGQUs832cLVvecO';
    const nodeId = 'f44076ce-181a-4c62-bb7d-7355f4e83640'; // The one we used? Wait, I need to check the script content first to be sure of the ID.
    // Actually, I'll read the script first, but I can write this generic checker now.

    const tree = await db.tree.findUnique({ where: { id: treeId } });
    if (!tree) {
        console.log("Tree not found");
        return;
    }

    console.log(`Tree Found: ${tree.name}`);

    let nodes: any[] = [];
    if (typeof tree.jsonDecisionTree === 'string') {
        try {
            const parsed = JSON.parse(tree.jsonDecisionTree);
            nodes = parsed.nodes || [];
        } catch (e) {
            console.log("Error parsing jsonDecisionTree");
        }
    } else if (typeof tree.jsonDecisionTree === 'object') {
        nodes = (tree.jsonDecisionTree as any).nodes || [];
    }

    console.log(`Total Nodes in Tree: ${nodes.length}`);

    // Check if our node exists
    // I will read the ID from the file in the next step, but let's list all nodes for now or check a specific one if I knew it.
    // I'll update this script to find the specific node once I read the previous script.
}

checkTreeStructure();
