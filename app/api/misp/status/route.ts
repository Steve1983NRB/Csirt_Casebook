import {env} from 'cloudflare:workers';
import {guard,json} from '@/lib/server';
import {configFromEnvironment} from '@/lib/misp';

export async function GET(req:Request){return guard(req,async()=>{
 try{
  const config=configFromEnvironment(env);
  return json({configured:!!config,provider:'MISP REST API',apiRoot:config?.apiRoot||null,authentication:config?'Read-only API key':'None'});
 }catch(e:any){return json({configured:false,provider:'MISP REST API',error:e.message})}
})}
