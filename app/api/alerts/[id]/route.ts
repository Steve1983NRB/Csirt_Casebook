import {body,database,guard,HttpError,json,caseSchema,auditStatement} from '@/lib/server';
import {identity} from '@/lib/access';
import {playbookActions} from '@/lib/playbooks';

type Ctx={params:Promise<{id:string}>};
export async function PATCH(req:Request,ctx:Ctx){return guard(req,async who=>{
 const {id}=await ctx.params,input=await body(req),db=database(),alert:any=await db.prepare('SELECT * FROM alert_inbox WHERE id=?').bind(id).first();
 if(!alert)throw new HttpError(404,'Alert not found.');
 if(['triage','dismiss','reopen'].includes(input?.action)){
  const status=input.action==='triage'?'Triaged':input.action==='dismiss'?'Dismissed':'New',at=new Date().toISOString();
  await db.prepare('UPDATE alert_inbox SET status=?,updated_at=? WHERE id=? AND case_id IS NULL').bind(status,at,id).run();
  return json({id,status,updatedAt:at});
 }
 if(input?.action!=='promote')throw new HttpError(400,'Unknown alert action.');
 if(alert.case_id)throw new HttpError(409,'This alert is already linked to an investigation.');
 const alertData=JSON.parse(alert.data),owner=await identity(req),caseData=caseSchema.parse({...input.case,title:input.case?.title||alertData.title,client:input.case?.client||alertData.client,date:input.case?.date||new Date().toISOString().slice(0,10),summary:input.case?.summary||alertData.description,incidentType:input.case?.incidentType||'Alert investigation'}),caseId=crypto.randomUUID(),at=new Date().toISOString(),tasks=playbookActions(caseData.playbook);
 await db.batch([
  db.prepare('INSERT INTO cases(id,owner_id,data,created_at,updated_at,author) VALUES(?,?,?,?,?,?)').bind(caseId,owner.id,JSON.stringify(caseData),at,at,who),
  ...tasks.flatMap(task=>{const recordId=crypto.randomUUID();return [db.prepare('INSERT INTO records(id,case_id,kind,data,updated_at,author) VALUES(?,?,?,?,?,?)').bind(recordId,caseId,'action',JSON.stringify(task),at,who),auditStatement(caseId,recordId,'action.created',who,{after:task,source:'playbook'})]}),
  auditStatement(caseId,caseId,'case.created',who,{title:caseData.title,ownerId:owner.id,playbook:caseData.playbook,sourceAlertId:id}),
  db.prepare('UPDATE alert_inbox SET status=?,case_id=?,updated_at=? WHERE id=? AND case_id IS NULL').bind('Promoted',caseId,at,id)
 ]);
 return json({id,status:'Promoted',caseId,updatedAt:at},201);
})}