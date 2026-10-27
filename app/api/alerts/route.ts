import {z} from 'zod';
import {body,database,guard,json} from '@/lib/server';
import {emitWebhook} from '@/lib/webhooks';

const alertSchema=z.object({title:z.string().trim().min(1).max(300),source:z.string().trim().min(1).max(300),severity:z.enum(['Critical','High','Medium','Low','Informational']),client:z.string().trim().max(300).default(''),occurredAt:z.string().datetime({offset:true}),description:z.string().max(20000).default(''),sourceReference:z.string().trim().max(2000).default('')});

export async function GET(req:Request){return guard(req,async()=>{const rows=(await database().prepare('SELECT * FROM alert_inbox ORDER BY CASE status WHEN \'New\' THEN 0 WHEN \'Triaged\' THEN 1 WHEN \'Promoted\' THEN 2 ELSE 3 END,updated_at DESC LIMIT 500').all()).results;return json({alerts:rows.map((row:any)=>({...JSON.parse(row.data),id:row.id,status:row.status,caseId:row.case_id,createdAt:row.created_at,updatedAt:row.updated_at,author:row.author}))})})}

export async function POST(req:Request){return guard(req,async who=>{const data=alertSchema.parse(await body(req)),id=crypto.randomUUID(),at=new Date().toISOString();await database().prepare('INSERT INTO alert_inbox(id,data,status,created_at,updated_at,author) VALUES(?,?,?,?,?,?)').bind(id,JSON.stringify(data),'New',at,at,who).run();await emitWebhook(database(),'alert.created',{alertId:id,title:data.title,severity:data.severity,client:data.client});return json({...data,id,status:'New',caseId:null,createdAt:at,updatedAt:at,author:who},201)})}