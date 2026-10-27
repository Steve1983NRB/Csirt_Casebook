import {access} from '@/lib/access';
import {env} from 'cloudflare:workers';
import {database,guard,HttpError} from '@/lib/server';

export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return guard(req,async()=>{
 const id=(await ctx.params).id,row:any=await database().prepare('SELECT * FROM ioc_files WHERE id=?').bind(id).first();
 if(!row)throw new HttpError(404,'Indicator file not found.');await access(req,row.case_id,'read');
 const object=await env.BUCKET?.get(id);if(!object)throw new HttpError(503,'Indicator file is unavailable.');
 const safeName=row.name.replace(/["\\\r\n]/g,'_').replace(/[^\x20-\x7e]/g,'_');
 return new Response(object.body,{headers:{'Content-Type':row.mime,'Content-Disposition':`attachment; filename="${safeName}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
})}
