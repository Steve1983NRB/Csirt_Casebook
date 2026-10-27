import {guard,json,body,database,caseRow,caseSchema,auditStatement,HttpError} from '@/lib/server';
import {registerUser} from '@/lib/access';
import {playbookActions} from '@/lib/playbooks';
import {cleanAttributes,loadAttributeDefs} from '@/lib/attributes';
import {emitWebhook} from '@/lib/webhooks';
import {templateData} from '@/lib/templates';
export async function GET(req:Request){return guard(req,async()=>{const who=await registerUser(req);return json((await database().prepare("SELECT c.*,CASE WHEN c.owner_id=? OR (c.owner_id IS NULL AND lower(c.author)=?) THEN 'owner' ELSE m.role END AS role FROM cases c LEFT JOIN case_access m ON m.case_id=c.id AND m.user_id=? WHERE c.owner_id=? OR (c.owner_id IS NULL AND lower(c.author)=?) OR m.user_id IS NOT NULL ORDER BY c.updated_at DESC").bind(who.id,who.email.toLowerCase(),who.id,who.id,who.email.toLowerCase()).all()).results.map(caseRow))})}
export async function POST(req:Request){return guard(req,async who=>{
 const user=await registerUser(req),input=await body(req),db=database(),parsed=caseSchema.parse(input),data={...parsed,attributes:cleanAttributes(await loadAttributeDefs(db),parsed.attributes)},id=crypto.randomUUID(),at=new Date().toISOString(),clientId=crypto.randomUUID();
 let tasks:any[]=playbookActions(data.playbook);
 if(typeof input.templateId==='string'){const row:any=await db.prepare('SELECT data FROM case_templates WHERE id=?').bind(input.templateId).first();if(!row)throw new HttpError(400,'The selected case template no longer exists.');tasks=[...tasks,...templateData.parse(JSON.parse(row.data)).actions.map(a=>({title:a.title,description:a.description,owner:'',dueDate:'',status:'To do' as const,priority:a.priority,recommendation:false,include:true}))]}
 const statements=[db.prepare('INSERT OR IGNORE INTO clients(id,owner_id,name,contact_name,email,phone,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(clientId,user.id,data.client,'','','','',at,at),db.prepare('INSERT INTO cases(id,owner_id,data,created_at,updated_at,author) VALUES(?,?,?,?,?,?)').bind(id,user.id,JSON.stringify(data),at,at,who)];
 statements.push(...tasks.flatMap(task=>{const recordId=crypto.randomUUID();return [db.prepare('INSERT INTO records(id,case_id,kind,data,updated_at,author) VALUES(?,?,?,?,?,?)').bind(recordId,id,'action',JSON.stringify(task),at,who),auditStatement(id,recordId,'action.created',who,{after:task,source:'playbook'})]}),auditStatement(id,id,'case.created',who,{title:data.title,ownerId:user.id,playbook:data.playbook}));
 await db.batch(statements);await emitWebhook(db,'case.created',{caseId:id,reference:data.reference,title:data.title,client:data.client,priority:data.priority});return json({...data,id,version:1,updatedAt:at,role:'owner'},201)
})}
