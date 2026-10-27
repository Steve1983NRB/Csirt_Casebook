import {DOMParser} from '@xmldom/xmldom';
export const newsSources=[
 {id:'cisa',name:'CISA Advisories',url:'https://www.cisa.gov/cybersecurity-advisories/all.xml',site:'https://www.cisa.gov',category:'Vulnerability advisories'},
 {id:'cert-fr',name:'CERT-FR',url:'https://www.cert.ssi.gouv.fr/feed/',site:'https://www.cert.ssi.gouv.fr',category:'National CERT advisories'},
 {id:'cert-eu',name:'CERT-EU',url:'https://cert.europa.eu/publications/security-advisories-rss',site:'https://cert.europa.eu',category:'EU CERT advisories'},
 {id:'ncsc-uk',name:'NCSC UK',url:'https://www.ncsc.gov.uk/api/1/services/v1/report-rss-feed.xml',site:'https://www.ncsc.gov.uk',category:'National CERT reports'},
 {id:'hackernews',name:'The Hacker News',url:'https://feeds.feedburner.com/TheHackersNews',site:'https://thehackernews.com',category:'Threat intelligence'},
 {id:'krebs',name:'Krebs on Security',url:'https://krebsonsecurity.com/feed/',site:'https://krebsonsecurity.com',category:'Investigative journalism'},
 {id:'ms-security',name:'Microsoft Security Blog',url:'https://www.microsoft.com/en-us/security/blog/feed/',site:'https://www.microsoft.com',category:'Vendor research'},
 {id:'schneier',name:'Schneier on Security',url:'https://www.schneier.com/feed/atom/',site:'https://www.schneier.com',category:'Security commentary'},
 {id:'dfir-report',name:'The DFIR Report',url:'https://thedfirreport.com/feed/',site:'https://thedfirreport.com',category:'Incident investigations'}
] as const;
export type NewsSource=typeof newsSources[number];
export type NewsArticle={id:string;sourceId:string;source:string;category:string;title:string;url:string;publishedAt:string|null;excerpt:string;image:string|null};
export type NewsFeed=NewsSource & {status:'current'|'stale'|'unavailable';articles:NewsArticle[];checkedAt:string;lastSuccessAt:string|null;error:string|null;cacheWarning?:string;cached?:boolean};
export type NewsResponse={articles:NewsArticle[];feeds:(Omit<NewsFeed,'articles'> & {count:number})[];checkedAt:string;error?:string};

// Workers supports manual redirects. Validate each public publisher redirect;
// never forward incoming request headers, credentials or case information.
export async function fetchNews(source:NewsSource,transport:typeof fetch=fetch){
 try{return await fetchNewsOnce(source,transport)}
 catch(e:any){
  if(e?.name!=='TimeoutError'&&e?.name!=='AbortError'&&e?.message!=='Failed to fetch')throw e;
  return fetchNewsOnce(source,transport);
 }
}
// Large feeds (e.g. CISA) are cut after the last complete entry instead of being rejected.
function closeTruncatedFeed(xml:string){
 const end=Math.max(xml.lastIndexOf('</item>'),xml.lastIndexOf('</entry>'));
 if(end<0)return xml;
 const isEntry=xml.lastIndexOf('</entry>')>xml.lastIndexOf('</item>');
 const cut=xml.slice(0,end+(isEntry?8:7));
 return cut+(isEntry?'</feed>':/<rdf:RDF/i.test(cut)?'</rdf:RDF>':'</channel></rss>');
}
async function readFeed(response:Response,limit:number){
 if(!response.body)throw new Error('The source returned an empty response.');
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let n=0,truncated=false;
 for(;;){const r=await reader.read();if(r.done)break;parts.push(r.value);n+=r.value.length;if(n>=limit){truncated=true;await reader.cancel();break}}
 const out=new Uint8Array(n);let pos=0;for(const p of parts){out.set(p,pos);pos+=p.length}
 const text=new TextDecoder().decode(out);
 return truncated?closeTruncatedFeed(text):text;
}
async function fetchNewsOnce(source:NewsSource,transport:typeof fetch){
 const signal=AbortSignal.timeout(25000);
 const publisherHost=new URL(source.url).hostname.replace(/^www\./,'');
 let url:string=source.url;
 for(let hop=0;hop<=3;hop++){
    const response=await transport(url,{headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml','User-Agent':'CSIRT-Investigate/1.0 RSS reader'},redirect:'manual',signal});
  if(response.status>=300&&response.status<400){
   const location=response.headers.get('location');
   await response.body?.cancel();
   const next=location?publicHttps(location,url):null;
   if(!next||new URL(next).hostname.replace(/^www\./,'')!==publisherHost)throw new Error('The feed redirected outside its approved publisher.');
   if(hop===3)throw new Error('The feed returned too many redirects.');
   url=next;continue;
  }
  if(!response.ok){await response.body?.cancel();throw new Error('Feed returned HTTP '+response.status+'.');}
  const articles=parseNews(await readFeed(response,1536*1024),source);
  if(!articles.length)throw new Error('The feed returned no usable articles.');
  return articles;
 }
 throw new Error('The feed returned too many redirects.');
}
export function publicHttps(raw:string,base?:string){try{const u=new URL(raw,base);const h=u.hostname.toLowerCase();if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!h.includes('.')||h.startsWith('[')||/^\d+(\.\d+){3}$/.test(h)||/(^|\.)(localhost|local|internal|test|invalid)$/.test(h))return null;return u.href}catch{return null}}
function clean(raw:string){return raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,s)=>{const n=parseInt(s.startsWith('x')?s.slice(1):s,s.startsWith('x')?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''}).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,s)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[s as string]||'')).replace(/\s+/g,' ').trim()}
export function parseNews(xml:string,source:NewsSource):NewsArticle[]{if(xml.length>2*1024*1024)throw new Error('The feed exceeds 2 MB.');if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('DTD declarations are not accepted.');const doc=new DOMParser({onError:()=>{}}).parseFromString(xml,'text/xml');if(!doc?.documentElement||!['rss','feed','RDF'].includes(doc.documentElement.localName||''))throw new Error('The source did not return an RSS or Atom feed.');const elements=Array.from(doc.getElementsByTagName('*')),items=elements.filter(e=>e.localName==='item'||e.localName==='entry');const result:NewsArticle[]=[];
 for(const item of items.slice(0,30)){const children=Array.from(item.childNodes).filter(n=>n.nodeType===1) as any[];const get=(...names:string[])=>names.map(name=>children.find(e=>e.localName===name)?.textContent).find(Boolean)||'';const link=children.find(e=>e.localName==='link'&&(!e.getAttribute('rel')||e.getAttribute('rel')==='alternate'));const url=publicHttps(link?.getAttribute('href')||link?.textContent||get('guid'),source.site);if(!url)continue;const title=clean(get('title')).slice(0,300);if(!title)continue;const description=get('encoded','content','description','summary');const media=Array.from(item.getElementsByTagName('*')).find(e=>(['thumbnail','content'].includes(e.localName||'')&&e.getAttribute('url')&&(e.namespaceURI?.includes('search.yahoo.com/mrss')||e.getAttribute('medium')==='image'))||(e.localName==='enclosure'&&e.getAttribute('type')?.startsWith('image/')));const imageRaw=media?.getAttribute('url')||description.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]||'';const image=imageRaw?publicHttps(imageRaw.replaceAll('&amp;','&'),source.site):null;const at=Date.parse(get('pubDate','published','updated','date'));result.push({id:source.id+':'+url,sourceId:source.id,source:source.name,category:source.category,title,url,publishedAt:Number.isFinite(at)?new Date(at).toISOString():null,excerpt:clean(description).split(' ').slice(0,40).join(' ').slice(0,260),image})}
 return result.filter((a,i,list)=>list.findIndex(b=>b.url===a.url)===i)
}
export async function readBounded(response:Response,limit:number){if(Number(response.headers.get('content-length')||0)>limit)throw new Error('The response is too large.');if(!response.body)throw new Error('The source returned an empty response.');const reader=response.body.getReader(),parts:Uint8Array[]=[];let n=0;for(;;){const r=await reader.read();if(r.done)break;n+=r.value.length;if(n>limit){await reader.cancel();throw new Error('The response is too large.')}parts.push(r.value)}const out=new Uint8Array(n);let pos=0;for(const p of parts){out.set(p,pos);pos+=p.length}return new TextDecoder().decode(out)}
