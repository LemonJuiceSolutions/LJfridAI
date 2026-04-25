/**
 * Repair ScheduledTask.config.contextTables when it's missing entries that
 * pythonSelectedPipelines references. Walks the linked tree's JSON and
 * picks up nodes whose name matches the missing pipeline aliases, copying
 * the metadata fields the scheduler needs to materialize them.
 *
 * Run: npx tsx scripts/repair-task-context-tables.ts <taskId>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TASK_ID = process.argv[2] || "cmlf4afol001rdit5b7s9xm2c";

type CtxEntry = {
  name: string;
  path: string;
  nodeId?: string;
  isPython?: boolean;
  nodeName?: string;
  pythonCode?: string;
  query?: string;
  sqlQuery?: string;
  connectorId?: string;
  selectedDocuments?: string[];
  pipelineDependencies?: any[];
  pythonOutputType?: string;
};

function findNodeByName(
  node: any,
  needle: string,
  pathParts: string[] = ["root"],
): { node: any; path: string; pathParts: string[] } | null {
  if (!node || typeof node !== "object") return null;
  // Match on .name field (display name) first
  if (
    (node.name === needle || node.text === needle) &&
    (typeof node.pythonCode === "string" || typeof node.sqlQuery === "string")
  ) {
    return { node, path: pathParts.join("."), pathParts: [...pathParts] };
  }
  if (node.options && typeof node.options === "object") {
    for (const key of Object.keys(node.options)) {
      const child = node.options[key];
      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) {
          const r = findNodeByName(child[i], needle, [
            ...pathParts,
            `options['${key}']`,
            `[${i}]`,
          ]);
          if (r) return r;
        }
      } else {
        const r = findNodeByName(child, needle, [...pathParts, `options['${key}']`]);
        if (r) return r;
      }
    }
  }
  if (Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      const r = findNodeByName(node.children[i], needle, [
        ...pathParts,
        `children[${i}]`,
      ]);
      if (r) return r;
    }
  }
  return null;
}

(async () => {
  const task = await prisma.scheduledTask.findUnique({ where: { id: TASK_ID } });
  if (!task) {
    console.error("task not found:", TASK_ID);
    process.exit(1);
  }
  const cfg: any = task.config;
  const treeId: string | undefined = cfg?.treeId;
  if (!treeId) {
    console.error("task has no treeId in config");
    process.exit(1);
  }
  const tree = await prisma.tree.findUnique({ where: { id: treeId } });
  if (!tree) {
    console.error("tree not found:", treeId);
    process.exit(1);
  }
  const treeJson = JSON.parse(tree.jsonDecisionTree);

  const wanted: string[] = Array.isArray(cfg.pythonSelectedPipelines)
    ? cfg.pythonSelectedPipelines
    : [];
  if (wanted.length === 0) {
    console.log("no pythonSelectedPipelines on task — nothing to repair.");
    return;
  }

  const ctx: CtxEntry[] = Array.isArray(cfg.contextTables) ? cfg.contextTables : [];
  const have = new Set(ctx.map((c) => c.name));

  const missing = wanted.filter((n) => !have.has(n));
  console.log(`wanted: ${JSON.stringify(wanted)}`);
  console.log(`have:   ${JSON.stringify([...have])}`);
  console.log(`missing: ${JSON.stringify(missing)}`);

  if (missing.length === 0) {
    console.log("contextTables already complete.");
    return;
  }

  for (const name of missing) {
    const found = findNodeByName(treeJson, name);
    if (!found) {
      console.warn(`  ${name}: NOT FOUND in tree ${treeId}`);
      continue;
    }
    const n = found.node;
    const isPython = !!n.pythonCode;
    const entry: CtxEntry = {
      name,
      path: found.path,
      nodeId: n.id,
      nodeName: n.name || n.text,
      isPython,
      ...(isPython ? { pythonCode: n.pythonCode } : {}),
      ...(n.pythonOutputType ? { pythonOutputType: n.pythonOutputType } : {}),
      ...(n.sqlQuery ? { sqlQuery: n.sqlQuery, query: n.sqlQuery } : {}),
      ...(n.sqlConnectorId
        ? { connectorId: n.sqlConnectorId }
        : n.pythonConnectorId
        ? { connectorId: n.pythonConnectorId }
        : {}),
      ...(n.pipelineDependencies ? { pipelineDependencies: n.pipelineDependencies } : {}),
      ...(n.selectedDocuments ? { selectedDocuments: n.selectedDocuments } : {}),
    };
    ctx.push(entry);
    console.log(`  ${name}: added (path=${found.path}, isPython=${isPython})`);
  }

  cfg.contextTables = ctx;
  await prisma.scheduledTask.update({
    where: { id: TASK_ID },
    data: { config: cfg, status: "active", lastError: null },
  });
  console.log(`\ntask updated. contextTables now has ${ctx.length} entries.`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
