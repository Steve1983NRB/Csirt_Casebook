import {z} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {body,database,guard,HttpError,json} from '@/lib/server';

const schema=z.object({name:z.string().trim().min(2).max(80),description:z.string().trim().max(500).default('')});

// Group names are visible to every signed-in user so case owners can grant them; members are admin-only.
export async function GET(req:Request){return guard(req,async()=>{
 const rows=(await database().prepare('SELECT g.id,g.name,g.description,g.created_at AS createdAt,(SELECT COUNT(*) FROM group_members gm WHERE gm.group_id=g.id) AS memberCount FROM user_groups g ORDER BY g.name COLLATE NOCASE LIMIT 500').all()).results;
 return json({groups:rows});
})}

export async function POST(req:Request){return guard(req,async who=>{
 await requireAdmin(req);const input=schema.parse(await body(req)),db=database();
 if(await db.prepare('SELECT id FROM user_groups WHERE lower(name)=lower(?)').bind(input.name).first())throw new HttpError(409,'A group with this name already exists.');
 const id=crypto.randomUUID(),at=new Date().toISOString();
 await db.prepare('INSERT INTO user_groups(id,name,description,created_at,author) VALUES(?,?,?,?,?)').bind(id,input.name,input.description,at,who).run();
 return json({id,name:input.name,description:input.description,createdAt:at,memberCount:0},201);
})}
