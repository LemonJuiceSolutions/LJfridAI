import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

function findByName(node: any, name: string): any {
  if (!node || typeof node !== "object") return null;
  if ((node.sqlResultName === name || node.pythonResultName === name) && (node.sqlQuery || node.pythonCode)) return node;
  if (node.options) {
    for (const k of Object.keys(node.options)) {
      const c = node.options[k];
      if (Array.isArray(c)) for (const x of c) { const r = findByName(x, name); if (r) return r; }
      else { const r = findByName(c, name); if (r) return r; }
    }
  }
  if (Array.isArray(node.children)) for (const c of node.children) { const r = findByName(c, name); if (r) return r; }
  return null;
}

(async () => {
  const t = await p.scheduledTask.findUnique({ where: { id: "cmlf4afol001rdit5b7s9xm2c" } });
  if (!t) return;
  const cfg: any = t.config;
  const tree = await p.tree.findUnique({ where: { id: cfg.treeId } });
  if (!tree) return;
  const treeJson = JSON.parse(tree.jsonDecisionTree);

  for (const ct of cfg.contextTables || []) {
    const treeNode = findByName(treeJson, ct.name);
    if (!treeNode) {
      console.log(`${ct.name}: not found in tree`);
      continue;
    }
    const taskQ = (ct.sqlQuery || ct.query || "").trim();
    const treeQ = (treeNode.sqlQuery || "").trim();
    const same = taskQ === treeQ;
    console.log(`\n${ct.name}: ${same ? "IDENTICAL" : "DIFFERENT"}`);
    if (!same) {
      console.log(`  task len=${taskQ.length}, tree len=${treeQ.length}`);
      console.log(`  task tail: ...${taskQ.slice(-200)}`);
      console.log(`  tree tail: ...${treeQ.slice(-200)}`);
    }
  }
  await p.$disconnect();
})();
