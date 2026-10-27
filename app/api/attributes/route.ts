import {z} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {attributeTypes,loadAttributeDefs} from '@/lib/attributes';
import {body,database,guard,HttpError,json} from '@/lib/server';

const schema=z.object({label:z.string().trim().min(1).max(60),key:z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/,'Use a lowercase key such as business_unit.'),type:z.enum(attributeTypes),options:z.array(z.string().trim().min(1).max(80)).max(50).default([]),help:z.string().trim().max(200).default('')});

// Definitions are readable by every signed-in user (case forms need them); only administrators change them.
export async function GET(req:Request){return guard(req,async()=>json({attributes:await loadAttributeDefs(database())}))}

export async function POST(req:Request){return guard(req,async()=>{
 await requireAdmin(req);const input=schema.parse(await body(req)),db=database();
 if(input.type==='select'&&!input.options.length)throw new HttpError(400,'A choice field needs at least one option.');
 const count:any=await db.prepare('SELECT COUNT(*) AS n FROM attribute_defs').first();if((count?.n||0)>=30)throw new HttpError(409,'At most 30 custom fields are supported.');
 if(await db.prepare('SELECT id FROM attribute_defs WHERE key=?').bind(input.key).first())throw new HttpError(409,'A field with this key already exists.');
 const id=crypto.randomUUID();
 await db.prepare('INSERT INTO attribute_defs(id,key,label,type,options,help,position,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,input.key,input.label,input.type,JSON.stringify(input.type==='select'?input.options:[]),input.help,count?.n||0,new Date().toISOString()).run();
 return json({id,...input},201);
})}
