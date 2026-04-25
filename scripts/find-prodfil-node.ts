import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
function walk(n:any, path:string[]=["root"]):void{
  if(!n||typeof n!=='object')return;
  if(n.sqlQuery||n.pythonCode){
    console.log(`[${path.join('/')}] name="${n.name||'<no-name>'}" id=${n.id||'<no-id>'} hasSql=${!!n.sqlQuery} hasPy=${!!n.pythonCode}`);
  }
  if(n.options)for(const k of Object.keys(n.options)){
    const c=n.options[k];
    if(Array.isArray(c))c.forEach((x,i)=>walk(x,[...path,`opt[${k}][${i}]`]));
    else walk(c,[...path,`opt[${k}]`]);
  }
  if(Array.isArray(n.children))n.children.forEach((c:any,i:number)=>walk(c,[...path,`child[${i}]`]));
}
(async()=>{
  const t=await p.tree.findUnique({where:{id:'RzX9nFJGQUs832cLVvecO'}});
  if(!t)return;
  walk(JSON.parse(t.jsonDecisionTree));
  await p.$disconnect();
})();
