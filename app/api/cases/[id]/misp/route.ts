import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {access} from '@/lib/access';
import {auditStatement,body,database,guard,HttpError,json,validateRecord} from '@/lib/server';
import {configFromEnvironment,MISP_MAX_IMPORT,MispClient,toCandidate} from '@/lib/misp';
import type {MispAttribute} from '@/lib/misp';

type Ctx={params:Promise<{id:string}>};

export async function GET(req:Request,ctx:Ctx){return guard(req,async()=>{
 const {id}=await ctx.params;await access(req,id,'manage');
 const config=configFromEnvironment(env);if(!config)throw new HttpError(503,'MISP is not configured.');
 try{return json({events:await new MispClient(config).events()})}catch(e:any){throw new HttpError(502,e.message)}
})}

export async function POST(req:Request,ctx:Ctx){return guard(req,async who=>{
 const {id}=await ctx.params;await access(req,id,'manage');
 const input=z.discriminatedUnion('action',[
  z.object({action:z.literal('preview'),eventId:z.string().regex(/^\d{1,20}$/)}),
  z.object({action:z.literal('import'),eventId:z.string().regex(/^\d{1,20}$/),attributeUuids:z.array(z.string().uuid()).min(1).max(MISP_MAX_IMPORT)})
 ]).parse(await body(req));
 const config=configFromEnvironment(env);if(!config)throw new HttpError(503,'MISP is not configured.');
 let selected:{event:any;attributes:MispAttribute[]};
 try{selected=await new MispClient(config).event(input.eventId)}catch(e:any){throw new HttpError(502,e.message)}
 if(input.action==='preview'){
  return json({event:selected.event,attributes:selected.attributes.map(attribute=>{const candidate=toCandidate(attribute);return {uuid:attribute.uuid,id:attribute.id,type:attribute.type,value:attribute.value,category:attribute.category,comment:attribute.comment,tags:attribute.tags,toIds:attribute.toIds,supported:!!candidate,localType:candidate?.type||null,normalizedValue:candidate?.value||null}})});
 }
 const wanted=new Set(input.attributeUuids);
 if(wanted.size!==input.attributeUuids.length)throw new HttpError(400,'An attribute was selected more than once.');
 const attributes=selected.attributes.filter(attribute=>wanted.has(attribute.uuid));
 if(attributes.length!==wanted.size)throw new HttpError(400,'A selected attribute is not part of this MISP event.');
 const candidates=attributes.map(toCandidate);
 if(candidates.some(candidate=>!candidate))throw new HttpError(400,'A selected MISP attribute is not a supported IOC type or has an invalid value.');
 const db=database(),rows:any[]=(await db.prepare("SELECT data FROM records WHERE case_id=? AND kind='ioc'").bind(id).all()).results||[];
 const imported=new Set<string>();
 for(const row of rows){const data=JSON.parse(row.data),source=data.externalSource;if(source?.provider==='MISP'&&source.apiRoot===config.apiRoot)imported.add(`${source.eventUuid}:${source.attributeUuid}`)}
 const statements:D1PreparedStatement[]=[],created:string[]=[],skipped:string[]=[],at=new Date().toISOString();
 for(const candidate of candidates){
  if(!candidate)continue;
  const {attribute}=candidate,uniqueKey=`${selected.event.uuid}:${attribute.uuid}`;
  if(imported.has(uniqueKey)){skipped.push(attribute.uuid);continue}
  const externalSource={provider:'MISP' as const,apiRoot:config.apiRoot,eventId:selected.event.id,eventUuid:selected.event.uuid,eventInfo:selected.event.info,attributeId:attribute.id,attributeUuid:attribute.uuid,toIds:attribute.toIds,rawAttribute:JSON.stringify(attribute.raw).slice(0,20000)};
  const description=[`MISP event: ${selected.event.info}`,`Category: ${attribute.category||'unspecified'}`,attribute.comment?`Comment: ${attribute.comment}`:'',attribute.tags.length?`Tags: ${attribute.tags.join(', ')}`:'',`MISP detection flag (to_ids): ${attribute.toIds?'yes':'no'}`].filter(Boolean).join('\n');
  const data=await validateRecord(id,'ioc',{type:candidate.type,value:candidate.value,description,assetId:'',include:false,externalSource});
  const recordId=crypto.randomUUID();
  statements.push(db.prepare('INSERT INTO records(id,case_id,kind,data,updated_at,author) VALUES(?,?,?,?,?,?)').bind(recordId,id,'ioc',JSON.stringify(data),at,who),auditStatement(id,recordId,'ioc.created',who,{source:'MISP',eventUuid:selected.event.uuid,attributeUuid:attribute.uuid,reviewState:'draft'}));
  created.push(attribute.uuid);imported.add(uniqueKey);
 }
 if(statements.length)await db.batch(statements);
 return json({received:wanted.size,created:created.length,skipped:skipped.length,reviewState:'draft'});
})}
