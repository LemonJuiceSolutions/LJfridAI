/**
 * scripts/diag-task-detail.ts
 *
 * Print full config + tree path for a list of task ids so we know exactly
 * which scheduler entries to fire from the UI when investigating slowness.
 */

import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const TARGET_IDS = [
    'cmlkfalmz00178131q1siv7mv', // top: 8883s avg / 17h worst
    'cmlfqtksx002bwa5gn41ezd6s', // 7991s avg / 9h worst
    'cmli16dze001pbq7ao98nfsyy', // 4607s avg
];

async function main() {
    for (const id of TARGET_IDS) {
        const t = await db.scheduledTask.findUnique({ where: { id } });
        if (!t) {
            console.log(`\n[${id}]  NOT FOUND`);
            continue;
        }
        const cfg: any = t.config || {};
        console.log(`\n=== ${t.name} ===`);
        console.log(`  id           ${t.id}`);
        console.log(`  type         ${t.type}`);
        console.log(`  status       ${t.status}`);
        console.log(`  cron         ${t.cronExpression || '(specific schedule)'}`);
        console.log(`  treeId       ${cfg.treeId || '?'}`);
        console.log(`  nodeId       ${cfg.nodeId || '?'}`);
        console.log(`  nodePath     ${cfg.nodePath || '?'}`);
        console.log(`  subject      ${cfg.subject || cfg.emailSubject || '(none)'}`);
        console.log(`  to           ${cfg.to || '(none)'}`);
        console.log(`  contextTables count: ${(cfg.contextTables || []).length}`);
        if (cfg.treeId) {
            const tree = await db.tree.findUnique({ where: { id: cfg.treeId }, select: { name: true } });
            console.log(`  treeName     ${tree?.name || '?'}`);
        }
        // Most recent runs
        const runs = await db.scheduledTaskExecution.findMany({
            where: { taskId: id },
            orderBy: { startedAt: 'desc' },
            take: 5,
            select: { startedAt: true, completedAt: true, status: true, error: true },
        });
        console.log(`  Last 5 runs:`);
        for (const r of runs) {
            const dur = r.completedAt
                ? ((r.completedAt.getTime() - r.startedAt.getTime()) / 1000).toFixed(1) + 's'
                : '(running?)';
            console.log(`    ${r.startedAt.toISOString()}  ${dur.padStart(10)}  ${r.status.padEnd(20)}  ${r.error?.slice(0, 80) || ''}`);
        }
    }
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
