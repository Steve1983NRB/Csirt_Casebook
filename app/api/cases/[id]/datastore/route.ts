import {access} from '@/lib/access';
import {env} from 'cloudflare:workers';
import {auditStatement,database,guard,HttpError,json} from '@/lib/server';
import {limitedBytes,sha256} from '@/lib/archive';
import {DATASTORE_MAX_FILE,DATASTORE_MAX_FILES,DATASTORE_MAX_TOTAL} from '@/lib/templates';

type Ctx={params:Promise<{id:string}>};
const clean=(value:unknown,max:number)=>typeof value==='string'?value.replace(/[\\\x00-\x1f]/g,'_').trim().slice(0,max):'';

export async function GET(req:Request,ctx:Ctx){return guard(req,async()=>{
 const id=(await ctx.params).id;await access(req,id,'read');
 const files=(await database().prepare('SELECT id,case_id AS caseId,folder,name,mime,sha256,size,description,created_at AS createdAt,author FROM datastore_files WHERE case_id=? ORDER BY folder COLLATE NOCASE,name COLLATE NOCASE LIMIT 1000').bind(id).all()).results as any[];
 return json({files,limits:{maxFile:DATASTORE_MAX_FILE,maxFiles:DATASTORE_MAX_FILES,maxTotal:DATASTORE_MAX_TOTAL},used:files.reduce((n,f)=>n+f.size,0)});
})}

export async function POST(req:Request,ctx:Ctx){return guard(req,async who=>{
 const caseId=(await ctx.params).id;await access(req,caseId,'write');
 let form:FormData;try{const raw=await limitedBytes(req,DATASTORE_MAX_FILE+1024*1024);form=await new Response(raw,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData()}catch(e:any){throw new HttpError(400,e.message)}
 const file=form.get('file');if(!(file instanceof File))throw new HttpError(400,'Choose a file.');
 if(file.size>DATASTORE_MAX_FILE)throw new HttpError(413,'Files must be at most 25 MB.');
 if(!env.BUCKET)throw new HttpError(503,'File storage is unavailable.');
 const db=database(),usage:any=await db.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(size),0) AS total FROM datastore_files WHERE case_id=?').bind(caseId).first();
 if(usage.n>=DATASTORE_MAX_FILES)throw new HttpError(409,'This investigation reached its file limit.');
 if(usage.total+file.size>DATASTORE_MAX_TOTAL)throw new HttpError(409,'This investigation reached its storage limit.');
 const bytes=new Uint8Array(await file.arrayBuffer()),id=crypto.randomUUID(),digest=await sha256(bytes),at=new Date().toISOString();
 const name=clean(file.name.replace(/\//g,'_'),200)||'file',folder=clean(form.get('folder'),100),description=clean(form.get('description'),1000),claimed=file.type.slice(0,120),mime=/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(claimed)?claimed:'application/octet-stream';
 await env.BUCKET.put(id,bytes,{httpMetadata:{contentType:'application/octet-stream'}});
 try{await db.batch([db.prepare('INSERT INTO datastore_files(id,case_id,folder,name,mime,sha256,size,description,created_at,author) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,caseId,folder,name,mime,digest,bytes.length,description,at,who),auditStatement(caseId,id,'datastore.file_added',who,{name,folder,sha256:digest,size:bytes.length},true)])}catch(e){await env.BUCKET.delete(id);throw e}
 return json({id,caseId,folder,name,mime,sha256:digest,size:bytes.length,description,createdAt:at,author:who},201);
})}
