import {identity} from '@/lib/access';
import {database,guard,HttpError,json} from '@/lib/server';

type SearchResult={
 id:string;
 caseId:string;
 type:'case'|'record';
 kind?:string;
 title:string;
 context:string;
 reference:string;
 updatedAt:string;
};

function searchable(value:string){return `%${value.toLowerCase().replaceAll('!','!!').replaceAll('%','!%').replaceAll('_','!_')}%`}
function text(value:unknown){return typeof value==='string'?value.trim():''}
function recordTitle(kind:string,data:any){
 return text(data.title)||text(data.name)||text(data.value)||text(data.account)||text(data.techniqueId)||kind;
}
function recordContext(data:any){
 return text(data.description)||text(data.content)||text(data.source)||text(data.address)||text(data.rationale);
}

export async function GET(req:Request){return guard(req,async()=>{
 const query=new URL(req.url).searchParams.get('q')?.trim()||'';
 if(query.length<2)return json({query,results:[]});
 if(query.length>200)throw new HttpError(400,'Search terms must be 200 characters or fewer.');
 const who=await identity(req),pattern=searchable(query),db=database();
 const [caseRows,recordRows]=await db.batch([
  db.prepare(`SELECT DISTINCT c.id,c.data,c.updated_at
   FROM cases c LEFT JOIN case_access m ON m.case_id=c.id AND m.user_id=?
   WHERE (c.owner_id=? OR (c.owner_id IS NULL AND lower(c.author)=?) OR m.user_id IS NOT NULL)
   AND lower(c.data) LIKE ? ESCAPE '!'
   ORDER BY c.updated_at DESC LIMIT 20`).bind(who.id,who.id,who.email.toLowerCase(),pattern),
  db.prepare(`SELECT DISTINCT r.id,r.case_id,r.kind,r.data,r.updated_at,c.data AS case_data
   FROM records r JOIN cases c ON c.id=r.case_id
   LEFT JOIN case_access m ON m.case_id=c.id AND m.user_id=?
   WHERE (c.owner_id=? OR (c.owner_id IS NULL AND lower(c.author)=?) OR m.user_id IS NOT NULL)
   AND lower(r.data) LIKE ? ESCAPE '!'
   ORDER BY r.updated_at DESC LIMIT 60`).bind(who.id,who.id,who.email.toLowerCase(),pattern)
 ]);
 const results:SearchResult[]=[];
 for(const row of caseRows.results as any[]){
  const data=JSON.parse(row.data);
  results.push({id:row.id,caseId:row.id,type:'case',title:text(data.title),context:text(data.client),reference:text(data.reference),updatedAt:row.updated_at});
 }
 for(const row of recordRows.results as any[]){
  const data=JSON.parse(row.data),caseData=JSON.parse(row.case_data);
  results.push({id:row.id,caseId:row.case_id,type:'record',kind:row.kind,title:recordTitle(row.kind,data),context:recordContext(data).slice(0,180),reference:text(caseData.reference),updatedAt:row.updated_at});
 }
 return json({query,results:results.slice(0,60)});
})}