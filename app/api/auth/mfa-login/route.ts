import {json,body,HttpError,database} from '@/lib/server';
import {assertSameOrigin,pendingSession,verifyTotp,clearMfaPending,sessionCookieHeader,accountView,authRoute,createSession,recordLoginAttempt,clearLoginAttempts} from '@/lib/auth';

// Second factor: completes a session that passed the password step.
export async function POST(req:Request){return authRoute(async()=>{
 assertSameOrigin(req);
 const pending=await pendingSession(req);
 if(!pending||!pending.session.mfa_pending)throw new HttpError(401,'Start a new sign-in.');
 const attemptKey=await recordLoginAttempt(req,`mfa:${pending.user.email}`);
 const input=await body(req);
 const user:any=await database().prepare('SELECT * FROM app_users WHERE id=?').bind(pending.user.id).first();
 if(!user?.mfa_secret||!user.mfa_enabled)throw new HttpError(400,'Two-factor authentication is not enabled.');
 if(!await verifyTotp(user.mfa_secret,typeof input?.code==='string'?input.code:''))throw new HttpError(401,'Invalid authentication code.');
 await clearLoginAttempts(attemptKey);
 await clearMfaPending(pending.session.id);
 // Rotate the session token after the factor upgrade.
 await database().prepare('DELETE FROM auth_sessions WHERE id=?').bind(pending.session.id).run();
 const {token}=await createSession(user.id,false);
 return json({user:accountView({id:user.id,email:user.email,displayName:user.display_name,isAdmin:!!user.is_admin,mfaEnabled:true})},200,{'Set-Cookie':sessionCookieHeader(req,token)});
})}
