import {access} from '@/lib/access';
import {cleanAttributes,loadAttributeDefs} from '@/lib/attributes';
import {emitWebhook} from '@/lib/webhooks';
import {guard,json,body,database,caseSchema,snapshot,auditStatement,HttpError} from '@/lib/server';
import {env} from 'cloudflare:workers';
type Ctx={params:Promise<{id:string}>};
export async function GET(req:Request,ctx:Ctx){return guard(req,async()=>{const {id}=await ctx.params,full=new URL(req.url).searchParams.get('archive')==='1';const p=await access(req,id,full?'manage':'read');const s=await snapshot(id,full);return json({...s,permissions:{role:p.role,canWrite:p.canWrite,canReview:p.canReview,canManage:p.canManage}})})}
export async function PUT(req:Request,ctx:Ctx){return guard(req,async who=>{const {id}=await ctx.params,b=await body(req),permission=await access(req,id,'write'),old=permission.case,oldData=caseSchema.parse(JSON.parse(old.data)),parsed=caseSchema.parse(b.data),data={...parsed,attributes:cleanAttributes(await loadAttributeDefs(database()),parsed.attributes)};if(data.requireDualReview!==oldData.requireDualReview&&!permission.canManage)throw new HttpError(403,'Only the case owner can change the four-eyes review policy.');if(data.status==='Closed'&&!permission.canReview)throw new HttpError(403,'Only a reviewer or owner can close the investigation.');if(old.version!==b.version)throw new HttpError(409,'This case changed in another session. Reload before saving.');const at=new Date().toISOString();const [r]=await database().batch([database().prepare('UPDATE cases SET data=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(JSON.stringify(data),at,id,b.version),auditStatement(id,id,'case.updated',who,{before:oldData,after:data},true)]);if(!r.meta.changes)throw new HttpError(409,'This case changed in another session. Reload before saving.');await emitWebhook(database(),'case.updated',{caseId:id,reference:data.reference,title:data.title,client:data.client,status:data.status,priority:data.priority});return json({...data,id,version:b.version+1,updatedAt:at})})}
export async function DELETE(req:Request,ctx:Ctx){return guard(req,async()=>{
 const {id}=await ctx.params,input=await body(req),permission=await access(req,id,'manage'),caseData=JSON.parse(permission.case.data);
 if(input?.reference!==caseData.reference)throw new HttpError(400,'Type the exact case reference to confirm permanent deletion.');
 const db=database(),[attachments,iocFiles,reports]=await db.batch([
  db.prepare('SELECT id FROM attachments WHERE case_id=?').bind(id),
  db.prepare('SELECT id FROM ioc_files WHERE case_id=?').bind(id),
  db.prepare('SELECT id FROM reports WHERE case_id=?').bind(id)
 ]);
 const objectKeys=[...attachments.results.map((row:any)=>row.id),...iocFiles.results.map((row:any)=>row.id),...reports.results.flatMap((row:any)=>[row.id,row.id+'.json'])];
 if(objectKeys.length)await env.BUCKET?.delete(objectKeys);
 await db.batch([
    db.prepare('UPDATE alert_inbox SET status=?,case_id=NULL,updated_at=? WHERE case_id=?').bind('Dismissed',new Date().toISOString(),id),
  db.prepare('DELETE FROM taxii_imports WHERE case_id=?').bind(id),
  db.prepare('DELETE FROM taxii_batches WHERE case_id=?').bind(id),
  db.prepare('DELETE FROM attachments WHERE case_id=?').bind(id),
  db.prepare('DELETE FROM ioc_files WHERE case_id=?').bind(id),
  db.prepare('DELETE FROM case_comments WHERE case_id=?').bind(id),
  db.prepare('DELETE FROM reports WHERE case_id=?').bind(id),
  db.prepare('DELETE FROM audit WHERE case_id=?').bind(id),
  db.prepare('DELETE FROM records WHERE case_id=?').bind(id),
  db.prepare('DELETE FROM case_memberships WHERE case_id=?').bind(id),
  db.prepare('DELETE FROM cases WHERE id=?').bind(id)
 ]);
 return json({deleted:true,id});
})}
