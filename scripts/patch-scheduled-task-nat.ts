/**
 * Patch the NaT.where bug in ScheduledTask.config.pythonCode snapshots.
 * The scheduler runs the snapshot stored on the task row, not the live
 * tree node, so the tree-side patch alone isn't enough.
 *
 * Run with: npx tsx scripts/patch-scheduled-task-nat.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CAP_OLD = `cap["START"] = to_dt(cap[col_start_c]) if col_start_c else pd.NaT
end1c = to_dt(cap[col_end1_c]) if col_end1_c else pd.NaT
end2c = to_dt(cap[col_end2_c]) if col_end2_c else pd.NaT
cap["END"] = end1c.where(pd.notna(end1c), end2c)`;

const CAP_NEW = `_empty_dt_c = pd.Series(pd.NaT, index=cap.index, dtype="datetime64[ns]")
cap["START"] = to_dt(cap[col_start_c]) if col_start_c else _empty_dt_c.copy()
end1c = to_dt(cap[col_end1_c]) if col_end1_c else _empty_dt_c.copy()
end2c = to_dt(cap[col_end2_c]) if col_end2_c else _empty_dt_c.copy()
cap["END"] = end1c.where(end1c.notna(), end2c)`;

const GAN_OLD = `gan["START"] = to_dt(gan[col_start_g]) if col_start_g else pd.NaT
end1g = to_dt(gan[col_end1_g]) if col_end1_g else pd.NaT
end2g = to_dt(gan[col_end2_g]) if col_end2_g else pd.NaT
gan["END"] = end1g.where(pd.notna(end1g), end2g)`;

const GAN_NEW = `_empty_dt_g = pd.Series(pd.NaT, index=gan.index, dtype="datetime64[ns]")
gan["START"] = to_dt(gan[col_start_g]) if col_start_g else _empty_dt_g.copy()
end1g = to_dt(gan[col_end1_g]) if col_end1_g else _empty_dt_g.copy()
end2g = to_dt(gan[col_end2_g]) if col_end2_g else _empty_dt_g.copy()
gan["END"] = end1g.where(end1g.notna(), end2g)`;

(async () => {
  const tasks = await prisma.scheduledTask.findMany();
  let patched = 0;
  for (const task of tasks) {
    const cfg = task.config as any;
    if (!cfg || typeof cfg !== "object") continue;
    let changed = false;
    for (const key of ["pythonCode", "code", "script"]) {
      const code = cfg[key];
      if (typeof code !== "string") continue;
      let after = code;
      if (after.includes(CAP_OLD)) {
        after = after.replace(CAP_OLD, CAP_NEW);
        changed = true;
      }
      if (after.includes(GAN_OLD)) {
        after = after.replace(GAN_OLD, GAN_NEW);
        changed = true;
      }
      if (changed) cfg[key] = after;
    }
    if (changed) {
      await prisma.scheduledTask.update({
        where: { id: task.id },
        data: { config: cfg, lastError: null, status: "active" },
      });
      patched++;
      console.log(`patched: ${task.name} (${task.id})`);
    }
  }
  console.log(`Total scheduled tasks patched: ${patched}`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
