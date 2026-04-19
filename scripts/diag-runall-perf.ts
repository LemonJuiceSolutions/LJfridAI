/**
 * scripts/diag-runall-perf.ts
 *
 * One-shot diagnostic: counts the tasks that "Esegui tutti" would fire and
 * shows the recent-execution timing distribution. Use to size the run-all
 * total wall-time before committing to a larger optimisation pass.
 *
 *   npx tsx scripts/diag-runall-perf.ts
 */

// Use PrismaClient directly — importing src/lib/db pulls in encryption.ts which
// requires the `server-only` package, and that throws when loaded outside Next.
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
    const eligible = await db.scheduledTask.findMany({
        where: {
            OR: [{ scheduleType: 'specific' }, { cronExpression: { not: null } }],
        },
        select: { id: true, name: true, type: true, status: true, companyId: true },
        orderBy: { createdAt: 'asc' },
    });

    const byCompany: Record<string, typeof eligible> = {};
    for (const t of eligible) {
        const c = t.companyId || 'unknown';
        (byCompany[c] = byCompany[c] || []).push(t);
    }

    console.log(`\n=== run-all eligibility ===`);
    console.log(`Total eligible tasks (specific or cron): ${eligible.length}`);
    for (const [cid, list] of Object.entries(byCompany)) {
        const byType = list.reduce<Record<string, number>>(
            (acc, t) => ((acc[t.type] = (acc[t.type] || 0) + 1), acc),
            {},
        );
        console.log(`  company=${cid.slice(0, 12)}…  total=${list.length}  ${JSON.stringify(byType)}`);
    }

    const recent = await db.scheduledTaskExecution.findMany({
        orderBy: { startedAt: 'desc' },
        take: 200,
        select: { taskId: true, startedAt: true, completedAt: true, status: true },
    });
    const durations = recent
        .filter((r) => r.completedAt)
        .map((r) => ({
            id: r.taskId,
            ms: (r.completedAt as Date).getTime() - r.startedAt.getTime(),
            status: r.status,
        }));

    if (durations.length === 0) {
        console.log('\nNo finished executions in history yet.');
        return;
    }

    durations.sort((a, b) => b.ms - a.ms);
    const p50 = durations[Math.floor(durations.length * 0.5)].ms;
    const p90 = durations[Math.floor(durations.length * 0.1)].ms;
    const p99 = durations[Math.max(0, Math.floor(durations.length * 0.01))].ms;
    const total = durations.reduce((s, d) => s + d.ms, 0);
    const avg = total / durations.length;

    console.log(`\n=== Last ${durations.length} task executions ===`);
    console.log(`avg=${(avg / 1000).toFixed(1)}s  p50=${(p50 / 1000).toFixed(1)}s  p90=${(p90 / 1000).toFixed(1)}s  p99=${(p99 / 1000).toFixed(1)}s`);
    console.log(`\nSlowest 10:`);
    for (const d of durations.slice(0, 10)) {
        console.log(`  ${(d.ms / 1000).toFixed(1).padStart(7)}s  ${d.status.padEnd(10)}  ${d.id}`);
    }

    // Per-task average over recent runs (helps spot one specific bad apple)
    const perTask = new Map<string, number[]>();
    for (const d of durations) {
        if (!perTask.has(d.id)) perTask.set(d.id, []);
        perTask.get(d.id)!.push(d.ms);
    }
    const perTaskAvg = [...perTask.entries()]
        .map(([id, list]) => ({
            id,
            runs: list.length,
            avgMs: list.reduce((s, x) => s + x, 0) / list.length,
        }))
        .sort((a, b) => b.avgMs - a.avgMs);

    console.log(`\nSlowest tasks by avg duration (across their recent runs):`);
    const taskMeta = new Map(eligible.map((t) => [t.id, t]));
    for (const t of perTaskAvg.slice(0, 10)) {
        const meta = taskMeta.get(t.id);
        const label = meta ? `${meta.type}  ${meta.name?.slice(0, 60)}` : '(unknown task)';
        console.log(`  ${(t.avgMs / 1000).toFixed(1).padStart(7)}s avg  (${t.runs}x)  ${label}`);
    }

    // Run-all wall-time estimate: sequential execution + 1s delay between tasks
    const DELAY_MS = 1000;
    const eligibleAvgMs = avg; // we don't have a per-eligible-task estimate yet
    const estimateMs = eligible.length * eligibleAvgMs + Math.max(0, eligible.length - 1) * DELAY_MS;
    console.log(`\n=== Run-all wall-time estimate ===`);
    console.log(`If "Esegui tutti" fires every eligible task and they average the recent ${(avg / 1000).toFixed(1)}s,`);
    console.log(`expect ~${(estimateMs / 60000).toFixed(1)} min total (sequential, +${DELAY_MS}ms breather/each).`);

    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
