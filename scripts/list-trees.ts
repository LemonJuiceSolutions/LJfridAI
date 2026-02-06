
import { db } from '@/lib/db';

async function listTrees() {
    const trees = await db.tree.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' }
    });
    console.log("Found Trees:");
    trees.forEach(t => console.log(`- ${t.name} (${t.id})`));
}

listTrees();
