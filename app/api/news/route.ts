import {guard,json,database} from '@/lib/server';
import {newsSources,fetchNews,type NewsSource,type NewsFeed} from '@/lib/news';

// Invalidate failures cached by the old, Worker-incompatible transport.
const CACHE_VERSION=2;
async function feed(source:NewsSource,force:boolean):Promise<NewsFeed>{
 const id='rss:'+source.id;
 let cache:NewsFeed|null=null,age=Infinity,cacheWarning:string|undefined;
 try{
  const row:any=await database().prepare('SELECT data,updated_at FROM external_cache WHERE id=?').bind(id).first();
  if(row){
   const parsed=JSON.parse(row.data);
   if(parsed.version===CACHE_VERSION&&parsed.url===source.url&&Array.isArray(parsed.articles)){
    cache=parsed;age=Date.now()-Date.parse(row.updated_at);
   }
  }
 }catch{cacheWarning='Feed cache is unavailable; displaying live results when possible.';console.warn('dfir_news_cache_read_failed',{source:source.id});}
 if(cache&&age>=0&&age<(force||cache.status!=='current'?60000:15*60000))return {...cache,cached:true};
 let value:NewsFeed;
 try{
  const articles=await fetchNews(source),at=new Date().toISOString();
  value={...source,status:'current',articles,checkedAt:at,lastSuccessAt:at,error:null};
 }catch(e:any){
  const error=e.name==='TimeoutError'?'The source timed out.':e.message==='Failed to fetch'?'The source could not be reached.':String(e.message||'The source could not be read.').slice(0,200);
  value={...source,status:cache?.articles.length?'stale':'unavailable',articles:cache?.articles||[],checkedAt:new Date().toISOString(),lastSuccessAt:cache?.lastSuccessAt||null,error};
  console.warn('dfir_news_source_failed',{source:source.id,error});
 }
 try{
  await database().prepare('INSERT INTO external_cache(id,data,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(id,JSON.stringify({...value,version:CACHE_VERSION}),value.checkedAt).run();
 }catch{cacheWarning='Feed cache is unavailable; these results may not be available offline.';console.warn('dfir_news_cache_write_failed',{source:source.id});}
 return {...value,...(cacheWarning?{cacheWarning}:{})};
}

export async function GET(req:Request){return guard(req,async()=>{
 const force=new URL(req.url).searchParams.get('refresh')==='1';
 const feeds=await Promise.all(newsSources.map(source=>feed(source,force)));
 const articles=feeds.flatMap(f=>f.articles).sort((a,b)=>(Date.parse(b.publishedAt||'')||0)-(Date.parse(a.publishedAt||'')||0)).filter((a,i,all)=>all.findIndex(b=>b.url===a.url)===i);
 return json({feeds:feeds.map(({articles,...f})=>({...f,count:articles.length})),articles,checkedAt:new Date().toISOString(),...(!articles.length?{error:'No news could be retrieved. Source errors are listed below. Retry with Refresh feeds.'}:{})},articles.length?200:502);
})}
