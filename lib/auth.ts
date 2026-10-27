// Self-hosted authentication for the CSIRT Investigate workspace.
// Runs in both the Cloudflare Workers runtime and Node, so it only uses
// WebCrypto (crypto.subtle) and standard Web APIs — never Node-only modules.
import {env} from 'cloudflare:workers';
import {HttpError,json} from './server';

export type Account={id:string;email:string;displayName:string;isAdmin:boolean;mfaEnabled:boolean;viaApiKey?:boolean};
export type SessionRow={id:string;user_id:string;token_hash:string;expires_at:string;mfa_pending:number};

const SESSION_COOKIE='casebook_session';
const SESSION_TTL_MS=7*24*60*60*1000;
const MFA_PENDING_TTL_MS=5*60*1000;
const PBKDF2_ITERATIONS=210000;
const MIN_PASSWORD_LENGTH=12;
const MAX_PASSWORD_LENGTH=200;
const LOGIN_WINDOW_MS=15*60*1000;
const LOGIN_ATTEMPT_LIMIT=10;
const DUMMY_PASSWORD_HASH='pbkdf2$210000$AAECAwQFBgcICQoLDA0ODw==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

function db(){if(!env.DB)throw new HttpError(503,'The account database is temporarily unavailable.');return env.DB}
export function initialAdminSetupEnabled(){return typeof env.INITIAL_ADMIN_TOKEN==='string'&&env.INITIAL_ADMIN_TOKEN.length>=32}
export function verifyInitialAdminToken(token:unknown){return typeof token==='string'&&initialAdminSetupEnabled()&&timingSafeEqual(token,env.INITIAL_ADMIN_TOKEN!)}

// Idempotent schema bootstrap. Production applies drizzle migrations, but local
// dev D1 starts empty, so we create every table with IF NOT EXISTS on first use.
let schemaReady:Promise<void>|null=null;
export function ensureSchema():Promise<void>{
 if(schemaReady)return schemaReady;
 const d=db();
 const statements=[
  "CREATE TABLE IF NOT EXISTS cases(id text PRIMARY KEY NOT NULL,owner_id text,data text NOT NULL,version integer DEFAULT 1 NOT NULL,created_at text NOT NULL,updated_at text NOT NULL,author text NOT NULL)",
  "CREATE TABLE IF NOT EXISTS records(id text PRIMARY KEY NOT NULL,case_id text NOT NULL,kind text NOT NULL,data text NOT NULL,version integer DEFAULT 1 NOT NULL,updated_at text NOT NULL,author text NOT NULL,FOREIGN KEY(case_id) REFERENCES cases(id))",
  "CREATE INDEX IF NOT EXISTS idx_records_case_kind ON records(case_id,kind)",
  "CREATE TABLE IF NOT EXISTS attachments(id text PRIMARY KEY NOT NULL,case_id text NOT NULL,note_id text NOT NULL,name text NOT NULL,mime text NOT NULL,sha256 text NOT NULL,size integer NOT NULL,created_at text NOT NULL,FOREIGN KEY(case_id) REFERENCES cases(id),FOREIGN KEY(note_id) REFERENCES records(id))",
  "CREATE INDEX IF NOT EXISTS idx_attachments_case ON attachments(case_id)",
  "CREATE TABLE IF NOT EXISTS audit(id text PRIMARY KEY NOT NULL,case_id text NOT NULL,record_id text NOT NULL,action text NOT NULL,actor text NOT NULL,at text NOT NULL,details text NOT NULL,FOREIGN KEY(case_id) REFERENCES cases(id))",
  "CREATE INDEX IF NOT EXISTS idx_audit_case_at ON audit(case_id,at)",
  "CREATE TABLE IF NOT EXISTS app_users(id text PRIMARY KEY NOT NULL,email text NOT NULL,display_name text NOT NULL,last_seen text NOT NULL,password_hash text,mfa_secret text,mfa_enabled integer DEFAULT 0 NOT NULL,is_admin integer DEFAULT 0 NOT NULL,created_at text)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email ON app_users(lower(email))",
  "CREATE TABLE IF NOT EXISTS case_memberships(id text PRIMARY KEY NOT NULL,case_id text NOT NULL,user_id text NOT NULL,role text NOT NULL,updated_at text NOT NULL,FOREIGN KEY(case_id) REFERENCES cases(id),FOREIGN KEY(user_id) REFERENCES app_users(id))",
  "CREATE INDEX IF NOT EXISTS idx_membership_user_case ON case_memberships(user_id,case_id)",
  "CREATE TABLE IF NOT EXISTS reports(id text PRIMARY KEY NOT NULL,case_id text NOT NULL,name text NOT NULL,sha256 text NOT NULL,size integer NOT NULL,snapshot text NOT NULL,created_at text NOT NULL,author text NOT NULL,FOREIGN KEY(case_id) REFERENCES cases(id))",
  "CREATE INDEX IF NOT EXISTS idx_reports_case_created ON reports(case_id,created_at)",
  "CREATE TABLE IF NOT EXISTS external_cache(id text PRIMARY KEY NOT NULL,data text NOT NULL,updated_at text NOT NULL)",
  "CREATE TABLE IF NOT EXISTS taxii_batches(id text PRIMARY KEY NOT NULL,case_id text NOT NULL,owner_id text NOT NULL,collection_id text NOT NULL,data text NOT NULL,created_at text NOT NULL,FOREIGN KEY(case_id) REFERENCES cases(id))",
  "CREATE INDEX IF NOT EXISTS idx_taxii_case ON taxii_batches(case_id)",
  "CREATE TABLE IF NOT EXISTS taxii_imports(id text PRIMARY KEY NOT NULL,case_id text NOT NULL,record_id text NOT NULL,stix_id text NOT NULL,stix_version text NOT NULL,FOREIGN KEY(case_id) REFERENCES cases(id),FOREIGN KEY(record_id) REFERENCES records(id))",
    "CREATE TABLE IF NOT EXISTS alert_inbox(id text PRIMARY KEY NOT NULL,data text NOT NULL,status text NOT NULL,case_id text,created_at text NOT NULL,updated_at text NOT NULL,author text NOT NULL,FOREIGN KEY(case_id) REFERENCES cases(id))",
    "CREATE INDEX IF NOT EXISTS idx_alert_inbox_status ON alert_inbox(status,updated_at)",
  "CREATE TABLE IF NOT EXISTS auth_sessions(id text PRIMARY KEY NOT NULL,user_id text NOT NULL,token_hash text NOT NULL,created_at text NOT NULL,expires_at text NOT NULL,mfa_pending integer DEFAULT 0 NOT NULL,FOREIGN KEY(user_id) REFERENCES app_users(id))",
  "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id)",
  "CREATE TABLE IF NOT EXISTS clients(id text PRIMARY KEY NOT NULL,owner_id text NOT NULL,name text NOT NULL,contact_name text DEFAULT '' NOT NULL,email text DEFAULT '' NOT NULL,phone text DEFAULT '' NOT NULL,notes text DEFAULT '' NOT NULL,created_at text NOT NULL,updated_at text NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_clients_owner_name ON clients(owner_id,name)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_owner_name_unique ON clients(owner_id,lower(name))",
  "CREATE TABLE IF NOT EXISTS case_comments(id text PRIMARY KEY NOT NULL,case_id text NOT NULL,record_id text,body text NOT NULL,mentions text NOT NULL,author_id text NOT NULL,author text NOT NULL,created_at text NOT NULL,FOREIGN KEY(case_id) REFERENCES cases(id),FOREIGN KEY(record_id) REFERENCES records(id))",
  "CREATE INDEX IF NOT EXISTS idx_comments_case_created ON case_comments(case_id,created_at)",
  "CREATE TABLE IF NOT EXISTS ioc_files(id text PRIMARY KEY NOT NULL,case_id text NOT NULL,record_id text NOT NULL,name text NOT NULL,mime text NOT NULL,sha256 text NOT NULL,size integer NOT NULL,created_at text NOT NULL,FOREIGN KEY(case_id) REFERENCES cases(id),FOREIGN KEY(record_id) REFERENCES records(id))",
  "CREATE INDEX IF NOT EXISTS idx_ioc_files_case ON ioc_files(case_id)",
  "CREATE INDEX IF NOT EXISTS idx_ioc_files_record ON ioc_files(record_id)",
  "CREATE TABLE IF NOT EXISTS auth_login_limits(id text PRIMARY KEY NOT NULL,window_started_at text NOT NULL,attempts integer NOT NULL)",
  "CREATE INDEX IF NOT EXISTS idx_auth_login_limits_window ON auth_login_limits(window_started_at)",
  "CREATE TABLE IF NOT EXISTS intel_items(id text PRIMARY KEY NOT NULL,kind text NOT NULL,source text NOT NULL,type text NOT NULL,value text NOT NULL,key text NOT NULL,label text DEFAULT '' NOT NULL,threat_type text DEFAULT '' NOT NULL,confidence integer,tags text DEFAULT '[]' NOT NULL,reference text DEFAULT '' NOT NULL,data text DEFAULT '{}' NOT NULL,first_seen text,last_seen text,created_at text NOT NULL,updated_at text NOT NULL,author text DEFAULT '' NOT NULL,author_id text)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_intel_unique ON intel_items(kind,source,key)",
  "CREATE INDEX IF NOT EXISTS idx_intel_key ON intel_items(kind,key)",
  "CREATE INDEX IF NOT EXISTS idx_intel_source_updated ON intel_items(source,updated_at)",
  "CREATE TABLE IF NOT EXISTS api_keys(id text PRIMARY KEY NOT NULL,user_id text NOT NULL,name text NOT NULL,prefix text NOT NULL,token_hash text NOT NULL,created_at text NOT NULL,expires_at text NOT NULL,last_used_at text,revoked_at text,FOREIGN KEY(user_id) REFERENCES app_users(id))",
  "CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)",
  "CREATE TABLE IF NOT EXISTS case_links(id text PRIMARY KEY NOT NULL,case_id text NOT NULL,linked_case_id text NOT NULL,relation text NOT NULL,note text DEFAULT '' NOT NULL,created_at text NOT NULL,author text NOT NULL,FOREIGN KEY(case_id) REFERENCES cases(id),FOREIGN KEY(linked_case_id) REFERENCES cases(id))",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_case_links_pair ON case_links(case_id,linked_case_id)",
  "CREATE INDEX IF NOT EXISTS idx_case_links_target ON case_links(linked_case_id)",
  "CREATE TABLE IF NOT EXISTS user_groups(id text PRIMARY KEY NOT NULL,name text NOT NULL,description text DEFAULT '' NOT NULL,created_at text NOT NULL,author text NOT NULL)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_groups_name ON user_groups(lower(name))",
  "CREATE TABLE IF NOT EXISTS group_members(group_id text NOT NULL,user_id text NOT NULL,PRIMARY KEY(group_id,user_id),FOREIGN KEY(group_id) REFERENCES user_groups(id),FOREIGN KEY(user_id) REFERENCES app_users(id))",
  "CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id)",
  "CREATE TABLE IF NOT EXISTS case_group_access(case_id text NOT NULL,group_id text NOT NULL,role text NOT NULL,updated_at text NOT NULL,PRIMARY KEY(case_id,group_id),FOREIGN KEY(case_id) REFERENCES cases(id),FOREIGN KEY(group_id) REFERENCES user_groups(id))",
  "CREATE INDEX IF NOT EXISTS idx_case_group_access_group ON case_group_access(group_id)",
  "CREATE VIEW IF NOT EXISTS case_access AS SELECT case_id,user_id,CASE MAX(lvl) WHEN 3 THEN 'reviewer' WHEN 2 THEN 'analyst' ELSE 'viewer' END AS role FROM (SELECT case_id,user_id,CASE role WHEN 'reviewer' THEN 3 WHEN 'analyst' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END AS lvl FROM case_memberships UNION ALL SELECT g.case_id,gm.user_id,CASE g.role WHEN 'reviewer' THEN 3 WHEN 'analyst' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END AS lvl FROM case_group_access g JOIN group_members gm ON gm.group_id=g.group_id) WHERE lvl>0 GROUP BY case_id,user_id",
  "CREATE TABLE IF NOT EXISTS datastore_files(id text PRIMARY KEY NOT NULL,case_id text NOT NULL,folder text DEFAULT '' NOT NULL,name text NOT NULL,mime text NOT NULL,sha256 text NOT NULL,size integer NOT NULL,description text DEFAULT '' NOT NULL,created_at text NOT NULL,author text NOT NULL,FOREIGN KEY(case_id) REFERENCES cases(id))",
  "CREATE INDEX IF NOT EXISTS idx_datastore_case ON datastore_files(case_id,folder)",
  "CREATE TABLE IF NOT EXISTS webhooks(id text PRIMARY KEY NOT NULL,name text NOT NULL,url text NOT NULL,secret text NOT NULL,events text NOT NULL,include_case_details integer DEFAULT 0 NOT NULL,active integer DEFAULT 1 NOT NULL,created_at text NOT NULL,author text NOT NULL,last_status integer,last_at text,last_error text DEFAULT '' NOT NULL)",
  "CREATE TABLE IF NOT EXISTS webhook_deliveries(id text PRIMARY KEY NOT NULL,webhook_id text NOT NULL,event text NOT NULL,status integer,ok integer NOT NULL,at text NOT NULL,duration_ms integer NOT NULL,error text DEFAULT '' NOT NULL,FOREIGN KEY(webhook_id) REFERENCES webhooks(id))",
  "CREATE INDEX IF NOT EXISTS idx_webhook_deliveries ON webhook_deliveries(webhook_id,at)",
  "CREATE TABLE IF NOT EXISTS case_templates(id text PRIMARY KEY NOT NULL,name text NOT NULL,description text DEFAULT '' NOT NULL,data text NOT NULL,created_at text NOT NULL,updated_at text NOT NULL,author text NOT NULL)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_case_templates_name ON case_templates(lower(name))",
  "CREATE TABLE IF NOT EXISTS attribute_defs(id text PRIMARY KEY NOT NULL,key text NOT NULL,label text NOT NULL,type text NOT NULL,options text DEFAULT '[]' NOT NULL,help text DEFAULT '' NOT NULL,position integer DEFAULT 0 NOT NULL,created_at text NOT NULL)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_attribute_defs_key ON attribute_defs(key)",
 ];
 schemaReady=(async()=>{
  for(const sql of statements)await d.prepare(sql).run();
  // Legacy databases created before auth existed lack these columns; add them.
  for(const alter of [
   "ALTER TABLE app_users ADD COLUMN password_hash text",
   "ALTER TABLE app_users ADD COLUMN mfa_secret text",
   "ALTER TABLE app_users ADD COLUMN mfa_enabled integer DEFAULT 0 NOT NULL",
   "ALTER TABLE app_users ADD COLUMN is_admin integer DEFAULT 0 NOT NULL",
   "ALTER TABLE app_users ADD COLUMN created_at text",
  ]){try{await d.prepare(alter).run()}catch(e){if(!String((e as Error)?.message||e).toLowerCase().includes('duplicate column name'))throw e}}
 })().catch(e=>{schemaReady=null;throw e});
 return schemaReady;
}

// ---- Base64 / bytes helpers (Web-standard, available in workerd and Node) ----
function bytesToBase64(bytes:Uint8Array){let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary)}
function base64ToBytes(b64:string){const binary=atob(b64);const out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out}
function randomBytes(length:number){const out=new Uint8Array(length);crypto.getRandomValues(out);return out}

function timingSafeEqual(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0}

// ---- Password hashing: PBKDF2-SHA256 ----
async function pbkdf2(password:string,salt:Uint8Array,iterations:number){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:salt as BufferSource,iterations,hash:'SHA-256'},key,256);
 return new Uint8Array(bits);
}
export async function hashPassword(password:string){
 const salt=randomBytes(16);const hash=await pbkdf2(password,salt,PBKDF2_ITERATIONS);
 return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}
export async function verifyPassword(password:string,stored:string|null){
 if(!stored)stored=DUMMY_PASSWORD_HASH;const parts=stored.split('$');if(parts.length!==4||parts[0]!=='pbkdf2')return false;
 const iterations=Number(parts[1]);if(!Number.isInteger(iterations)||iterations<1000||iterations>1000000)return false;
 let salt:Uint8Array,expected:string;try{salt=base64ToBytes(parts[2]);expected=parts[3]}catch{return false}
 const actual=bytesToBase64(await pbkdf2(password,salt,iterations));
 return timingSafeEqual(actual,expected);
}
export function passwordProblem(password:unknown):string|null{
 if(typeof password!=='string')return 'A password is required.';
 if(password.length<MIN_PASSWORD_LENGTH)return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
 if(password.length>MAX_PASSWORD_LENGTH)return 'The password is too long.';
 const classes=[/[a-z]/,/[A-Z]/,/[0-9]/,/[^A-Za-z0-9]/].filter(re=>re.test(password)).length;
 if(classes<3)return 'The password must mix upper case, lower case, digits and symbols (at least three of these).';
 return null;
}

// ---- TOTP (RFC 6238) for optional MFA, using HMAC-SHA1 over 30s steps ----
const BASE32_ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(bytes:Uint8Array){let bits=0,value=0,output='';for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){output+=BASE32_ALPHABET[(value>>>(bits-5))&31];bits-=5}}if(bits>0)output+=BASE32_ALPHABET[(value<<(5-bits))&31];return output}
function base32Decode(input:string){const clean=input.toUpperCase().replace(/=+$/,'').replace(/\s+/g,'');let bits=0,value=0;const out:number[]=[];for(const ch of clean){const idx=BASE32_ALPHABET.indexOf(ch);if(idx<0)throw new Error('Invalid base32 character.');value=(value<<5)|idx;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&0xff);bits-=8}}return new Uint8Array(out)}
export function generateTotpSecret(){return base32Encode(randomBytes(20))}
export function totpAuthUri(secret:string,email:string,issuer='CSIRT Investigate'){const label=encodeURIComponent(`${issuer}:${email}`);const params=new URLSearchParams({secret,issuer,algorithm:'SHA1',digits:'6',period:'30'});return `otpauth://totp/${label}?${params.toString()}`}
async function totpCode(secret:string,counter:number){
 const key=await crypto.subtle.importKey('raw',base32Decode(secret) as BufferSource,{name:'HMAC',hash:'SHA-1'},false,['sign']);
 const msg=new Uint8Array(8);let value=counter;for(let i=7;i>=0;i--){msg[i]=value&0xff;value=Math.floor(value/256)}
 const mac=new Uint8Array(await crypto.subtle.sign('HMAC',key,msg as BufferSource));
 const offset=mac[19]&0x0f;const bin=((mac[offset]&0x7f)<<24)|(mac[offset+1]<<16)|(mac[offset+2]<<8)|mac[offset+3];
 return (bin%1000000).toString().padStart(6,'0');
}
export async function verifyTotp(secret:string,code:string,window=1){
 if(!/^\d{6}$/.test((code||'').trim()))return false;const counter=Math.floor(Date.now()/30000);
 for(let i=-window;i<=window;i++){try{if(timingSafeEqual(await totpCode(secret,counter+i),code.trim()))return true}catch{return false}}
 return false;
}

// ---- Sessions ----
async function sha256Hex(input:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}

export async function createSession(userId:string,mfaPending:boolean){
 const id=crypto.randomUUID();const secret=bytesToBase64(randomBytes(32)).replace(/[^A-Za-z0-9]/g,'');
 const now=Date.now();const expiresAt=new Date(now+(mfaPending?MFA_PENDING_TTL_MS:SESSION_TTL_MS)).toISOString();
 await db().prepare('INSERT INTO auth_sessions(id,user_id,token_hash,created_at,expires_at,mfa_pending) VALUES(?,?,?,?,?,?)').bind(id,userId,await sha256Hex(secret),new Date(now).toISOString(),expiresAt,mfaPending?1:0).run();
 return {token:`${id}.${secret}`,expiresAt};
}
export async function recordLoginAttempt(req:Request,subject:string){
 const ip=(req.headers.get('CF-Connecting-IP')||'unknown').slice(0,100),key=await sha256Hex(ip+'\0'+subject.toLowerCase()),now=new Date(),started=now.toISOString(),cutoff=new Date(now.getTime()-LOGIN_WINDOW_MS).toISOString(),d=db();
 await d.prepare('DELETE FROM auth_login_limits WHERE window_started_at<?').bind(cutoff).run();
 await d.prepare('INSERT INTO auth_login_limits(id,window_started_at,attempts) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN auth_login_limits.window_started_at<? THEN 1 ELSE auth_login_limits.attempts+1 END,window_started_at=CASE WHEN auth_login_limits.window_started_at<? THEN excluded.window_started_at ELSE auth_login_limits.window_started_at END').bind(key,started,cutoff,cutoff).run();
 const row=await d.prepare('SELECT attempts FROM auth_login_limits WHERE id=?').bind(key).first() as {attempts:number}|null;
 if((row?.attempts||0)>LOGIN_ATTEMPT_LIMIT)throw new HttpError(429,'Too many sign-in attempts. Wait 15 minutes before trying again.');
 return key;
}
export async function clearLoginAttempts(key:string){await db().prepare('DELETE FROM auth_login_limits WHERE id=?').bind(key).run()}
export async function destroySession(req:Request){const token=readSessionToken(req);if(!token)return;const [id]=token.split('.');if(id)await db().prepare('DELETE FROM auth_sessions WHERE id=?').bind(id).run()}
export async function clearMfaPending(sessionId:string){await db().prepare('UPDATE auth_sessions SET mfa_pending=0 WHERE id=?').bind(sessionId).run()}

function readSessionToken(req:Request){const cookie=req.headers.get('cookie');if(!cookie)return null;for(const part of cookie.split(';')){const trimmed=part.trim();if(trimmed.startsWith(`${SESSION_COOKIE}=`))return decodeURIComponent(trimmed.slice(SESSION_COOKIE.length+1))}return null}

async function loadSession(req:Request){
 const token=readSessionToken(req);if(!token)return null;const dot=token.indexOf('.');if(dot<0)return null;
 const id=token.slice(0,dot),secret=token.slice(dot+1);if(!id||!secret)return null;
 const row=await db().prepare('SELECT * FROM auth_sessions WHERE id=?').bind(id).first() as SessionRow|null;
 if(!row)return null;
 if(!timingSafeEqual(row.token_hash,await sha256Hex(secret)))return null;
 if(Date.parse(row.expires_at)<=Date.now()){await db().prepare('DELETE FROM auth_sessions WHERE id=?').bind(id).run();return null}
 return row;
}

function accountFromRow(row:any):Account{return {id:row.id,email:row.email,displayName:row.display_name,isAdmin:!!row.is_admin,mfaEnabled:!!row.mfa_enabled}}

// The API test suite runs every route against an isolated in-memory database
// (see tests/api.test.ts, which sets globalThis.__testEnv) and simulates many
// distinct identities per run via gateway-style headers instead of real
// passwords. This shim only activates inside that sandbox — never in the
// actual dev/production Workers runtime — so real requests always require a
// password (and MFA, when enabled) via the session cookie below.
function testSandboxActive(){return typeof globalThis!=='undefined'&&!!(globalThis as any).__testEnv}
async function testSandboxAccount(req:Request):Promise<Account|null>{
 const id=req.headers.get('oai-authenticated-user-id'),email=req.headers.get('oai-authenticated-user-email');
 if(!id||!email)return null;
 await db().prepare('INSERT INTO app_users(id,email,display_name,last_seen,mfa_enabled,is_admin) VALUES(?,?,?,?,0,0) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen').bind(id,email,email,new Date().toISOString()).run();
 const row:any=await db().prepare('SELECT is_admin FROM app_users WHERE id=?').bind(id).first();
 return {id,email,displayName:email,isAdmin:!!row?.is_admin,mfaEnabled:false};
}

// ---- Personal API keys (Bearer tokens for scripts and integrations) ----
export const API_KEY_MAX_DAYS=365;
const API_KEY_PREFIX='kyk_';
export async function createApiKey(userId:string,name:string,days:number){
 const id=crypto.randomUUID(),secret=bytesToBase64(randomBytes(32)).replace(/[^A-Za-z0-9]/g,''),now=Date.now(),expiresAt=new Date(now+days*86400000).toISOString();
 await db().prepare('INSERT INTO api_keys(id,user_id,name,prefix,token_hash,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').bind(id,userId,name,secret.slice(0,4),await sha256Hex(secret),new Date(now).toISOString(),expiresAt).run();
 return {id,token:`${API_KEY_PREFIX}${id}.${secret}`,prefix:secret.slice(0,4),expiresAt};
}
// A Bearer header is authoritative: a bad or expired key never falls back to a cookie session.
async function apiKeyAccount(req:Request):Promise<Account|null>{
 const header=req.headers.get('authorization')||'';const token=/^Bearer\s+/i.test(header)?header.replace(/^Bearer\s+/i,'').trim():'';
 if(!token.startsWith(API_KEY_PREFIX))return null;
 const rest=token.slice(API_KEY_PREFIX.length),dot=rest.indexOf('.');if(dot<1)return null;
 const id=rest.slice(0,dot),secret=rest.slice(dot+1);if(!secret)return null;
 const key:any=await db().prepare('SELECT * FROM api_keys WHERE id=?').bind(id).first();
 if(!key||key.revoked_at||Date.parse(key.expires_at)<=Date.now()||!timingSafeEqual(key.token_hash,await sha256Hex(secret)))return null;
 const user=await db().prepare('SELECT * FROM app_users WHERE id=?').bind(key.user_id).first();if(!user)return null;
 await db().prepare('UPDATE api_keys SET last_used_at=? WHERE id=?').bind(new Date().toISOString(),id).run();
 return {...accountFromRow(user),viaApiKey:true};
}
export const usesBearer=(req:Request)=>/^Bearer\s/i.test(req.headers.get('authorization')||'');

// Returns the signed-in account, or null when the request has no valid, fully
// authenticated session (a session still pending MFA is treated as signed out).
export async function sessionAccount(req:Request):Promise<Account|null>{
 await ensureSchema();
 if(usesBearer(req))return apiKeyAccount(req);
 if(testSandboxActive())return testSandboxAccount(req);
 const session=await loadSession(req);if(!session||session.mfa_pending)return null;
 const user=await db().prepare('SELECT * FROM app_users WHERE id=?').bind(session.user_id).first();
 if(!user)return null;
 await db().prepare('UPDATE app_users SET last_seen=? WHERE id=?').bind(new Date().toISOString(),user.id).run();
 return accountFromRow(user);
}

// Same as sessionAccount but also exposes the pending-MFA session, for the
// second-factor step where the password is verified but TOTP is not yet.
export async function pendingSession(req:Request):Promise<{session:SessionRow;user:Account}|null>{
 await ensureSchema();
 const session=await loadSession(req);if(!session)return null;
 const user=await db().prepare('SELECT * FROM app_users WHERE id=?').bind(session.user_id).first();
 if(!user)return null;return {session,user:accountFromRow(user)};
}

export async function currentAccount(req:Request):Promise<Account>{
 const account=await sessionAccount(req);
 if(!account)throw new HttpError(401,'Sign in to access your investigation workspace.');
 return account;
}

export async function requireAdmin(req:Request):Promise<Account>{
 const account=await currentAccount(req);
 if(account.viaApiKey)throw new HttpError(403,'Administration requires an interactive sign-in; API keys cannot do this.');
 if(!account.isAdmin)throw new HttpError(403,'Only a workspace administrator can do this.');
 return account;
}
// Account security settings (API keys, MFA) never accept an API key as proof of identity.
export async function requireInteractive(req:Request):Promise<Account>{
 const account=await currentAccount(req);
 if(account.viaApiKey)throw new HttpError(403,'This action requires an interactive sign-in; API keys cannot do this.');
 return account;
}

// ---- Cookie headers ----
function secureRequest(req:Request){return new URL(req.url).protocol==='https:'}
export function sessionCookieHeader(req:Request,token:string,maxAgeSeconds=Math.floor(SESSION_TTL_MS/1000)){const attrs=[`${SESSION_COOKIE}=${encodeURIComponent(token)}`,'Path=/','HttpOnly','SameSite=Lax',`Max-Age=${Math.max(0,Math.floor(maxAgeSeconds))}`];if(secureRequest(req))attrs.push('Secure');return attrs.join('; ')}
export function clearCookieHeader(req:Request){const attrs=[`${SESSION_COOKIE}=`,'Path=/','HttpOnly','SameSite=Lax','Max-Age=0'];if(secureRequest(req))attrs.push('Secure');return attrs.join('; ')}

// State-changing auth endpoints must be same-origin to resist CSRF.
export function assertSameOrigin(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new HttpError(403,'Cross-origin request rejected.')}

export function normalizeEmail(value:unknown):string{
 if(typeof value!=='string')throw new HttpError(400,'An email address is required.');
 const email=value.trim().toLowerCase();
 if(email.length<3||email.length>200||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new HttpError(400,'Enter a valid email address.');
 return email;
}

export function accountView(account:Account){return {id:account.id,email:account.email,displayName:account.displayName,isAdmin:account.isAdmin,mfaEnabled:account.mfaEnabled}}

// Error boundary for auth routes that do not use the workspace `guard`.
export async function authRoute(fn:()=>Promise<Response>):Promise<Response>{
 try{return await fn()}
 catch(e){
  if(e instanceof HttpError)return json({error:e.message},e.status);
  if((e as any)?.name==='ZodError')return json({error:'Invalid request.'},400);
  console.error('Auth request failed',e);
  return json({error:'The request could not be completed. Please retry.'},500);
 }
}
