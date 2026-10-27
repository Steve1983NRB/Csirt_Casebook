import {z} from 'zod';
import {identity} from '@/lib/access';
import {database,guard,HttpError,json} from '@/lib/server';

const schema=z.object({name:z.string().trim().min(1).max(200),contactName:z.string().trim().max(200).default(''),email:z.string().trim().email().max(320).or(z.literal('')).default(''),phone:z.string().trim().max(80).default(''),notes:z.string().max(10000).default('')});
export async function GET(req:Request){return guard(req,async()=>{
 const me=await identity(req),db=database();
 const clients=await db.prepare(`SELECT DISTINCT cl.* FROM clients cl LEFT JOIN cases c ON c.owner_id=cl.owner_id AND lower(json_extract(c.data,'$.client'))=lower(cl.name) LEFT JOIN case_access m ON m.case_id=c.id AND m.user_id=? WHERE cl.owner_id=? OR m.user_id IS NOT NULL ORDER BY cl.name COLLATE NOCASE`).bind(me.id,me.id).all();
 return json(clients.results);
})}

export async function POST(req:Request){return guard(req,async()=>{
 const me=await identity(req),data=schema.parse(await (async()=>{try{return await req.json()}catch{throw new HttpError(400,'Invalid JSON.')}})()),db=database(),existing=await db.prepare('SELECT id FROM clients WHERE owner_id=? AND lower(name)=lower(?)').bind(me.id,data.name).first();if(existing)throw new HttpError(409,'A client with this name already exists.');const id=crypto.randomUUID(),at=new Date().toISOString();
 await db.batch([db.prepare('INSERT INTO clients(id,owner_id,name,contact_name,email,phone,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,me.id,data.name,data.contactName,data.email,data.phone,data.notes,at,at)]);
 return json({id,...data,ownerId:me.id,createdAt:at,updatedAt:at},201);
})}
