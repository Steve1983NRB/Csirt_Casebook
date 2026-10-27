import {identity} from '@/lib/access';
import {database,guard,HttpError,json} from '@/lib/server';
type RelatedRow={id:string;caseId:string;data:string;caseData:string};

// Cross-case correlation: does this indicator or technique already appear in
// another investigation the analyst can access? A signal only — never used
// to auto-link, auto-merge or infer compromise across cases.
export async function GET(req:Request){return guard(req,async()=>{
 const url=new URL(req.url);
 const kind=url.searchParams.get('kind')||'';
 const value=(url.searchParams.get('value')||'').trim();
 const excludeCaseId=url.searchParams.get('excludeCaseId')||'';
 if(!['ioc','technique'].includes(kind))throw new HttpError(400,'Unsupported record kind for correlation.');
 if(!value||value.length>2000)throw new HttpError(400,'A comparison value is required.');
 const who=await identity(req),db=database();
 const rows=(await db.prepare(`SELECT DISTINCT r.id,r.case_id AS caseId,r.data,c.data AS caseData
  FROM records r JOIN cases c ON c.id=r.case_id
  LEFT JOIN case_access m ON m.case_id=c.id AND m.user_id=?
  WHERE r.kind=? AND (c.owner_id=? OR (c.owner_id IS NULL AND lower(c.author)=?) OR m.user_id IS NOT NULL)
    ORDER BY r.updated_at DESC LIMIT 300`).bind(who.id,kind,who.id,who.email.toLowerCase()).all()).results as unknown as RelatedRow[];
 const needle=value.toLowerCase();
 const seen=new Set<string>();
 const results:{caseId:string;reference:string;title:string;client:string;recordId:string}[]=[];
 for(const row of rows){
  if(row.caseId===excludeCaseId||seen.has(row.caseId))continue;
  const data=JSON.parse(row.data);const compare=kind==='ioc'?data.value:data.techniqueId;
  if(typeof compare!=='string'||compare.toLowerCase()!==needle)continue;
  const c=JSON.parse(row.caseData);seen.add(row.caseId);
  results.push({caseId:row.caseId,recordId:row.id,reference:c.reference,title:c.title,client:c.client});
 }
 return json({results});
})}
