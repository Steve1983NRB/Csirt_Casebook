import {z} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {templateData} from '@/lib/templates';
import {body,database,guard,HttpError,json} from '@/lib/server';
const schema=z.object({name:z.string().trim().min(2).max(80),description:z.string().trim().max(500).default(''),data:templateData});
const view=(r:any)=>({id:r.id,name:r.name,description:r.description,data:JSON.parse(r.data),updatedAt:r.updated_at});

export async function GET(req:Request){return guard(req,async()=>{
 const rows=(await database().prepare('SELECT * FROM case_templates ORDER BY name COLLATE NOCASE LIMIT 100').all()).results as any[];
 return json({templates:rows.map(view)});
})}

export async function POST(req:Request){return guard(req,async who=>{
 await requireAdmin(req);const input=schema.parse(await body(req)),db=database();
 if(await db.prepare('SELECT id FROM case_templates WHERE lower(name)=lower(?)').bind(input.name).first())throw new HttpError(409,'A template with this name already exists.');
 const id=crypto.randomUUID(),at=new Date().toISOString();
 await db.prepare('INSERT INTO case_templates(id,name,description,data,created_at,updated_at,author) VALUES(?,?,?,?,?,?,?)').bind(id,input.name,input.description,JSON.stringify(input.data),at,at,who).run();
 return json({id,name:input.name,description:input.description,data:input.data,updatedAt:at},201);
})}
