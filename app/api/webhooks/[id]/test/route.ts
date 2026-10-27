import {requireAdmin} from '@/lib/auth';
import {deliver,recordDelivery} from '@/lib/webhooks';
import {database,guard,HttpError,json} from '@/lib/server';

export async function POST(req:Request,ctx:{params:Promise<{id:string}>}){return guard(req,async()=>{
 await requireAdmin(req);const id=(await ctx.params).id,db=database();
 const hook:any=await db.prepare('SELECT id,url,secret FROM webhooks WHERE id=?').bind(id).first();if(!hook)throw new HttpError(404,'Webhook not found.');
 const result=await deliver(hook,'webhook.test',{message:'Test delivery from CSIRT Investigate.'});
 await recordDelivery(db,id,'webhook.test',result);
 return json(result);
})}
