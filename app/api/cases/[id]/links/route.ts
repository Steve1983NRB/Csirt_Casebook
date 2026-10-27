import {z} from 'zod';
import {access,identity} from '@/lib/access';
import {auditStatement,body,database,guard,HttpError,json} from '@/lib/server';
import {linkRelations} from '@/lib/templates';
import {emitWebhook} from '@/lib/webhooks';

type Ctx={params:Promise<{id:string}>};
const createSchema=z.object({linkedCaseId:z.string().uuid(),relation:z.enum(linkRelations).default('related'),note:z.string().trim().max(1000).default('')});

// Only links to cases the caller can read are returned, so a link never reveals a hidden case.
export async function GET(req:Request,ctx:Ctx){return guard(req,async()=>{
 const caseId=(await ctx.params).id;await access(req,caseId,'read');const me=await identity(req);
 const rows=(await database().prepare(`SELECT l.id,l.case_id,l.linked_case_id,l.relation,l.note,l.created_at,l.author,c.id AS other_id,c.data AS other_data FROM case_links l
  JOIN cases c ON c.id=CASE WHEN l.case_id=? THEN l.linked_case_id ELSE l.case_id END
  LEFT JOIN case_access m ON m.case_id=c.id AND m.user_id=?
  WHERE (l.case_id=? OR l.linked_case_id=?) AND (c.owner_id=? OR (c.owner_id IS NULL AND lower(c.author)=?) OR m.user_id IS NOT NULL)
  ORDER BY l.created_at DESC LIMIT 200`).bind(caseId,me.id,caseId,caseId,me.id,me.email.toLowerCase()).all()).results as any[];
 return json({links:rows.map(r=>{const c=JSON.parse(r.other_data);return {id:r.id,direction:r.case_id===caseId?'outgoing':'incoming',relation:r.relation,note:r.note,createdAt:r.created_at,author:r.author,case:{id:r.other_id,reference:c.reference,title:c.title,client:c.client,status:c.status,priority:c.priority}}})});
})}

export async function POST(req:Request,ctx:Ctx){return guard(req,async who=>{
 const caseId=(await ctx.params).id,input=createSchema.parse(await body(req));
 await access(req,caseId,'write');
 if(input.linkedCaseId===caseId)throw new HttpError(400,'A case cannot be linked to itself.');
 await access(req,input.linkedCaseId,'read');
 const db=database(),existing=await db.prepare('SELECT id FROM case_links WHERE (case_id=? AND linked_case_id=?) OR (case_id=? AND linked_case_id=?)').bind(caseId,input.linkedCaseId,input.linkedCaseId,caseId).first();
 if(existing)throw new HttpError(409,'These investigations are already linked.');
 const count:any=await db.prepare('SELECT COUNT(*) AS n FROM case_links WHERE case_id=? OR linked_case_id=?').bind(caseId,caseId).first();
 if((count?.n||0)>=200)throw new HttpError(409,'This investigation reached its 200-link limit.');
 const id=crypto.randomUUID(),at=new Date().toISOString();
 await db.batch([
  db.prepare('INSERT INTO case_links(id,case_id,linked_case_id,relation,note,created_at,author) VALUES(?,?,?,?,?,?,?)').bind(id,caseId,input.linkedCaseId,input.relation,input.note,at,who),
  auditStatement(caseId,id,'case.linked',who,{linkedCaseId:input.linkedCaseId,relation:input.relation}),
  auditStatement(input.linkedCaseId,id,'case.linked',who,{linkedCaseId:caseId,relation:input.relation,incoming:true})
 ]);
 await emitWebhook(db,'case.linked',{caseId,linkedCaseId:input.linkedCaseId,relation:input.relation});
 return json({id,relation:input.relation,note:input.note,createdAt:at},201);
})}

export async function DELETE(req:Request,ctx:Ctx){return guard(req,async who=>{
 const caseId=(await ctx.params).id,input=z.object({linkId:z.string().uuid()}).parse(await body(req));
 await access(req,caseId,'write');
 const db=database(),link:any=await db.prepare('SELECT * FROM case_links WHERE id=? AND (case_id=? OR linked_case_id=?)').bind(input.linkId,caseId,caseId).first();
 if(!link)throw new HttpError(404,'Link not found.');
 await db.batch([
  db.prepare('DELETE FROM case_links WHERE id=?').bind(input.linkId),
  auditStatement(link.case_id,input.linkId,'case.unlinked',who,{linkedCaseId:link.linked_case_id},true),
  auditStatement(link.linked_case_id,input.linkId,'case.unlinked',who,{linkedCaseId:link.case_id,incoming:true})
 ]);
 return json({removed:true});
})}
