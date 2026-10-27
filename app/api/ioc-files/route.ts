import {access} from '@/lib/access';
import {env} from 'cloudflare:workers';
import {auditStatement,database,guard,HttpError,json} from '@/lib/server';
import {limitedBytes,sha256} from '@/lib/archive';

export async function POST(req:Request){return guard(req,async who=>{
 let form:FormData;try{const raw=await limitedBytes(req,9*1024*1024);form=await new Response(raw,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData()}catch(e:any){throw new HttpError(400,e.message)}
 const file=form.get('file'),recordId=form.get('recordId');if(!(file instanceof File)||typeof recordId!=='string')throw new HttpError(400,'Choose a file and a saved indicator.');
 if(file.size<1||file.size>8*1024*1024)throw new HttpError(413,'Indicator files must be between 1 byte and 8 MB.');
 const db=database(),record:any=await db.prepare("SELECT * FROM records WHERE id=? AND kind='ioc'").bind(recordId).first();if(!record)throw new HttpError(404,'Indicator not found.');
 await access(req,record.case_id,'write');if(!env.BUCKET)throw new HttpError(503,'Indicator file storage is unavailable.');
 const id=crypto.randomUUID(),bytes=new Uint8Array(await file.arrayBuffer()),digest=await sha256(bytes),at=new Date().toISOString(),name=file.name.replace(/[\\/\x00-\x1f]/g,'_').slice(0,200)||'indicator-file',claimedMime=file.type.slice(0,120),mime=/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(claimedMime)?claimedMime:'application/octet-stream';
 await env.BUCKET.put(id,bytes,{httpMetadata:{contentType:mime}});
 try{await db.batch([db.prepare('INSERT INTO ioc_files(id,case_id,record_id,name,mime,sha256,size,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND version=?)').bind(id,record.case_id,recordId,name,mime,digest,file.size,at,recordId,record.version),auditStatement(record.case_id,id,'ioc.file_added',who,{recordId,name,mime,sha256:digest,size:file.size},true)]);const inserted=await db.prepare('SELECT id FROM ioc_files WHERE id=?').bind(id).first();if(!inserted)throw new HttpError(409,'The indicator changed during file upload. Please retry.')}catch(e){await env.BUCKET.delete(id);throw e}
 return json({id,caseId:record.case_id,recordId,name,mime,sha256:digest,size:file.size,createdAt:at},201);
})}
