import {json,body,HttpError,database} from '@/lib/server';
import {ensureSchema,assertSameOrigin,normalizeEmail,verifyPassword,createSession,sessionCookieHeader,accountView,authRoute,recordLoginAttempt,clearLoginAttempts} from '@/lib/auth';

export async function POST(req:Request){return authRoute(async()=>{
 assertSameOrigin(req);
 await ensureSchema();
 const input=await body(req);
 const email=normalizeEmail(input?.email);
 const attemptKey=await recordLoginAttempt(req,email);
 const user:any=await database().prepare('SELECT * FROM app_users WHERE lower(email)=?').bind(email).first();
 const ok=await verifyPassword(typeof input?.password==='string'?input.password:'',user?.password_hash||null);
 // Uniform error and constant-ish work whether or not the account exists.
 if(!user||!ok)throw new HttpError(401,'Invalid email or password.');
 await clearLoginAttempts(attemptKey);
 if(user.mfa_enabled){
  const {token}=await createSession(user.id,true);
  return json({mfaRequired:true},200,{'Set-Cookie':sessionCookieHeader(req,token,300)});
 }
 const {token}=await createSession(user.id,false);
 return json({user:accountView({id:user.id,email:user.email,displayName:user.display_name,isAdmin:!!user.is_admin,mfaEnabled:!!user.mfa_enabled})},200,{'Set-Cookie':sessionCookieHeader(req,token)});
})}
