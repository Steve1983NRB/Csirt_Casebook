'use client';
import {useEffect,useState} from 'react';
import {Rss,RefreshCw,ExternalLink,Search,Newspaper,AlertCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import type {NewsArticle,NewsResponse} from '@/lib/news';

const REFRESH_INTERVAL_MS=15*60000;
function timeAgo(ms:number){const s=Math.max(0,Math.round(ms/1000));if(s<60)return s+'s ago';const m=Math.round(s/60);if(m<60)return m+'m ago';return Math.round(m/60)+'h ago'}
function countdown(ms:number){const s=Math.max(0,Math.round(ms/1000)),m=Math.floor(s/60);return m+'m '+(s-m*60)+'s'}

export default function DfirNews(){
 const [data,setData]=useState<NewsResponse|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[source,setSource]=useState('all'),[query,setQuery]=useState('');
 const [now,setNow]=useState(()=>Date.now());
 async function load(refresh=false){
  setLoading(true);
  try{
   const response=await fetch('/api/news'+(refresh?'?refresh=1':''));
   const body:any=await response.json();
   // A failed aggregate still contains each source's useful error details.
   if(Array.isArray(body.articles)&&Array.isArray(body.feeds)){
    setData(body);setError(response.ok?'':body.error||'The news sources could not be read.');
   }else throw new Error(body.error||'The news sources could not be read.');
  }catch(e:any){setError(e.message||'News could not be loaded. Please retry.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{load();const timer=setInterval(()=>{if(document.visibilityState==='visible')load();},REFRESH_INTERVAL_MS);return()=>clearInterval(timer);},[]);
 useEffect(()=>{const tick=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(tick);},[]);
 const articles=(data?.articles||[]).filter(a=>(source==='all'||a.sourceId===source)&&(!query||[a.title,a.excerpt,a.category].join(' ').toLowerCase().includes(query.toLowerCase())));
 const sourceIssues=data?.feeds.filter(f=>f.status!=='current'||f.cacheWarning)||[];
 const noNews=!!data&&!data.articles.length;
 const checkedAt=data?.checkedAt?Date.parse(data.checkedAt):null;
 return <section className="news-workspace">
  <div className="page-title"><div><div className="eyebrow">RESEARCH & FIELD INTELLIGENCE</div><h1>DFIR News</h1><p>Incident analysis, forensic research and community updates.</p></div><Button variant="outline" onClick={()=>load(true)} disabled={loading}><RefreshCw className={loading?'spin':''}/>{loading?'Refreshing…':'Refresh feeds'}</Button></div>
  {data&&<div className="metrics"><div className="metric"><Newspaper size={19}/><strong>{data.articles.length}</strong><span>Total articles</span></div>{data.feeds.map(f=><div className="metric" key={f.id}><Rss size={19}/><strong>{f.count}</strong><span>{f.name}</span></div>)}</div>}
  <div className="news-toolbar">
   <div className="search"><Search size={16}/><Input placeholder="Search DFIR news…" aria-label="Search DFIR news" value={query} onChange={e=>setQuery(e.target.value)}/></div>
   <Select value={source} onValueChange={setSource}><SelectTrigger aria-label="News source"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem>{data?.feeds.map(f=><SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent></Select>
   <span className="meta" aria-live="polite">{articles.length} articles{checkedAt?' · Last fetch '+timeAgo(now-checkedAt)+' · Next in '+countdown(checkedAt+REFRESH_INTERVAL_MS-now):''}</span>
  </div>
  {error&&<div className="error" role="alert">{error}</div>}
  {!error&&sourceIssues.length>0&&<div className="news-warning" role="status"><AlertCircle size={18}/><span>{sourceIssues.length} {sourceIssues.length===1?'source needs':'sources need'} attention. Available articles remain visible; details are shown below.</span></div>}
  {!data&&loading?<div className="loading">Reading the DFIR feeds…</div>:data&&<>
   <div className="news-grid">{articles.map(a=><NewsCard key={a.id} article={a} stale={data.feeds.find(f=>f.id===a.sourceId)?.status==='stale'}/>)}</div>
   {!articles.length&&<div className="empty"><Newspaper/><h2>{noNews?'News sources are unavailable':'No articles match'}</h2><p>{noNews?'See the source errors below. Use Refresh feeds to retry; failed sources are retried after one minute.':'Try a different source or search term.'}</p>{!noNews&&<Button variant="outline" onClick={()=>{setSource('all');setQuery('');}}>Clear filters</Button>}</div>}
   <details className="panel feed-status" open={sourceIssues.length>0||undefined}>
    <summary><Rss size={18}/>Feed sources and health<span>{data.feeds.filter(f=>f.status==='current').length} / {data.feeds.length} current</span></summary>
    <div className="feed-grid">{data.feeds.map(f=><article key={f.id}>
     <div><b>{f.name}</b><Badge variant={f.status==='current'?'secondary':'outline'}>{f.status==='current'?'Current':f.status==='stale'?'Cached · source unavailable':'Unavailable'}</Badge></div>
     <p className="meta">{f.count} articles{f.lastSuccessAt?' · Last success '+new Date(f.lastSuccessAt).toLocaleString('en-GB'):''}</p>
     {f.error&&<p className="feed-error">{f.error}</p>}{f.cacheWarning&&<p className="feed-error">{f.cacheWarning}</p>}
     <a href={f.site} target="_blank" rel="noreferrer">Visit publisher <ExternalLink size={13}/></a>{' · '}<a href={f.url} target="_blank" rel="noreferrer">RSS feed <ExternalLink size={13}/></a>
    </article>)}</div>
   </details>
   <p className="meta">Article images and excerpts come from the publishers. Open the source for the full report. News items are external research and do not validate case findings.</p>
  </>}
 </section>;
}
function NewsCard({article:a,stale}:{article:NewsArticle;stale:boolean}){
 const [failed,setFailed]=useState(false);
 return <article className="news-card"><a href={a.url} target="_blank" rel="noreferrer" className="news-image" aria-label={'Read '+a.title}>{a.image&&!failed?<img src={a.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<div className="news-source-cover"><Rss size={32}/><span>{a.source}</span><small>{a.category}</small></div>}</a><div className="news-copy"><div className="news-meta"><b>{a.source}</b><time>{a.publishedAt?new Date(a.publishedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Date not provided'}</time></div>{stale&&<Badge variant="outline">Cached · source unavailable</Badge>}<h2><a href={a.url} target="_blank" rel="noreferrer">{a.title}</a></h2><p>{a.excerpt}</p><a className="news-read" href={a.url} target="_blank" rel="noreferrer">Read source <ExternalLink size={14}/></a></div></article>;
}
