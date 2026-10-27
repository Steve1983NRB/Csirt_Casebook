import {guard,json,database} from '@/lib/server';
import {registerUser,access} from '@/lib/access';
export async function GET(req:Request){return guard(req,async()=>{const me=await registerUser(req),caseId=new URL(req.url).searchParams.get('caseId');if(!caseId)return json({me});await access(req,caseId,'manage');const users=(await database().prepare('SELECT id,email,display_name AS displayName FROM app_users ORDER BY display_name').all()).results;return json({me,users})})}
