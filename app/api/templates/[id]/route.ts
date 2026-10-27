import {requireAdmin} from '@/lib/auth';
import {database,guard,HttpError,json} from '@/lib/server';

export async function DELETE(req:Request,ctx:{params:Promise<{id:string}>}){return guard(req,async()=>{
 await requireAdmin(req);const id=(await ctx.params).id;
 const result=await database().prepare('DELETE FROM case_templates WHERE id=?').bind(id).run();
 if(!result.meta.changes)throw new HttpError(404,'Template not found.');
 return json({deleted:true});
})}
