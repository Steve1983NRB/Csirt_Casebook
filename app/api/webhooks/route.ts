import {z} from 'zod';
import {requireAdmin} from '@/lib/auth';
import {webhookEvents,assertSafeWebhookUrl} from '@/lib/webhooks';
import {body,database,guard,HttpError,json} from '@/lib/server';

const schema=z.object({name:z.string().trim().min(1).max(80),url:z.string().trim().max(500),events:z.array(z.enum(webhookEvents)).min(1),includeCaseDetails:z.boolean().default(false)});
const view=(r:any)=>({id:r.id,name:r.name,url:r.url,events:JSON.parse(r.events),includeCaseDetails:!!r.include_case_details,active:!!r.active,createdAt:r.created_at,lastStatus:r.last_status,lastAt:r.last_at,lastError:r.last_error});

export async function GET(req:Request){return guard(req,async()=>{
 await requireAdmin(req);
 const rows=(await database().prepare('SELECT * FROM webhooks ORDER BY created_at DESC LIMIT 100').all()).results as any[];
 return json({hooks:rows.map(view),events:webhookEvents});
})}

// The signing secret is returned exactly once, at creation.
export async function POST(req:Request){return guard(req,async who=>{
 await requireAdmin(req);const input=schema.parse(await body(req)),db=database();assertSafeWebhookUrl(input.url);
 const count:any=await db.prepare('SELECT COUNT(*) AS n FROM webhooks').first();if((count?.n||0)>=20)throw new HttpError(409,'At most 20 webhooks can be configured.');
 const id=crypto.randomUUID(),secret=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join(''),at=new Date().toISOString();
 await db.prepare('INSERT INTO webhooks(id,name,url,secret,events,include_case_details,active,created_at,author) VALUES(?,?,?,?,?,?,1,?,?)').bind(id,input.name,input.url,secret,JSON.stringify([...new Set(input.events)]),input.includeCaseDetails?1:0,at,who).run();
 return json({id,name:input.name,url:input.url,events:input.events,secret},201);
})}
