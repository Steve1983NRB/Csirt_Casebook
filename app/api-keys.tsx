'use client';
import {useCallback,useEffect,useState} from 'react';
import {KeyRound,Copy,Trash2,Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Badge} from '@/components/ui/badge';
import {call,fmtDate} from './workspace-api';

// Personal API keys: Bearer tokens that act as the signed-in user, with that user's case access only.
export default function ApiKeys(){
 const [now]=useState(()=>Date.now()),[keys,setKeys]=useState<any[]>([]),[error,setError]=useState(''),[name,setName]=useState(''),[days,setDays]=useState(90),[token,setToken]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(()=>{call('auth/api-keys').then(d=>{setKeys(d.keys);setError('')}).catch(e=>setError(e.message))},[]);
 useEffect(()=>{load()},[load]);
 async function create(e:React.FormEvent){e.preventDefault();setBusy(true);try{const r=await call('auth/api-keys','POST',{name,days});setToken(r.token);setName('');load()}catch(err:any){setError(err.message)}finally{setBusy(false)}}
 async function revoke(k:any){if(!confirm(`Revoke key "${k.name}"? Scripts using it stop working immediately.`))return;try{await call('auth/api-keys/'+k.id,'DELETE');load()}catch(e:any){setError(e.message)}}
 const state=(k:any)=>k.revokedAt?'Revoked':Date.parse(k.expiresAt)<=now?'Expired':'Active';
 return <>
  <div className="page-title"><div><div className="eyebrow">AUTOMATION</div><h1>API keys</h1><p>Call the CSIRT API from scripts or other tools without your password. A key has exactly your access to cases and cannot manage accounts, MFA or other keys.</p></div><KeyRound/></div>
  {error&&<div className="error" role="alert">{error}</div>}
  <section className="panel">
   {token&&<div className="notice"><KeyRound/><div><p>Copy your key now — it is shown only once.</p><div className="mfa-secret"><code>{token}</code><Button size="icon" variant="ghost" aria-label="Copy API key" onClick={()=>navigator.clipboard.writeText(token)}><Copy/></Button></div><Button variant="link" onClick={()=>setToken('')}>Dismiss</Button></div></div>}
   <form className="access-form" onSubmit={create}><div className="field"><Label htmlFor="key-name">Name</Label><Input id="key-name" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. SIEM export" required maxLength={80}/></div><div className="field"><Label htmlFor="key-days">Valid for (days)</Label><Input id="key-days" type="number" min={1} max={365} value={days} onChange={e=>setDays(Number(e.target.value))}/></div><Button type="submit" disabled={busy}><Plus/>Create key</Button></form>
   <p className="meta">Usage: <code>curl -H &quot;Authorization: Bearer kyk_…&quot; {typeof window!=='undefined'?window.location.origin:''}/api/cases</code></p>
   {keys.map(k=><div className="member-row" key={k.id}><div><b>{k.name}</b> <Badge variant={state(k)==='Active'?'default':'secondary'}>{state(k)}</Badge><span className="meta">kyk_…{k.prefix} · created {fmtDate(k.createdAt)} · expires {fmtDate(k.expiresAt)} · last used {fmtDate(k.lastUsedAt)}</span></div>{state(k)==='Active'&&<Button size="icon" variant="ghost" aria-label={'Revoke '+k.name} onClick={()=>revoke(k)}><Trash2/></Button>}</div>)}
   {!keys.length&&<p className="meta">No API key yet.</p>}
  </section>
 </>;
}
