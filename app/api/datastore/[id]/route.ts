import {access} from '@/lib/access';
import {env} from 'cloudflare:workers';
import {auditStatement,database,guard,HttpError,json} from '@/lib/server';

type Ctx={params:Promise<{id:string}>};
async function load(id:string){const row:any=await database().prepare('SELECT * FROM datastore_files WHERE id=?').bind(id).first();if(!row)throw new HttpError(404,'File not found.');return row}

export async function GET(req:Request,ctx:Ctx){return guard(req,async()=>{
 const row=await load((await ctx.params).id);await access(req,row.case_id,'read');
 const object=await env.BUCKET?.get(row.id);if(!object)throw new HttpError(503,'The file is unavailable.');
 const safeName=row.name.replace(/["\\\r\n]/g,'_').replace(/[^\x20-\x7e]/g,'_');
 // Always an opaque download: uploaded content must never render in the application's origin.
 return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${safeName}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
})}

export async function DELETE(req:Request,ctx:Ctx){return guard(req,async who=>{
 const row=await load((await ctx.params).id);await access(req,row.case_id,'write');
 await database().batch([database().prepare('DELETE FROM datastore_files WHERE id=?').bind(row.id),auditStatement(row.case_id,row.id,'datastore.file_removed',who,{name:row.name,folder:row.folder,sha256:row.sha256},true)]);
 await env.BUCKET?.delete(row.id);
 return json({deleted:true});
})}
