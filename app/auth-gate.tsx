'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {ShieldCheck,LogIn,UserPlus,KeyRound,Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

export type AuthUser={id:string;email:string;displayName:string;isAdmin:boolean;mfaEnabled:boolean};
type AuthState={user:AuthUser|null;refresh:()=>Promise<void>;signOut:()=>Promise<void>};
const AuthContext=createContext<AuthState>({user:null,refresh:async()=>{},signOut:async()=>{}});
export function useAuth(){return useContext(AuthContext)}

async function post(path:string,data:any){
 const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const body:any=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(body.error||'The request could not be completed.');
 return body;
}

export function AuthGate({children}:{children:ReactNode}){
 const [user,setUser]=useState<AuthUser|null>(null);
 const [ready,setReady]=useState(false);
 const [registrationOpen,setRegistrationOpen]=useState(false);
 async function refresh(){try{const r=await fetch('/api/auth/session');const b:any=await r.json();setUser(b.user||null);setRegistrationOpen(!!b.registrationOpen)}catch{setUser(null)}finally{setReady(true)}}
 async function signOut(){try{await post('/api/auth/logout',{})}catch{}setUser(null)}
 useEffect(()=>{refresh()},[]);
 if(!ready)return <div className="auth-loading"><Loader2 className="spin"/> Loading workspace…</div>;
 if(!user)return <AuthScreen onSignedIn={setUser} registrationOpen={registrationOpen}/>;
 return <AuthContext.Provider value={{user,refresh,signOut}}>{children}</AuthContext.Provider>;
}

function AuthScreen({onSignedIn,registrationOpen}:{onSignedIn:(u:AuthUser)=>void;registrationOpen:boolean}){
 const [mode,setMode]=useState<'login'|'register'>('login');
 const [email,setEmail]=useState('');
 const [displayName,setDisplayName]=useState('');
 const [password,setPassword]=useState('');
 const [confirm,setConfirm]=useState('');
 const [bootstrapToken,setBootstrapToken]=useState('');
 const [code,setCode]=useState('');
 const [mfaStep,setMfaStep]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');

 async function submit(e:React.FormEvent){
  e.preventDefault();setError('');setBusy(true);
  try{
   if(mfaStep){
    const b=await post('/api/auth/mfa-login',{code});onSignedIn(b.user);return;
   }
   if(mode==='register'){
    if(password!==confirm)throw new Error('The passwords do not match.');
    const b=await post('/api/auth/register',{email,password,displayName,bootstrapToken});onSignedIn(b.user);return;
   }
   const b=await post('/api/auth/login',{email,password});
   if(b.mfaRequired){setMfaStep(true);setError('');return;}
   onSignedIn(b.user);
  }catch(err:any){setError(err.message)}finally{setBusy(false)}
 }

 return <div className="auth-shell">
  <div className="auth-card">
    <div className="auth-brand"><img src="/csirt-dfir-white.png" alt="CSIRT DFIR" onError={e=>{(e.target as HTMLImageElement).style.display='none'}}/><ShieldCheck size={26}/><span>CSIRT Investigate</span></div>
   {mfaStep?<>
    <h1>Two-factor authentication</h1>
    <p className="auth-sub">Enter the 6-digit code from your authenticator app.</p>
    <form onSubmit={submit} className="auth-form">
     <div className="auth-field"><Label htmlFor="mfa-code">Authentication code</Label><Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="123456" autoFocus/></div>
     {error&&<div className="auth-error" role="alert">{error}</div>}
     <Button type="submit" disabled={busy||code.length!==6}>{busy?<Loader2 className="spin"/>:<KeyRound/>}Verify</Button>
     <button type="button" className="auth-link" onClick={()=>{setMfaStep(false);setCode('');setPassword('')}}>Back to sign in</button>
    </form>
   </>:<>
    <h1>{mode==='login'?'Sign in':'Create your account'}</h1>
    <p className="auth-sub">{mode==='login'?'Access your DFIR investigation workspace.':'Set up the first administrator account.'}</p>
    <form onSubmit={submit} className="auth-form">
     <div className="auth-field"><Label htmlFor="auth-email">Email</Label><Input id="auth-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="analyst@example.org" required/></div>
     {mode==='register'&&<div className="auth-field"><Label htmlFor="auth-name">Display name</Label><Input id="auth-name" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Optional"/></div>}
     {mode==='register'&&<div className="auth-field"><Label htmlFor="auth-bootstrap">Administrator bootstrap token</Label><Input id="auth-bootstrap" type="password" autoComplete="off" value={bootstrapToken} onChange={e=>setBootstrapToken(e.target.value)} required/></div>}
     <div className="auth-field"><Label htmlFor="auth-password">Password</Label><Input id="auth-password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} required/></div>
     {mode==='register'&&<>
      <div className="auth-field"><Label htmlFor="auth-confirm">Confirm password</Label><Input id="auth-confirm" type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required/></div>
      <p className="auth-hint">At least 12 characters, mixing upper case, lower case, digits and symbols.</p>
     </>}
     {error&&<div className="auth-error" role="alert">{error}</div>}
     <Button type="submit" disabled={busy}>{busy?<Loader2 className="spin"/>:mode==='login'?<LogIn/>:<UserPlus/>}{mode==='login'?'Sign in':'Create account'}</Button>
    </form>
    {registrationOpen&&<div className="auth-switch">{mode==='login'?<>Initial setup: <button type="button" className="auth-link" onClick={()=>{setMode('register');setError('')}}>create the principal administrator</button></>:<>Already have an account? <button type="button" className="auth-link" onClick={()=>{setMode('login');setError('')}}>Sign in</button></>}</div>}
   </>}
  </div>
  <p className="auth-note">Self-hosted account. No external identity or AI provider is used to sign in.</p>
 </div>;
}
