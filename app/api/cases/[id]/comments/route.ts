import {z} from 'zod';
import {access,identity} from '@/lib/access';
import {auditStatement,database,guard,HttpError,json} from '@/lib/server';

type Ctx={params:Promise<{id:string}>};
const schema=z.object({body:z.string().trim().min(1).max(5000),recordId:z.string().uuid().nullable().optional()});

export async function GET(req:Request,ctx:Ctx){return guard(req,async()=>{
 const caseId=(await ctx.params).id;await access(req,caseId,'read');
 const rows=await database().prepare('SELECT id,case_id AS caseId,record_id AS recordId,body,mentions,author_id AS authorId,author,created_at AS createdAt FROM case_comments WHERE case_id=? ORDER BY created_at,id').bind(caseId).all();
 return json(rows.results.map((r:any)=>({...r,mentions:JSON.parse(r.mentions)})));
})}

export async function POST(req:Request,ctx:Ctx){return guard(req,async who=>{
 const caseId=(await ctx.params).id;await access(req,caseId,'write');const me=await identity(req);
 let input;try{input=await req.json()}catch{throw new HttpError(400,'Invalid JSON.')}
 const data=schema.parse(input);
 if(data.recordId){const record=await database().prepare('SELECT id FROM records WHERE id=? AND case_id=?').bind(data.recordId,caseId).first();if(!record)throw new HttpError(400,'The comment target does not belong to this investigation.')}
 const emails=[...new Set([...data.body.matchAll(/(?:^|[\s(])@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)].map(m=>m[1].toLowerCase()))];
 if(emails.length>20)throw new HttpError(400,'A comment can mention at most 20 people.');
 const allowed:any[]=(await database().prepare("SELECT lower(u.email) AS email FROM app_users u LEFT JOIN case_access m ON m.user_id=u.id AND m.case_id=? WHERE u.id=(SELECT owner_id FROM cases WHERE id=?) OR m.user_id IS NOT NULL OR lower(u.email)=(SELECT lower(author) FROM cases WHERE id=?)").bind(caseId,caseId,caseId).all()).results;
 const available=new Set(allowed.map(x=>x.email));for(const email of emails)if(!available.has(email))throw new HttpError(400,`@${email} is not a member of this investigation.`);
 const id=crypto.randomUUID(),at=new Date().toISOString(),db=database(),count:any=await db.prepare('SELECT COUNT(*) AS count FROM case_comments WHERE case_id=?').bind(caseId).first();if(count.count>=2000)throw new HttpError(409,'This discussion reached its 2,000-comment limit.');
 const [insert]=await db.batch([db.prepare('INSERT INTO case_comments(id,case_id,record_id,body,mentions,author_id,author,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM case_comments WHERE case_id=?)<2000').bind(id,caseId,data.recordId||null,data.body,JSON.stringify(emails),me.id,who,at,caseId),auditStatement(caseId,id,'comment.created',who,{recordId:data.recordId||null,mentions:emails},true)]);
 if(!insert.meta.changes)throw new HttpError(409,'This discussion reached its 2,000-comment limit.');
 return json({id,caseId,recordId:data.recordId||null,body:data.body,mentions:emails,authorId:me.id,author:who,createdAt:at},201);
})}
