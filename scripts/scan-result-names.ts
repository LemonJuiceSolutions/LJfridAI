import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
function walk(n:any):void{
  if(!n||typeof n!=='object')return;
  const rn = n.sqlResultName || n.pythonResultName;
  if (rn === 'PRODFIL' || rn === 'PRODFIL2' || rn === 'HR2' || rn === 'EstrazioneSharePoint') {
    console.log(`id=${n.id} name="${n.name||'<no-name>'}" sqlResultName=${n.sqlResultName} pythonResultName=${n.pythonResultName} hasSql=${!!n.sqlQuery} hasPy=${!!n.pythonCode} sqlTail=${(n.sqlQuery||'').slice(-150)}`);
  }
  if(n.options)for(const k of Object.keys(n.options)){
    const c=n.options[k];
    if(Array.isArray(c))c.forEach((x:any)=>walk(x));
    else walk(c);
  }
  if(Array.isArray(n.children))n.children.forEach((c:any)=>walk(c));
}
(async()=>{
  const t=await p.tree.findUnique({where:{id:'RzX9nFJGQUs832cLVvecO'}});
  if(!t)return;
  walk(JSON.parse(t.jsonDecisionTree));
  await p.$disconnect();
})();
