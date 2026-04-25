/**
 * One-off: patch the "Aggregato" node Python script to fix the
 * `'NaTType' object has no attribute 'where'` crash that appears when
 * Fine Produzione / Consegna Stimata / Consegna da Contratto columns
 * aren't present in the upstream PRODFIL/PRODFIL2 dataframe.
 *
 * Idempotent: only rewrites the four lines that produce the bug.
 *
 * Run with: npx tsx scripts/patch-aggregato-nat-fix.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TREE_ID = "RzX9nFJGQUs832cLVvecO";

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

function findAggregatoNodes(node: any, path: string[] = []): Array<{ node: any; path: string[] }> {
  const matches: Array<{ node: any; path: string[] }> = [];
  if (!node || typeof node !== "object") return matches;
  // Match any node whose Python code carries the broken `pd.NaT.where(...)`
  // pattern. Don't rely on node.name because "Aggregato" is also an option
  // key in the path, not necessarily the node label.
  if (typeof node.pythonCode === "string" &&
      (node.pythonCode.includes(CAP_OLD) || node.pythonCode.includes(GAN_OLD))) {
    matches.push({ node, path: [...path] });
  }
  if (node.options && typeof node.options === "object") {
    for (const key of Object.keys(node.options)) {
      const child = node.options[key];
      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) {
          matches.push(...findAggregatoNodes(child[i], [...path, "options", key, String(i)]));
        }
      } else {
        matches.push(...findAggregatoNodes(child, [...path, "options", key]));
      }
    }
  }
  if (Array.isArray(node.children)) {
    for (let i = 0; i < node.children.length; i++) {
      matches.push(...findAggregatoNodes(node.children[i], [...path, "children", String(i)]));
    }
  }
  return matches;
}

async function main() {
  // Scan every tree — the broken script may have been duplicated across
  // multiple trees / branches.
  const trees = await prisma.tree.findMany({
    select: { id: true, name: true, jsonDecisionTree: true },
  });

  let totalPatched = 0;
  for (const tree of trees) {
    let json: any;
    try {
      json = JSON.parse(tree.jsonDecisionTree);
    } catch {
      continue;
    }
    const found = findAggregatoNodes(json);
    if (found.length === 0) continue;
    console.log(`Tree "${tree.name}" (${tree.id}): ${found.length} candidate(s)`);

    let patched = 0;
    for (const { node, path } of found) {
      let after = node.pythonCode as string;
      let changed = false;
      if (after.includes(CAP_OLD)) {
        after = after.replace(CAP_OLD, CAP_NEW);
        changed = true;
      }
      if (after.includes(GAN_OLD)) {
        after = after.replace(GAN_OLD, GAN_NEW);
        changed = true;
      }
      if (changed) {
        node.pythonCode = after;
        patched++;
        console.log(`  [${path.join("/")}] patched`);
      } else {
        console.log(`  [${path.join("/")}] no patchable block found`);
      }
    }

    if (patched > 0) {
      await prisma.tree.update({
        where: { id: tree.id },
        data: { jsonDecisionTree: JSON.stringify(json) },
      });
      console.log(`  -> tree updated (${patched} nodes)`);
      totalPatched += patched;
    }
  }
  console.log(`Done. Total nodes patched across all trees: ${totalPatched}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
