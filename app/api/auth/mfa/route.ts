import {json,body,HttpError,database} from '@/lib/server';
import {requireInteractive as currentAccount,assertSameOrigin,generateTotpSecret,totpAuthUri,verifyTotp,verifyPassword,authRoute,recordLoginAttempt,clearLoginAttempts} from '@/lib/auth';

// Manage the signed-in user's own TOTP two-factor authentication.
// action=setup   -> issue a new secret (not yet active)
// action=enable  -> confirm a 6-digit code to activate the pending secret
// action=disable -> turn off MFA after re-entering the password
export async function POST(req:Request){return authRoute(async()=>{
 assertSameOrigin(req);
 const account=await currentAccount(req);
 const input=await body(req);
 const db=database();
 const action=input?.action;
 if(action==='setup'){
  const secret=generateTotpSecret();
  await db.prepare('UPDATE app_users SET mfa_secret=?,mfa_enabled=0 WHERE id=?').bind(secret,account.id).run();
  return json({secret,uri:totpAuthUri(secret,account.email)});
 }
 if(action==='enable'){
  const attemptKey=await recordLoginAttempt(req,`mfa-setup:${account.id}`);
  const user:any=await db.prepare('SELECT mfa_secret FROM app_users WHERE id=?').bind(account.id).first();
  if(!user?.mfa_secret)throw new HttpError(400,'Start two-factor setup first.');
  if(!await verifyTotp(user.mfa_secret,typeof input?.code==='string'?input.code:''))throw new HttpError(401,'Invalid authentication code.');
  await clearLoginAttempts(attemptKey);
  await db.prepare('UPDATE app_users SET mfa_enabled=1 WHERE id=?').bind(account.id).run();
  return json({mfaEnabled:true});
 }
 if(action==='disable'){
  const attemptKey=await recordLoginAttempt(req,`mfa-disable:${account.id}`);
  const user:any=await db.prepare('SELECT password_hash FROM app_users WHERE id=?').bind(account.id).first();
  if(!await verifyPassword(typeof input?.password==='string'?input.password:'',user?.password_hash||null))throw new HttpError(401,'Incorrect password.');
  await clearLoginAttempts(attemptKey);
  await db.prepare('UPDATE app_users SET mfa_enabled=0,mfa_secret=NULL WHERE id=?').bind(account.id).run();
  return json({mfaEnabled:false});
 }
 throw new HttpError(400,'Unknown action.');
})}
