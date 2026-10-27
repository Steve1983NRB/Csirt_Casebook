import {feedById,fetchFeedText,normalizeKey,type IntelCandidate,type IntelFeed} from './intel';
import {HttpError} from './server';

export type D1Like={prepare:(query:string)=>any;batch:(items:any[])=>Promise<any[]>};
export type IntelRow={id:string;kind:string;source:string;type:string;value:string;key:string;label:string;threat_type:string;confidence:number|null;tags:string;reference:string;data:string;first_seen:string|null;last_seen:string|null;created_at:string;updated_at:string;author:string;author_id:string|null};
export type IntelItem={id:string;kind:'indicator'|'actor';source:string;type:string;value:string;label:string;threatType:string;confidence:number|null;tags:string[];reference:string;data:any;firstSeen:string|null;lastSeen:string|null;updatedAt:string;author:string;manual:boolean};

export type CaseIoc={recordId:string;type:string;value:string;include:boolean};
const hostOf=(value:string)=>{try{return new URL(normalizeKey(value)).hostname.replace(/^\[|\]$/g,'')}catch{return ''}};

// Looks up case indicators (exact value, plus the host of URLs) in the shared library.
export async function matchIocs(db:D1Like,iocs:CaseIoc[]){
 const wanted=new Set<string>();for(const i of iocs){wanted.add(normalizeKey(i.value));if(i.type==='URL'){const h=hostOf(i.value);if(h)wanted.add(h)}}
 const keys=[...wanted],hits=new Map<string,IntelItem[]>();
 for(let i=0;i<keys.length;i+=80){
  const chunk=keys.slice(i,i+80);
  for(const row of (await db.prepare(`SELECT * FROM intel_items WHERE kind='indicator' AND key IN (${chunk.map(()=>'?').join(',')}) ORDER BY source,updated_at DESC`).bind(...chunk).all()).results as any[]){const list=hits.get(row.key)||[];list.push(intelItem(row));hits.set(row.key,list)}
 }
 return iocs.map(i=>{
  const direct=hits.get(normalizeKey(i.value))||[],host=i.type==='URL'?hostOf(i.value):'',viaHost=host?(hits.get(host)||[]):[];
  return {...i,hits:[...direct.map(h=>({...h,via:'value' as const})),...viaHost.filter(h=>!direct.some(d=>d.id===h.id)).map(h=>({...h,via:'host' as const}))]};
 }).filter(m=>m.hits.length);
}

export const COOLDOWN_MS=10*60*1000;
export const statusId=(feedId:string)=>'intel:'+feedId;

export function intelItem(row:any):IntelItem{
 const parse=(s:string,fallback:any)=>{try{return JSON.parse(s)}catch{return fallback}};
 return {id:row.id,kind:row.kind,source:row.source,type:row.type,value:row.value,label:row.label,threatType:row.threat_type,confidence:row.confidence,tags:parse(row.tags,[]),reference:row.reference,data:parse(row.data,{}),firstSeen:row.first_seen,lastSeen:row.last_seen,updatedAt:row.updated_at,author:row.author,manual:row.source==='manual'};
}

const COLUMNS='id,kind,source,type,value,key,label,threat_type,confidence,tags,reference,data,first_seen,last_seen,created_at,updated_at';
const ROW='(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
const UPSERT=' ON CONFLICT(kind,source,key) DO UPDATE SET type=excluded.type,value=excluded.value,label=excluded.label,threat_type=excluded.threat_type,confidence=excluded.confidence,tags=excluded.tags,reference=excluded.reference,data=excluded.data,first_seen=excluded.first_seen,last_seen=excluded.last_seen,updated_at=excluded.updated_at';

export async function storeFeedItems(db:D1Like,source:string,items:IntelCandidate[],at:string){
 const unique=new Map<string,IntelCandidate>();
 for(const item of items){const key=normalizeKey(item.value);if(key&&!unique.has(key))unique.set(key,item)}
 const rows=[...unique.entries()];
 const statements:any[]=[];
 for(let i=0;i<rows.length;i+=6){
  const chunk=rows.slice(i,i+6);
  statements.push(db.prepare(`INSERT INTO intel_items(${COLUMNS}) VALUES ${chunk.map(()=>ROW).join(',')}${UPSERT}`).bind(...chunk.flatMap(([key,x])=>[crypto.randomUUID(),'indicator',source,x.type,x.value,key,x.label,x.threatType,x.confidence,JSON.stringify(x.tags),x.reference,JSON.stringify(x.data),x.firstSeen,x.lastSeen,at,at])));
 }
 for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50));
 return rows.length;
}

export type FeedStatus={id:string;lastSuccessAt:string|null;checkedAt:string|null;error:string|null;count:number};
export async function readStatuses(db:D1Like):Promise<Record<string,FeedStatus>>{
 const counts=new Map<string,number>(((await db.prepare("SELECT source,COUNT(*) AS n FROM intel_items WHERE kind='indicator' GROUP BY source").all()).results as any[]).map(r=>[r.source,r.n]));
 const cached=(await db.prepare("SELECT id,data FROM external_cache WHERE id LIKE 'intel:%'").all()).results as any[];
 const out:Record<string,FeedStatus>={};
 for(const row of cached){try{const v=JSON.parse(row.data),id=String(row.id).slice(6);out[id]={id,lastSuccessAt:v.lastSuccessAt??null,checkedAt:v.checkedAt??null,error:v.error??null,count:counts.get(id)||0}}catch{/* ignore corrupt status */}}
 for(const [id,n] of counts)out[id]??={id,lastSuccessAt:null,checkedAt:null,error:null,count:n};
 return out;
}

export async function syncFeed(db:D1Like,id:string,options:{force?:boolean;transport?:typeof fetch;now?:Date;authKey?:string}={}):Promise<{feed:IntelFeed;skipped:boolean;status:FeedStatus}>{
 const feed=feedById(id);if(!feed)throw new HttpError(404,'Unknown threat-intelligence feed.');
 const now=options.now||new Date(),at=now.toISOString(),previous=(await readStatuses(db))[id];
 if(!options.force&&previous?.lastSuccessAt&&now.getTime()-Date.parse(previous.lastSuccessAt)<COOLDOWN_MS)return {feed,skipped:true,status:previous};
 let status:FeedStatus;
 try{
  const candidates=(feed.load?await feed.load(options.transport,options.authKey):feed.parse(await fetchFeedText(feed,options.transport))).slice(0,feed.limit);
  const count=await storeFeedItems(db,id,candidates,at);
  if(feed.pruneMissing!==false)await db.prepare("DELETE FROM intel_items WHERE kind='indicator' AND source=? AND updated_at<?").bind(id,at).run();
  status={id,lastSuccessAt:at,checkedAt:at,error:null,count};
 }catch(e:any){
  status={id,lastSuccessAt:previous?.lastSuccessAt??null,checkedAt:at,error:String(e?.message||e).slice(0,300),count:previous?.count||0};
 }
 await db.prepare('INSERT INTO external_cache(id,data,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(statusId(id),JSON.stringify({lastSuccessAt:status.lastSuccessAt,checkedAt:status.checkedAt,error:status.error}),at).run();
 return {feed,skipped:false,status};
}
