'use client';
import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,CalendarClock,Download,FolderOpen,ListChecks,Monitor,Search,ShieldAlert,Target,Repeat2,Activity as ActivityIcon} from 'lucide-react';
import {toast} from 'sonner';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import type {Case,Entry} from '@/lib/model';

export type WorkspaceViewId='dashboard'|'operations';
export type OperationViewId='tasks'|'indicators'|'assets';
type Overview={cases:(Case&{role?:string})[];entries:Entry[];activity:{id:string;caseId:string;action:string;actor:string;at:string}[]};
type Open=(caseId:string,tab:string)=>void;
const today=()=>new Date().toISOString().slice(0,10);
const plusDays=(n:number)=>new Date(Date.now()+n*864e5).toISOString().slice(0,10);
const priorityRank:Record<string,number>={High:0,Medium:1,Low:2};
const casePriorities=['P1','P2','P3','P4','Unassessed'];
const when=(s:string)=>new Date(s).toLocaleString('en-GB',{timeZone:'UTC',hour12:false,dateStyle:'medium',timeStyle:'short'})+' UTC';
const verb=(a:string)=>a.replace(/\./g,' ').replace(/^./,c=>c.toUpperCase());
function csv(rows:string[][]){return rows.map(r=>r.map(v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}).join(',')).join('\r\n')}
function saveCsv(name:string,rows:string[][]){const url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}

function Kpi({label,value,icon:Icon,tone,onClick}:{label:string;value:number|string;icon:any;tone?:'danger'|'warn'|'ok';onClick?:()=>void}){return <button type="button" className={'kpi '+(tone||'')} onClick={onClick} disabled={!onClick}><Icon size={18}/><strong>{value}</strong><span>{label}</span></button>}
function Bars({items}:{items:{label:string;value:number;className?:string}[]}){const max=Math.max(1,...items.map(i=>i.value));return <div className="bars">{items.map(i=><div className="bar-row" key={i.label}><span>{i.label}</span><div className="bar-track"><div className={'bar-fill '+(i.className||'')} style={{width:(i.value/max*100)+'%'}}/></div><b>{i.value}</b></div>)}</div>}
function Head({eyebrow,title,description,children}:{eyebrow:string;title:string;description:string;children?:React.ReactNode}){return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{children}</div>}

export default function WorkspaceViews({view,operationView,onOperationViewChange,onOpen,currentUser}:{view:WorkspaceViewId;operationView:OperationViewId;onOperationViewChange:(view:OperationViewId)=>void;onOpen:Open;currentUser:{email?:string;displayName?:string}|null}){
 const [data,setData]=useState<Overview|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{const c=new AbortController();setError('');fetch('/api/overview',{signal:c.signal}).then(async r=>{const v:any=await r.json();if(!r.ok)throw new Error(v.error||'Could not load the workspace overview.');setData(v)}).catch(e=>{if(e.name!=='AbortError')setError(e.message)});return()=>c.abort()},[reload,view]);
 if(error)return <div className="error" role="alert">{error} <Button variant="outline" onClick={()=>setReload(n=>n+1)}>Retry</Button></div>;
 if(!data)return <div className="loading">Loading workspace…</div>;
 const props={data,onOpen,currentUser,refresh:()=>setReload(n=>n+1)};
 if(view==='dashboard')return <Dashboard {...props}/>;
 return <><Tabs value={operationView} onValueChange={value=>onOperationViewChange(value as OperationViewId)}><TabsList aria-label="Cross-investigation operations"><TabsTrigger value="tasks">Action queue</TabsTrigger><TabsTrigger value="indicators">IOC register</TabsTrigger><TabsTrigger value="assets">Asset inventory</TabsTrigger></TabsList></Tabs>{operationView==='tasks'?<Tasks {...props}/>:operationView==='indicators'?<Indicators {...props}/>:<Assets {...props}/>}</>;
}
type P={data:Overview;onOpen:Open;currentUser:{email?:string;displayName?:string}|null;refresh:()=>void};
const caseMap=(d:Overview)=>new Map(d.cases.map(c=>[c.id,c]));

function Dashboard({data,onOpen,currentUser}:P){
 const cm=caseMap(data),now=today(),soon=plusDays(7);
 const open=data.cases.filter(c=>c.status!=='Closed');
 const tasks=data.entries.filter(e=>e.kind==='action'&&e.data.status!=='Done'&&cm.get(e.caseId)?.status!=='Closed');
 const overdue=tasks.filter(t=>t.data.dueDate&&t.data.dueDate<now),dueSoon=tasks.filter(t=>t.data.dueDate&&t.data.dueDate>=now&&t.data.dueDate<=soon);
 const mine=tasks.filter(t=>t.data.owner&&currentUser&&[currentUser.email,currentUser.displayName].some(v=>v&&t.data.owner.toLowerCase()===v.toLowerCase()));
 const compromised=data.entries.filter(e=>e.kind==='asset'&&e.data.compromised&&cm.get(e.caseId)?.status!=='Closed');
 const iocByValue=new Map<string,Set<string>>();for(const e of data.entries)if(e.kind==='ioc'){const k=e.data.type+'|'+String(e.data.value).toLowerCase();(iocByValue.get(k)||iocByValue.set(k,new Set()).get(k)!).add(e.caseId)}
 const shared=[...iocByValue.entries()].filter(([,s])=>s.size>1).sort((a,b)=>b[1].size-a[1].size);
 const attention=[...overdue,...dueSoon,...mine.filter(t=>!t.data.dueDate)].filter((t,i,a)=>a.indexOf(t)===i).slice(0,8);
 const urgent=open.filter(c=>c.priority==='P1'||c.priority==='P2').length;
 return <>
  <Head eyebrow="SOC OVERVIEW" title="Dashboard" description="Live situation across every investigation you can access."/>
  <div className="kpis">
   <Kpi label="Open investigations" value={open.length} icon={FolderOpen}/>
   <Kpi label="P1 / P2 in progress" value={urgent} icon={ShieldAlert} tone={urgent?'danger':undefined}/>
   <Kpi label="Overdue actions" value={overdue.length} icon={AlertTriangle} tone={overdue.length?'danger':'ok'}/>
   <Kpi label="Due within 7 days" value={dueSoon.length} icon={CalendarClock} tone={dueSoon.length?'warn':undefined}/>
   <Kpi label="Assigned to me" value={mine.length} icon={ListChecks}/>
   <Kpi label="Assets flagged compromised" value={compromised.length} icon={Monitor} tone={compromised.length?'warn':undefined}/>
  </div>
  <div className="dash-grid">
   <section className="panel"><div className="panel-head"><h2>Needs attention</h2><Badge variant="outline">{attention.length}</Badge></div>
    {attention.length?<ul className="dash-list">{attention.map(t=>{const c=cm.get(t.caseId);const late=t.data.dueDate&&t.data.dueDate<now;return <li key={t.id}><button type="button" onClick={()=>onOpen(t.caseId,'actions')}><b>{t.data.title}</b><span>{c?.reference} · {c?.client}</span></button><Badge variant={late?'destructive':'outline'}>{t.data.dueDate?(late?'Overdue ':'Due ')+t.data.dueDate:'Assigned to me'}</Badge></li>})}</ul>:<p className="muted">Nothing is overdue or due this week.</p>}
   </section>
   <section className="panel"><div className="panel-head"><h2>Open cases by priority</h2></div>
    <Bars items={casePriorities.map(p=>({label:p,value:open.filter(c=>c.priority===p).length,className:p==='P1'?'p1':p==='P2'?'p2':''}))}/>
    <div className="panel-head spaced"><h2>Open cases by status</h2></div>
    <Bars items={['Open','In review'].map(s=>({label:s,value:data.cases.filter(c=>c.status===s).length}))}/>
   </section>
   <section className="panel"><div className="panel-head"><h2><Repeat2 size={17}/> Indicators seen in several cases</h2><Badge variant="outline">{shared.length}</Badge></div>
    {shared.length?<ul className="dash-list">{shared.slice(0,8).map(([k,s])=>{const [type,...v]=k.split('|');return <li key={k}><span className="mono">{v.join('|')}</span><Badge variant="secondary">{type} · {s.size} cases</Badge></li>})}</ul>:<p className="muted">No indicator is shared between investigations. This is a correlation signal only, never proof of a common actor.</p>}
   </section>
   <section className="panel"><div className="panel-head"><h2><ActivityIcon size={17}/> Recent activity</h2></div>
    {data.activity.length?<ul className="dash-list activity">{data.activity.slice(0,10).map(a=>{const c=cm.get(a.caseId);return <li key={a.id}><button type="button" onClick={()=>onOpen(a.caseId,'activity')}><b>{verb(a.action)}</b><span>{c?.reference} · {a.actor} · {when(a.at)}</span></button></li>})}</ul>:<p className="muted">No activity yet.</p>}
   </section>
  </div>
 </>;
}

function Tasks({data,onOpen,refresh,currentUser}:P){
 const cm=caseMap(data),now=today();
 const [q,setQ]=useState(''),[status,setStatus]=useState('active'),[prio,setPrio]=useState('all'),[mineOnly,setMine]=useState(false),[busy,setBusy]=useState('');
 const all=data.entries.filter(e=>e.kind==='action');
 const isMine=(e:Entry)=>!!e.data.owner&&!!currentUser&&[currentUser.email,currentUser.displayName].some(v=>v&&e.data.owner.toLowerCase()===v.toLowerCase());
 const rows=useMemo(()=>all.filter(t=>{const c=cm.get(t.caseId);return (status==='active'?t.data.status!=='Done':status==='all'||t.data.status===status)&&(prio==='all'||t.data.priority===prio)&&(!mineOnly||isMine(t))&&(`${t.data.title} ${t.data.owner} ${c?.reference} ${c?.client}`).toLowerCase().includes(q.toLowerCase())}).sort((a,b)=>(a.data.status==='Done'?1:0)-(b.data.status==='Done'?1:0)||(a.data.dueDate||'9999').localeCompare(b.data.dueDate||'9999')||priorityRank[a.data.priority]-priorityRank[b.data.priority]),[all,status,prio,mineOnly,q]);// eslint-disable-line react-hooks/exhaustive-deps
 async function setState(t:Entry,next:string){setBusy(t.id);try{const r=await fetch('/api/records/'+t.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:t.version,data:{...t.data,status:next}})}),v:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(v.error||'Update failed.');toast.success('Action updated');refresh()}catch(e:any){toast.error(e.message)}finally{setBusy('')}}
 return <>
  <Head eyebrow="CROSS-INVESTIGATION OPERATIONS" title="Action queue" description="Track actions and deadlines across every investigation you can access.">
   <Button variant="outline" onClick={()=>saveCsv('actions.csv',[['Case','Client','Action','Owner','Due','Status','Priority'],...rows.map(t=>{const c=cm.get(t.caseId);return [c?.reference||'',c?.client||'',t.data.title,t.data.owner,t.data.dueDate,t.data.status,t.data.priority]})])}><Download/>Export CSV</Button>
  </Head>
  <div className="filters">
   <div className="search grow"><Search size={17}/><Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search action, owner, case or client…" aria-label="Search actions"/></div>
   <select aria-label="Status" value={status} onChange={e=>setStatus(e.target.value)}><option value="active">Not done</option><option value="all">All statuses</option><option>To do</option><option>In progress</option><option>Done</option></select>
   <select aria-label="Priority" value={prio} onChange={e=>setPrio(e.target.value)}><option value="all">Any priority</option><option>High</option><option>Medium</option><option>Low</option></select>
   <label className="chip-toggle"><input type="checkbox" checked={mineOnly} onChange={e=>setMine(e.target.checked)}/> Assigned to me</label>
  </div>
  <div className="panel table-panel">{rows.length?<table className="data-table"><thead><tr><th>Action</th><th>Case</th><th>Owner</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead><tbody>{rows.map(t=>{const c=cm.get(t.caseId),late=t.data.status!=='Done'&&t.data.dueDate&&t.data.dueDate<now,canWrite=c?.role!=='viewer';return <tr key={t.id} className={late?'late':''}>
    <td><button type="button" className="link" onClick={()=>onOpen(t.caseId,'actions')}>{t.data.title}</button></td>
    <td><span className="mono">{c?.reference}</span><small className="sub">{c?.client}</small></td>
    <td>{t.data.owner||<span className="muted">Unassigned</span>}</td>
    <td>{t.data.dueDate?<>{t.data.dueDate}{late&&<Badge variant="destructive" className="ml">Overdue</Badge>}</>:<span className="muted">—</span>}</td>
    <td><Badge variant={t.data.priority==='High'?'destructive':'outline'}>{t.data.priority}</Badge></td>
    <td><select aria-label={'Status of '+t.data.title} disabled={!canWrite||busy===t.id} value={t.data.status} onChange={e=>setState(t,e.target.value)}><option>To do</option><option>In progress</option><option>Done</option></select></td></tr>})}</tbody></table>:<p className="muted pad">No action matches these filters.</p>}</div>
 </>;
}

function Indicators({data,onOpen}:P){
 const cm=caseMap(data);const [q,setQ]=useState(''),[type,setType]=useState('all'),[shared,setShared]=useState(false);
 const groups=useMemo(()=>{const m=new Map<string,{type:string;value:string;desc:string;items:Entry[]}>();for(const e of data.entries)if(e.kind==='ioc'){const k=e.data.type+'|'+String(e.data.value).toLowerCase();const g=m.get(k)||{type:e.data.type,value:e.data.value,desc:e.data.description,items:[] as Entry[]};g.items.push(e);m.set(k,g)}return [...m.values()]},[data]);
 const rows=groups.filter(g=>(type==='all'||g.type===type)&&(!shared||new Set(g.items.map(i=>i.caseId)).size>1)&&(g.value+' '+g.desc).toLowerCase().includes(q.toLowerCase())).sort((a,b)=>new Set(b.items.map(i=>i.caseId)).size-new Set(a.items.map(i=>i.caseId)).size||a.value.localeCompare(b.value));
 const types=[...new Set(groups.map(g=>g.type))];
 return <>
  <Head eyebrow="CROSS-INVESTIGATION INTELLIGENCE" title="IOC register" description="Review indicators across accessible investigations, grouped by type and value.">
   <Button variant="outline" onClick={()=>saveCsv('indicators.csv',[['Type','Value','Cases','Description'],...rows.map(g=>[g.type,g.value,[...new Set(g.items.map(i=>cm.get(i.caseId)?.reference||''))].join(' '),g.desc])])}><Download/>Export CSV</Button>
  </Head>
  <div className="filters">
   <div className="search grow"><Search size={17}/><Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search a value or description…" aria-label="Search indicators"/></div>
   <select aria-label="Type" value={type} onChange={e=>setType(e.target.value)}><option value="all">All types</option>{types.map(t=><option key={t}>{t}</option>)}</select>
   <label className="chip-toggle"><input type="checkbox" checked={shared} onChange={e=>setShared(e.target.checked)}/> Shared between cases</label>
  </div>
  <div className="panel table-panel">{rows.length?<table className="data-table"><thead><tr><th>Type</th><th>Value</th><th>Cases</th><th>Report</th></tr></thead><tbody>{rows.slice(0,500).map(g=>{const ids=[...new Set(g.items.map(i=>i.caseId))];return <tr key={g.type+g.value}>
   <td><Badge variant="outline">{g.type}</Badge></td><td className="mono wrap">{g.value}</td>
   <td><div className="chips">{ids.map(id=><button type="button" className="chip" key={id} onClick={()=>onOpen(id,'intelligence')}>{cm.get(id)?.reference}</button>)}</div></td>
   <td>{g.items.some(i=>i.data.include)?<Badge variant="secondary">Selected</Badge>:<span className="muted">—</span>}</td></tr>})}</tbody></table>:<p className="muted pad">No indicator matches these filters.</p>}</div>
 </>;
}

function Assets({data,onOpen}:P){
 const cm=caseMap(data);const [q,setQ]=useState(''),[type,setType]=useState('all'),[comp,setComp]=useState(false);
 const all=data.entries.filter(e=>e.kind==='asset');
 const rows=all.filter(a=>(type==='all'||a.data.type===type)&&(!comp||a.data.compromised)&&(`${a.data.name} ${a.data.address} ${a.data.description}`).toLowerCase().includes(q.toLowerCase()));
 const types=[...new Set(all.map(a=>a.data.type))];
 return <>
  <Head eyebrow="CROSS-INVESTIGATION INVENTORY" title="Asset inventory" description="Browse machines, accounts and services across investigations you can access.">
   <Button variant="outline" onClick={()=>saveCsv('assets.csv',[['Case','Name','Type','Address','Flagged compromised'],...rows.map(a=>[cm.get(a.caseId)?.reference||'',a.data.name,a.data.type,a.data.address,a.data.compromised?'yes':'no'])])}><Download/>Export CSV</Button>
  </Head>
  <div className="filters">
   <div className="search grow"><Search size={17}/><Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name, address or description…" aria-label="Search assets"/></div>
   <select aria-label="Type" value={type} onChange={e=>setType(e.target.value)}><option value="all">All types</option>{types.map(t=><option key={t}>{t}</option>)}</select>
   <label className="chip-toggle"><input type="checkbox" checked={comp} onChange={e=>setComp(e.target.checked)}/> Flagged compromised</label>
  </div>
  <div className="panel table-panel">{rows.length?<table className="data-table"><thead><tr><th>Asset</th><th>Type</th><th>Address</th><th>Case</th><th>Analyst flag</th></tr></thead><tbody>{rows.slice(0,500).map(a=>{const c=cm.get(a.caseId);return <tr key={a.id}>
   <td><button type="button" className="link" onClick={()=>onOpen(a.caseId,'overview')}>{a.data.name}</button></td><td>{a.data.type}</td><td className="mono wrap">{a.data.address||'—'}</td>
   <td><span className="mono">{c?.reference}</span><small className="sub">{c?.client}</small></td>
   <td>{a.data.compromised?<Badge variant="destructive"><Target size={12}/> Compromised</Badge>:<span className="muted">—</span>}</td></tr>})}</tbody></table>:<p className="muted pad">No asset matches these filters.</p>}</div>
 </>;
}
