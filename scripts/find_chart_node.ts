
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findPipeline() {
    const pipelines = await prisma.pipeline.findMany();

    for (const p of pipelines) {
        // Check pipeline name
        if (p.name && p.name.toUpperCase().includes('FINANCE')) {
            console.log(`MATCH PIPELINE NAME: ${p.id} (${p.name})`);
        }

        const nodes = (typeof p.nodes === 'string' ? JSON.parse(p.nodes) : p.nodes) as Record<string, any>;
        for (const [id, node] of Object.entries(nodes)) {
            if (
                node.title === 'Chart' ||
                node.decision === 'Chart' ||
                node.question === 'Chart' ||
                node.label === 'Chart'
            ) {
                console.log(`Found pipeline: ${p.id} (${p.name})`);
                console.log(`Node ID: ${id}`);
                console.log(`Node Title: ${node.title}`);
                return;
            }
        }
    }
    console.log("No pipeline found with a node named 'Chart'");
}

findPipeline()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
