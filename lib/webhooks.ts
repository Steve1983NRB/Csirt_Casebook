import {HttpError} from './server';

export const webhookEvents=['case.created','case.updated','case.linked','record.created','report.generated','alert.created','alert.promoted'] as const;
export type WebhookEvent=typeof webhookEvents[number];

const PRIVATE_V4=[/^0\./,/^10\./,/^127\./,/^169\.254\./,/^172\.(1[6-9]|2\d|3[01])\./,/^192\.168\./,/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,/^192\.0\.0\./,/^198\.1[89]\./,/^2(2[4-9]|[3-5]\d)\./];

// Workers cannot resolve DNS before connecting, so the policy is syntactic: HTTPS only, no credentials,
// no IP literals in private/special ranges, no single-label or internal-looking hostnames.
export function assertSafeWebhookUrl(raw:string){
 let url:URL;try{url=new URL(raw)}catch{throw new HttpError(400,'Enter a valid webhook URL.')}
 if(url.protocol!=='https:')throw new HttpError(400,'Webhook URLs must use https.');
 if(url.username||url.password)throw new HttpError(400,'Webhook URLs cannot contain credentials.');
 if(url.port&&url.port!=='443')throw new HttpError(400,'Webhook URLs must use the default https port.');
 const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
 if(!host||!host.includes('.')&&!host.includes(':'))throw new HttpError(400,'The webhook host must be a public domain name.');
 if(host.includes(':'))throw new HttpError(400,'IPv6 literals are not allowed for webhooks.');
 if(/^\d+\.\d+\.\d+\.\d+$/.test(host)&&PRIVATE_V4.some(re=>re.test(host)))throw new HttpError(400,'Webhook URLs cannot target private or reserved addresses.');
 if(/^\d+$/.test(host.split('.').pop()||'')&&!/^\d+\.\d+\.\d+\.\d+$/.test(host))throw new HttpError(400,'Webhook URLs cannot use numeric host encodings.');
 if(/(^|\.)(localhost|local|internal|intranet|lan|corp|home|localdomain)$/.test(host))throw new HttpError(400,'Webhook URLs cannot target internal hostnames.');
 return url;
}

const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer)).map(b=>b.toString(16).padStart(2,'0')).join('');
export async function signPayload(secret:string,timestamp:string,body:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return 'sha256='+hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${timestamp}.${body}`)));
}

type Db={prepare:(q:string)=>any};
export type DeliveryResult={ok:boolean;status:number|null;error:string;durationMs:number};

export async function deliver(hook:{id:string;url:string;secret:string},event:string,payload:unknown,transport:typeof fetch=fetch):Promise<DeliveryResult>{
 const started=Date.now(),timestamp=String(Math.floor(started/1000)),body=JSON.stringify({event,deliveredAt:new Date(started).toISOString(),data:payload});
 try{
  assertSafeWebhookUrl(hook.url);
  const response=await transport(hook.url,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json','User-Agent':'CSIRT-Investigate-Webhook/1.0','X-CSIRT-Event':event,'X-CSIRT-Delivery':crypto.randomUUID(),'X-CSIRT-Timestamp':timestamp,'X-CSIRT-Signature':await signPayload(hook.secret,timestamp,body)},body,signal:AbortSignal.timeout(4000)});
  const ok=response.status>=200&&response.status<300;
  return {ok,status:response.status,error:ok?'':response.status>=300&&response.status<400?'Redirects are not followed.':`HTTP ${response.status}`,durationMs:Date.now()-started};
 }catch(e:any){return {ok:false,status:null,error:String(e?.message||e).slice(0,200),durationMs:Date.now()-started}}
}

export async function recordDelivery(db:Db,hookId:string,event:string,r:DeliveryResult){
 const at=new Date().toISOString();
 await db.prepare('INSERT INTO webhook_deliveries(id,webhook_id,event,status,ok,at,duration_ms,error) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),hookId,event,r.status,r.ok?1:0,at,r.durationMs,r.error).run();
 await db.prepare('UPDATE webhooks SET last_status=?,last_at=?,last_error=? WHERE id=?').bind(r.status,at,r.error,hookId).run();
 await db.prepare("DELETE FROM webhook_deliveries WHERE webhook_id=? AND id NOT IN (SELECT id FROM webhook_deliveries WHERE webhook_id=? ORDER BY at DESC LIMIT 50)").bind(hookId,hookId).run();
}

// Best effort and bounded: a slow or failing endpoint never fails the user's request.
export async function emitWebhook(db:Db,event:WebhookEvent,payload:{caseId?:string;[k:string]:unknown},transport:typeof fetch=fetch){
 try{
  const hooks=(await db.prepare("SELECT id,url,secret,events,include_case_details AS details FROM webhooks WHERE active=1 LIMIT 20").all()).results as any[];
  await Promise.allSettled(hooks.filter(h=>{try{return (JSON.parse(h.events) as string[]).includes(event)}catch{return false}}).map(async h=>{
   // Without the opt-in only identifiers leave the system, never case content.
   const data=h.details?payload:{caseId:payload.caseId,recordId:payload.recordId,kind:payload.kind,reference:payload.reference};
   await recordDelivery(db,h.id,event,await deliver(h,event,data,transport));
  }));
 }catch(e){console.error('Webhook dispatch failed',e)}
}
