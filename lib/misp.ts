import {publicHttps,readBounded} from './news';

export type MispConfig={apiRoot:string;apiKey:string};
export type MispEnvironment={MISP_API_ROOT?:string;MISP_API_KEY?:string};
export type MispEvent={id:string;uuid:string;info:string;date:string;timestamp:string;org:string;threatLevel:string};
export type MispAttribute={id:string;uuid:string;type:string;value:string;category:string;comment:string;toIds:boolean;tags:string[];raw:Record<string,unknown>};
export type MispIocType='IP'|'Domain'|'URL'|'SHA256'|'SHA1'|'MD5'|'File name';
export type MispCandidate={attribute:MispAttribute;type:MispIocType;value:string};

const MAX_RESPONSE=2*1024*1024;
const MAX_EVENTS=50;
const MAX_EVENT_ATTRIBUTES=1000;
const MAX_IMPORT=50;

function text(value:unknown,max=300){return typeof value==='string'?value.trim().slice(0,max):''}
function object(value:unknown):Record<string,any>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{}}
function eventObject(value:unknown):Record<string,any>{const row=object(value);return object(row.Event||row.event||row)}
function validIp(value:string){
 if(/^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(value))return true;
 if(!value.includes(':'))return false;
 try{return new URL(`http://[${value}]/`).hostname.startsWith('[')}catch{return false}
}

export function configFromEnvironment(env:MispEnvironment):MispConfig|null{
 const rawRoot=text(env.MISP_API_ROOT,2000),apiKey=text(env.MISP_API_KEY,500);
 if(!rawRoot&&!apiKey)return null;
 if(!rawRoot)throw new Error('Configure MISP_API_ROOT.');
 if(!apiKey)throw new Error('Configure MISP_API_KEY.');
 const root=publicHttps(rawRoot);
 if(!root)throw new Error('Configure MISP_API_ROOT as a public HTTPS URL on port 443 without credentials, query or fragment.');
 const url=new URL(root);
 if(url.search||url.hash)throw new Error('MISP_API_ROOT must not contain a query or fragment.');
 return {apiRoot:url.href.replace(/\/?$/,'/'),apiKey};
}

function listEvents(value:unknown):MispEvent[]{
 const root=object(value),rows=Array.isArray(value)?value:Array.isArray(root.response)?root.response:Array.isArray(root.events)?root.events:root.Event?[root]:[];
 if(rows.length>MAX_EVENTS)throw new Error('MISP returned too many events in one response.');
 return rows.map((entry:unknown)=>{
  const e=eventObject(entry),org=object(e.Orgc||e.orgc||e.Org||e.org),threat=object(e.ThreatLevel||e.threat_level);
  return {id:text(e.id,40),uuid:text(e.uuid,100),info:text(e.info,300),date:text(e.date,40),timestamp:text(e.timestamp,40),org:text(org.name||e.org,200),threatLevel:text(threat.name||e.threat_level_id,40)};
 }).filter((e:MispEvent)=>/^\d{1,20}$/.test(e.id)&&e.info);
}

export function normalizeAttribute(value:unknown):MispAttribute|null{
 const row=object(value),uuid=text(row.uuid,100),id=text(row.id,40),type=text(row.type,100).toLowerCase(),rawValue=text(row.value,2000);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)||!id||!rawValue)return null;
 const tagRows=Array.isArray(row.Tag)?row.Tag:[];
 const tags=tagRows.map((entry:unknown)=>text(object(entry).name||object(object(entry).Tag).name,80)).filter(Boolean).slice(0,30);
 const category=text(row.category,100),comment=text(row.comment,1000),toIds=row.to_ids===true||row.to_ids===1||row.to_ids==='1';
 return {id,uuid,type,value:rawValue,category,comment,toIds,tags,raw:{id,uuid,type,value:rawValue,category,comment,to_ids:toIds,Tag:tags.map(name=>({name}))}};
}

export function toCandidate(attribute:MispAttribute):MispCandidate|null{
 const typeMap:Record<string,MispIocType>={'ip-src':'IP','ip-dst':'IP','ip-src|port':'IP','ip-dst|port':'IP',domain:'Domain',hostname:'Domain',url:'URL',md5:'MD5',sha1:'SHA1',sha256:'SHA256',filename:'File name'};
 const type=typeMap[attribute.type];if(!type)return null;
 const value=type==='IP'?attribute.value.split('|')[0].trim():attribute.value;
 if(!value||value.length>2000)return null;
 if(type==='IP'&&!validIp(value))return null;
 if(type==='URL'&&!/^https?:\/\//i.test(value))return null;
 if(['MD5','SHA1','SHA256'].includes(type)&&!new RegExp(`^[a-f0-9]{${type==='MD5'?32:type==='SHA1'?40:64}}$`,'i').test(value))return null;
 if(type==='Domain'&&!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i.test(value))return null;
 return {attribute,type,value};
}

export class MispClient{
 constructor(private config:MispConfig,private transport:typeof fetch=(input,init)=>fetch(input,init)){}
 private async request(path:string,method:'GET'|'POST',body?:Record<string,unknown>):Promise<any>{
  const url=new URL(path,this.config.apiRoot);
  let response:Response;
  try{
   response=await this.transport(url,{method,headers:{Authorization:this.config.apiKey,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(15000)});
  }catch{throw new Error('The MISP endpoint could not be reached. Check its URL, network access and TLS certificate.')}
  if(response.status>=300&&response.status<400){await response.body?.cancel();throw new Error('The MISP endpoint redirected. Configure its canonical API root; authenticated redirects are not followed.')}
  if(!response.ok){await response.body?.cancel();if(response.status===401||response.status===403)throw new Error('MISP access denied. Check the API key and read permissions.');if(response.status===429)throw new Error('MISP is rate limiting requests. Retry later.');throw new Error(`MISP returned HTTP ${response.status}.`)}
  if(!/^application\/(json|[^;]+\+json)/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw new Error('MISP did not return JSON.')}
  try{return JSON.parse(await readBounded(response,MAX_RESPONSE))}catch(e){if(e instanceof SyntaxError)throw new Error('MISP returned invalid JSON.');throw e}
 }
 async events():Promise<MispEvent[]>{
  const response=await this.request('events/restSearch','POST',{returnFormat:'json',published:true,metadata:true,last:'30d',limit:MAX_EVENTS,page:1});
  return listEvents(response);
 }
 async event(id:string):Promise<{event:MispEvent;attributes:MispAttribute[]}>{
  if(!/^\d{1,20}$/.test(id))throw new Error('Invalid MISP event ID.');
  const response=await this.request(`events/view/${encodeURIComponent(id)}`,'GET'),e=eventObject(response);
  if(String(e.id)!==id)throw new Error('MISP returned a different event than requested.');
  const attrs=Array.isArray(e.Attribute)?e.Attribute:Array.isArray(e.attributes)?e.attributes:[];
  if(attrs.length>MAX_EVENT_ATTRIBUTES)throw new Error('This MISP event has too many attributes to preview safely.');
  const attributes=attrs.map(normalizeAttribute).filter((v:MispAttribute|null):v is MispAttribute=>!!v);
  return {event:{id:text(e.id,40),uuid:text(e.uuid,100),info:text(e.info,300),date:text(e.date,40),timestamp:text(e.timestamp,40),org:text(object(e.Orgc||e.orgc).name,200),threatLevel:text(object(e.ThreatLevel||e.threat_level).name||e.threat_level_id,40)},attributes};
 }
}

export const MISP_MAX_IMPORT=MAX_IMPORT;
