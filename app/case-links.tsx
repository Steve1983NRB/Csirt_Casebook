'use client';
import {useCallback,useEffect,useState} from 'react';
import {Link2,Trash2,ArrowRight,ArrowLeft} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {linkRelations} from '@/lib/templates';
import {call,fmtDate} from './workspace-api';

const relationLabel:Record<string,string>={related:'Related','duplicate':'Duplicate',parent:'Parent',child:'Child','same-actor':'Same threat actor','same-campaign':'Same campaign'};

// Explicit links between investigations; a link only ever shows cases the viewer can already open.
export default function CaseLinks({caseId,canWrite,cases,onOpenCase}:{caseId:string;canWrite:boolean;cases:{id:string;reference:string;title:string}[];onOpenCase:(id:string)=>void}){
 const [links,setLinks]=useState<any[]|null>(null),[error,setError]=useState(''),[target,setTarget]=useState(''),[relation,setRelation]=useState('related'),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(()=>{call(`cases/${caseId}/links`).then(d=>{setLinks(d.links);setError('')}).catch(e=>setError(e.message))},[caseId]);
 useEffect(()=>{load()},[load]);
 const linked=new Set((links||[]).map(l=>l.case.id));
 const options=cases.filter(c=>c.id!==caseId&&!linked.has(c.id));
 async function add(){setBusy(true);try{await call(`cases/${caseId}/links`,'POST',{linkedCaseId:target,relation,note});setTarget('');setNote('');load()}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function remove(id:string){try{await call(`cases/${caseId}/links`,'DELETE',{linkId:id});load()}catch(e:any){setError(e.message)}}
 return <div className="case-intel">
  <div className="section-head"><div><h2>Linked investigations</h2><p>Record that this case belongs to the same campaign, actor or incident as another one. Links are visible from both cases.</p></div></div>
  {error&&<div className="error" role="alert">{error}</div>}
  {canWrite&&<div className="panel"><div className="access-form">
   <Select value={target} onValueChange={setTarget}><SelectTrigger aria-label="Case to link"><SelectValue placeholder="Choose an investigation"/></SelectTrigger><SelectContent>{options.map(c=><SelectItem key={c.id} value={c.id}>{c.reference} · {c.title}</SelectItem>)}</SelectContent></Select>
   <Select value={relation} onValueChange={setRelation}><SelectTrigger aria-label="Relation"><SelectValue/></SelectTrigger><SelectContent>{linkRelations.map(r=><SelectItem key={r} value={r}>{relationLabel[r]}</SelectItem>)}</SelectContent></Select>
   <Input aria-label="Note" placeholder="Why are they linked? (optional)" value={note} onChange={e=>setNote(e.target.value)} maxLength={1000}/>
   <Button disabled={!target||busy} onClick={add}><Link2/>Link</Button></div>
   {!options.length&&<p className="meta">No other accessible investigation to link.</p>}</div>}
  <div className="panel">{!links?<p className="meta">Loading…</p>:!links.length?<p className="meta">This investigation is not linked to another one.</p>:links.map(l=><div className="ioc-file" key={l.id}>
   <div>{l.direction==='outgoing'?<ArrowRight size={14}/>:<ArrowLeft size={14}/>} <Badge variant="outline">{relationLabel[l.relation]||l.relation}</Badge> <button className="link" onClick={()=>onOpenCase(l.case.id)}><b>{l.case.reference}</b> · {l.case.title}</button> <Badge variant="secondary">{l.case.priority}</Badge> <Badge variant="secondary">{l.case.status}</Badge>
    <div className="meta">{l.case.client} · linked by {l.author} on {fmtDate(l.createdAt)}{l.note?' — '+l.note:''}</div></div>
   {canWrite&&<Button size="sm" variant="ghost" aria-label={'Remove link to '+l.case.reference} onClick={()=>remove(l.id)}><Trash2/></Button>}</div>)}</div>
 </div>;
}
