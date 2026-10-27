import {z} from 'zod';
import {access} from '@/lib/access';
import {auditStatement,body,database,guard,HttpError,json} from '@/lib/server';

type Ctx={params:Promise<{id:string}>};
const grant=z.object({groupId:z.string().uuid(),role:z.enum(['reviewer','analyst','viewer'])});

export async function GET(req:Request,ctx:Ctx){return guard(req,async()=>{
 const id=(await ctx.params).id;await access(req,id,'manage');
 const groups=(await database().prepare('SELECT a.group_id AS groupId,a.role,g.name,g.description,(SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) AS memberCount FROM case_group_access a JOIN user_groups g ON g.id=a.group_id WHERE a.case_id=? ORDER BY g.name COLLATE NOCASE').bind(id).all()).results;
 return json({groups});
})}

export async function POST(req:Request,ctx:Ctx){return guard(req,async who=>{
 const id=(await ctx.params).id;await access(req,id,'manage');const input=grant.parse(await body(req)),db=database();
 const group:any=await db.prepare('SELECT id,name FROM user_groups WHERE id=?').bind(input.groupId).first();if(!group)throw new HttpError(400,'Select an existing group.');
 await db.batch([db.prepare('INSERT INTO case_group_access(case_id,group_id,role,updated_at) VALUES(?,?,?,?) ON CONFLICT(case_id,group_id) DO UPDATE SET role=excluded.role,updated_at=excluded.updated_at').bind(id,input.groupId,input.role,new Date().toISOString()),auditStatement(id,input.groupId,'access.group_granted',who,{group:group.name,role:input.role})]);
 return json({groupId:input.groupId,role:input.role});
})}

export async function DELETE(req:Request,ctx:Ctx){return guard(req,async who=>{
 const id=(await ctx.params).id;await access(req,id,'manage');const input=z.object({groupId:z.string().uuid()}).parse(await body(req));
 await database().batch([database().prepare('DELETE FROM case_group_access WHERE case_id=? AND group_id=?').bind(id,input.groupId),auditStatement(id,input.groupId,'access.group_revoked',who,input,true)]);
 return json({removed:true});
})}
