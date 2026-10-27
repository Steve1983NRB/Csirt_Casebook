import {z} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {body,database,guard,HttpError,json} from '@/lib/server';

type Ctx={params:Promise<{id:string}>};
const schema=z.object({userId:z.string().min(1).max(200)});
async function ensureGroup(id:string){if(!await database().prepare('SELECT id FROM user_groups WHERE id=?').bind(id).first())throw new HttpError(404,'Group not found.')}

export async function GET(req:Request,ctx:Ctx){return guard(req,async()=>{
 await requireAdmin(req);const id=(await ctx.params).id;await ensureGroup(id);
 const members=(await database().prepare('SELECT u.id,u.email,u.display_name AS displayName FROM group_members gm JOIN app_users u ON u.id=gm.user_id WHERE gm.group_id=? ORDER BY u.display_name').bind(id).all()).results;
 return json({members});
})}

export async function POST(req:Request,ctx:Ctx){return guard(req,async()=>{
 await requireAdmin(req);const id=(await ctx.params).id,input=schema.parse(await body(req)),db=database();await ensureGroup(id);
 if(!await db.prepare('SELECT id FROM app_users WHERE id=?').bind(input.userId).first())throw new HttpError(400,'Select a workspace user.');
 await db.prepare('INSERT OR IGNORE INTO group_members(group_id,user_id) VALUES(?,?)').bind(id,input.userId).run();
 return json({added:true},201);
})}

export async function DELETE(req:Request,ctx:Ctx){return guard(req,async()=>{
 await requireAdmin(req);const id=(await ctx.params).id,input=schema.parse(await body(req));await ensureGroup(id);
 await database().prepare('DELETE FROM group_members WHERE group_id=? AND user_id=?').bind(id,input.userId).run();
 return json({removed:true});
})}
