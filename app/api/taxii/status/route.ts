import {env} from 'cloudflare:workers';
import {guard,json} from '@/lib/server';
import {configFromEnvironment} from '@/lib/taxii';
export async function GET(req:Request){return guard(req,async()=>{try{const config=configFromEnvironment(env);return json({configured:!!config,provider:'OpenCTI / TAXII 2.1',authentication:config?.token?'Bearer token':config?.username?'Basic authentication':'None',endpoint:config?.apiRoot||null})}catch(e:any){return json({configured:false,error:e.message})}})}
