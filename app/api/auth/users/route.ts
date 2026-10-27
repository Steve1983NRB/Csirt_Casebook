import {json,body,HttpError,database} from '@/lib/server';
import {requireAdmin,assertSameOrigin,authRoute,hashPassword} from '@/lib/auth';

// Workspace-wide administrator management (distinct from per-case roles,
// which are managed from a case's Access tab).
export async function GET(req:Request){return authRoute(async()=>{
 await requireAdmin(req);
 const users=(await database().prepare('SELECT id,email,display_name AS displayName,is_admin AS isAdmin,mfa_enabled AS mfaEnabled,last_seen AS lastSeen FROM app_users ORDER BY display_name').all()).results;
 return json({users:users.map((u:any)=>({...u,isAdmin:!!u.isAdmin,mfaEnabled:!!u.mfaEnabled}))});
})}

// Generates a random temporary password meeting the workspace complexity
// rules; shown to the admin exactly once and never stored in plain text.
function generateTemporaryPassword(){
 const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);
 let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
 const alnum=btoa(binary).replace(/[^A-Za-z0-9]/g,'');
 return alnum.slice(0,14)+'-9!';
}

export async function POST(req:Request){return authRoute(async()=>{
 assertSameOrigin(req);
 const admin=await requireAdmin(req);
 const input=await body(req);
 const userId=typeof input?.userId==='string'?input.userId:'';
 if(!userId)throw new HttpError(400,'A user is required.');
 const db=database();
 if(input?.action==='reset-password'){
  const target:any=await db.prepare('SELECT id FROM app_users WHERE id=?').bind(userId).first();
  if(!target)throw new HttpError(404,'User not found.');
  const temporaryPassword=generateTemporaryPassword();
    await db.batch([
     db.prepare('UPDATE app_users SET password_hash=? WHERE id=?').bind(await hashPassword(temporaryPassword),userId),
     db.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(userId),
     db.prepare('UPDATE api_keys SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').bind(new Date().toISOString(),userId),
    ]);
  return json({ok:true,temporaryPassword});
 }
 const makeAdmin=input?.isAdmin===true;
 const target:any=await db.prepare('SELECT id,is_admin FROM app_users WHERE id=?').bind(userId).first();
 if(!target)throw new HttpError(404,'User not found.');
 if(!makeAdmin&&target.id===admin.id){
  const remaining=await db.prepare('SELECT COUNT(*) AS n FROM app_users WHERE is_admin=1 AND id!=?').bind(admin.id).first() as {n:number};
  if((remaining?.n||0)===0)throw new HttpError(400,'At least one workspace administrator is required. Promote another user first.');
 }
 await db.prepare('UPDATE app_users SET is_admin=? WHERE id=?').bind(makeAdmin?1:0,userId).run();
 return json({ok:true});
})}
