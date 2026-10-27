import {json,database} from '@/lib/server';
import {sessionAccount,accountView,authRoute,ensureSchema,initialAdminSetupEnabled} from '@/lib/auth';

export async function GET(req:Request){return authRoute(async()=>{
 await ensureSchema();
 const account=await sessionAccount(req);
 const admins=await database().prepare('SELECT COUNT(*) AS n FROM app_users WHERE is_admin=1').first() as {n:number};
 return json({user:account?accountView(account):null,registrationOpen:(admins?.n||0)===0&&initialAdminSetupEnabled()});
})}
