import {requireAdmin} from '@/lib/auth';
import {database,guard,HttpError,json} from '@/lib/server';

export async function DELETE(req:Request,ctx:{params:Promise<{id:string}>}){return guard(req,async()=>{
 await requireAdmin(req);const id=(await ctx.params).id,db=database();
 if(!await db.prepare('SELECT id FROM user_groups WHERE id=?').bind(id).first())throw new HttpError(404,'Group not found.');
 await db.batch([db.prepare('DELETE FROM case_group_access WHERE group_id=?').bind(id),db.prepare('DELETE FROM group_members WHERE group_id=?').bind(id),db.prepare('DELETE FROM user_groups WHERE id=?').bind(id)]);
 return json({deleted:true});
})}
