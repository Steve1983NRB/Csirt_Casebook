import {database,getCase,HttpError} from './server';
import {currentAccount} from './auth';
export type Role='owner'|'reviewer'|'analyst'|'viewer';
export type Permission='read'|'write'|'review'|'manage';
export async function identity(req:Request){const account=await currentAccount(req);return {id:account.id,email:account.email,displayName:account.displayName}}
export function permissions(role:Role){return {role,canWrite:role!=='viewer',canReview:role==='owner'||role==='reviewer',canManage:role==='owner'}}
export async function registerUser(req:Request){return identity(req)}
export async function access(req:Request,caseId:string,need:Permission='read'){
 const who=await identity(req),c=await getCase(caseId);let role:Role|undefined;
 if(c.owner_id===who.id)role='owner';
 // Bounded migration of legacy cases created before stable owner IDs existed.
 if(!c.owner_id&&c.author.toLowerCase()===who.email.toLowerCase()){
  await database().prepare('UPDATE cases SET owner_id=? WHERE id=? AND owner_id IS NULL AND lower(author)=?').bind(who.id,caseId,who.email.toLowerCase()).run();
  const bound:any=await database().prepare('SELECT owner_id FROM cases WHERE id=?').bind(caseId).first();if(bound?.owner_id===who.id)role='owner';
 }
 if(!role){const member:any=await database().prepare('SELECT role FROM case_access WHERE case_id=? AND user_id=?').bind(caseId,who.id).first();role=member?.role}
 if(!role||!['owner','reviewer','analyst','viewer'].includes(role))throw new HttpError(404,'Investigation not found.');
 const p=permissions(role);if((need==='write'&&!p.canWrite)||(need==='review'&&!p.canReview)||(need==='manage'&&!p.canManage))throw new HttpError(403,need==='manage'?'Only the case owner can manage access and backups.':need==='review'?'A reviewer or case owner must validate this finding.':'This investigation is read-only for your role.');return {...p,case:c,identity:who};
}
export function enforceReview(role:Role,kind:string,data:any,old?:any,context?:{actor:string;recordAuthor?:string;requireDualReview?:boolean}){
 const field=kind==='note'?'status':kind==='event'?'status':kind==='asset'?'compromised':['ioc','technique','identity'].includes(kind)?'include':null;
 const approved=kind==='note'?'Validated':kind==='event'?'Confirmed':true;
 const draft=kind==='note'?'Draft':kind==='event'?'Unconfirmed':false;
 const approving=(kind==='note'||kind==='event')&&field&&data[field]===approved&&old?.[field]!==approved;
 if(approving&&context?.requireDualReview){const author=context.recordAuthor||context.actor;if(context.actor===author)throw new HttpError(403,'This case requires review by someone other than the record author.');}
 if(role==='owner'||role==='reviewer')return data;
 const out={...data};
 if(field&&out[field]===approved){if(old?.[field]===approved)out[field]=draft;else throw new HttpError(403,'A reviewer or case owner must validate this record before report inclusion.');}return out;
}
