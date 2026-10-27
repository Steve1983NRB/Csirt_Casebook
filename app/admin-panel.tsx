'use client';
import {useEffect,useState} from 'react';
import {ShieldCheck,UserPlus,KeyRound,RefreshCw,Copy,CheckCircle2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';
import {useAuth} from './auth-gate';
import WorkspaceAdmin from './workspace-admin';

type WorkspaceUser={id:string;email:string;displayName:string;isAdmin:boolean;mfaEnabled:boolean;lastSeen:string};
async function request(path:string,method='GET',data?:any){const r=await fetch(path,{method,headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const b:any=await r.json();if(!r.ok)throw new Error(b.error||'Request failed.');return b}

export default function AdminPanel(){
 const auth=useAuth();
 const [users,setUsers]=useState<WorkspaceUser[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [secret,setSecret]=useState(''),[uri,setUri]=useState(''),[code,setCode]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
 const [newEmail,setNewEmail]=useState(''),[newName,setNewName]=useState(''),[newPassword,setNewPassword]=useState('');
 const [resetFor,setResetFor]=useState<WorkspaceUser|null>(null),[tempPassword,setTempPassword]=useState('');
 async function load(){setLoading(true);try{setUsers((await request('/api/auth/users')).users);setError('')}catch(e:any){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);
 async function setAdmin(user:WorkspaceUser,isAdmin:boolean){setBusy(true);try{await request('/api/auth/users','POST',{userId:user.id,isAdmin});await auth.refresh();await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function resetPassword(user:WorkspaceUser){if(!confirm('Reset the password and sign out every active session for '+user.email+'?'))return;setBusy(true);try{const b=await request('/api/auth/users','POST',{action:'reset-password',userId:user.id});setResetFor(user);setTempPassword(b.temporaryPassword);setError('')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function setupMfa(){setBusy(true);try{const b=await request('/api/auth/mfa','POST',{action:'setup'});setSecret(b.secret);setUri(b.uri);setError('')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function enableMfa(){setBusy(true);try{await request('/api/auth/mfa','POST',{action:'enable',code});setSecret('');setUri('');setCode('');await auth.refresh();await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function disableMfa(){setBusy(true);try{await request('/api/auth/mfa','POST',{action:'disable',password});setPassword('');await auth.refresh();await load()}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function createUser(e:React.FormEvent){e.preventDefault();setBusy(true);try{await request('/api/auth/register','POST',{email:newEmail,displayName:newName,password:newPassword});setNewEmail('');setNewName('');setNewPassword('');await load()}catch(err:any){setError(err.message)}finally{setBusy(false)}}
 if(!auth.user?.isAdmin)return <div className="error">Only a workspace administrator can open this page.</div>;
 return <>
  <div className="page-title"><div><div className="eyebrow">WORKSPACE SECURITY</div><h1>Accounts & access</h1><p>Manage workspace administrators and your own two-factor authentication.</p></div><Badge>Administrator</Badge></div>
  {error&&<div className="error" role="alert">{error}</div>}
  <div className="admin-grid">
   <section className="panel">
    <div className="panel-head"><div><h2>Workspace users</h2><p className="meta">Admins manage accounts. Case roles are configured from each investigation&apos;s Access tab.</p></div><Button variant="ghost" size="icon" onClick={load} aria-label="Refresh users"><RefreshCw className={loading?'spin':''}/></Button></div>
    <form className="admin-create" onSubmit={createUser}>
     <div className="auth-field"><Label htmlFor="new-user-email">Email</Label><Input id="new-user-email" type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)} required/></div>
     <div className="auth-field"><Label htmlFor="new-user-name">Display name</Label><Input id="new-user-name" value={newName} onChange={e=>setNewName(e.target.value)}/></div>
     <div className="auth-field"><Label htmlFor="new-user-password">Initial password</Label><Input id="new-user-password" type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} required/></div>
     <Button type="submit" disabled={busy}><UserPlus/>Create account</Button>
    </form>
    <div className="admin-users">{users.map(user=><article key={user.id} className="admin-user"><div><b>{user.displayName}</b><span>{user.email}</span><span className="meta">Last seen {user.lastSeen?new Date(user.lastSeen).toLocaleString('en-GB'):'Never'} · {user.mfaEnabled?'MFA enabled':'MFA not enabled'}</span>{resetFor?.id===user.id&&tempPassword&&<div className="notice"><KeyRound/><div><p>Temporary password for {user.email} (shown once):</p><div className="mfa-secret"><code>{tempPassword}</code><Button size="icon" variant="ghost" aria-label="Copy temporary password" onClick={()=>navigator.clipboard.writeText(tempPassword)}><Copy/></Button></div><Button variant="link" onClick={()=>{setResetFor(null);setTempPassword('')}}>Dismiss</Button></div></div>}</div><div className="admin-role"><Button variant="outline" size="sm" disabled={busy} onClick={()=>resetPassword(user)}><KeyRound/>Reset password</Button><Label htmlFor={'admin-'+user.id}>Admin</Label><Switch id={'admin-'+user.id} checked={user.isAdmin} disabled={busy} onCheckedChange={v=>setAdmin(user,v)}/></div></article>)}</div>
   </section>
   <section className="panel">
    <div className="panel-head"><h2>Two-factor authentication</h2><KeyRound/></div>
    {auth.user.mfaEnabled?<><div className="notice"><CheckCircle2/><p>MFA is enabled on your account.</p></div><div className="auth-field"><Label htmlFor="disable-password">Confirm your password to disable MFA</Label><Input id="disable-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></div><Button variant="outline" disabled={busy||!password} onClick={disableMfa}>Disable MFA</Button></>:secret?<><p>Scan this URI with Microsoft Authenticator, Google Authenticator, 1Password or another TOTP app.</p><div className="mfa-secret"><code>{secret}</code><Button size="icon" variant="ghost" aria-label="Copy secret" onClick={()=>navigator.clipboard.writeText(secret)}><Copy/></Button></div><details><summary>Manual setup URI</summary><code className="wrap">{uri}</code></details><div className="auth-field"><Label htmlFor="enable-code">6-digit code</Label><Input id="enable-code" inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></div><Button disabled={busy||code.length!==6} onClick={enableMfa}>Verify & enable MFA</Button></>:<><p>Add a second factor to protect your account even if your password is compromised.</p><Button disabled={busy} onClick={setupMfa}><ShieldCheck/>Set up MFA</Button></>}
   </section>
  </div>
  <WorkspaceAdmin/>
 </>;
}
