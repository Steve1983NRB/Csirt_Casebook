'use client';
import {useCallback,useEffect,useState} from 'react';
import {UsersRound,Webhook,ListPlus,FileStack,Trash2,Copy,Send,Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Badge} from '@/components/ui/badge';
import {Switch} from '@/components/ui/switch';
import {Textarea} from '@/components/ui/textarea';
import {Checkbox} from '@/components/ui/checkbox';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {playbooks,type PlaybookId} from '@/lib/playbooks';
import {attributeTypes} from '@/lib/templates';
import {call,fmtDate} from './workspace-api';

export default function WorkspaceAdmin(){
 return <section className="panel" aria-label="Workspace configuration">
  <div className="panel-head"><div><h2>Workspace configuration</h2><p className="meta">Groups, outbound webhooks, custom case fields and case templates. Administrators only.</p></div></div>
  <Tabs defaultValue="groups"><TabsList><TabsTrigger value="groups"><UsersRound size={15}/>Groups</TabsTrigger><TabsTrigger value="webhooks"><Webhook size={15}/>Webhooks</TabsTrigger><TabsTrigger value="fields"><ListPlus size={15}/>Custom fields</TabsTrigger><TabsTrigger value="templates"><FileStack size={15}/>Templates</TabsTrigger></TabsList>
   <TabsContent value="groups"><Groups/></TabsContent><TabsContent value="webhooks"><Webhooks/></TabsContent><TabsContent value="fields"><Fields/></TabsContent><TabsContent value="templates"><Templates/></TabsContent>
  </Tabs></section>;
}

function useLoad<T>(path:string,pick:(d:any)=>T,initial:T){
 const [data,setData]=useState<T>(initial),[error,setError]=useState('');
 const load=useCallback(()=>{call(path).then(d=>{setData(pick(d));setError('')}).catch(e=>setError(e.message))},[path]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{load()},[load]);
 return {data,error,setError,load};
}
const Err=({e}:{e:string})=>e?<div className="error" role="alert">{e}</div>:null;

function Groups(){
 const {data:groups,error,setError,load}=useLoad<any[]>('groups',d=>d.groups,[]);
 const [name,setName]=useState(''),[description,setDescription]=useState(''),[open,setOpen]=useState(''),[members,setMembers]=useState<any[]>([]),[users,setUsers]=useState<any[]>([]),[pick,setPick]=useState('');
 useEffect(()=>{call('auth/users').then(d=>setUsers(d.users)).catch(()=>{})},[]);
 const loadMembers=useCallback((id:string)=>call(`groups/${id}/members`).then(d=>setMembers(d.members)).catch(e=>setError(e.message)),[setError]);
 async function create(e:React.FormEvent){e.preventDefault();try{await call('groups','POST',{name,description});setName('');setDescription('');load()}catch(err:any){setError(err.message)}}
 async function remove(g:any){if(!confirm(`Delete group "${g.name}"? Its case grants are removed.`))return;try{await call('groups/'+g.id,'DELETE');if(open===g.id)setOpen('');load()}catch(e:any){setError(e.message)}}
 async function add(){try{await call(`groups/${open}/members`,'POST',{userId:pick});setPick('');loadMembers(open);load()}catch(e:any){setError(e.message)}}
 async function drop(userId:string){try{await call(`groups/${open}/members`,'DELETE',{userId});loadMembers(open);load()}catch(e:any){setError(e.message)}}
 return <div><Err e={error}/>
  <form className="access-form" onSubmit={create}><Input aria-label="Group name" placeholder="Group name, e.g. Blue team" value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={80}/><Input aria-label="Group description" placeholder="Description (optional)" value={description} onChange={e=>setDescription(e.target.value)} maxLength={500}/><Button type="submit"><Plus/>Create group</Button></form>
  {groups.map(g=><div key={g.id}><div className="member-row"><div><b>{g.name}</b><span>{g.description||'No description'} · {g.memberCount} members</span></div><Button size="sm" variant="outline" onClick={()=>{const next=open===g.id?'':g.id;setOpen(next);if(next)loadMembers(next)}}>{open===g.id?'Close':'Members'}</Button><Button size="icon" variant="ghost" aria-label={'Delete group '+g.name} onClick={()=>remove(g)}><Trash2/></Button></div>
   {open===g.id&&<div className="panel"><div className="access-form"><Select value={pick} onValueChange={setPick}><SelectTrigger aria-label="User to add"><SelectValue placeholder="Add a user"/></SelectTrigger><SelectContent>{users.filter(u=>!members.some(m=>m.id===u.id)).map(u=><SelectItem key={u.id} value={u.id}>{u.displayName} · {u.email}</SelectItem>)}</SelectContent></Select><Button disabled={!pick} onClick={add}>Add</Button></div>
    {members.map(m=><div className="member-row" key={m.id}><div><b>{m.displayName}</b><span>{m.email}</span></div><Button size="icon" variant="ghost" aria-label={'Remove '+m.email} onClick={()=>drop(m.id)}><Trash2/></Button></div>)}{!members.length&&<p className="meta">No member yet.</p>}</div>}</div>)}
  {!groups.length&&<p className="meta">No group yet. Create one, then grant it a role from a case&apos;s Access tab.</p>}</div>;
}

function Webhooks(){
 const {data,error,setError,load}=useLoad<{hooks:any[];events:string[]}>('webhooks',d=>d,{hooks:[],events:[]});
 const [name,setName]=useState(''),[url,setUrl]=useState(''),[events,setEvents]=useState<string[]>(['case.created']),[details,setDetails]=useState(false),[secret,setSecret]=useState(''),[log,setLog]=useState<{id:string;rows:any[]}|null>(null),[testing,setTesting]=useState('');
 async function create(e:React.FormEvent){e.preventDefault();try{const r=await call('webhooks','POST',{name,url,events,includeCaseDetails:details});setSecret(r.secret);setName('');setUrl('');load()}catch(err:any){setError(err.message)}}
 async function toggle(h:any,active:boolean){try{await call('webhooks/'+h.id,'PATCH',{active});load()}catch(e:any){setError(e.message)}}
 async function remove(h:any){if(!confirm(`Delete webhook "${h.name}"?`))return;try{await call('webhooks/'+h.id,'DELETE');load()}catch(e:any){setError(e.message)}}
 async function test(h:any){setTesting(h.id);try{await call(`webhooks/${h.id}/test`,'POST',{});load();await showLog(h.id)}catch(e:any){setError(e.message)}finally{setTesting('')}}
 async function showLog(id:string){try{setLog({id,rows:(await call('webhooks/'+id)).deliveries})}catch(e:any){setError(e.message)}}
 return <div><Err e={error}/>
  <p className="meta">Each delivery is an HTTPS POST signed with HMAC-SHA256 (<code>X-CSIRT-Signature</code> over <code>timestamp.body</code>). By default only identifiers are sent, never case content. Redirects and private or internal addresses are refused.</p>
  {secret&&<div className="notice"><Copy/><div><p>Signing secret (shown once):</p><div className="mfa-secret"><code>{secret}</code><Button size="icon" variant="ghost" aria-label="Copy secret" onClick={()=>navigator.clipboard.writeText(secret)}><Copy/></Button></div><Button variant="link" onClick={()=>setSecret('')}>Dismiss</Button></div></div>}
  <form onSubmit={create} className="form-grid"><div className="field"><Label htmlFor="wh-name">Name</Label><Input id="wh-name" value={name} onChange={e=>setName(e.target.value)} required maxLength={80}/></div><div className="field"><Label htmlFor="wh-url">HTTPS URL</Label><Input id="wh-url" type="url" placeholder="https://hooks.example.com/csirt" value={url} onChange={e=>setUrl(e.target.value)} required/></div>
   <div className="field wide"><Label>Events</Label>{data.events.map(ev=><div className="checkline" key={ev}><Checkbox id={'ev-'+ev} checked={events.includes(ev)} onCheckedChange={v=>setEvents(v?[...events,ev]:events.filter(x=>x!==ev))}/><Label htmlFor={'ev-'+ev}>{ev}</Label></div>)}</div>
   <div className="checkline wide"><Checkbox id="wh-details" checked={details} onCheckedChange={v=>setDetails(v===true)}/><Label htmlFor="wh-details">Include case details (title, client, status) in payloads</Label></div>
   <Button type="submit" disabled={!events.length}><Plus/>Add webhook</Button></form>
  {data.hooks.map(h=><div key={h.id}><div className="member-row"><div><b>{h.name}</b> <Badge variant={h.active?'default':'secondary'}>{h.active?'Active':'Paused'}</Badge><span>{h.url}</span><span className="meta">{h.events.join(', ')}{h.includeCaseDetails?' · with case details':''} · last: {h.lastAt?`${h.lastStatus??'error'} on ${fmtDate(h.lastAt)}${h.lastError?' — '+h.lastError:''}`:'never'}</span></div>
   <Switch checked={h.active} onCheckedChange={v=>toggle(h,v)} aria-label={'Activate '+h.name}/><Button size="sm" variant="outline" disabled={testing===h.id} onClick={()=>test(h)}><Send/>Test</Button><Button size="sm" variant="ghost" onClick={()=>showLog(h.id)}>Log</Button><Button size="icon" variant="ghost" aria-label={'Delete '+h.name} onClick={()=>remove(h)}><Trash2/></Button></div>
   {log&&log.id===h.id&&<div className="panel">{log.rows.map(r=><div className="meta" key={r.id}>{r.ok?'✔':'✖'} {r.event} · {r.status??'no response'} · {r.durationMs} ms · {fmtDate(r.at)}{r.error?' · '+r.error:''}</div>)}{!log.rows.length&&<p className="meta">No delivery yet.</p>}</div>}</div>)}
 </div>;
}

function Fields(){
 const {data:fields,error,setError,load}=useLoad<any[]>('attributes',d=>d.attributes,[]);
 const [label,setLabel]=useState(''),[key,setKey]=useState(''),[type,setType]=useState<string>('text'),[options,setOptions]=useState(''),[help,setHelp]=useState('');
 async function create(e:React.FormEvent){e.preventDefault();try{await call('attributes','POST',{label,key,type,options:options.split(',').map(s=>s.trim()).filter(Boolean),help});setLabel('');setKey('');setOptions('');setHelp('');load()}catch(err:any){setError(err.message)}}
 async function remove(f:any){if(!confirm(`Delete field "${f.label}"? Existing values stay in old cases but are no longer shown.`))return;try{await call('attributes/'+f.id,'DELETE');load()}catch(e:any){setError(e.message)}}
 return <div><Err e={error}/><p className="meta">Extra fields shown when creating or editing every investigation (business unit, regulator notified, affected users…).</p>
  <form onSubmit={create} className="form-grid"><div className="field"><Label htmlFor="cf-label">Label</Label><Input id="cf-label" value={label} onChange={e=>{setLabel(e.target.value);if(!key||key===slug(label))setKey(slug(e.target.value))}} required maxLength={60}/></div><div className="field"><Label htmlFor="cf-key">Key</Label><Input id="cf-key" value={key} onChange={e=>setKey(e.target.value)} required pattern="[a-z][a-z0-9_]{1,39}"/></div>
   <div className="field"><Label>Type</Label><Select value={type} onValueChange={setType}><SelectTrigger aria-label="Field type"><SelectValue/></SelectTrigger><SelectContent>{attributeTypes.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
   {type==='select'&&<div className="field"><Label htmlFor="cf-options">Options (comma separated)</Label><Input id="cf-options" value={options} onChange={e=>setOptions(e.target.value)}/></div>}
   <div className="field wide"><Label htmlFor="cf-help">Help text (optional)</Label><Input id="cf-help" value={help} onChange={e=>setHelp(e.target.value)} maxLength={200}/></div><Button type="submit"><Plus/>Add field</Button></form>
  {fields.map(f=><div className="member-row" key={f.id}><div><b>{f.label}</b> <Badge variant="outline">{f.type}</Badge><span><code>{f.key}</code>{f.options?.length?' · '+f.options.join(', '):''}</span></div><Button size="icon" variant="ghost" aria-label={'Delete '+f.label} onClick={()=>remove(f)}><Trash2/></Button></div>)}</div>;
}
const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').replace(/^[^a-z]+/,'').slice(0,40);

function Templates(){
 const {data:templates,error,setError,load}=useLoad<any[]>('templates',d=>d.templates,[]);
 const [name,setName]=useState(''),[description,setDescription]=useState(''),[incidentType,setIncidentType]=useState(''),[priority,setPriority]=useState('P3'),[tlp,setTlp]=useState('TLP:AMBER'),[playbook,setPlaybook]=useState<string>('standard'),[tags,setTags]=useState(''),[scope,setScope]=useState(''),[actions,setActions]=useState('');
 async function create(e:React.FormEvent){e.preventDefault();try{await call('templates','POST',{name,description,data:{incidentType,priority,tlp,playbook,tags:tags.split(',').map(s=>s.trim()).filter(Boolean),scope,actions:actions.split('\n').map(s=>s.trim()).filter(Boolean).map(title=>({title,priority:'Medium'}))}});setName('');setDescription('');setActions('');load()}catch(err:any){setError(err.message)}}
 async function remove(t:any){if(!confirm(`Delete template "${t.name}"?`))return;try{await call('templates/'+t.id,'DELETE');load()}catch(e:any){setError(e.message)}}
 return <div><Err e={error}/><p className="meta">Reusable starting points chosen when creating a case: classification, scope, tags, playbook and extra tasks.</p>
  <form onSubmit={create} className="form-grid"><div className="field"><Label htmlFor="tp-name">Template name</Label><Input id="tp-name" value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={80}/></div><div className="field"><Label htmlFor="tp-desc">Description</Label><Input id="tp-desc" value={description} onChange={e=>setDescription(e.target.value)} maxLength={500}/></div>
   <div className="field"><Label htmlFor="tp-type">Incident type</Label><Input id="tp-type" value={incidentType} onChange={e=>setIncidentType(e.target.value)}/></div>
   <div className="field"><Label>Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger aria-label="Priority"><SelectValue/></SelectTrigger><SelectContent>{['Unassessed','P1','P2','P3','P4'].map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
   <div className="field"><Label>Classification</Label><Select value={tlp} onValueChange={setTlp}><SelectTrigger aria-label="Classification"><SelectValue/></SelectTrigger><SelectContent>{['TLP:AMBER','TLP:AMBER+STRICT','TLP:RED','TLP:GREEN','TLP:CLEAR'].map(p=><SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
   <div className="field"><Label>Playbook</Label><Select value={playbook} onValueChange={setPlaybook}><SelectTrigger aria-label="Playbook"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(playbooks).map(([id,p])=><SelectItem key={id} value={id}>{p.label}</SelectItem>)}</SelectContent></Select></div>
   <div className="field wide"><Label htmlFor="tp-tags">Tags (comma separated)</Label><Input id="tp-tags" value={tags} onChange={e=>setTags(e.target.value)}/></div>
   <div className="field wide"><Label htmlFor="tp-scope">Default scope</Label><Textarea id="tp-scope" rows={3} value={scope} onChange={e=>setScope(e.target.value)}/></div>
   <div className="field wide"><Label htmlFor="tp-actions">Extra tasks (one per line)</Label><Textarea id="tp-actions" rows={3} value={actions} onChange={e=>setActions(e.target.value)}/></div><Button type="submit"><Plus/>Save template</Button></form>
  {templates.map(t=><div className="member-row" key={t.id}><div><b>{t.name}</b> <Badge variant="outline">{t.data.priority}</Badge> <Badge variant="outline">{playbooks[t.data.playbook as PlaybookId]?.label||t.data.playbook}</Badge><span>{t.description||t.data.incidentType||'No description'} · {t.data.actions.length} extra tasks</span></div><Button size="icon" variant="ghost" aria-label={'Delete '+t.name} onClick={()=>remove(t)}><Trash2/></Button></div>)}</div>;
}
