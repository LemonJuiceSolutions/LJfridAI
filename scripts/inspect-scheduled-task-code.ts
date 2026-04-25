import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const tasks = await p.scheduledTask.findMany({
    select: { id: true, name: true, type: true, config: true, status: true },
  });
  console.log(`Total tasks: ${tasks.length}`);
  let matches = 0;
  for (const t of tasks) {
    const cfg = t.config as any;
    const code = cfg?.pythonCode || cfg?.code || cfg?.script;
    if (typeof code === "string" && code.includes("end1c.where(pd.notna(end1c)")) {
      matches++;
      console.log(`MATCH ${matches}: name="${t.name}" id=${t.id} type=${t.type} status=${t.status}`);
    }
  }
  console.log(`\nMatches: ${matches}`);
  await p.$disconnect();
})();
