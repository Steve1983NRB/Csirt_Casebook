import {z} from 'zod';
import {identity} from '@/lib/access';
import {database,guard,HttpError,json} from '@/lib/server';

const schema=z.object({contactName:z.string().trim().max(200).default(''),email:z.string().trim().email().max(320).or(z.literal('')).default(''),phone:z.string().trim().max(80).default(''),notes:z.string().max(10000).default('')});
export async function PUT(req:Request,ctx:{params:Promise<{id:string}>}){return guard(req,async()=>{
 const me=await identity(req),id=(await ctx.params).id,db=database(),client:any=await db.prepare('SELECT * FROM clients WHERE id=?').bind(id).first();if(!client)throw new HttpError(404,'Client not found.');if(client.owner_id!==me.id)throw new HttpError(403,'Only the client owner can edit this client.');
 let input;try{input=await req.json()}catch{throw new HttpError(400,'Invalid JSON.')}const data=schema.parse(input),at=new Date().toISOString();await db.prepare('UPDATE clients SET contact_name=?,email=?,phone=?,notes=?,updated_at=? WHERE id=? AND owner_id=?').bind(data.contactName,data.email,data.phone,data.notes,at,id,me.id).run();
 return json({id,name:client.name,...data,owner_id:me.id,created_at:client.created_at,updated_at:at});
})}
export async function DELETE(req:Request,ctx:{params:Promise<{id:string}>}){return guard(req,async()=>{
 const me=await identity(req),id=(await ctx.params).id,db=database(),row:any=await db.prepare('SELECT * FROM clients WHERE id=?').bind(id).first();
 if(!row)throw new HttpError(404,'Client not found.');if(row.owner_id!==me.id)throw new HttpError(403,'Only the client owner can remove this client.');
 const used=await db.prepare("SELECT id FROM cases WHERE owner_id=? AND lower(json_extract(data,'$.client'))=lower(?) LIMIT 1").bind(row.owner_id,row.name).first();if(used)throw new HttpError(409,'This client is linked to an investigation and cannot be deleted.');
 await db.prepare('DELETE FROM clients WHERE id=?').bind(id).run();return json({deleted:true,id});
})}
