import {access} from '@/lib/access';
import {env} from 'cloudflare:workers';
import {guard,database,HttpError} from '@/lib/server';
export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){return guard(req,async()=>{const id=(await ctx.params).id,row:any=await database().prepare('SELECT * FROM attachments WHERE id=?').bind(id).first();if(!row)throw new HttpError(404,'Screenshot not found.');await access(req,row.case_id,'read');const object=await env.BUCKET?.get(id);if(!object)throw new HttpError(503,'Screenshot is unavailable.');return new Response(object.body,{headers:{'Content-Type':row.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename="screenshot.${row.mime==='image/png'?'png':'jpg'}"`}})})}
