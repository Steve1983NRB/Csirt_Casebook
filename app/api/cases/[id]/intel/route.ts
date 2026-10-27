import {access} from '@/lib/access';
import {database,guard,json} from '@/lib/server';
import {matchIocs,type CaseIoc} from '@/lib/intel-store';

type Ctx={params:Promise<{id:string}>};

// Compare the case's indicators with the shared intelligence library. A hit is context to verify, not proof of compromise.
export async function GET(req:Request,ctx:Ctx){return guard(req,async()=>{
 const caseId=(await ctx.params).id;await access(req,caseId,'read');
 const db=database(),records=(await db.prepare("SELECT id,data FROM records WHERE case_id=? AND kind='ioc'").bind(caseId).all()).results as any[];
 const iocs:CaseIoc[]=records.map(r=>{const d=JSON.parse(r.data);return {recordId:r.id as string,type:String(d.type),value:String(d.value),include:!!d.include}}).filter(i=>i.value);
 const matches=await matchIocs(db,iocs);
 const [total]=(await db.prepare("SELECT COUNT(*) AS n FROM intel_items WHERE kind='indicator'").all()).results as any[];
 return json({matches,checked:iocs.length,libraryIndicators:total?.n||0,generatedAt:new Date().toISOString()});
})}
