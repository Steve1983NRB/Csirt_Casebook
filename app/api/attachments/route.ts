import {access} from '@/lib/access';
import {env} from 'cloudflare:workers';
import {guard,json,database,auditStatement,HttpError} from '@/lib/server';
import {limitedBytes,imageMime,sha256} from '@/lib/archive';
export async function POST(req:Request){return guard(req,async who=>{
 let f:FormData;try{const raw=await limitedBytes(req,9*1024*1024);f=await new Response(raw,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData()}catch(e:any){throw new HttpError(400,e.message)}
 const file=f.get('file'),noteId=f.get('noteId');if(!(file instanceof File)||typeof noteId!=='string')throw new HttpError(400,'Choose an image and a saved note.');if(file.size>8*1024*1024)throw new HttpError(413,'Screenshots must be at most 8 MB.');
 const db=database(),note:any=await db.prepare("SELECT * FROM records WHERE id=? AND kind='note'").bind(noteId).first();if(!note)throw new HttpError(404,'Note not found.');const permission=await access(req,note.case_id,'write');
 const bytes=new Uint8Array(await file.arrayBuffer());let mime:string;try{mime=imageMime(bytes)}catch{throw new HttpError(400,'Use a PNG or JPEG screenshot.')}if(!env.BUCKET)throw new HttpError(503,'Screenshot storage is unavailable.');
 const id=crypto.randomUUID(),name=file.name.slice(0,200)||'Screenshot',digest=await sha256(bytes),at=new Date().toISOString(),before=JSON.parse(note.data),after={...before,...(!permission.canReview?{status:'Draft'}:{})};
 await env.BUCKET.put(id,bytes,{httpMetadata:{contentType:mime}});
 try{const [insert]=await db.batch([
  db.prepare('INSERT INTO attachments(id,case_id,note_id,name,mime,sha256,size,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM records WHERE id=? AND version=?)').bind(id,note.case_id,noteId,name,mime,digest,file.size,at,noteId,note.version),
  auditStatement(note.case_id,id,'screenshot.added',who,{name,sha256:digest,noteId,noteVersion:note.version+1,reviewState:after.status},true),
  db.prepare('UPDATE records SET data=?,version=version+1,updated_at=?,author=? WHERE id=? AND version=?').bind(JSON.stringify(after),at,who,noteId,note.version),
  auditStatement(note.case_id,noteId,'note.screenshot.updated',who,{before,after},true)
 ]);if(!insert.meta.changes)throw new HttpError(409,'The note changed during screenshot upload. Please retry.')}catch(e){await env.BUCKET.delete(id);throw e}
 return json({id,caseId:note.case_id,noteId,name,mime,sha256:digest,size:file.size,createdAt:at},201)
})}
