
import { db } from '@/lib/db';

async function inspectTree() {
    const treeId = 'RzX9nFJGQUs832cLVvecO';
    const tree = await db.tree.findUnique({ where: { id: treeId } });

    if (!tree) {
        console.log("Tree not found");
        return;
    }

    const raw = tree.jsonDecisionTree;
    console.log("Type:", typeof raw);

    if (typeof raw === 'string') {
        console.log("Preview:", raw.substring(0, 500));
    } else {
        console.log("Preview Stringify:", JSON.stringify(raw).substring(0, 500));
    }
}

inspectTree();
