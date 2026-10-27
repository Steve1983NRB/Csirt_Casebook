export const iocTypes=['IP','Domain','URL','SHA256','SHA1','MD5','File name','Other'] as const;
export type IocType=typeof iocTypes[number];

export type IntelCandidate={type:IocType;value:string;label:string;threatType:string;confidence:number|null;tags:string[];reference:string;firstSeen:string|null;lastSeen:string|null;data:Record<string,unknown>};
export type IntelFeed={id:string;name:string;url:string;site:string;description:string;license:string;limit:number;parse:(text:string)=>IntelCandidate[];load?:(transport?:typeof fetch,authKey?:string)=>Promise<IntelCandidate[]>;pruneMissing?:boolean};

export const MAX_VALUE=2000;

// Analysts paste defanged indicators from reports; compare them in their live form.
export function refang(value:string){return value.trim().replace(/^hxxp/i,'http').replace(/\[\.\]|\(\.\)|\[dot\]/gi,'.').replace(/\[:\]/g,':').replace(/\[@\]/g,'@').replace(/\[:\/\/\]/g,'://')}
export function normalizeKey(value:string){return refang(value).toLowerCase().slice(0,MAX_VALUE)}

const ipv4=/^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const ipv6=/^[0-9a-f:]+:[0-9a-f:]*$/i;
const domain=/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i;
export function detectType(raw:string):IocType{
 const v=refang(raw);
 if(/^[a-f0-9]{64}$/i.test(v))return 'SHA256';
 if(/^[a-f0-9]{40}$/i.test(v))return 'SHA1';
 if(/^[a-f0-9]{32}$/i.test(v))return 'MD5';
 if(/^https?:\/\//i.test(v))return 'URL';
 if(ipv4.test(v)||(ipv6.test(v)&&v.includes(':')&&!v.includes('.')&&v.length>=3))return 'IP';
 if(domain.test(v))return 'Domain';
 if(/\.[a-z0-9]{1,6}$/i.test(v)&&!v.includes(' '))return 'File name';
 return 'Other';
}

const clean=(v:unknown,max=300)=>typeof v==='string'?v.trim().slice(0,max):'';
const utc=(v:unknown)=>{const s=clean(v,40);if(!s)return null;const iso=/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(s)?s.replace(' ','T')+(s.length>10?'Z':''):s;return Number.isNaN(Date.parse(iso))?null:new Date(iso).toISOString()};
const tagList=(v:unknown)=>(Array.isArray(v)?v:typeof v==='string'?v.split(','):[]).map(x=>clean(x,40)).filter(Boolean).slice(0,12);

export function parseFeodo(text:string):IntelCandidate[]{
 const rows=JSON.parse(text);if(!Array.isArray(rows))throw new Error('Unexpected Feodo Tracker format.');
 return rows.filter((r:any)=>typeof r?.ip_address==='string').map((r:any)=>({type:'IP' as const,value:r.ip_address,label:clean(r.malware,100),threatType:'botnet_cc',confidence:null,tags:tagList([r.status,r.country,r.port?`port:${r.port}`:'']),reference:`https://feodotracker.abuse.ch/browse/host/${r.ip_address}/`,firstSeen:utc(r.first_seen),lastSeen:utc(r.last_online),data:{port:r.port??null,asn:r.as_name??null,hostname:r.hostname??null,status:r.status??null}}));
}

const threatFoxTypes:Record<string,IocType>={url:'URL',domain:'Domain','ip:port':'IP',md5_hash:'MD5',sha256_hash:'SHA256',sha1_hash:'SHA1'};
export function parseThreatFox(text:string):IntelCandidate[]{
 const root=JSON.parse(text);if(!root||typeof root!=='object'||Array.isArray(root))throw new Error('Unexpected ThreatFox format.');
 if('query_status' in root){
  if(root.query_status!=='ok')throw new Error(`ThreatFox query failed: ${clean(String(root.query_status),60)}.`);
  const items:IntelCandidate[]=[];
  for(const e of (Array.isArray(root.data)?root.data:[]) as any[]){
   const type=threatFoxTypes[e?.ioc_type],raw=clean(e?.ioc,MAX_VALUE);if(!type||!raw)continue;
   const port=type==='IP'?raw.split(':')[1]:undefined,value=type==='IP'?raw.split(':')[0]:raw;
   items.push({type,value,label:clean(e.malware_printable,100),threatType:clean(e.threat_type,60),confidence:Number.isFinite(e.confidence_level)?Math.max(0,Math.min(100,Math.round(e.confidence_level))):null,tags:tagList([...tagList(e.tags).filter(t=>!/^[a-f0-9]{32}$/i.test(t)),port?`port:${port}`:'']),reference:`https://threatfox.abuse.ch/ioc/${encodeURIComponent(String(e.id??''))}/`,firstSeen:utc(clean(e.first_seen,40).replace(/ UTC$/,'')),lastSeen:utc(clean(e.last_seen,40).replace(/ UTC$/,'')),data:{reporter:clean(e.reporter,80)}});
  }
  return items.reverse();
 }
 const out:IntelCandidate[]=[];
 for(const [id,entries] of Object.entries(root).reverse()){
  for(const e of (Array.isArray(entries)?entries:[]) as any[]){
   const type=threatFoxTypes[e?.ioc_type];const raw=clean(e?.ioc_value,MAX_VALUE);if(!type||!raw)continue;
   const port=type==='IP'?raw.split(':')[1]:undefined,value=type==='IP'?raw.split(':')[0]:raw;
   out.push({type,value,label:clean(e.malware_printable,100),threatType:clean(e.threat_type,60),confidence:Number.isFinite(e.confidence_level)?Math.max(0,Math.min(100,Math.round(e.confidence_level))):null,tags:tagList([...tagList(e.tags).filter(t=>!/^[a-f0-9]{32}$/i.test(t)),port?`port:${port}`:'']),reference:`https://threatfox.abuse.ch/ioc/${encodeURIComponent(id)}/`,firstSeen:utc(e.first_seen_utc),lastSeen:utc(e.last_seen_utc),data:{reporter:clean(e.reporter,80)}});
  }
 }
 return out;
}

export function parseUrlhaus(text:string):IntelCandidate[]{
 // Authenticated CSV export (newest first): id,dateadded,url,url_status,last_online,threat,tags,urlhaus_link,reporter
 const csvRows=text.split(/\r?\n/).filter(l=>/^"\d+","/.test(l));
 if(csvRows.length)return csvRows.flatMap(line=>{
  const cells=[...line.matchAll(/"((?:[^"]|"")*)"/g)].map(m=>m[1].replace(/""/g,'"'));
  const value=cells[2]||'';if(!/^https?:\/\//i.test(value)||value.length>MAX_VALUE)return [];
  return [{type:'URL' as const,value,label:'',threatType:clean(cells[5],60)||'malware_download',confidence:null,tags:tagList(cells[6]),reference:cells[7]||'https://urlhaus.abuse.ch/',firstSeen:utc(cells[1]),lastSeen:utc(cells[4]),data:{status:clean(cells[3],20),reporter:clean(cells[8],80)}}];
 });
 return text.split(/\r?\n/).map(l=>l.trim()).filter(l=>/^https?:\/\//i.test(l)&&l.length<=MAX_VALUE).map(value=>({type:'URL' as const,value,label:'',threatType:'malware_download',confidence:null,tags:[],reference:'https://urlhaus.abuse.ch/',firstSeen:null,lastSeen:null,data:{}}));
}

export function parseBazaar(text:string):IntelCandidate[]{
 try{
  const root=JSON.parse(text);
  if(root&&typeof root==='object'&&!Array.isArray(root)){
   if(root.query_status&&root.query_status!=='ok')throw new Error(`MalwareBazaar query failed: ${clean(String(root.query_status),60)}.`);
   return (Array.isArray(root.data)?root.data:[]).filter((row:any)=>/^[a-f0-9]{64}$/i.test(row?.sha256_hash||'')).map((row:any)=>{const value=String(row.sha256_hash).toLowerCase();return {type:'SHA256' as const,value,label:clean(row.signature,100),threatType:'malware_sample',confidence:null,tags:tagList(row.tags),reference:`https://bazaar.abuse.ch/sample/${value}/`,firstSeen:utc(row.first_seen),lastSeen:utc(row.last_seen),data:{fileType:clean(row.file_type,40)}}});
  }
 }catch(e:any){if(/query failed/.test(e?.message))throw e}
 return text.split(/\r?\n/).map(l=>l.trim().toLowerCase()).filter(l=>/^[a-f0-9]{64}$/.test(l)).map(value=>({type:'SHA256' as const,value,label:'',threatType:'malware_sample',confidence:null,tags:[],reference:`https://bazaar.abuse.ch/sample/${value}/`,firstSeen:null,lastSeen:null,data:{}}));
}

export function parseDFIRReportIndicators(text:string,referenceFallback=''):IntelCandidate[]{
 const lines=text.split(/\r?\n/),title=lines.find(line=>/^#\s+/.test(line))?.replace(/^#\s+/,'').trim()||'The DFIR Report';
 const articleLink=text.match(/\[here\]\((https:\/\/thedfirreport\.com\/[^)\s]+)\)/i)?.[1]||referenceFallback;
 const candidates:IntelCandidate[]=[];
 let section='',inCodeBlock=false,collect=false;
 for(const line of lines){
  const heading=line.match(/^#{2,6}\s+(.+?)\s*#*\s*$/);
  if(heading){section=heading[1].trim();collect=/(?:domain|url|ip(?:\s+address)?|hash|md5|sha-?1|sha-?256)/i.test(section);continue}
  if(/^```/.test(line)){inCodeBlock=!inCodeBlock;continue}
  if(!inCodeBlock||!collect)continue;
  const value=line.trim().replace(/^(?:[-*]\s+|\d+[.)]\s+)/,'').replace(/^`|`$/g,'').trim();
  if(!value||value.length>MAX_VALUE)continue;
  const type=detectType(value);
  if(!['IP','Domain','URL','MD5','SHA1','SHA256'].includes(type))continue;
  candidates.push({type,value,label:title,threatType:'reported_ioc',confidence:null,tags:['The DFIR Report',section].slice(0,12),reference:articleLink,data:{report:title,section},firstSeen:null,lastSeen:null});
 }
 return candidates;
}

const DFIR_REPORT_TREE_URL='https://api.github.com/repos/The-DFIR-Report/DFIR-Report-Indicators/git/trees/main?recursive=1';
const DFIR_REPORT_RAW_ROOT='https://raw.githubusercontent.com/The-DFIR-Report/DFIR-Report-Indicators/main/';
async function remoteText(url:string,transport:typeof fetch,maxBytes:number):Promise<string>{
 const response=await transport(url,{headers:{Accept:'application/vnd.github+json, text/markdown','User-Agent':'CSIRT-Investigate/1.0 threat-intel sync'},signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error(`The DFIR Report returned HTTP ${response.status}.`);
 const text=await response.text();
 if(text.length>maxBytes)throw new Error('The DFIR Report response is too large.');
 return text;
}
export async function loadDFIRReportIndicators(transport:typeof fetch=fetch):Promise<IntelCandidate[]>{
 const tree=JSON.parse(await remoteText(DFIR_REPORT_TREE_URL,transport,5*1024*1024));
 if(!Array.isArray(tree?.tree))throw new Error('Unexpected The DFIR Report repository tree format.');
 if(tree.truncated)throw new Error('The DFIR Report repository tree was truncated.');
 const paths:string[]=tree.tree
  .filter((entry:any)=>entry?.type==='blob'&&typeof entry.path==='string'&&/^\d{4}-\d{2}-\d{2}-[\w.-]+\.md$/i.test(entry.path))
  .map((entry:any):string=>entry.path)
  .sort()
  .slice(-100);
 const all:IntelCandidate[]=[];
 let totalBytes=0;
 for(let i=0;i<paths.length;i+=5){
  const batch=await Promise.all(paths.slice(i,i+5).map(async(path:string)=>{
   const text=await remoteText(DFIR_REPORT_RAW_ROOT+path,transport,2*1024*1024);
   totalBytes+=text.length;
   if(totalBytes>25*1024*1024)throw new Error('The DFIR Report indicator collection is too large.');
   return parseDFIRReportIndicators(text,`https://github.com/The-DFIR-Report/DFIR-Report-Indicators/blob/main/${path}`);
  }));
  all.push(...batch.flat());
 }
 return all;
}

const THREATFOX_API_URL='https://threatfox-api.abuse.ch/api/v1/';
const URLHAUS_EXPORT_URL='https://urlhaus-api.abuse.ch/v2/files/exports/';
const MALWAREBAZAAR_API_URL='https://mb-api.abuse.ch/api/v1/';

async function fetchAbuseChText(name:string,url:string,authKey:string|undefined,transport:typeof fetch,body?:Record<string,string|number>,json=false){
 const key=authKey?.trim();
 if(!key)throw new Error('Configure the server-side ABUSECH_AUTH_KEY to synchronize abuse.ch feeds.');
 const headers:Record<string,string>={Accept:'application/json, text/plain','User-Agent':'CSIRT-Investigate/1.0 threat-intel sync'};
 if(body){headers['Auth-Key']=key;headers['Content-Type']=json?'application/json':'application/x-www-form-urlencoded'}
 const response=await transport(url,{method:body?'POST':'GET',headers,body:body?(json?JSON.stringify(body):new URLSearchParams(body as Record<string,string>)):undefined,signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error(`${name} returned HTTP ${response.status}.`);
 const text=await response.text();
 if(text.length>60*1024*1024)throw new Error(`${name} response is too large.`);
 return text;
}

async function loadThreatFox(transport:typeof fetch=fetch,authKey?:string){
 return parseThreatFox(await fetchAbuseChText('ThreatFox',THREATFOX_API_URL,authKey,transport,{query:'get_iocs',days:7},true));
}
async function loadURLhaus(transport:typeof fetch=fetch,authKey?:string){
 const key=authKey?.trim();
 if(!key)throw new Error('Configure the server-side ABUSECH_AUTH_KEY to synchronize abuse.ch feeds.');
 return parseUrlhaus(await fetchAbuseChText('URLhaus',URLHAUS_EXPORT_URL+encodeURIComponent(key)+'/recent.csv',key,transport));
}
async function loadMalwareBazaar(transport:typeof fetch=fetch,authKey?:string){
 return parseBazaar(await fetchAbuseChText('MalwareBazaar',MALWAREBAZAAR_API_URL,authKey,transport,{query:'get_recent',selector:'100'}));
}

// Public feeds are fetched server-side only; no case data is ever sent.
export const intelFeeds:IntelFeed[]=[
 {id:'feodo',name:'Feodo Tracker — botnet C2',url:'https://feodotracker.abuse.ch/downloads/ipblocklist.json',site:'https://feodotracker.abuse.ch',description:'Command-and-control servers of banking trojans and loaders (Emotet, QakBot, Dridex…).',license:'CC0 (abuse.ch)',limit:2000,parse:parseFeodo},
 {id:'threatfox',name:'ThreatFox — recent IOCs',url:THREATFOX_API_URL,site:'https://threatfox.abuse.ch',description:'Community-shared IPs, domains, URLs and hashes tagged with the malware family.',license:'CC0 (abuse.ch)',limit:1500,parse:parseThreatFox,load:loadThreatFox},
 {id:'urlhaus',name:'URLhaus — malware URLs',url:URLHAUS_EXPORT_URL,site:'https://urlhaus.abuse.ch',description:'Recently reported URLs distributing malware.',license:'CC0 (abuse.ch)',limit:1000,parse:parseUrlhaus,load:loadURLhaus},
 {id:'bazaar',name:'MalwareBazaar — sample hashes',url:MALWAREBAZAAR_API_URL,site:'https://bazaar.abuse.ch',description:'SHA-256 hashes of recently submitted malware samples.',license:'CC0 (abuse.ch)',limit:1000,parse:parseBazaar,load:loadMalwareBazaar},
 {id:'dfir-report',name:'The DFIR Report — investigation IOCs',url:DFIR_REPORT_TREE_URL,site:'https://github.com/The-DFIR-Report/DFIR-Report-Indicators',description:'Domains, URLs, IPs and hashes published in The DFIR Report investigations. Historical leads; validate before treating as active.',license:'Source repository; see publisher terms',limit:20000,parse:parseDFIRReportIndicators,load:loadDFIRReportIndicators,pruneMissing:false}
];
export const feedById=(id:string)=>intelFeeds.find(f=>f.id===id);

export async function fetchFeedText(feed:IntelFeed,transport:typeof fetch=fetch){
 const response=await transport(feed.url,{headers:{Accept:'application/json, text/plain','User-Agent':'CSIRT-Investigate/1.0 threat-intel sync'},signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error(`${feed.name} returned HTTP ${response.status}.`);
 const text=await response.text();
 if(text.length>30*1024*1024)throw new Error(`${feed.name} response is too large.`);
 return text;
}

export type StaticActor={id:string;name:string;aliases:string[];country:string;motivation:string;description:string;techniques:string[];reference:string;source:string};
export type ActorMatch<A extends {name:string;aliases?:string[];techniques?:string[]}=StaticActor>={actor:A;overlap:string[];score:number};

// Techniques observed in a case point at candidate actors; a hint to verify, never an attribution.
export function rankActors<A extends {name:string;aliases?:string[];techniques?:string[]}>(actors:A[],caseTechniques:string[],limit=10):ActorMatch<A>[]{
 const set=new Set(caseTechniques.map(t=>t.toUpperCase()));if(set.size<2)return [];
 return actors.map(actor=>{const techniques=actor.techniques||[],overlap=techniques.filter(t=>set.has(t.toUpperCase()));return {actor,overlap,score:overlap.length*overlap.length/Math.max(8,techniques.length)}}).filter(m=>m.overlap.length>=2).sort((a,b)=>b.score-a.score||b.overlap.length-a.overlap.length).slice(0,limit);
}

const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Actor or alias names written in the case text (tags, summary, findings).
export function mentionedActors<A extends {name:string;aliases?:string[]}>(actors:A[],text:string):A[]{
 const haystack=text.toLowerCase();const found:A[]=[];
 for(const actor of actors){const names=[actor.name,...(actor.aliases||[])].filter(n=>n.length>=5);if(names.some(n=>new RegExp(`(?<![a-z0-9])${escape(n.toLowerCase())}(?![a-z0-9])`).test(haystack)))found.push(actor)}
 return found;
}
