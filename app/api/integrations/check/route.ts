import {env} from 'cloudflare:workers';
import {guard,json} from '@/lib/server';
import {configFromEnvironment as mispConfig,MispClient} from '@/lib/misp';
import {configFromEnvironment as socradarConfig,SocradarClient} from '@/lib/socradar';
import {configFromEnvironment as taxiiConfig,TaxiiClient} from '@/lib/taxii';
import {readBounded} from '@/lib/news';

type CheckResult={id:string;name:string;status:'connected'|'failed'|'not-configured';message:string};

async function probe(id:string,name:string,check:()=>Promise<{configured:boolean;message?:string}>,secrets:string[]=[]):Promise<CheckResult>{
 try{
  const result=await check();
  return {id,name,status:result.configured?'connected':'not-configured',message:result.message|| (result.configured?'Connection successful.':'Not configured.')};
 }catch(error){
  let message=error instanceof Error?error.message:'Connection check failed.';
  for(const secret of secrets)if(secret)message=message.replaceAll(secret,'[redacted]');
  return {id,name,status:'failed',message:message.slice(0,300)};
 }
}

async function checkAbuseCh():Promise<{configured:boolean;message?:string}>{
 const key=typeof env.ABUSECH_AUTH_KEY==='string'?env.ABUSECH_AUTH_KEY.trim():'';
 if(!key)return {configured:false};
 const response=await fetch('https://threatfox-api.abuse.ch/api/v1/',{
  method:'POST',
  headers:{'Auth-Key':key,'Accept':'application/json','Content-Type':'application/json'},
  body:JSON.stringify({query:'get_iocs',days:1}),
  signal:AbortSignal.timeout(15000),
 });
 if(!response.ok){await response.body?.cancel();throw new Error(`ThreatFox returned HTTP ${response.status}.`)}
 let data:any;
 try{data=JSON.parse(await readBounded(response,2*1024*1024))}catch{throw new Error('ThreatFox returned invalid or oversized JSON.')}
 if(!['ok','no_result'].includes(data?.query_status))throw new Error(`ThreatFox rejected the request (${String(data?.query_status||'unknown').slice(0,60)}).`);
 return {configured:true,message:'ThreatFox API key accepted.'};
}

export async function POST(req:Request){return guard(req,async()=>{
 const key=typeof env.SOCRADAR_PREMIUM_FEEDS_API_KEY==='string'?env.SOCRADAR_PREMIUM_FEEDS_API_KEY.trim():'';
 const token=typeof env.TAXII_TOKEN==='string'?env.TAXII_TOKEN:'';
 const password=typeof env.TAXII_PASSWORD==='string'?env.TAXII_PASSWORD:'';
 const results=await Promise.all([
  probe('socradar','SOCradar Premium Feeds',async()=>{const config=socradarConfig(env);if(!config)return {configured:false};const feeds=await new SocradarClient(config).feeds();return {configured:true,message:`Connected. ${feeds.length} feeds available.`}},[key]),
  probe('misp','MISP REST API',async()=>{const config=mispConfig(env);if(!config)return {configured:false};const events=await new MispClient(config).events();return {configured:true,message:`Connected. ${events.length} published events found.`}},[String(env.MISP_API_KEY||'').trim()]),
  probe('taxii','OpenCTI / TAXII 2.1',async()=>{const config=taxiiConfig(env);if(!config)return {configured:false};const result=await new TaxiiClient(config).collections();return {configured:true,message:`Connected. ${result.collections.length} readable collections found.`}},[token,password]),
  probe('abusech','abuse.ch / ThreatFox',checkAbuseCh,[String(env.ABUSECH_AUTH_KEY||'').trim()]),
 ]);
 return json({checkedAt:new Date().toISOString(),results});
})}
