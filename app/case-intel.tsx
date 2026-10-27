'use client';
import {useEffect,useMemo,useState} from 'react';
import {AlertCircle,Radar,UserSearch,Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {mentionedActors,rankActors,type StaticActor} from '@/lib/intel';
import {ActorDialog,intelApi,loadActors} from './threat-intel';

type Props={caseId:string;entries:any[];canWrite:boolean;onChanged:()=>void};

// Enrichment is advisory: library hits and technique overlap are leads for the analyst, never an attribution.
export default function CaseIntel({caseId,entries,canWrite,onChanged}:Props){
 const [intel,setIntel]=useState<any>(null),[actors,setActors]=useState<StaticActor[]>([]),[error,setError]=useState(''),[open,setOpen]=useState<StaticActor|null>(null),[busy,setBusy]=useState('');
 useEffect(()=>{intelApi('cases/'+caseId+'/intel').then(value=>{setIntel(value);setError('')}).catch(e=>setError(e.message));loadActors().then(setActors)},[caseId,entries]);
 const techniques=useMemo(()=>[...new Set(entries.filter(e=>e.kind==='technique').map(e=>String(e.data?.techniqueId||'').toUpperCase()).filter(Boolean))],[entries]);
 const text=useMemo(()=>entries.filter(e=>e.kind==='note'||e.kind==='case').map(e=>[e.data?.title,e.data?.content].join(' ')).join('\n'),[entries]);
 const ranked=useMemo(()=>rankActors(actors,techniques,8),[actors,techniques]);
 const named=useMemo(()=>mentionedActors(actors,text).slice(0,8),[actors,text]);
 const addNote=async(a:StaticActor,overlap:string[])=>{setBusy(a.id);try{await intelApi('records','POST',{caseId,kind:'note',data:{title:'Threat actor lead: '+a.name,assetId:'',category:'Threat Analysis',content:`Possible link to ${a.name}${a.aliases.length?' (also '+a.aliases.slice(0,4).join(', ')+')':''}. `+(overlap.length?`Overlapping techniques: ${overlap.join(', ')}. `:'')+'This is a lead based on public profiles, not an attribution.'+(a.reference?'\nReference: '+a.reference:''),source:a.source,evidenceIds:[],status:'Draft',include:false,confidence:'Low'}});onChanged()}catch(e:any){setError(e.message)}setBusy('')};
 return <div className="case-intel">
  {error&&<div className="error" role="alert">{error}</div>}
  <div className="panel"><div className="panel-head"><h3><Radar size={17}/> Indicator matches</h3></div>
   {!intel?<p className="meta">Checking the intelligence library…</p>:<>
    <p className="meta">{intel.checked} case indicators compared with {intel.libraryIndicators} shared library entries. {intel.matches.length} with hits.</p>
    <p className="meta">Threat intel → Feeds synchronises the shared abuse.ch library; matches appear here and are not copied into this case. Use the SOCradar import above to add feed indicators directly to this case.</p>
    {!intel.libraryIndicators&&<p className="meta"><AlertCircle size={14}/> The shared indicator library is empty. Synchronise feeds in Threat intel → Feeds first.</p>}
    {intel.matches.map((m:any)=><div key={m.recordId} className="ioc-file"><div><Badge variant="outline">{m.type}</Badge> <code>{m.value}</code></div>
     <div>{m.hits.slice(0,4).map((h:any)=><div key={h.id}><Badge variant={h.manual?'outline':'secondary'} className={h.manual?'badge-manual':''}>{h.source}</Badge> {h.label||h.threatType||'listed'}{h.via==='host'?' (host of this URL)':''}{h.tags?.length?' · '+h.tags.slice(0,3).join(', '):''}</div>)}</div></div>)}
    <p className="meta">A hit means the value was reported elsewhere; verify before acting.</p></>}
  </div>
  <div className="panel"><div className="panel-head"><h3><UserSearch size={17}/> Threat actor leads</h3></div>
   {!ranked.length&&!named.length?<p className="meta">{techniques.length?'No profile shares enough techniques with this case.':'Add ATT&CK or ATLAS techniques to the case to get actor suggestions.'}</p>:null}
   {named.length>0&&<><h4>Named in your notes</h4>{named.map(a=><div key={'n'+a.id} className="ioc-file"><button className="link" onClick={()=>setOpen(a)}>{a.name}</button><span className="meta">{a.country}</span>{canWrite&&<Button size="sm" variant="outline" disabled={busy===a.id} onClick={()=>addNote(a,[])}><Plus size={13}/>Add note</Button>}</div>)}</>}
   {ranked.length>0&&<><h4>Technique overlap ({techniques.length} case techniques, ranked by how much of each actor&apos;s profile the case reproduces)</h4>{ranked.map(r=><div key={r.actor.id} className="ioc-file"><button className="link" onClick={()=>setOpen(r.actor)}>{r.actor.name}</button><span className="meta">{r.overlap.length}/{r.actor.techniques?.length||'?'} of its techniques seen: {r.overlap.slice(0,6).join(', ')}</span>{canWrite&&<Button size="sm" variant="outline" disabled={busy===r.actor.id} onClick={()=>addNote(r.actor,r.overlap)}><Plus size={13}/>Add note</Button>}</div>)}</>}
   <p className="meta">Many actors share common techniques. Treat these as hypotheses, not attribution.</p>
  </div>
  {open&&<ActorDialog actor={open} onClose={()=>setOpen(null)}/>}
 </div>;
}
