'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Radar,Search,RefreshCw,Plus,Trash2,ExternalLink,Rss,UserSearch,Database,AlertCircle,Target,BookOpen,ShieldAlert} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Badge} from '@/components/ui/badge';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {iocTypes,rankActors,type StaticActor} from '@/lib/intel';
import {dfirResources} from '@/lib/dfir-resources';

export type IntelRow={id:string;kind:string;source:string;type:string;value:string;label:string;threatType:string;confidence:number|null;tags:string[];reference:string;data:any;firstSeen:string|null;lastSeen:string|null;updatedAt:string;author:string;manual:boolean};
export async function intelApi(path:string,method='GET',data?:any):Promise<any>{const r=await fetch('/api/'+path,{method,headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const v:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(v.error||'Request failed.');return v}

// Static actor dataset (ATT&CK groups + MISP galaxy) merged with actors added by analysts.
export async function loadActors():Promise<StaticActor[]>{
 const [stat,manual]=await Promise.all([fetch('/intel/actors.json').then(r=>r.ok?r.json():{actors:[]}).catch(()=>({actors:[]})) as Promise<any>,intelApi('intel?kind=actor&source=manual&limit=200').catch(()=>({items:[]}))]);
 const mine:StaticActor[]=(manual.items as IntelRow[]).map(i=>({id:i.id,name:i.value,aliases:i.data.aliases||[],country:i.data.country||'',motivation:i.data.motivation||'',description:i.data.description||'',techniques:i.data.techniques||[],reference:i.reference,source:'manual'}));
 return [...mine,...(stat.actors||stat||[])];
}
const when=(v:string|null)=>v?new Date(v).toLocaleDateString('en-GB',{timeZone:'UTC'}):'—';

export default function ThreatIntel({onOpenCase}:{onOpenCase?:(caseId:string,tab:string)=>void}={}){
 const [tab,setTab]=useState('cases');
 return <section className="news-workspace">
  <div className="page-title"><div><div className="eyebrow">SHARED INTELLIGENCE</div><h1>Threat intel</h1><p>Free open-source indicator feeds, threat actor profiles and your own entries, matched against your open investigations.</p></div></div>
  <Tabs value={tab} onValueChange={setTab}>
   <TabsList><TabsTrigger value="cases"><Target size={15}/>Open cases</TabsTrigger><TabsTrigger value="indicators"><Radar size={15}/>Indicators</TabsTrigger><TabsTrigger value="actors"><UserSearch size={15}/>Threat actors</TabsTrigger><TabsTrigger value="feeds"><Rss size={15}/>Feeds</TabsTrigger><TabsTrigger value="sources"><BookOpen size={15}/>The DFIR Report</TabsTrigger></TabsList>
   <TabsContent value="cases"><CaseMatches onOpenCase={onOpenCase}/></TabsContent>
   <TabsContent value="indicators"><Indicators/></TabsContent>
   <TabsContent value="actors"><Actors/></TabsContent>
   <TabsContent value="feeds"><Feeds/></TabsContent>
   <TabsContent value="sources"><DFIRResources/></TabsContent>
  </Tabs>
 </section>;
}

function DFIRResources(){
 return <div className="panel">
  <div className="panel-head"><div><h3><BookOpen size={17}/>Publisher resources</h3><p className="meta">External references for all public repositories in The DFIR Report GitHub organization. Repository content is not copied into this catalogue.</p></div></div>
  <div className="feed-grid">{dfirResources.map(resource=><article key={resource.id}>
   <div><b>{resource.name}</b><Badge variant="outline">{resource.kind}</Badge></div>
   <p className="meta">{resource.description}</p>
   <p className="meta">Terms: {resource.license}</p>
   <p className="meta"><ShieldAlert size={14}/> {resource.handling}</p>
   <a href={resource.repository} target="_blank" rel="noreferrer">Open repository <ExternalLink size={13}/></a>
   {resource.relatedUrl&&<> {' · '}<a href={resource.relatedUrl} target="_blank" rel="noreferrer">{resource.relatedLabel} <ExternalLink size={13}/></a></>}
  </article>)}</div>
  <p className="meta">Use these rules and references as analyst leads, not proof of activity. Validate content, compatibility and licensing before operational use.</p>
 </div>;
}

// Cross-case matching: library hits and technique-overlap actor leads for every open investigation you can access.
function CaseMatches({onOpenCase}:{onOpenCase?:(caseId:string,tab:string)=>void}){
 const [data,setData]=useState<any>(null),[actors,setActors]=useState<StaticActor[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[open,setOpen]=useState<StaticActor|null>(null);
 const load=useCallback(()=>{setBusy(true);Promise.all([intelApi('intel/matches'),loadActors()]).then(([m,a])=>{setData(m);setActors(a);setError('')}).catch(e=>setError(e.message)).finally(()=>setBusy(false))},[]);
 useEffect(()=>{load()},[load]);
 const rows=useMemo(()=>(data?.cases||[]).map((c:any)=>({...c,leads:rankActors(actors,c.techniques,3)})),[data,actors]);
 const withHits=rows.filter((c:any)=>c.matches.length).length;
 return <div className="case-intel">
  {error&&<div className="error" role="alert">{error}</div>}
  <div className="panel"><div className="panel-head"><div><h3><Target size={17}/> Matches across open investigations</h3><p className="meta">{data?`${rows.length} open cases checked against ${data.libraryIndicators} library indicators and ${actors.length} actor profiles. ${withHits} with indicator hits.`:'Checking…'}</p></div><Button size="sm" variant="outline" onClick={load} disabled={busy}><RefreshCw size={14} className={busy?'spin':''}/>Re-check</Button></div>
   {data&&!data.libraryIndicators&&<p className="meta"><AlertCircle size={14}/> The indicator library is empty. Synchronise the feeds in the Feeds tab.</p>}
   {rows.map((c:any)=><div className="ioc-file" key={c.id}>
    <div><button className="link" onClick={()=>onOpenCase?.(c.id,'enrichment')}><b>{c.reference}</b> · {c.title}</button> <Badge variant="outline">{c.client}</Badge> <Badge variant={c.matches.length?'destructive':'secondary'}>{c.matches.length} indicator {c.matches.length===1?'hit':'hits'}</Badge> <span className="meta">{c.checked} IOCs · {c.techniques.length} techniques</span>
     {c.matches.slice(0,3).map((m:any)=><div key={m.recordId} className="meta"><code>{m.value}</code> → {m.hits.slice(0,2).map((h:any)=>`${h.source}${h.label?': '+h.label:''}`).join(' · ')}</div>)}
     {c.leads.length>0&&<div className="meta">Actor leads: {c.leads.map((l:any,i:number)=><span key={l.actor.id}>{i?', ':''}<button className="link" onClick={()=>setOpen(l.actor)}>{l.actor.name}</button> ({l.overlap.length}/{l.actor.techniques?.length||'?'} techniques)</span>)}</div>}
    </div></div>)}
   {data&&!rows.length&&<p className="meta">No open investigation with indicators or techniques yet.</p>}
   <p className="meta">Hits and leads are hypotheses to verify, not proof of compromise or attribution. Actor leads rank profiles by how much of their known technique set the case reproduces.</p>
  </div>
  {open&&<ActorDialog actor={open} onClose={()=>setOpen(null)}/>}
 </div>;
}

function Indicators(){
 const [q,setQ]=useState(''),[source,setSource]=useState('all'),[type,setType]=useState('all'),[page,setPage]=useState(0),[data,setData]=useState<{items:IntelRow[];total:number}|null>(null),[error,setError]=useState(''),[adding,setAdding]=useState(false),[feeds,setFeeds]=useState<any[]>([]);
 const size=50;
 const load=useCallback(()=>{const p=new URLSearchParams({kind:'indicator',limit:String(size),offset:String(page*size)});if(q)p.set('q',q);if(source!=='all')p.set('source',source);if(type!=='all')p.set('type',type);intelApi('intel?'+p).then(setData).catch(e=>setError(e.message))},[q,source,type,page]);
 useEffect(()=>{const t=setTimeout(load,250);return()=>clearTimeout(t)},[load]);
 useEffect(()=>{intelApi('intel/feeds').then(v=>setFeeds(v.feeds)).catch(()=>{})},[]);
 const remove=async(id:string)=>{try{await intelApi('intel/'+id,'DELETE');load()}catch(e:any){setError(e.message)}};
 return <>
  <div className="news-toolbar">
   <div className="search"><Search size={16}/><Input placeholder="Search value, label or tag…" aria-label="Search indicators" value={q} onChange={e=>{setQ(e.target.value);setPage(0)}}/></div>
   <Select value={source} onValueChange={v=>{setSource(v);setPage(0)}}><SelectTrigger aria-label="Source"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem><SelectItem value="manual">Manual</SelectItem>{feeds.map(f=><SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent></Select>
   <Select value={type} onValueChange={v=>{setType(v);setPage(0)}}><SelectTrigger aria-label="Type"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{iocTypes.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
   <Button onClick={()=>setAdding(true)}><Plus size={15}/>Add indicators</Button>
  </div>
  {error&&<div className="error" role="alert">{error}</div>}
  {data&&!data.total&&<div className="empty"><Database/><h2>No indicators yet</h2><p>Open the Feeds tab to synchronise public feeds, or add your own indicators.</p></div>}
  {data&&data.total>0&&<div className="panel table-panel"><table className="data-table"><thead><tr><th>Type</th><th>Value</th><th>Context</th><th>Source</th><th>Last seen</th><th></th></tr></thead><tbody>{data.items.map(i=><tr key={i.id}>
   <td><Badge variant="outline">{i.type}</Badge></td>
   <td style={{wordBreak:'break-all',maxWidth:380}}><code>{i.value}</code></td>
   <td>{i.label||i.threatType||'—'}{i.tags.length>0&&<span className="sub">{i.tags.slice(0,4).join(', ')}</span>}</td>
   <td>{i.manual?<Badge variant="outline" className="badge-manual">Manual</Badge>:<Badge variant="secondary">{i.source}</Badge>}{i.reference&&<a className="ml" href={i.reference} target="_blank" rel="noreferrer" aria-label="Reference"><ExternalLink size={13}/></a>}</td>
   <td>{when(i.lastSeen||i.updatedAt)}</td>
   <td>{i.manual&&<Button variant="ghost" size="icon" aria-label={'Delete '+i.value} onClick={()=>remove(i.id)}><Trash2 size={15}/></Button>}</td>
  </tr>)}</tbody></table></div>}
  {data&&data.total>size&&<div className="filters"><Button variant="outline" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</Button><span className="meta">{page*size+1}–{Math.min(data.total,(page+1)*size)} of {data.total}</span><Button variant="outline" disabled={(page+1)*size>=data.total} onClick={()=>setPage(p=>p+1)}>Next</Button></div>}
  <p className="meta">Feed indicators are community-reported and can be stale or wrong. Manual entries are analyst-provided and are not independently verified unless a reference is supplied. A match is a lead to verify, not proof of compromise.</p>
  {adding&&<AddIndicators onClose={()=>setAdding(false)} onSaved={()=>{setAdding(false);load()}}/>}
 </>;
}

function AddIndicators({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
 const [text,setText]=useState(''),[label,setLabel]=useState(''),[tags,setTags]=useState(''),[reference,setReference]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const values=text.split(/[\r\n,;]+/).map(v=>v.trim()).filter(Boolean);
 const save=async()=>{setBusy(true);setError('');try{await intelApi('intel','POST',{kind:'indicator',values,label,tags:tags.split(',').map(t=>t.trim()).filter(Boolean),reference});onSaved()}catch(e:any){setError(e.message);setBusy(false)}};
 return <Dialog open onOpenChange={v=>!v&&!busy&&onClose()}><DialogContent><DialogHeader><DialogTitle>Add indicators</DialogTitle><DialogDescription>One per line. Defanged values (hxxp, [.]) are accepted and the type is detected automatically.</DialogDescription></DialogHeader>
  <p className="meta">These indicators will be shared with analysts as manually entered leads. They are not verified by an external source.</p>
  <Textarea rows={6} aria-label="Indicators" placeholder={'198.51.100.7\nevil[.]example\nhxxps://bad[.]example/payload'} value={text} onChange={e=>setText(e.target.value)}/>
  <Input aria-label="Label" placeholder="Label, e.g. campaign or malware family" value={label} onChange={e=>setLabel(e.target.value)}/>
  <Input aria-label="Tags" placeholder="Tags, comma separated" value={tags} onChange={e=>setTags(e.target.value)}/>
  <Input aria-label="Reference" placeholder="Reference link (https://…)" value={reference} onChange={e=>setReference(e.target.value)}/>
  {error&&<div className="error" role="alert">{error}</div>}
  <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy||!values.length}>{busy?'Saving…':`Add ${values.length||''} indicator${values.length===1?'':'s'}`}</Button></DialogFooter>
 </DialogContent></Dialog>;
}

function Actors(){
 const [actors,setActors]=useState<StaticActor[]|null>(null),[q,setQ]=useState(''),[open,setOpen]=useState<StaticActor|null>(null),[adding,setAdding]=useState(false);
 const load=useCallback(()=>{loadActors().then(setActors)},[]);
 useEffect(load,[load]);
 const rows=useMemo(()=>{const s=q.trim().toLowerCase();return (actors||[]).filter(a=>!s||[a.name,...a.aliases,a.country,a.motivation].join(' ').toLowerCase().includes(s))},[actors,q]);
 return <>
  <div className="news-toolbar"><div className="search"><Search size={16}/><Input placeholder="Search name, alias, country…" aria-label="Search actors" value={q} onChange={e=>setQ(e.target.value)}/></div><span className="meta">{rows.length} profiles</span><Button onClick={()=>setAdding(true)}><Plus size={15}/>Add actor</Button></div>
  {!actors?<div className="loading">Loading profiles…</div>:<div className="panel table-panel"><table className="data-table"><thead><tr><th>Actor</th><th>Aliases</th><th>Origin</th><th>Techniques</th><th>Source</th></tr></thead><tbody>{rows.slice(0,200).map(a=><tr key={a.source+a.id} onClick={()=>setOpen(a)} style={{cursor:'pointer'}}>
   <td><b>{a.name}</b></td><td>{a.aliases.slice(0,3).join(', ')||'—'}</td><td>{a.country||'—'}</td><td>{a.techniques.length||'—'}</td><td><Badge variant={a.source==='manual'?'outline':'secondary'} className={a.source==='manual'?'badge-manual':''}>{a.source}</Badge></td></tr>)}</tbody></table></div>}
  {rows.length>200&&<p className="meta">Showing the first 200. Refine the search to see more.</p>}
  <p className="meta">Public profiles come from MITRE ATT&CK and the MISP galaxy (CC0); manual profiles are analyst-provided and not independently verified. Group naming differs between vendors; overlap of techniques is circumstantial and never proves attribution.</p>
  {open&&<ActorDialog actor={open} onClose={()=>setOpen(null)}/>}
  {adding&&<AddActor onClose={()=>setAdding(false)} onSaved={()=>{setAdding(false);load()}}/>}
 </>;
}

export function ActorDialog({actor:a,onClose}:{actor:StaticActor;onClose:()=>void}){
 return <Dialog open onOpenChange={v=>!v&&onClose()}><DialogContent><DialogHeader><DialogTitle>{a.name}</DialogTitle><DialogDescription>{a.source==='manual'?'Analyst-provided profile; not independently verified.':([a.country,a.motivation].filter(Boolean).join(' · ')||'No origin recorded')}</DialogDescription></DialogHeader>
  {a.aliases.length>0&&<p><b>Aliases:</b> {a.aliases.join(', ')}</p>}
  {a.description&&<p style={{maxHeight:200,overflow:'auto'}}>{a.description}</p>}
  {a.techniques.length>0&&<p><b>Techniques ({a.techniques.length}):</b> {a.techniques.join(', ')}</p>}
  {a.reference&&<a href={a.reference} target="_blank" rel="noreferrer">Reference <ExternalLink size={13}/></a>}
 </DialogContent></Dialog>;
}

function AddActor({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
 const [f,setF]=useState({name:'',aliases:'',country:'',motivation:'',description:'',techniques:'',reference:''}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const set=(k:string)=>(e:any)=>setF({...f,[k]:e.target.value});
 const list=(s:string)=>s.split(/[,\s]+/).map(x=>x.trim()).filter(Boolean);
 const save=async()=>{setBusy(true);setError('');try{await intelApi('intel','POST',{kind:'actor',name:f.name,aliases:f.aliases.split(',').map(x=>x.trim()).filter(Boolean),country:f.country,motivation:f.motivation,description:f.description,techniques:list(f.techniques).map(t=>t.toUpperCase()),reference:f.reference});onSaved()}catch(e:any){setError(e.message);setBusy(false)}};
 return <Dialog open onOpenChange={v=>!v&&!busy&&onClose()}><DialogContent><DialogHeader><DialogTitle>Add a threat actor</DialogTitle><DialogDescription>Your own analyst-provided profile, shared with every analyst and not independently verified. Techniques use ATT&CK or ATLAS ids (T1059.001, AML.T0051).</DialogDescription></DialogHeader>
  <Input aria-label="Name" placeholder="Name" value={f.name} onChange={set('name')}/>
  <Input aria-label="Aliases" placeholder="Aliases, comma separated" value={f.aliases} onChange={set('aliases')}/>
  <Input aria-label="Country" placeholder="Origin / country" value={f.country} onChange={set('country')}/>
  <Input aria-label="Motivation" placeholder="Motivation (e.g. financial)" value={f.motivation} onChange={set('motivation')}/>
  <Textarea aria-label="Description" rows={4} placeholder="Description" value={f.description} onChange={set('description')}/>
  <Input aria-label="Techniques" placeholder="Technique ids, e.g. T1486 T1490" value={f.techniques} onChange={set('techniques')}/>
  <Input aria-label="Reference" placeholder="Reference link (https://…)" value={f.reference} onChange={set('reference')}/>
  {error&&<div className="error" role="alert">{error}</div>}
  <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy||f.name.trim().length<2}>{busy?'Saving…':'Add actor'}</Button></DialogFooter>
 </DialogContent></Dialog>;
}

function Feeds(){
 const [feeds,setFeeds]=useState<any[]>([]),[manual,setManual]=useState<any[]>([]),[running,setRunning]=useState(''),[error,setError]=useState('');
 const load=useCallback(()=>intelApi('intel/feeds').then(v=>{setFeeds(v.feeds);setManual(v.manual)}).catch(e=>setError(e.message)),[]);
 useEffect(()=>{load()},[load]);
 const sync=async(ids:string[],force:boolean)=>{setError('');for(const id of ids){setRunning(id);try{await intelApi('intel/feeds','POST',{feed:id,force})}catch(e:any){setError(id+': '+e.message)}await load()}setRunning('')};
 return <>
  <div className="notice"><Radar size={18}/><p><b>Shared feed library:</b> syncing ThreatFox, URLhaus or MalwareBazaar stores indicators for matching against cases. It does not add them to case records. Open a case → <b>Enrichment</b> to see matches, or use the SOCradar import there to add selected feed indicators directly to that case.</p></div>
  <div className="news-toolbar"><span className="meta">Feeds are fetched by the server only; no case data is ever sent out. ThreatFox, URLhaus and MalwareBazaar require a free <a href="https://auth.abuse.ch/" target="_blank" rel="noreferrer">abuse.ch Auth-Key</a> configured by your administrator.</span><Button style={{marginLeft:'auto'}} disabled={!!running} onClick={()=>sync(feeds.map(f=>f.id),true)}><RefreshCw size={15} className={running?'spin':''}/>Sync all</Button></div>
  {error&&<div className="error" role="alert">{error}</div>}
  <div className="feed-grid">{feeds.map(f=><article key={f.id}>
   <div><b>{f.name}</b><Badge variant={f.status.error?'outline':'secondary'}>{f.status.error?'Error':f.status.lastSuccessAt?'Synced':'Never synced'}</Badge></div>
   <p className="meta">{f.description}</p>
   <p className="meta">{f.status.count} indicators{f.status.lastSuccessAt?' · last success '+new Date(f.status.lastSuccessAt).toLocaleString('en-GB'):''} · {f.license}</p>
   {f.status.error&&<p className="feed-error"><AlertCircle size={13}/> {f.status.error}</p>}
   <Button variant="outline" size="sm" disabled={!!running} onClick={()=>sync([f.id],true)}><RefreshCw size={13} className={running===f.id?'spin':''}/>Sync</Button>{' '}<a href={f.site} target="_blank" rel="noreferrer">Publisher <ExternalLink size={13}/></a>
  </article>)}
  <article><div><b>Manual entries</b><Badge variant="outline" className="badge-manual">Analysts</Badge></div><p className="meta">{manual.map(m=>m.n+' '+m.kind+(m.n===1?'':'s')).join(' · ')||'None yet'}</p></article></div>
 </>;
}
