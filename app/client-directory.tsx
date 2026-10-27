'use client';
import {useEffect,useMemo,useState} from 'react';
import {Building2,Plus,Save,Search,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import type {Case} from '@/lib/model';

type Client={id:string;owner_id:string;name:string;contact_name:string;email:string;phone:string;notes:string;created_at:string;updated_at:string};
export default function ClientDirectory({cases,onOpen,currentUser}:{cases:Case[];onOpen:(id:string)=>void;currentUser:{id:string}|null}){
 const [clients,setClients]=useState<Client[]>([]),[selected,setSelected]=useState(''),[query,setQuery]=useState(''),[busy,setBusy]=useState(false);
 const [form,setForm]=useState({name:'',contactName:'',email:'',phone:'',notes:''});
 async function load(){const r=await fetch('/api/clients');const b:any=await r.json();if(!r.ok)throw new Error(b.error||'Unable to load client directory.');setClients(b)}
 useEffect(()=>{load().catch(e=>toast.error(e.message))},[]);
 const groups=useMemo(()=>{const map=new Map<string,Case[]>();for(const c of cases){const key=c.client.trim().toLocaleLowerCase();map.set(key,[...(map.get(key)||[]),c])}return map},[cases]);
 const names=[...new Map([...cases.map(c=>[c.client.toLocaleLowerCase(),c.client] as const),...clients.map(c=>[c.name.toLocaleLowerCase(),c.name] as const)]).values()]
  .filter(n=>n.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.localeCompare(b));
 const active=clients.find(c=>c.name.toLowerCase()===selected.toLowerCase());
 function select(name:string){setSelected(name);const c=clients.find(x=>x.name.toLowerCase()===name.toLowerCase());setForm(c?{name:c.name,contactName:c.contact_name,email:c.email,phone:c.phone,notes:c.notes}:{name,contactName:'',email:'',phone:'',notes:''})}
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);try{const method=active?'PUT':'POST',url=active?'/api/clients/'+active.id:'/api/clients',r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,name:active?.name||form.name})}),b:any=await r.json();if(!r.ok)throw new Error(b.error||'Client details could not be saved.');await load();setSelected(b.name);toast.success('Client details saved.')}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 async function remove(){if(!active||!confirm(`Delete the client profile for ${active.name}?`))return;setBusy(true);try{const r=await fetch('/api/clients/'+active.id,{method:'DELETE'}),b:any=await r.json();if(!r.ok)throw new Error(b.error||'Client could not be deleted.');await load();setSelected('');toast.success('Client profile deleted.')}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 return <div className="client-directory">
  <div className="page-title"><div><div className="eyebrow">WORKSPACE</div><h1>Clients</h1><p>Client profiles and their investigation history.</p></div><Button onClick={()=>{setSelected('');setForm({name:'',contactName:'',email:'',phone:'',notes:''})}}><Plus/> New client</Button></div>
  <div className="client-layout">
   <section className="panel client-list"><div className="search"><Search size={16}/><Input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a client…" aria-label="Search clients"/></div>
    {names.map(name=>{const linked=groups.get(name.toLowerCase())||[];return <button className={'client-item '+(selected.toLowerCase()===name.toLowerCase()?'active':'')} key={name} onClick={()=>select(name)}><Building2 size={17}/><span><b>{name}</b><small>{linked.length} investigation{linked.length===1?'':'s'}</small></span><Badge variant="outline">{linked.length}</Badge></button>})}
    {!names.length&&<p className="muted pad">No client records yet. Create a profile or add an investigation.</p>}
   </section>
   <section className="panel client-detail">
    {selected||!active?(
     <form onSubmit={save}><div className="panel-head"><h2>{selected?'Client profile':'Create a client'}</h2>{active&&active.owner_id!==currentUser?.id&&<Badge variant="outline">Shared</Badge>}</div>
      <div className="form-grid">
       <div className="field wide"><label htmlFor="client-name">Organization name</label><Input id="client-name" required maxLength={200} disabled={!!active} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>{active&&<small>Organization names are fixed to preserve case history links.</small>}</div>
       <div className="field"><label htmlFor="client-contact">Primary contact</label><Input id="client-contact" disabled={active?.owner_id!==currentUser?.id} value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})}/></div>
       <div className="field"><label htmlFor="client-email">Contact email</label><Input id="client-email" type="email" disabled={active?.owner_id!==currentUser?.id} value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div>
       <div className="field"><label htmlFor="client-phone">Phone</label><Input id="client-phone" disabled={active?.owner_id!==currentUser?.id} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></div>
       <div className="field wide"><label htmlFor="client-notes">Engagement notes</label><Textarea id="client-notes" rows={5} disabled={active?.owner_id!==currentUser?.id} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
      </div>
      {(!active||active.owner_id===currentUser?.id)&&<div className="button-row spaced"><Button type="submit" disabled={busy||!form.name.trim()}><Save/>{busy?'Saving…':active?'Save profile':'Create client'}</Button>{active&&(groups.get(active.name.toLowerCase())||[]).length===0&&<Button type="button" variant="destructive" disabled={busy} onClick={remove}><Trash2/>Delete client</Button>}</div>}
     </form>
    ):<div className="empty"><Building2 size={30}/><h2>Select a client</h2><p>View organization details and linked investigations.</p></div>}
    {selected&&<div className="linked-cases spaced"><h3>Investigation history</h3>{(groups.get(selected.toLowerCase())||[]).length?groups.get(selected.toLowerCase())!.map(c=><button type="button" className="linked-case" key={c.id} onClick={()=>onOpen(c.id)}><span><b>{c.reference}</b> · {c.title}<small>{c.date} · {c.status} · {c.priority}</small></span><Badge variant="outline">{c.status}</Badge></button>):<p className="muted">No investigations linked by this client name.</p>}</div>}
   </section>
  </div>
 </div>;
}
