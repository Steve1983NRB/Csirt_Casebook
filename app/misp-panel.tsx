'use client';
import {useEffect,useState} from 'react';
import {Download,ExternalLink,Plug,RefreshCw,ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Checkbox} from '@/components/ui/checkbox';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import type {Snapshot} from '@/lib/model';

async function call(path:string,data?:any){
 const response=await fetch('/api/'+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});
 const value:any=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(value.error||'MISP request failed.');
 return value;
}

export default function MispPanel({snapshot,onImported}:{snapshot:Snapshot|null;onImported:()=>Promise<void>}){
 const [status,setStatus]=useState<any>(null),[events,setEvents]=useState<any[]>([]),[eventId,setEventId]=useState(''),[preview,setPreview]=useState<any>(null),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{call('misp/status').then(setStatus).catch(e=>setError(e.message))},[]);
 useEffect(()=>{setEvents([]);setEventId('');setPreview(null);setSelected([]);setMessage('');setError('')},[snapshot?.case.id]);
 const canConnect=!!status?.configured&&!!snapshot?.permissions?.canManage;
 async function connect(){
  if(!snapshot)return;setBusy(true);setError('');setMessage('');
  try{const result=await call('cases/'+snapshot.case.id+'/misp');setEvents(result.events);setEventId(result.events[0]?.id||'');setPreview(null);setSelected([]);setMessage(`${result.events.length} published MISP events found from the last 30 days.`)}
  catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 async function loadEvent(){
  if(!snapshot||!eventId)return;setBusy(true);setError('');setMessage('');
  try{
   const result=await call('cases/'+snapshot.case.id+'/misp',{action:'preview',eventId});
   setPreview(result);setSelected(result.attributes.filter((a:any)=>a.supported&&a.toIds).slice(0,50).map((a:any)=>a.uuid));
  }catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 async function importSelected(){
  if(!snapshot||!preview||!selected.length)return;setBusy(true);setError('');setMessage('');
  try{const result=await call('cases/'+snapshot.case.id+'/misp',{action:'import',eventId:preview.event.id,attributeUuids:selected});setMessage(`${result.created} IOC drafts imported; ${result.skipped} already imported.`);setSelected([]);await onImported()}
  catch(e:any){setError(e.message)}finally{setBusy(false)}
 }
 const options=events;
 return <section className="panel taxii-panel">
  <div className="section-head"><div><div className="eyebrow">READ-ONLY THREAT INTELLIGENCE</div><h2>MISP</h2><p>Review published MISP events and explicitly import selected attributes as draft indicators.</p></div><Badge variant="outline">{status?.configured?'Configured':'Setup required'}</Badge></div>
  {error&&<div className="error" role="alert">{error}</div>}{status?.error&&<div className="error" role="alert">{status.error}</div>}
  {!status?.configured?<div className="taxii-setup"><Plug size={28}/><div><h3>Connect a MISP server</h3><p>Ask the workspace administrator to configure the MISP REST API and a dedicated read-only API key. Credentials remain server-side.</p><details><summary>Administrator connection settings</summary><p>Set both values in local <code>.dev.vars</code> or as deployment secrets. A public HTTPS hostname on port 443 is required; redirects and private/local hostnames are refused.</p><dl><dt>MISP_API_ROOT</dt><dd>Canonical MISP base URL, for example <code>https://misp.example.org/</code>.</dd><dt>MISP_API_KEY</dt><dd>Dedicated MISP key with read-only event and attribute permissions. Never use a key with write permissions.</dd></dl><a href="https://www.circl.lu/doc/misp/automation/" target="_blank" rel="noreferrer">MISP automation and API documentation <ExternalLink size={14}/></a></details></div></div>:<>
   <p className="meta">{status.apiRoot} · {status.authentication}</p>
   {!snapshot?<p className="notice">Open an investigation that should receive the indicators, then return to Integrations.</p>:!snapshot.permissions?.canManage?<p className="notice">Only the case owner can browse and import MISP intelligence for {snapshot.case.reference}.</p>:<>
    <div className="notice"><ShieldCheck/><p>Import into <b>{snapshot.case.reference}</b> · Selected MISP attributes become unconfirmed IOC drafts. No investigation data is sent to MISP.</p></div>
    <div className="taxii-controls">
     <Button variant="outline" onClick={connect} disabled={busy||!canConnect}><Plug/>{events.length?'Refresh events':'Test connection & list events'}</Button>
     <Select value={eventId} disabled={busy||!events.length} onValueChange={value=>{setEventId(value);setPreview(null);setSelected([])}}><SelectTrigger aria-label="MISP event"><SelectValue placeholder="Choose a published event"/></SelectTrigger><SelectContent>{options.map((event:any)=><SelectItem key={event.id} value={event.id}>{event.date} · {event.info}</SelectItem>)}</SelectContent></Select>
     <Button onClick={loadEvent} disabled={busy||!eventId}><RefreshCw/>Preview event</Button>
    </div>
    {preview&&<><div className="panel-head"><div><h3>{preview.event.info}</h3><p className="meta">Event {preview.event.id} · {preview.event.date} · {preview.event.org||'Organization not supplied'} · {preview.attributes.length} attributes</p></div><Button onClick={importSelected} disabled={busy||!selected.length}><Download/>Import {selected.length||''} selected</Button></div>
     <p className="meta">Choose up to 50 supported attributes. Attributes marked for detection (`to_ids`) are preselected; inspect comments and tags before importing.</p>
     <div className="taxii-objects">{preview.attributes.map((attribute:any)=><article key={attribute.uuid}><Checkbox aria-label={'Import '+attribute.value} disabled={busy||!attribute.supported||(!selected.includes(attribute.uuid)&&selected.length>=50)} checked={selected.includes(attribute.uuid)} onCheckedChange={checked=>setSelected(checked?[...selected,attribute.uuid]:selected.filter(id=>id!==attribute.uuid))}/><div><b><code>{attribute.value}</code></b><p className="meta">{attribute.localType||attribute.type} · {attribute.category||'Uncategorised'}{attribute.toIds?' · to_ids':''}</p>{attribute.comment&&<p className="meta">{attribute.comment}</p>}{attribute.tags.length>0&&<p className="meta">Tags: {attribute.tags.join(', ')}</p>}{!attribute.supported&&<p className="meta">Not supported for IOC import</p>}</div></article>)}</div>
    </>}
   </>}
  </>}
  {message&&<p className="success" role="status">{message}</p>}{busy&&<p className="meta" role="status"><RefreshCw className="spin"/> Contacting MISP…</p>}
 </section>;
}
