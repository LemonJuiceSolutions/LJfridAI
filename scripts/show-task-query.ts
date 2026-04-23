import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const TASK_ID = process.argv[2] || 'cmli16dze001pbq7ao98nfsyy';
const SEARCH_NAME = process.argv[3] || 'FatturatoB2C';
async function main() {
  const t = await db.scheduledTask.findUnique({ where: { id: TASK_ID } });
  if (!t) { console.log('Task not found'); process.exit(1); }
  const cfg: any = t.config || {};
  const tree = await db.tree.findUnique({ where: { id: cfg.treeId } });
  if (!tree) { console.log('No tree'); process.exit(1); }
  const tj = JSON.parse(tree.jsonDecisionTree);
  const found: any[] = [];
  function walk(n: any, path: string[] = []): void {
    if (!n || typeof n !== 'object') return;
    const names = [n.sqlResultName, n.pythonResultName, n.aiConfig?.outputName, n.name].filter(Boolean);
    if (names.includes(SEARCH_NAME)) {
      found.push({ path: path.join(' > '), connectorId: n.connectorId, sqlQuery: n.sqlQuery, pythonCode: n.pythonCode });
    }
    if (n.options) for (const k of Object.keys(n.options)) {
      const v = n.options[k];
      if (Array.isArray(v)) v.forEach((c, i) => walk(c, [...path, k+'['+i+']']));
      else walk(v, [...path, k]);
    }
  }
  walk(tj);
  for (const f of found) {
    console.log(`\n=== ${SEARCH_NAME} @ ${f.path} ===`);
    console.log(`connectorId: ${f.connectorId}`);
    if (f.sqlQuery) console.log(`SQL:\n${f.sqlQuery}`);
    if (f.pythonCode) console.log(`PY:\n${f.pythonCode.slice(0, 1500)}`);
  }
  process.exit(0);
}
main();
