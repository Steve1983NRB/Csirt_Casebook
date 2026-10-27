import {z} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {body,database,guard,HttpError,json} from '@/lib/server';

type Ctx={params:Promise<{id:string}>};

export async function GET(req:Request,ctx:Ctx){return guard(req,async()=>{
 await requireAdmin(req);const id=(await ctx.params).id;
 const rows=(await database().prepare('SELECT id,event,status,ok,at,duration_ms AS durationMs,error FROM webhook_deliveries WHERE webhook_id=? ORDER BY at DESC LIMIT 50').bind(id).all()).results as any[];
 return json({deliveries:rows.map(r=>({...r,ok:!!r.ok}))});
})}

export async function PATCH(req:Request,ctx:Ctx){return guard(req,async()=>{
 await requireAdmin(req);const id=(await ctx.params).id,input=z.object({active:z.boolean()}).parse(await body(req));
 const result=await database().prepare('UPDATE webhooks SET active=? WHERE id=?').bind(input.active?1:0,id).run();
 if(!result.meta.changes)throw new HttpError(404,'Webhook not found.');
 return json({active:input.active});
})}

export async function DELETE(req:Request,ctx:Ctx){return guard(req,async()=>{
 await requireAdmin(req);const id=(await ctx.params).id,db=database();
 if(!await db.prepare('SELECT id FROM webhooks WHERE id=?').bind(id).first())throw new HttpError(404,'Webhook not found.');
 await db.batch([db.prepare('DELETE FROM webhook_deliveries WHERE webhook_id=?').bind(id),db.prepare('DELETE FROM webhooks WHERE id=?').bind(id)]);
 return json({deleted:true});
})}
