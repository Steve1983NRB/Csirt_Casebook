import {readBounded} from './news';

const API_ROOT='https://platform.socradar.com/api';
const MAX_FEEDS=3000;
const MAX_PAGE_SIZE=100;
const MAX_SYNC_ITEMS=500;

export type SocradarConfig={apiKey:string;companyId:string;apiRoot:string};
export type SocradarFeed={uuid:string;name:string;description:string;category:string;feedType:string;countries:string[];sectors:string[]};
export type SocradarItem={indicator:string;type:string;subtype?:string;score?:number;tags?:string[];sectors?:string[];countries?:string[];mitreAttckCodes?:string[];initialFeedSource?:string;insertDate?:string;latestSeenDate?:string};
export type SocradarPage={content:SocradarItem[];page:number;hasNext:boolean;startDate?:string;endDate?:string};

function text(value:unknown,max=500){return typeof value==='string'?value.slice(0,max):''}
function list(value:unknown,max=100){return Array.isArray(value)?value.filter(v=>typeof v==='string').slice(0,max) as string[]:[]}
function jsonObject(value:unknown):Record<string,any>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{} }

export function configFromEnvironment(env:Record<string,any>):SocradarConfig|null{
 const apiKey=text(env.SOCRADAR_PREMIUM_FEEDS_API_KEY,500).trim();
 const companyId=text(env.SOCRADAR_COMPANY_ID,100).trim();
 if(!apiKey&&!companyId)return null;
 if(!apiKey)throw new Error('Configure SOCRADAR_PREMIUM_FEEDS_API_KEY.');
 if(!/^[0-9]{1,30}$/.test(companyId))throw new Error('Configure a numeric SOCRADAR_COMPANY_ID.');
 const apiRoot=text(env.SOCRADAR_API_ROOT,200).trim()||API_ROOT;
 try{const u=new URL(apiRoot);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new Error('invalid');return {apiKey,companyId,apiRoot:u.toString().replace(/\/$/,'')}}catch{throw new Error('Configure SOCRADAR_API_ROOT as an HTTPS URL without credentials or query parameters.')}
}

function errorMessage(status:number,body:string){
 try{const parsed=jsonObject(JSON.parse(body));return text(parsed.message||parsed.error||`SOCradar returned HTTP ${status}.`,300)}catch{return `SOCradar returned HTTP ${status}.`}
}

export class SocradarClient{
 constructor(private config:SocradarConfig,private transport:typeof fetch=(input,init)=>fetch(input,init)){}
 private async request(path:string,params:Record<string,string|number|boolean|undefined>={}){
  const url=new URL(this.config.apiRoot+path);
  url.searchParams.set('key',this.config.apiKey);
  for(const [key,value] of Object.entries(params))if(value!==undefined&&value!=='')url.searchParams.set(key,String(value));
  let response:Response;
  try{response=await this.transport(url,{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(20000)})}catch{throw new Error('The SOCradar endpoint could not be reached. Check network access and trusted TLS certificates.')}
  if(response.status>=300&&response.status<400){await response.body?.cancel();throw new Error('The SOCradar endpoint redirected; the canonical HTTPS endpoint is required.')}
  const body=await readBounded(response,4*1024*1024);
  if(!response.ok)throw new Error(errorMessage(response.status,body));
  try{return JSON.parse(body)}catch{throw new Error('SOCradar returned invalid JSON.')}
 }
 async feeds(filters:Record<string,string|undefined>={}):Promise<SocradarFeed[]>{
  const raw=await this.request(`/premium-feeds/${encodeURIComponent(this.config.companyId)}/list-premium-feeds`,filters);
  const source=Array.isArray(raw)?raw:jsonObject(raw).feeds||jsonObject(raw).content||[];
  if(!Array.isArray(source)||source.length>MAX_FEEDS)throw new Error('SOCradar returned an invalid feed list.');
  return source.map((item:any)=>({uuid:text(item.uuid||item.feed_uuid||item.id,200),name:text(item.name||item.feed_name||item.title,300),description:text(item.description,1000),category:text(item.category||item.main_category,100),feedType:text(item.feed_type||item.type,100),countries:list(item.countries),sectors:list(item.sectors)})).filter(feed=>feed.uuid&&feed.name);
 }
 async content(feedUuid:string,options:{format?:'json';startDate?:string;endDate?:string;page?:number;checkAllowlist?:boolean}={}):Promise<SocradarPage>{
  if(!/^[a-zA-Z0-9_-]{1,200}$/.test(feedUuid))throw new Error('Invalid SOCradar feed identifier.');
  const page=Number(options.page||1);if(!Number.isInteger(page)||page<1||page>10000)throw new Error('Invalid SOCradar page.');
  const raw=await this.request(`/premium-feeds/${encodeURIComponent(this.config.companyId)}/get/${encodeURIComponent(feedUuid)}/${options.format||'json'}`,{start_date:options.startDate,end_date:options.endDate,page,check_allowlist:options.checkAllowlist===undefined?true:options.checkAllowlist});
  const body=jsonObject(raw),items=Array.isArray(body.content)?body.content:Array.isArray(raw)?raw:[];
  if(items.length>MAX_PAGE_SIZE)throw new Error('SOCradar returned too many indicators in one page.');
  return {content:items.map((item:any)=>({indicator:text(item.indicator||item.feed||item.value,2000),type:text(item.type||item.feed_type,100),subtype:text(item.subtype,100)||undefined,score:typeof item.score==='number'?item.score:undefined,tags:list(item.tags),sectors:list(item.sectors),countries:list(item.countries),mitreAttckCodes:list(item.mitre_attck_codes),initialFeedSource:text(item.initial_feed_source,300)||undefined,insertDate:text(item.insert_date,100)||undefined,latestSeenDate:text(item.latest_seen_date,100)||undefined})).filter(item=>item.indicator&&item.type),page:Number(body.page||page),hasNext:body.has_next===true,startDate:text(body.start_date,30)||undefined,endDate:text(body.end_date,30)||undefined};
 }
 async allContent(feedUuid:string,options:{startDate?:string;endDate?:string;checkAllowlist?:boolean}={}):Promise<SocradarItem[]>{
  const all:SocradarItem[]=[];let page=1;
  do{const result=await this.content(feedUuid,{...options,page});all.push(...result.content);if(all.length>=MAX_SYNC_ITEMS||!result.hasNext)break;page++;}while(page<=10000);
  return all.slice(0,MAX_SYNC_ITEMS);
 }
}

export function normalizeIndicatorType(type:string):'IP'|'Domain'|'URL'|'SHA256'|'SHA1'|'MD5'|'Other'{
 const value=type.toLowerCase().replace(/[^a-z0-9]/g,'');
 if(value==='ip'||value==='ipv4'||value==='ipv6'||value==='ipaddress')return 'IP';
 if(value==='domain'||value==='hostname'||value==='fqdn')return 'Domain';
 if(value==='url'||value==='uri')return 'URL';
 if(value==='sha256')return 'SHA256';
 if(value==='sha1')return 'SHA1';
 if(value==='md5'||value==='hash')return 'MD5';
 return 'Other';
}

export function itemDescription(item:SocradarItem,feed:SocradarFeed){
 const parts=[`SOCradar Premium Feed: ${feed.name}`,item.score===undefined?'':`Score: ${item.score}`,item.subtype?`Subtype: ${item.subtype}`:'',item.tags?.length?`Tags: ${item.tags.join(', ')}`:'',item.sectors?.length?`Sectors: ${item.sectors.join(', ')}`:'',item.countries?.length?`Countries: ${item.countries.join(', ')}`:'',item.mitreAttckCodes?.length?`MITRE ATT&CK: ${item.mitreAttckCodes.join(', ')}`:'',item.initialFeedSource?`Initial source: ${item.initialFeedSource}`:'',item.insertDate?`First seen: ${item.insertDate}`:'',item.latestSeenDate?`Last seen: ${item.latestSeenDate}`:''];
 return parts.filter(Boolean).join('\n').slice(0,100000);
}
