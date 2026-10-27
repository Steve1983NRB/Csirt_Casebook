import {requireAdmin} from '@/lib/auth';
import {database,guard,HttpError,json} from '@/lib/server';

// Values already stored on cases are kept in the case data but no longer shown or accepted.
export async function DELETE(req:Request,ctx:{params:Promise<{id:string}>}){return guard(req,async()=>{
 await requireAdmin(req);const id=(await ctx.params).id;
 const result=await database().prepare('DELETE FROM attribute_defs WHERE id=?').bind(id).run();
 if(!result.meta.changes)throw new HttpError(404,'Field not found.');
 return json({deleted:true});
})}
