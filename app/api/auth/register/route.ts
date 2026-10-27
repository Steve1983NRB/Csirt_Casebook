import {json,body,HttpError,database} from '@/lib/server';
import {ensureSchema,assertSameOrigin,normalizeEmail,hashPassword,passwordProblem,createSession,sessionCookieHeader,accountView,authRoute,requireAdmin,initialAdminSetupEnabled,verifyInitialAdminToken,recordLoginAttempt,clearLoginAttempts} from '@/lib/auth';

export async function POST(req:Request){return authRoute(async()=>{
 assertSameOrigin(req);
 await ensureSchema();
 const input=await body(req);
 const email=normalizeEmail(input?.email);
 const problem=passwordProblem(input?.password);
 if(problem)throw new HttpError(400,problem);
 const displayName=typeof input?.displayName==='string'&&input.displayName.trim()?input.displayName.trim().slice(0,200):email;
 const db=database();
 const existing=await db.prepare('SELECT id FROM app_users WHERE lower(email)=?').bind(email).first();
 if(existing)throw new HttpError(409,'An account with this email already exists.');
 const admins=await db.prepare('SELECT COUNT(*) AS n FROM app_users WHERE is_admin=1').first() as {n:number};
 const isAdmin=(admins?.n||0)===0?1:0;
 let bootstrapAttemptKey:string|undefined;
 if(isAdmin){
  if(!initialAdminSetupEnabled())throw new HttpError(503,'Initial administrator setup is disabled until a strong INITIAL_ADMIN_TOKEN is configured.');
  bootstrapAttemptKey=await recordLoginAttempt(req,'initial-admin-bootstrap');
  if(!verifyInitialAdminToken(input?.bootstrapToken))throw new HttpError(403,'The initial administrator setup token is invalid.');
 }else await requireAdmin(req);
 const id=crypto.randomUUID();const now=new Date().toISOString();
 const passwordHash=await hashPassword(input.password);
 await db.prepare('INSERT INTO app_users(id,email,display_name,last_seen,password_hash,mfa_secret,mfa_enabled,is_admin,created_at) VALUES(?,?,?,?,?,?,0,?,?)').bind(id,email,displayName,now,passwordHash,null,isAdmin,now).run();
 if(bootstrapAttemptKey)await clearLoginAttempts(bootstrapAttemptKey);
 if(isAdmin){
  const {token}=await createSession(id,false);
  return json({user:accountView({id,email,displayName,isAdmin:true,mfaEnabled:false})},201,{'Set-Cookie':sessionCookieHeader(req,token)});
 }
 return json({created:true,user:accountView({id,email,displayName,isAdmin:false,mfaEnabled:false})},201);
})}
