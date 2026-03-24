/**
 * Migration script: Strip heavy preview data from existing tree JSONs.
 *
 * This processes trees ONE AT A TIME using raw SQL to avoid loading
 * the entire JSON into Node.js memory (which causes OOM).
 *
 * Strategy: Use PostgreSQL's jsonb functions to strip data server-side.
 * Since the tree structure is deeply nested and recursive, we use a
 * pragmatic approach: load tree IDs, then for each tree use a streaming
 * approach with limited memory.
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// Fields to strip from nodes (these contain the large data arrays)
const HEAVY_FIELDS = [
    'sqlPreviewData',
    'executionPreviewResult',
];

// For pythonPreviewResult, we keep metadata but strip data
const PYTHON_DATA_FIELDS = [
    'data', 'chartBase64', 'chartHtml', 'rechartsConfig',
    'rechartsData', 'rechartsStyle', 'html', 'variables',
];

function stripNode(node: any): boolean {
    if (!node || typeof node !== 'object') return false;
    let changed = false;

    for (const field of HEAVY_FIELDS) {
        if (node[field]) {
            delete node[field];
            changed = true;
        }
    }

    if (node.pythonPreviewResult) {
        const pr = node.pythonPreviewResult;
        let hadData = false;
        for (const f of PYTHON_DATA_FIELDS) {
            if (pr[f]) { hadData = true; break; }
        }
        if (hadData) {
            node.pythonPreviewResult = {
                type: pr.type,
                timestamp: pr.timestamp,
                ...(pr.plotlyStyleOverrides ? { plotlyStyleOverrides: pr.plotlyStyleOverrides } : {}),
                ...(pr.plotlyJson ? { plotlyJson: pr.plotlyJson } : {}),
                ...(pr.htmlStyleOverrides ? { htmlStyleOverrides: pr.htmlStyleOverrides } : {}),
            };
            changed = true;
        }
    }

    return changed;
}

function walkAndStrip(node: any): boolean {
    if (!node || typeof node !== 'object') return false;
    let changed = stripNode(node);

    if (node.options && typeof node.options === 'object') {
        for (const key in node.options) {
            const val = node.options[key];
            if (Array.isArray(val)) {
                for (const item of val) {
                    if (walkAndStrip(item)) changed = true;
                }
            } else {
                if (walkAndStrip(val)) changed = true;
            }
        }
    }
    if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
            if (walkAndStrip(child)) changed = true;
        }
    }
    return changed;
}

async function main() {
    console.log('=== Migration: Strip preview data from tree JSONs ===\n');

    // Get all tree IDs and their JSON sizes
    const trees = await db.$queryRaw<Array<{ id: string; size: number }>>`
        SELECT id, octet_length("jsonDecisionTree") as size
        FROM "Tree"
        ORDER BY octet_length("jsonDecisionTree") DESC
    `;

    console.log(`Found ${trees.length} trees.`);

    const totalBefore = trees.reduce((sum, t) => sum + t.size, 0);
    console.log(`Total JSON size before: ${(totalBefore / 1024 / 1024).toFixed(1)} MB\n`);

    let totalFreed = 0;
    let treesUpdated = 0;

    for (const treeMeta of trees) {
        const sizeMB = (treeMeta.size / 1024 / 1024).toFixed(2);

        // Skip tiny trees (less than 100KB)
        if (treeMeta.size < 100_000) {
            continue;
        }

        console.log(`Processing tree ${treeMeta.id} (${sizeMB} MB)...`);

        try {
            // Load just this tree's JSON
            const tree = await db.tree.findUnique({
                where: { id: treeMeta.id },
                select: { jsonDecisionTree: true },
            });

            if (!tree?.jsonDecisionTree) continue;

            const json = JSON.parse(tree.jsonDecisionTree);
            const changed = walkAndStrip(json);

            if (changed) {
                const newStr = JSON.stringify(json);
                const freed = treeMeta.size - Buffer.byteLength(newStr);

                await db.tree.update({
                    where: { id: treeMeta.id },
                    data: { jsonDecisionTree: newStr },
                });

                totalFreed += freed;
                treesUpdated++;
                console.log(`  -> Stripped! Freed ${(freed / 1024).toFixed(0)} KB (${sizeMB} MB -> ${(Buffer.byteLength(newStr) / 1024 / 1024).toFixed(2)} MB)`);
            } else {
                console.log(`  -> No heavy data found, skipping.`);
            }
        } catch (err: any) {
            console.error(`  -> ERROR: ${err.message}`);
        }
    }

    console.log(`\n=== Done! ===`);
    console.log(`Trees updated: ${treesUpdated}/${trees.length}`);
    console.log(`Total freed: ${(totalFreed / 1024 / 1024).toFixed(1)} MB`);

    await db.$disconnect();
}

main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
