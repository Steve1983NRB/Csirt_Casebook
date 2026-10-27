import {requireInteractive} from '@/lib/auth';
import {database,guard,HttpError,json} from '@/lib/server';

export async function DELETE(req:Request,ctx:{params:Promise<{id:string}>}){return guard(req,async()=>{
 const me=await requireInteractive(req),id=(await ctx.params).id;
 const result=await database().prepare('UPDATE api_keys SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL').bind(new Date().toISOString(),id,me.id).run();
 if(!result.meta.changes)throw new HttpError(404,'API key not found.');
 return json({revoked:true});
})}
