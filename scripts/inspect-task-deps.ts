import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const t = await p.scheduledTask.findUnique({
    where: { id: "cmlf4afol001rdit5b7s9xm2c" },
  });
  if (!t) { console.log("not found"); return; }
  const cfg = t.config as any;
  console.log("name:", t.name);
  console.log("status:", t.status);
  console.log("config keys:", Object.keys(cfg || {}));
  console.log("--- dependencies ---");
  console.log(JSON.stringify(cfg?.dependencies, null, 2)?.slice(0, 3000));
  console.log("--- pipelineDependencies ---");
  console.log(JSON.stringify(cfg?.pipelineDependencies, null, 2)?.slice(0, 3000));
  console.log("--- pythonSelectedPipelines ---");
  console.log(JSON.stringify(cfg?.pythonSelectedPipelines, null, 2)?.slice(0, 3000));
  console.log("--- contextTables (compact) ---");
  for (const t of (cfg?.contextTables || [])) {
    console.log({
      name: t.name,
      isPython: !!t.isPython,
      hasPythonCode: !!t.pythonCode,
      hasSqlQuery: !!(t.sqlQuery || t.query),
      connectorId: t.connectorId || t.sqlConnectorId || null,
      pipelineDeps: (t.pipelineDependencies || []).map((d:any)=>d.tableName),
      sqlQueryHead: (t.sqlQuery || t.query || '').slice(0, 150),
    });
  }
  console.log("nodeId:", cfg?.nodeId);
  console.log("treeId:", cfg?.treeId);
  await p.$disconnect();
})();
