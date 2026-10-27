import {identity} from '@/lib/access';
import {database,guard,json} from '@/lib/server';
import {matchIocs,type CaseIoc} from '@/lib/intel-store';

// Cross-case view: which accessible, non-closed investigations contain indicators that the library knows about.
export async function GET(req:Request){return guard(req,async()=>{
 const who=await identity(req),db=database(),email=who.email.toLowerCase();
 const rows=(await db.prepare(`SELECT DISTINCT r.id,r.case_id AS caseId,r.kind,r.data,c.data AS caseData FROM records r JOIN cases c ON c.id=r.case_id LEFT JOIN case_access m ON m.case_id=c.id AND m.user_id=?
  WHERE r.kind IN ('ioc','technique') AND (c.owner_id=? OR (c.owner_id IS NULL AND lower(c.author)=?) OR m.user_id IS NOT NULL) ORDER BY r.updated_at DESC LIMIT 6000`).bind(who.id,who.id,email).all()).results as any[];
 type Entry={id:string;reference:string;title:string;client:string;status:string;priority:string;iocs:CaseIoc[];techniques:Set<string>};
 const cases=new Map<string,Entry>();
 for(const row of rows){
  const c=JSON.parse(row.caseData);if(c.status==='Closed')continue;
  const entry:Entry=cases.get(row.caseId)||{id:row.caseId,reference:c.reference,title:c.title,client:c.client,status:c.status,priority:c.priority,iocs:[],techniques:new Set<string>()};cases.set(row.caseId,entry);
  const d=JSON.parse(row.data);
  if(row.kind==='ioc'&&d.value)entry.iocs.push({recordId:row.id,type:String(d.type),value:String(d.value),include:!!d.include});
  if(row.kind==='technique'&&d.techniqueId)entry.techniques.add(String(d.techniqueId).toUpperCase());
 }
 const all=[...cases.values()],matched=await matchIocs(db,all.flatMap(c=>c.iocs)),byRecord=new Map(matched.map(m=>[m.recordId,m]));
 const results=all.map(c=>({id:c.id,reference:c.reference,title:c.title,client:c.client,status:c.status,priority:c.priority,checked:c.iocs.length,techniques:[...c.techniques],matches:c.iocs.map(i=>byRecord.get(i.recordId)).filter(Boolean)}));
 const [total]=(await db.prepare("SELECT COUNT(*) AS n FROM intel_items WHERE kind='indicator'").all()).results as any[];
 return json({cases:results,libraryIndicators:total?.n||0,generatedAt:new Date().toISOString()});
})}
