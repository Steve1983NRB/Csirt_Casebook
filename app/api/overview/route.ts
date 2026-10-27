import {identity} from '@/lib/access';
import {database,guard,json,caseRow,entryRow} from '@/lib/server';

// Cross-case read model for the dashboard and the global task / indicator /
// asset views. Only cases the caller owns or is a member of are included.
export async function GET(req:Request){return guard(req,async()=>{
 const who=await identity(req),db=database(),email=who.email.toLowerCase();
 const access=`(c.owner_id=? OR (c.owner_id IS NULL AND lower(c.author)=?) OR m.user_id IS NOT NULL)`;
 const [cases,records,audit]=await db.batch([
  db.prepare(`SELECT c.*,CASE WHEN c.owner_id=? OR (c.owner_id IS NULL AND lower(c.author)=?) THEN 'owner' ELSE m.role END AS role FROM cases c LEFT JOIN case_access m ON m.case_id=c.id AND m.user_id=? WHERE ${access} ORDER BY c.updated_at DESC`).bind(who.id,email,who.id,who.id,email),
  db.prepare(`SELECT r.* FROM records r JOIN cases c ON c.id=r.case_id LEFT JOIN case_access m ON m.case_id=c.id AND m.user_id=? WHERE r.kind IN ('action','ioc','asset','event') AND ${access} ORDER BY r.updated_at DESC LIMIT 4000`).bind(who.id,who.id,email),
  db.prepare(`SELECT a.id,a.case_id AS caseId,a.record_id AS recordId,a.action,a.actor,a.at FROM audit a JOIN cases c ON c.id=a.case_id LEFT JOIN case_access m ON m.case_id=c.id AND m.user_id=? WHERE ${access} ORDER BY a.at DESC LIMIT 40`).bind(who.id,who.id,email)
 ]);
 return json({cases:cases.results.map(caseRow),entries:records.results.map(entryRow),activity:audit.results});
})}
