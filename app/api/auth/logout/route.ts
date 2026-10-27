import {json} from '@/lib/server';
import {assertSameOrigin,destroySession,clearCookieHeader,authRoute} from '@/lib/auth';

export async function POST(req:Request){return authRoute(async()=>{
 assertSameOrigin(req);
 await destroySession(req);
 return json({signedOut:true},200,{'Set-Cookie':clearCookieHeader(req)});
})}
