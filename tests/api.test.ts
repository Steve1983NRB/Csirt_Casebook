import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {zipSync,strToU8} from 'fflate';
import {revisionHash,sha256,parseArchive} from '../lib/archive';
import {newsSources} from '../lib/news';
import {readiness} from '../lib/model';
const require=createRequire(import.meta.resolve('tsx'));const {build}=require('esbuild');
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const migration of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+migration,'utf8'));
let failAudit=false;
function prepare(query:string){let bindings:any[]=[];const execute=()=>{if(failAudit&&query.startsWith('INSERT INTO audit'))throw new Error('Injected audit failure');const stmt=sql.prepare(query);if(query.trim().startsWith('SELECT'))return {results:stmt.all(...bindings),success:true,meta:{changes:0}};const r=stmt.run(...bindings);return {results:[],success:true,meta:{changes:Number(r.changes)}}};return {bind(...args:any[]){bindings=args;return this},async first(){return execute().results[0]||null},async all(){return execute()},async run(){return execute()},execute}}
const DB={prepare,async batch(items:any[]){sql.exec('BEGIN');try{const result=items.map(s=>s.execute());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
const objects=new Map<string,Uint8Array>();
const BUCKET={async put(key:string,input:string|Uint8Array){objects.set(key,typeof input==='string'?strToU8(input):new Uint8Array(input))},async get(key:string){const bytes=objects.get(key);return bytes?{body:bytes,arrayBuffer:async()=>bytes.buffer}:null},async delete(keys:string|string[]){for(const key of typeof keys==='string'?[keys]:keys)objects.delete(key)}};
(globalThis as any).__testEnv={DB,BUCKET};
const result=await build({entryPoints:['tests/api-entry.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'test-env',setup(b:any){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'environment',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__testEnv;'}))}}]});
const api=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
function emailFor(user:string){return user==='test-actor'?'analyst@test.invalid':user==='analyst'?'analyst-member@test.invalid':user+'@test.invalid'}
function request(path:string,method='GET',data?:any,auth=true,origin='https://test.local',user='test-actor'){return new Request('https://test.local/api/'+path,{method,headers:{...(auth?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':emailFor(user)}:{}),'Origin':origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined})}
const value=async(r:Response)=>({status:r.status,body:await r.json() as any});
let caseId='',assetId='',noteId='';
test('API enforces sign-in and same-origin writes',async()=>{assert.equal((await api.cases.GET(request('cases','GET',undefined,false))).status,401);assert.equal((await api.cases.POST(request('cases','POST',{},true,'https://other.invalid'))).status,403)});
test('initial administrator setup requires a configured one-time secret',async()=>{const environment=(globalThis as any).__testEnv;environment.INITIAL_ADMIN_TOKEN='a'.repeat(48);const make=(bootstrapToken:string)=>new Request('https://test.local/api/auth/register',{method:'POST',headers:{origin:'https://test.local','content-type':'application/json','cf-connecting-ip':'192.0.2.9'},body:JSON.stringify({email:'first-admin@test.invalid',displayName:'First Admin',password:'StrongPass123!abc',bootstrapToken})});assert.equal((await api.register.POST(make('incorrect'))).status,403);const created=await api.register.POST(make(environment.INITIAL_ADMIN_TOKEN));assert.equal(created.status,201);assert.equal((await value(created)).body.user.isAdmin,true);assert.equal((await value(await api.authSession.GET(request('auth/session','GET',undefined,false)))).body.registrationOpen,false)});
test('sign-in attempts are limited per client and account',async()=>{const make=()=>new Request('https://test.local/api/auth/login',{method:'POST',headers:{origin:'https://test.local','content-type':'application/json','cf-connecting-ip':'192.0.2.10'},body:JSON.stringify({email:'missing-user@test.invalid',password:'NotThePassword123!'})});for(let i=0;i<10;i++)assert.equal((await api.login.POST(make())).status,401);assert.equal((await api.login.POST(make())).status,429)});
test('creates persisted investigations with audit entries',async()=>{const r=await value(await api.cases.POST(request('cases','POST',{title:'QA',reference:'CASE-1',client:'Test client',date:'2026-09-14'})));assert.equal(r.status,201);caseId=r.body.id;assert.ok((sql.prepare("SELECT COUNT(*) AS n FROM audit WHERE case_id=? AND action='case.created'").get(caseId) as any).n===1);assert.ok((sql.prepare('SELECT COUNT(*) AS n FROM audit WHERE case_id=?').get(caseId) as any).n>1);const cases=await value(await api.cases.GET(request('cases')));assert.equal(cases.body[0].reference,'CASE-1')});
test('persists asset and validated note references',async()=>{let r=await value(await api.records.POST(request('records','POST',{caseId,kind:'asset',data:{name:'Host one',type:'Windows'}})));assert.equal(r.status,201);assetId=r.body.id;r=await value(await api.records.POST(request('records','POST',{caseId,kind:'note',data:{title:'Observation',assetId,category:'Evidence of Execution',content:"Quoted text '; DROP TABLE cases; --",status:'Validated',source:'Event record 14',include:true}})));assert.equal(r.status,201);noteId=r.body.id;assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM cases').get() as any).n,1)});
test('rejects orphan or cross-case links and source-free validation',async()=>{let r=await api.records.POST(request('records','POST',{caseId,kind:'note',data:{title:'Unsupported',category:'Other',status:'Validated'}}));assert.equal(r.status,400);const c=await value(await api.cases.POST(request('cases','POST',{title:'Other case',reference:'CASE-2',client:'Other',date:'2026-09-14'})));r=await api.records.POST(request('records','POST',{caseId:c.body.id,kind:'note',data:{title:'Wrong asset',assetId,category:'Other'}}));assert.equal(r.status,400)});
test('rejects mismatched normalized/original timestamps',async()=>{const r=await api.records.POST(request('records','POST',{caseId,kind:'event',data:{title:'Bad time',occurredAt:'2026-09-14T10:00:00Z',originalTimestamp:'2026-09-14T10:00:00+02:00',source:'Log'}}));assert.equal(r.status,400)});
test('integration connection checks are read-only and never expose credentials',async()=>{
 const environment=(globalThis as any).__testEnv,originalFetch=globalThis.fetch;
 const names=['SOCRADAR_PREMIUM_FEEDS_API_KEY','SOCRADAR_COMPANY_ID','MISP_API_ROOT','MISP_API_KEY','TAXII_API_ROOT','TAXII_TOKEN','ABUSECH_AUTH_KEY'];
 const previous=Object.fromEntries(names.map(name=>[name,environment[name]]));
 try{
  for(const name of names)delete environment[name];
  let result=await value(await api.integrationCheck.POST(request('integrations/check','POST',{})));
  assert.equal(result.status,200);assert.ok(result.body.results.every((entry:any)=>entry.status==='not-configured'));
  Object.assign(environment,{SOCRADAR_PREMIUM_FEEDS_API_KEY:'socradar-secret',SOCRADAR_COMPANY_ID:'15881',MISP_API_ROOT:'https://misp.example.org/misp/',MISP_API_KEY:'misp-secret',TAXII_API_ROOT:'https://opencti.example.org/root/',TAXII_TOKEN:'taxii-secret',ABUSECH_AUTH_KEY:'abusech-secret'});
  let rejectSocradar=false;
  globalThis.fetch=async(input:any,init:any)=>{
   const url=new URL(input);
   if(url.hostname==='platform.socradar.com')return rejectSocradar?Response.json({message:'Rejected socradar-secret'},{status:401}):Response.json([{uuid:'feed-1',name:'Test feed'}]);
   if(url.hostname==='misp.example.org'){assert.equal(init.headers.Authorization,'misp-secret');return Response.json([])}
   if(url.hostname==='opencti.example.org'){
    if(url.pathname.endsWith('/collections/'))return new Response(JSON.stringify({collections:[{id:'collection-1',title:'Test collection',can_read:true}]}),{headers:{'content-type':'application/taxii+json;version=2.1'}});
    return new Response(JSON.stringify({title:'Test TAXII',versions:['application/taxii+json;version=2.1']}),{headers:{'content-type':'application/taxii+json;version=2.1'}});
   }
   assert.equal(url.hostname,'threatfox-api.abuse.ch');assert.equal(init.headers['Auth-Key'],'abusech-secret');
   return Response.json({query_status:'no_result',data:[]});
  };
  result=await value(await api.integrationCheck.POST(request('integrations/check','POST',{})));
  assert.equal(result.status,200);assert.ok(result.body.results.every((entry:any)=>entry.status==='connected'));
  const serialized=JSON.stringify(result.body);for(const secret of ['socradar-secret','misp-secret','taxii-secret','abusech-secret'])assert.ok(!serialized.includes(secret));
  rejectSocradar=true;result=await value(await api.integrationCheck.POST(request('integrations/check','POST',{})));
  const failedSocradar=result.body.results.find((entry:any)=>entry.id==='socradar');assert.equal(failedSocradar.status,'failed');assert.match(failedSocradar.message,/redacted/);assert.ok(!JSON.stringify(result.body).includes('socradar-secret'));
 }finally{
  globalThis.fetch=originalFetch;
  for(const name of names){if(previous[name]===undefined)delete environment[name];else environment[name]=previous[name]}
 }
});
test('links a timeline event to its source evidence record',async()=>{const evidence=await value(await api.records.POST(request('records','POST',{caseId,kind:'evidence',data:{name:'WIN-SERVER-01.E01',assetId}})));assert.equal(evidence.status,201);const r=await value(await api.records.POST(request('records','POST',{caseId,kind:'event',data:{title:'Process execution',assetId,evidenceId:evidence.body.id,occurredAt:'2026-09-14T10:00:00Z',originalTimestamp:'2026-09-14T10:00:00Z',source:'Evidence register'}})));assert.equal(r.status,201);assert.equal(r.body.data.evidenceId,evidence.body.id)});
test('optimistic concurrency rejects stale updates without new audit events',async()=>{const data={name:'Renamed host',type:'Windows'};let r=await api.recordItem.PUT(request('records/'+assetId,'PUT',{version:1,data}),{params:Promise.resolve({id:assetId})});assert.equal(r.status,200);const before=(sql.prepare('SELECT COUNT(*) AS n FROM audit').get() as any).n;r=await api.recordItem.PUT(request('records/'+assetId,'PUT',{version:1,data:{...data,name:'Stale overwrite'}}),{params:Promise.resolve({id:assetId})});assert.equal(r.status,409);assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM audit').get() as any).n,before);assert.equal(JSON.parse((sql.prepare('SELECT data FROM records WHERE id=?').get(assetId) as any).data).name,'Renamed host')});
test('audit failure rolls back a write instead of reporting partial persistence',async()=>{failAudit=true;const oldError=console.error;console.error=()=>{};try{const r=await api.recordItem.PUT(request('records/'+assetId,'PUT',{version:2,data:{name:'Must not persist',type:'Windows'}}),{params:Promise.resolve({id:assetId})});assert.equal(r.status,503);assert.equal((sql.prepare('SELECT version FROM records WHERE id=?').get(assetId) as any).version,2)}finally{failAudit=false;console.error=oldError}});
test('case snapshot returns persisted entries and auditable before/after changes',async()=>{const r=await value(await api.caseItem.GET(request('cases/'+caseId),{params:Promise.resolve({id:caseId})}));assert.equal(r.status,200);assert.ok(r.body.entries.some((e:any)=>e.id===noteId));assert.ok(r.body.audit.some((e:any)=>JSON.parse(e.details).before?.name==='Host one'))});
const ctx=(id:string)=>({params:Promise.resolve({id})});
const asUser=(user:string,path:string,method='GET',data?:any)=>request(path,method,data,true,'https://test.local',user);
function rawRequest(path:string,bytes:Uint8Array,user='test-actor',extra:Record<string,string>={}){return new Request('https://test.local/api/'+path,{method:'POST',headers:{'oai-authenticated-user-id':user,'oai-authenticated-user-email':emailFor(user),'origin':'https://test.local','content-type':'application/zip',...extra},body:bytes as Uint8Array<ArrayBuffer>})}
const getSnapshot=async(id=caseId)=> (await value(await api.caseItem.GET(request('cases/'+id),ctx(id)))).body;
const grant=async(userId:string,role:string)=>(await api.members.POST(request('cases/'+caseId+'/members','POST',{userId,role}),ctx(caseId)));
let attachmentId='',reportId='';
const png=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=','base64'));
async function upload(user='test-actor'){const form=new FormData();form.set('noteId',noteId);form.set('file',new File([png],'capture.png',{type:'image/png'}));return api.attachments.POST(new Request('https://test.local/api/attachments',{method:'POST',headers:{'oai-authenticated-user-id':user,'oai-authenticated-user-email':emailFor(user),'origin':'https://test.local'},body:form}))}
test('unassigned users cannot enumerate, read or change another case',async()=>{
 const listing=await value(await api.cases.GET(asUser('outsider','cases')));assert.deepEqual(listing.body,[]);
 assert.equal((await api.caseItem.GET(asUser('outsider','cases/'+caseId),ctx(caseId))).status,404);
 assert.equal((await api.records.POST(asUser('outsider','records','POST',{caseId,kind:'asset',data:{name:'Denied',type:'Windows'}}))).status,404);
 assert.equal((await api.recordItem.PUT(asUser('outsider','records/'+noteId,'PUT',{version:1,data:{}}),ctx(noteId))).status,404);
});
test('membership changes require the owner and a registered workspace identity',async()=>{
 assert.equal((await grant('unregistered','analyst')).status,400);
 for(const user of ['analyst','reviewer','viewer'])assert.equal((await api.users.GET(asUser(user,'users'))).status,200);
 assert.equal((await grant('analyst','analyst')).status,200);assert.equal((await grant('reviewer','reviewer')).status,200);assert.equal((await grant('viewer','viewer')).status,200);
 assert.equal((await api.members.POST(asUser('analyst','cases/'+caseId+'/members','POST',{userId:'outsider',role:'reviewer'}),ctx(caseId))).status,403);
 assert.equal((await api.users.GET(asUser('analyst','users?caseId='+caseId))).status,403);
 assert.equal((await grant('test-actor','viewer')).status,400);
});
test('role capabilities govern read, write, validation, archives and case closure',async()=>{
 const view=await value(await api.caseItem.GET(asUser('viewer','cases/'+caseId),ctx(caseId)));assert.equal(view.status,200);assert.equal(view.body.permissions.canWrite,false);
 assert.equal((await api.records.POST(asUser('viewer','records','POST',{caseId,kind:'asset',data:{name:'Denied',type:'Windows'}}))).status,403);
 assert.equal((await api.caseItem.GET(asUser('reviewer','cases/'+caseId+'?archive=1'),ctx(caseId))).status,403);
 for(const [kind,data] of [['note',{title:'No approval',category:'Other',status:'Validated',source:'Log'}],['event',{title:'No approval',occurredAt:'2026-09-15T10:00:00Z',originalTimestamp:'2026-09-15T10:00:00Z',source:'Log',status:'Confirmed'}],['ioc',{type:'Domain',value:'example.invalid',include:true}],['asset',{name:'Host',type:'Windows',compromised:true}]])assert.equal((await api.records.POST(asUser('analyst','records','POST',{caseId,kind,data}))).status,403);
 const c=view.body.case;assert.equal((await api.caseItem.PUT(asUser('analyst','cases/'+caseId,'PUT',{version:c.version,data:{...c,status:'Closed'}}),ctx(caseId))).status,403);
});
test('analyst edits to reviewed findings require renewed review',async()=>{
 const s=await getSnapshot(),n=s.entries.find((e:any)=>e.id===noteId);
 let r=await value(await api.recordItem.PUT(asUser('analyst','records/'+noteId,'PUT',{version:n.version,data:{...n.data,content:'Analyst amendment'}}),ctx(noteId)));assert.equal(r.status,200);assert.equal(r.body.data.status,'Draft');
 r=await value(await api.recordItem.PUT(asUser('reviewer','records/'+noteId,'PUT',{version:r.body.version,data:{...r.body.data,status:'Validated'}}),ctx(noteId)));assert.equal(r.status,200);assert.equal(r.body.data.status,'Validated');
});
test('screenshot uploads hash stored bytes and analyst additions invalidate approval',async()=>{
 const before=(await getSnapshot()).entries.find((e:any)=>e.id===noteId);const r=await value(await upload('analyst'));assert.equal(r.status,201);attachmentId=r.body.id;assert.equal(r.body.sha256,await sha256(png));assert.deepEqual(objects.get(attachmentId),png);
 const after=(await getSnapshot()).entries.find((e:any)=>e.id===noteId);assert.equal(after.data.status,'Draft');assert.equal(after.version,before.version+1);
 assert.equal((await api.attachmentItem.GET(asUser('outsider','attachments/'+attachmentId),ctx(attachmentId))).status,404);
 assert.equal((await api.attachmentItem.GET(asUser('viewer','attachments/'+attachmentId),ctx(attachmentId))).status,200);
 assert.equal((await upload('viewer')).status,403);
});
test('revocation removes previously granted read access',async()=>{
 assert.equal((await api.members.DELETE(request('cases/'+caseId+'/members','DELETE',{userId:'viewer'}),ctx(caseId))).status,200);
 assert.equal((await api.caseItem.GET(asUser('viewer','cases/'+caseId),ctx(caseId))).status,404);
 assert.equal((await api.attachmentItem.GET(asUser('viewer','attachments/'+attachmentId),ctx(attachmentId))).status,404);
});
test('legacy cases bind once to stable user ID and remain accessible after an email change',async()=>{
 const id=crypto.randomUUID();sql.prepare('INSERT INTO cases(id,data,created_at,updated_at,author) VALUES(?,?,?,?,?)').run(id,JSON.stringify({title:'Legacy',reference:'LEGACY'}),'now','now','analyst@test.invalid');
 assert.equal((await api.caseItem.GET(request('cases/'+id),ctx(id))).status,200);assert.equal((sql.prepare('SELECT owner_id FROM cases WHERE id=?').get(id) as any).owner_id,'test-actor');
 const req=request('cases/'+id);req.headers.set('oai-authenticated-user-email','renamed@test.invalid');assert.equal((await api.caseItem.GET(req,ctx(id))).status,200);
 const other=asUser('outsider','cases/'+id);other.headers.set('oai-authenticated-user-email','analyst@test.invalid');assert.equal((await api.caseItem.GET(other,ctx(id))).status,404);
});
async function archiveFixture(){const snapshot=await getSnapshot();const files:Record<string,Uint8Array>={'case.json':strToU8(JSON.stringify({format:'csirt-casebook',version:1,...snapshot}))};for(const a of snapshot.attachments)files['screenshots/'+a.id+(a.mime==='image/png'?'.png':'.jpg')]=objects.get(a.id)!;return {snapshot,files,bytes:zipSync(files)}}
test('restoration preserves content and screenshot integrity while remapping relationships and ownership',async()=>{
 const fixture=await archiveFixture(),before=(sql.prepare('SELECT COUNT(*) AS n FROM cases').get() as any).n;
 const r=await value(await api.restore.POST(rawRequest('cases/restore',fixture.bytes,'restorer')));assert.equal(r.status,201);assert.notEqual(r.body.id,caseId);assert.equal(r.body.status,'Open');
 const restored=await value(await api.caseItem.GET(asUser('restorer','cases/'+r.body.id),ctx(r.body.id)));assert.equal(restored.body.permissions.role,'owner');assert.equal(restored.body.entries.length,fixture.snapshot.entries.length);
 const note=restored.body.entries.find((e:any)=>e.kind==='note'),asset=restored.body.entries.find((e:any)=>e.kind==='asset');assert.notEqual(note.id,noteId);assert.equal(note.data.assetId,asset.id);assert.equal(restored.body.attachments[0].noteId,note.id);assert.equal(restored.body.attachments[0].sha256,await sha256(png));assert.deepEqual(objects.get(restored.body.attachments[0].id),png);
 assert.ok(restored.body.audit.some((a:any)=>a.action==='archive.history'));assert.ok(restored.body.audit.some((a:any)=>a.action==='case.restored'));
 assert.equal((await api.caseItem.GET(asUser('analyst','cases/'+r.body.id),ctx(r.body.id))).status,404);assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM cases').get() as any).n,before+1);assert.equal((await getSnapshot()).case.title,fixture.snapshot.case.title);
});
test('tampered screenshots, missing relationships and oversized ZIPs fail before case writes',async()=>{
 const fixture=await archiveFixture(),before=(sql.prepare('SELECT COUNT(*) AS n FROM cases').get() as any).n;
 const badImage={...fixture.files,['screenshots/'+attachmentId+'.png']:new Uint8Array([...png,1])};assert.equal((await api.restore.POST(rawRequest('cases/restore',zipSync(badImage)))).status,400);
 const changed=structuredClone(fixture.snapshot);changed.entries.find((e:any)=>e.kind==='note').data.assetId=crypto.randomUUID();const badRefs={...fixture.files,'case.json':strToU8(JSON.stringify({format:'csirt-casebook',version:1,...changed}))};assert.equal((await api.restore.POST(rawRequest('cases/restore',zipSync(badRefs)))).status,400);
 await assert.rejects(()=>parseArchive(zipSync({'case.json':new Uint8Array(9*1024*1024)})),/expanded archive/);
 assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM cases').get() as any).n,before);
});
test('failed restoration rolls back all database rows and removes staged objects',async()=>{
 const f=await archiveFixture(),before=(sql.prepare('SELECT COUNT(*) AS n FROM cases').get() as any).n,keys=[...objects.keys()].sort();failAudit=true;const oldError=console.error;console.error=()=>{};
 try{assert.equal((await api.restore.POST(rawRequest('cases/restore',f.bytes))).status,503);assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM cases').get() as any).n,before);assert.deepEqual([...objects.keys()].sort(),keys)}finally{failAudit=false;console.error=oldError}
});
test('archiving Word requires a reviewer and the exact current source revision',async()=>{
 const s=await getSnapshot(),docx=new Uint8Array(readFileSync('public/CSIRT_Template_Report.docx')),headers={'X-Case-Revision':await revisionHash(s)};
 assert.equal((await api.reports.POST(rawRequest('cases/'+caseId+'/reports',docx,'analyst',headers),ctx(caseId))).status,403);
 assert.equal((await api.reports.POST(rawRequest('cases/'+caseId+'/reports',docx,'reviewer',{'X-Case-Revision':'stale'}),ctx(caseId))).status,409);
 const r=await value(await api.reports.POST(rawRequest('cases/'+caseId+'/reports',docx,'reviewer',headers),ctx(caseId)));assert.equal(r.status,201);reportId=r.body.id;assert.equal(r.body.sha256,await sha256(docx));assert.deepEqual(objects.get(reportId),docx);
 const source=await value(await api.reportItem.GET(request('reports/'+reportId+'?source=1'),ctx(reportId)));assert.equal(source.status,200);assert.equal(source.body.case.id,caseId);assert.equal(await revisionHash(source.body),headers['X-Case-Revision']);
 assert.equal((await api.reportItem.GET(asUser('outsider','reports/'+reportId),ctx(reportId))).status,404);assert.equal((await api.reportItem.GET(request('reports/'+reportId),ctx(reportId))).status,200);
 assert.ok((await getSnapshot()).reports.some((r:any)=>r.id===reportId));
});
test('archived reports keep their source snapshot after subsequent case edits',async()=>{
 const old=JSON.parse(new TextDecoder().decode(objects.get(reportId+'.json'))),s=await getSnapshot();const r=await api.caseItem.PUT(request('cases/'+caseId,'PUT',{version:s.case.version,data:{...s.case,summary:'A later summary'}}),ctx(caseId));assert.equal(r.status,200);
 const source=await value(await api.reportItem.GET(request('reports/'+reportId+'?source=1'),ctx(reportId)));assert.equal(source.body.case.version,old.case.version);assert.equal(source.body.case.summary,old.case.summary);assert.notEqual((await getSnapshot()).case.version,old.case.version);
});
test('TTP mapping validates canonical taxonomy, evidence links and reviewer boundaries',async()=>{
 const data={techniqueId:'T1059.001',name:'Invented',tactics:'Wrong tactic',rationale:'PowerShell execution observed in the linked note.',sourceNoteIds:[noteId],assetId,include:true,domain:'enterprise'};
 const r=await value(await api.records.POST(asUser('reviewer','records','POST',{caseId,kind:'technique',data})));assert.equal(r.status,201);assert.equal(r.body.data.name,'PowerShell');assert.equal(r.body.data.attackVersion,'19.2');assert.deepEqual(r.body.data.sourceNoteIds,[noteId]);assert.equal(r.body.data.tactics,'Execution');
 const atlas=await value(await api.records.POST(asUser('reviewer','records','POST',{caseId,kind:'technique',data:{...data,techniqueId:'AML.T0000',name:'Untrusted',domain:'atlas',include:false}})));assert.equal(atlas.status,201);assert.equal(atlas.body.data.name,'Search Open Technical Databases');assert.equal(atlas.body.data.attackVersion,'2026.09');assert.equal(atlas.body.data.domain,'atlas');
 assert.equal((await api.records.POST(asUser('analyst','records','POST',{caseId,kind:'technique',data}))).status,403);
 assert.equal((await api.records.POST(request('records','POST',{caseId,kind:'technique',data:{...data,sourceNoteIds:[]}}))).status,400);
 assert.equal((await api.records.POST(request('records','POST',{caseId,kind:'technique',data:{...data,sourceNoteIds:[crypto.randomUUID()]}}))).status,400);
 assert.equal((await api.records.POST(request('records','POST',{caseId,kind:'technique',data:{...data,techniqueId:'T9999'}}))).status,400);
 const archive=await archiveFixture(),restored=await value(await api.restore.POST(rawRequest('cases/restore',archive.bytes))),s=await getSnapshot(restored.body.id),mapping=s.entries.find((e:any)=>e.kind==='technique'),note=s.entries.find((e:any)=>e.kind==='note');assert.deepEqual(mapping.data.sourceNoteIds,[note.id]);
});
test('TAXII imports use server-staged objects, deduplicate and preserve read-only source provenance',async()=>{
 const environment=(globalThis as any).__testEnv;assert.equal((await value(await api.taxiiStatus.GET(request('taxii/status')))).body.configured,false);environment.TAXII_API_ROOT='https://opencti.example.com/root/';environment.TAXII_TOKEN='server-only-secret';const originalFetch=globalThis.fetch;
 const stix={type:'indicator',id:'indicator--12345678-1234-4234-8234-123456789012',name:'Observed domain',modified:'2026-09-15T00:00:00Z',pattern_type:'stix',pattern:"[domain-name:value = 'example.org']"};globalThis.fetch=async(url:any,init:any)=>{assert.equal(init.headers.Authorization,'Bearer server-only-secret');return Response.json({objects:[stix],more:false})};
 try{
  const denied=await api.caseTaxii.POST(asUser('analyst','cases/'+caseId+'/taxii','POST',{action:'preview',collectionId:'research'}),ctx(caseId));assert.equal(denied.status,403);
  const status=await value(await api.taxiiStatus.GET(request('taxii/status')));assert.ok(!JSON.stringify(status.body).includes('server-only-secret'));
  const preview=await value(await api.caseTaxii.POST(request('cases/'+caseId+'/taxii','POST',{action:'preview',collectionId:'research'}),ctx(caseId)));assert.equal(preview.status,200);assert.equal(preview.body.objects[0].supported,true);
  const body={action:'import',batchId:preview.body.batchId,objectIds:[stix.id]};let imported=await value(await api.caseTaxii.POST(request('cases/'+caseId+'/taxii','POST',body),ctx(caseId)));assert.equal(imported.status,200);assert.equal(imported.body.imported,1);
  imported=await value(await api.caseTaxii.POST(request('cases/'+caseId+'/taxii','POST',body),ctx(caseId)));assert.equal(imported.body.imported,0);assert.equal(imported.body.skipped,1);
    const entry=(await getSnapshot()).entries.find((e:any)=>e.data.externalSource?.stixId===stix.id);assert.equal(entry.data.include,false);assert.equal(entry.data.value,'example.org');assert.equal(JSON.parse(entry.data.externalSource.rawObject).pattern,stix.pattern);
  assert.equal((await api.records.POST(request('records','POST',{caseId,kind:'ioc',data:entry.data}))).status,400);
  const edited=await value(await api.recordItem.PUT(request('records/'+entry.id,'PUT',{version:entry.version,data:{...entry.data,externalSource:{...entry.data.externalSource,stixId:'forged'}}}),ctx(entry.id)));assert.equal(edited.status,200);assert.equal(edited.body.data.externalSource.stixId,stix.id);
  assert.equal((await api.caseTaxii.POST(request('cases/'+caseId+'/taxii','POST',{...body,objectIds:['indicator--12345678-1234-4234-8234-123456789099']}),ctx(caseId))).status,400);
  sql.prepare('UPDATE taxii_batches SET created_at=? WHERE id=?').run('2020-01-01T00:00:00Z',preview.body.batchId);assert.equal((await api.caseTaxii.POST(request('cases/'+caseId+'/taxii','POST',body),ctx(caseId))).status,410);
 }finally{globalThis.fetch=originalFetch;delete environment.TAXII_API_ROOT;delete environment.TAXII_TOKEN}
});
test('MISP read-only integration previews selected events and imports deduplicated IOC drafts',async()=>{
 const environment=(globalThis as any).__testEnv,originalFetch=globalThis.fetch;
 assert.equal((await value(await api.mispStatus.GET(request('misp/status')))).body.configured,false);
 environment.MISP_API_ROOT='https://misp.example.org/misp/';environment.MISP_API_KEY='misp-server-secret';
 const event={Event:{id:'42',uuid:'11111111-1111-4111-8111-111111111111',info:'Threat research',date:'2026-10-01',Orgc:{name:'CERT'},Attribute:[
  {id:'5',uuid:'22222222-2222-4222-8222-222222222222',type:'domain',value:'malware.example',category:'Network activity',to_ids:true,comment:'C2',Tag:[{name:'tlp:amber'}]},
  {id:'6',uuid:'33333333-3333-4333-8333-333333333333',type:'email-src',value:'analyst@example.org',category:'Payload delivery',to_ids:true}
 ]}};
 globalThis.fetch=async(url:any,init:any)=>{
  assert.equal(new URL(url).hostname,'misp.example.org');assert.equal(init.headers.Authorization,'misp-server-secret');assert.equal(init.redirect,'manual');
  if(new URL(url).pathname.endsWith('/events/restSearch'))return Response.json([{Event:{id:'42',uuid:event.Event.uuid,info:event.Event.info,date:event.Event.date,Orgc:event.Event.Orgc}}]);
  return Response.json(event);
 };
 try{
  const status=await value(await api.mispStatus.GET(request('misp/status')));assert.equal(status.body.configured,true);assert.ok(!JSON.stringify(status.body).includes('misp-server-secret'));
  assert.equal((await api.caseMisp.GET(asUser('analyst','cases/'+caseId+'/misp'),ctx(caseId))).status,403);
  const list=await value(await api.caseMisp.GET(request('cases/'+caseId+'/misp'),ctx(caseId)));assert.equal(list.status,200);assert.equal(list.body.events[0].id,'42');
  const preview=await value(await api.caseMisp.POST(request('cases/'+caseId+'/misp','POST',{action:'preview',eventId:'42'}),ctx(caseId)));assert.equal(preview.status,200);assert.equal(preview.body.attributes[0].localType,'Domain');assert.equal(preview.body.attributes[1].supported,false);
  const data={action:'import',eventId:'42',attributeUuids:['22222222-2222-4222-8222-222222222222']};
  let imported=await value(await api.caseMisp.POST(request('cases/'+caseId+'/misp','POST',data),ctx(caseId)));assert.equal(imported.status,200);assert.equal(imported.body.created,1);assert.equal(imported.body.reviewState,'draft');
  imported=await value(await api.caseMisp.POST(request('cases/'+caseId+'/misp','POST',data),ctx(caseId)));assert.equal(imported.body.created,0);assert.equal(imported.body.skipped,1);
  const row=(await getSnapshot()).entries.find((entry:any)=>entry.data.externalSource?.attributeUuid==='22222222-2222-4222-8222-222222222222');
  assert.equal(row.data.value,'malware.example');assert.equal(row.data.include,false);assert.equal(row.data.externalSource.provider,'MISP');assert.equal(JSON.parse(row.data.externalSource.rawAttribute).comment,'C2');
  assert.equal((await api.caseMisp.POST(request('cases/'+caseId+'/misp','POST',{...data,attributeUuids:['33333333-3333-4333-8333-333333333333']}),ctx(caseId))).status,400);
  assert.equal((await api.caseMisp.POST(request('cases/'+caseId+'/misp','POST',{...data,attributeUuids:['44444444-4444-4444-8444-444444444444']}),ctx(caseId))).status,400);
 }finally{globalThis.fetch=originalFetch;delete environment.MISP_API_ROOT;delete environment.MISP_API_KEY}
});
test('RSS server caches successful feeds and retains explicit stale data on source failures',async()=>{
 const originalFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('<rss><channel><item><title>Forensic report</title><link>https://dfir.ch/research/</link><description>Field analysis</description></item></channel></rss>',{headers:{'Content-Type':'application/rss+xml'}})};
 try{let r=await value(await api.news.GET(request('news')));assert.equal(r.status,200);assert.equal(r.body.feeds.length,newsSources.length);assert.ok(r.body.feeds.every((f:any)=>f.status==='current'));assert.equal(calls,newsSources.length);await api.news.GET(request('news'));assert.equal(calls,newsSources.length);
  sql.prepare("UPDATE external_cache SET updated_at='2020-01-01T00:00:00Z' WHERE id LIKE 'rss:%'").run();globalThis.fetch=async()=>new Response('Unavailable',{status:503});r=await value(await api.news.GET(request('news')));assert.ok(r.body.feeds.every((f:any)=>f.status==='stale'));assert.ok(r.body.articles.length>0);assert.ok(r.body.feeds.every((f:any)=>f.lastSuccessAt));
 }finally{globalThis.fetch=originalFetch}
});

test('news invalidates legacy failures, exposes an aggregate outage and retries failures after one minute',async()=>{
 const originalFetch=globalThis.fetch,originalWarn=console.warn;console.warn=()=>{};let calls=0;
 try{
  const now=new Date().toISOString();
  for(const source of newsSources)sql.prepare('INSERT INTO external_cache(id,data,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run('rss:'+source.id,JSON.stringify({...source,status:'unavailable',articles:[],error:'Invalid redirect value'}),now);
  globalThis.fetch=async()=>{calls++;return new Response('Unavailable',{status:503});};
  let r=await value(await api.news.GET(request('news')));assert.equal(r.status,502);assert.equal(calls,newsSources.length);assert.equal(r.body.articles.length,0);assert.match(r.body.error,/Source errors/);assert.ok(r.body.feeds.every((f:any)=>f.error==='Feed returned HTTP 503.'));
  await api.news.GET(request('news?refresh=1'));assert.equal(calls,newsSources.length);
  sql.prepare("UPDATE external_cache SET updated_at=? WHERE id LIKE 'rss:%'").run(new Date(Date.now()-61000).toISOString());
  globalThis.fetch=async()=>{calls++;return new Response('<rss><channel><item><title>Restored feed</title><link>https://dfir.ch/restored/</link></item></channel></rss>');};
  r=await value(await api.news.GET(request('news')));assert.equal(r.status,200);assert.equal(calls,newsSources.length*2);assert.ok(r.body.feeds.every((f:any)=>f.status==='current'));
  assert.equal((await api.news.GET(request('news','GET',undefined,false))).status,401);assert.equal(calls,newsSources.length*2);
 }finally{globalThis.fetch=originalFetch;console.warn=originalWarn;}
});

test('news cache failures do not discard successfully fetched publisher articles',async()=>{
 const originalFetch=globalThis.fetch,originalWarn=console.warn,environment=(globalThis as any).__testEnv;console.warn=()=>{};
 try{
  environment.DB={...DB,prepare(query:string){if(query.includes('external_cache'))throw new Error('Cache unavailable');return DB.prepare(query)}};
  globalThis.fetch=async()=>new Response('<rss><channel><item><title>Live result</title><link>https://dfir.ch/live/</link></item></channel></rss>');
  const r=await value(await api.news.GET(request('news')));assert.equal(r.status,200);assert.ok(r.body.articles.length);assert.ok(r.body.feeds.every((f:any)=>f.status==='current'&&f.cacheWarning));
 }finally{environment.DB=DB;globalThis.fetch=originalFetch;console.warn=originalWarn;}
});
test('client profiles, case-member mentions and uploaded IOC files are access controlled',async()=>{
 const owner='feature-owner',caseResponse=await value(await api.cases.POST(asUser(owner,'cases','POST',{title:'Feature validation',reference:'FEATURE-1',client:'Feature client',date:'2026-10-16'})));
 assert.equal(caseResponse.status,201);const id=caseResponse.body.id;
 const directory=await value(await api.clients.GET(asUser(owner,'clients')));assert.ok(directory.body.some((c:any)=>c.name==='Feature client'));
 const client=directory.body.find((c:any)=>c.name==='Feature client');
 const saved=await value(await api.clientItem.PUT(asUser(owner,'clients/'+client.id,'PUT',{contactName:'Incident lead',email:'lead@example.test',phone:'+1 555 0100',notes:'Preferred escalation path.'}),ctx(client.id)));
 assert.equal(saved.status,200);assert.equal(saved.body.contactName,'Incident lead');
 const invalid=await api.comments.POST(asUser(owner,'cases/'+id+'/comments','POST',{body:'Please review @outside@example.test'}),ctx(id));assert.equal(invalid.status,400);
 const comment=await value(await api.comments.POST(asUser(owner,'cases/'+id+'/comments','POST',{body:'Please review @feature-owner@test.invalid'}),ctx(id)));
 assert.equal(comment.status,201);assert.deepEqual(comment.body.mentions,['feature-owner@test.invalid']);
 const indicator=await value(await api.records.POST(asUser(owner,'records','POST',{caseId:id,kind:'ioc',data:{type:'Domain',value:'sample.example.test',description:'Test attachment'}})));
 assert.equal(indicator.status,201);
 const form=new FormData();form.set('recordId',indicator.body.id);form.set('file',new File([strToU8('IOC sample')],'sample.bin',{type:'application/octet-stream'}));
 const uploadResult=await value(await api.iocFiles.POST(new Request('https://test.local/api/ioc-files',{method:'POST',headers:{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':owner+'@test.invalid',origin:'https://test.local'},body:form})));
 assert.equal(uploadResult.status,201);assert.match(uploadResult.body.sha256,/^[a-f0-9]{64}$/);
 const downloadResult=await api.iocFile.GET(asUser(owner,'ioc-files/'+uploadResult.body.id),ctx(uploadResult.body.id));assert.equal(downloadResult.status,200);assert.equal(await downloadResult.text(),'IOC sample');
 assert.equal((await api.iocFile.GET(asUser('feature-outsider','ioc-files/'+uploadResult.body.id),ctx(uploadResult.body.id))).status,404);
});

test('threat intel library: manual entries, case matching and deletion rules',async()=>{
 const owner='intel-owner',other='intel-other';
 const c=await value(await api.cases.POST(asUser(owner,'cases','POST',{title:'Intel case',reference:'INTEL-1',client:'Intel client',date:'2026-10-16'})));const id=c.body.id;
 for(const v of ['198.51.100.7','evil.example.test','https://payload.example.test/a.exe'])assert.equal((await api.records.POST(asUser(owner,'records','POST',{caseId:id,kind:'ioc',data:{type:v.startsWith('http')?'URL':v.startsWith('198')?'IP':'Domain',value:v,description:''}}))).status,201);
 const added=await value(await api.intel.POST(asUser(owner,'intel','POST',{kind:'indicator',values:['198[.]51[.]100[.]7','payload[.]example[.]test','nomatch.example.test'],label:'Test campaign',tags:['ransomware']})));
 assert.equal(added.status,201);assert.equal(added.body.created,3);
 const list=await value(await api.intel.GET(asUser(owner,'intel?kind=indicator&q=198.51.100.7')));assert.equal(list.body.total,1);assert.equal(list.body.items[0].type,'IP');
 const hits=await value(await api.caseIntel.GET(asUser(owner,'cases/'+id+'/intel'),ctx(id)));assert.equal(hits.body.checked,3);assert.deepEqual(hits.body.matches.map((m:any)=>m.value).sort(),['198.51.100.7','https://payload.example.test/a.exe']);
 assert.equal((await api.caseIntel.GET(asUser(other,'cases/'+id+'/intel'),ctx(id))).status,404);
 const actor=await value(await api.intel.POST(asUser(owner,'intel','POST',{kind:'actor',name:'TEST-GROUP',techniques:['T1486','AML.T0051'],country:'XX'})));assert.equal(actor.status,201);
 assert.equal((await api.intel.POST(asUser(owner,'intel','POST',{kind:'actor',name:'Bad',techniques:['nope']}))).status,400);
 assert.equal((await api.intelItem.DELETE(asUser(other,'intel/'+actor.body.items[0].id,'DELETE'),ctx(actor.body.items[0].id))).status,403);
 assert.equal((await api.intelItem.DELETE(asUser(owner,'intel/'+actor.body.items[0].id,'DELETE'),ctx(actor.body.items[0].id))).status,200);
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response('# Feodo\n[]');
  const feeds=await value(await api.intelFeeds.GET(asUser(owner,'intel/feeds')));assert.equal(feeds.status,200);assert.ok(feeds.body.feeds.length>=4);
  assert.equal((await api.intelFeeds.POST(asUser(owner,'intel/feeds','POST',{feed:'does-not-exist'}))).status,404);
 }finally{globalThis.fetch=original}
});

test('demo ransomware case populates every section and generates both reports',async()=>{
 const {seedDemoCase,DEMO_REFERENCE}=await import('../scripts/demo-case');
 const user='demo-owner';
 const route=(method:string,path:string):[any,string[]]=>{
  const [p]=path.split('?'),s=p.split('/'),id=s[1];
  if(s[0]==='cases'&&!id)return [api.cases,[]];
  if(s[0]==='cases'&&s[2]==='comments')return [api.comments,[id]];
  if(s[0]==='cases'&&s[2]==='members')return [api.members,[id]];
  if(s[0]==='cases'&&s[2]==='reports')return [api.reports,[id]];
  if(s[0]==='cases')return [api.caseItem,[id]];
  if(s[0]==='records'&&id)return [api.recordItem,[id]];
  if(s[0]==='alerts'&&id)return [api.alertItem,[id]];
  const table:any={records:api.records,attachments:api.attachments,'ioc-files':api.iocFiles,clients:api.clients,alerts:api.alerts,users:api.users,intel:api.intel};
  return [table[s[0]],[]];
 };
 const call=async(method:string,path:string,init:any={})=>{
  const [module,[id]]=route(method,path);
  const headers:Record<string,string>={'oai-authenticated-user-id':user,'oai-authenticated-user-email':emailFor(user),origin:'https://test.local',...init.headers};
  let body:any;if(init.json!==undefined){body=JSON.stringify(init.json);headers['content-type']='application/json'}else if(init.form)body=init.form;else if(init.raw)body=init.raw;
  const response=await module[method](new Request('https://test.local/api/'+path,{method,headers,body}),{params:Promise.resolve({id})});
  const text=await response.text();let parsed:any=text;try{parsed=JSON.parse(text)}catch{}
  return {status:response.status,body:parsed};
 };
 const {caseId}=await seedDemoCase(call,{email:emailFor(user)});
 const s=(await call('GET','cases/'+caseId)).body;
 const count=(kind:string)=>s.entries.filter((e:any)=>e.kind===kind).length;
 for(const kind of ['asset','note','event','evidence','ioc','identity','technique','action'])assert.ok(count(kind)>=3,kind);
 assert.equal(s.case.reference,DEMO_REFERENCE);assert.ok(s.attachments.length>=3);assert.ok(s.iocFiles.length>=1);assert.ok((await call('GET',`cases/${caseId}/comments`)).body.length>=5);assert.equal(s.reports.length,2);
 assert.equal((await call('GET','intel?kind=indicator&q=nightharvest&limit=50')).body.total,0);
 assert.equal((await call('GET','intel?kind=actor&q=nightharvest&limit=50')).body.total,0);
 assert.ok(readiness(s).every(r=>r.ok));
 const alerts=(await call('GET','alerts')).body.alerts;assert.ok(alerts.some((a:any)=>a.caseId===caseId));
 assert.equal((await call('GET','cases')).body.filter((c:any)=>c.reference===DEMO_REFERENCE).length,1);
 await assert.rejects(()=>seedDemoCase(call,{email:emailFor(user)}),/already exists/);
});

const makeAdmin=async(user:string)=>{await api.cases.GET(asUser(user,'cases'));sql.prepare('UPDATE app_users SET is_admin=1 WHERE id=?').run(user)};
const mkCase=async(user:string,reference:string)=>(await value(await api.cases.POST(asUser(user,'cases','POST',{title:reference,reference,client:'Ext client',date:'2026-10-01'})))).body.id as string;
const bearer=(token:string,path:string,method='GET',data?:any)=>new Request('https://test.local/api/'+path,{method,headers:{authorization:'Bearer '+token,origin:'https://test.local','content-type':'application/json'},body:data?JSON.stringify(data):undefined});

test('API keys authenticate as their owner, expire, revoke and cannot manage accounts',async()=>{
 const owner='key-owner',created=await value(await api.apiKeys.POST(asUser(owner,'auth/api-keys','POST',{name:'ci',days:30})));
 assert.equal(created.status,201);assert.match(created.body.token,/^kyk_/);
 const list=await value(await api.apiKeys.GET(asUser(owner,'auth/api-keys')));assert.ok(!JSON.stringify(list.body).includes(created.body.token));assert.equal(list.body.keys.length,1);
 const own=await mkCase(owner,'KEY-OWN');
 const viaKey=await value(await api.cases.GET(bearer(created.body.token,'cases')));assert.equal(viaKey.status,200);assert.ok(viaKey.body.some((c:any)=>c.id===own));
 const other=await value(await api.cases.GET(bearer(created.body.token,'cases')));assert.ok(!other.body.some((c:any)=>c.reference==='DEMO-DLH-2026-001'));
 assert.equal((await api.cases.GET(bearer(created.body.token+'x','cases'))).status,401);
 assert.equal((await api.cases.GET(bearer('kyk_nope.nope','cases'))).status,401);
 assert.equal((await api.apiKeys.POST(bearer(created.body.token,'auth/api-keys','POST',{name:'escalate'}))).status,403);
 await makeAdmin(owner);assert.equal((await api.groups.POST(bearer(created.body.token,'groups','POST',{name:'Key-made group'}))).status,403);
 assert.equal((await api.apiKeyItem.DELETE(asUser('someone-else','auth/api-keys/'+created.body.id,'DELETE'),ctx(created.body.id))).status,404);
 assert.equal((await api.apiKeyItem.DELETE(asUser(owner,'auth/api-keys/'+created.body.id,'DELETE'),ctx(created.body.id))).status,200);
 assert.equal((await api.cases.GET(bearer(created.body.token,'cases'))).status,401);
 const expiring=await value(await api.apiKeys.POST(asUser(owner,'auth/api-keys','POST',{name:'short',days:1})));sql.prepare("UPDATE api_keys SET expires_at='2020-01-01T00:00:00.000Z' WHERE id=?").run(expiring.body.id);
 assert.equal((await api.cases.GET(bearer(expiring.body.token,'cases'))).status,401);
 assert.equal((await api.apiKeys.POST(asUser(owner,'auth/api-keys','POST',{name:'x',days:9999}))).status,400);
});

test('case links are symmetric, access-checked and never reveal inaccessible cases',async()=>{
 const a=await mkCase('link-a','LNK-A'),b=await mkCase('link-a','LNK-B'),hidden=await mkCase('link-hidden','LNK-HIDDEN');
 assert.equal((await api.caseLinks.POST(asUser('link-a','cases/'+a+'/links','POST',{linkedCaseId:hidden,relation:'related'}),ctx(a))).status,404);
 assert.equal((await api.caseLinks.POST(asUser('link-a','cases/'+a+'/links','POST',{linkedCaseId:a}),ctx(a))).status,400);
 const ok=await value(await api.caseLinks.POST(asUser('link-a','cases/'+a+'/links','POST',{linkedCaseId:b,relation:'same-actor',note:'Same crew'}),ctx(a)));assert.equal(ok.status,201);
 assert.equal((await api.caseLinks.POST(asUser('link-a','cases/'+b+'/links','POST',{linkedCaseId:a}),ctx(b))).status,409);
 const fromA=(await value(await api.caseLinks.GET(asUser('link-a','cases/'+a+'/links'),ctx(a)))).body.links,fromB=(await value(await api.caseLinks.GET(asUser('link-a','cases/'+b+'/links'),ctx(b)))).body.links;
 assert.equal(fromA[0].direction,'outgoing');assert.equal(fromB[0].direction,'incoming');assert.equal(fromB[0].case.reference,'LNK-A');
 sql.prepare('INSERT INTO case_links(id,case_id,linked_case_id,relation,note,created_at,author) VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),a,hidden,'related','',new Date().toISOString(),'x');
 assert.ok(!(await value(await api.caseLinks.GET(asUser('link-a','cases/'+a+'/links'),ctx(a)))).body.links.some((l:any)=>l.case.reference==='LNK-HIDDEN'));
 assert.equal((await api.caseLinks.DELETE(asUser('link-a','cases/'+a+'/links','DELETE',{linkId:ok.body.id}),ctx(a))).status,200);
 assert.equal((await value(await api.caseLinks.GET(asUser('link-a','cases/'+b+'/links'),ctx(b)))).body.links.length,0);
});

test('group grants give members case access at the highest role and disappear when revoked',async()=>{
 const admin='grp-admin',member='grp-member',bystander='grp-bystander';await makeAdmin(admin);await api.cases.GET(asUser(member,'cases'));await api.cases.GET(asUser(bystander,'cases'));
 const caseId=await mkCase(admin,'GRP-CASE');
 assert.equal((await api.groups.POST(asUser(member,'groups','POST',{name:'Blue team'}))).status,403);
 const group=await value(await api.groups.POST(asUser(admin,'groups','POST',{name:'Blue team'})));assert.equal(group.status,201);
 assert.equal((await api.groups.POST(asUser(admin,'groups','POST',{name:'blue TEAM'}))).status,409);
 assert.equal((await api.groupMembers.POST(asUser(admin,'groups/'+group.body.id+'/members','POST',{userId:member}),ctx(group.body.id))).status,201);
 assert.equal((await api.caseItem.GET(asUser(member,'cases/'+caseId),ctx(caseId))).status,404);
 assert.equal((await api.caseGroups.POST(asUser(member,'cases/'+caseId+'/groups','POST',{groupId:group.body.id,role:'analyst'}),ctx(caseId))).status,404);
 assert.equal((await api.caseGroups.POST(asUser(admin,'cases/'+caseId+'/groups','POST',{groupId:group.body.id,role:'viewer'}),ctx(caseId))).status,200);
 const read=await value(await api.caseItem.GET(asUser(member,'cases/'+caseId),ctx(caseId)));assert.equal(read.status,200);assert.equal(read.body.permissions.canWrite,false);
 assert.equal((await api.caseItem.GET(asUser(bystander,'cases/'+caseId),ctx(caseId))).status,404);
 assert.ok((await value(await api.cases.GET(asUser(member,'cases')))).body.some((c:any)=>c.id===caseId));
 await api.members.POST(asUser(admin,'cases/'+caseId+'/members','POST',{userId:member,role:'reviewer'}),ctx(caseId));
 assert.equal((await value(await api.caseItem.GET(asUser(member,'cases/'+caseId),ctx(caseId)))).body.permissions.canReview,true);
 await api.members.DELETE(asUser(admin,'cases/'+caseId+'/members','DELETE',{userId:member}),ctx(caseId));
 assert.equal((await value(await api.caseItem.GET(asUser(member,'cases/'+caseId),ctx(caseId)))).body.permissions.canWrite,false);
 assert.equal((await api.caseGroups.DELETE(asUser(admin,'cases/'+caseId+'/groups','DELETE',{groupId:group.body.id}),ctx(caseId))).status,200);
 assert.equal((await api.caseItem.GET(asUser(member,'cases/'+caseId),ctx(caseId))).status,404);
 assert.equal((await api.groupItem.DELETE(asUser(admin,'groups/'+group.body.id,'DELETE'),ctx(group.body.id))).status,200);
});

test('datastore stores hashed files per case, downloads them as opaque attachments and enforces access',async()=>{
 const owner='ds-owner',caseId=await mkCase(owner,'DS-CASE'),content=new TextEncoder().encode('<script>alert(1)</script>');
 const upload=(user:string,name='note.html')=>{const form=new FormData();form.set('file',new File([content],name,{type:'text/html'}));form.set('folder','Triage');form.set('description','Sample');return new Request('https://test.local/api/cases/'+caseId+'/datastore',{method:'POST',headers:{'oai-authenticated-user-id':user,'oai-authenticated-user-email':emailFor(user),origin:'https://test.local'},body:form})};
 const made=await value(await api.caseDatastore.POST(upload(owner),ctx(caseId)));assert.equal(made.status,201);assert.equal(made.body.sha256,await sha256(content));assert.equal(made.body.folder,'Triage');
 assert.equal((await api.caseDatastore.POST(upload('ds-outsider'),ctx(caseId))).status,404);
 const download=await api.datastoreItem.GET(asUser(owner,'datastore/'+made.body.id),ctx(made.body.id));assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'application/octet-stream');assert.match(download.headers.get('content-disposition')||'',/^attachment/);assert.match(download.headers.get('content-security-policy')||'',/sandbox/);assert.equal(await download.text(),'<script>alert(1)</script>');
 assert.equal((await api.datastoreItem.GET(asUser('ds-outsider','datastore/'+made.body.id),ctx(made.body.id))).status,404);
 assert.equal((await value(await api.caseDatastore.GET(asUser(owner,'cases/'+caseId+'/datastore'),ctx(caseId)))).body.files.length,1);
 assert.equal((await api.datastoreItem.DELETE(asUser(owner,'datastore/'+made.body.id,'DELETE'),ctx(made.body.id))).status,200);
 assert.equal((await api.datastoreItem.GET(asUser(owner,'datastore/'+made.body.id),ctx(made.body.id))).status,404);
 assert.ok((sql.prepare("SELECT COUNT(*) AS n FROM audit WHERE case_id=? AND action LIKE 'datastore.%'").get(caseId) as any).n>=2);
});

test('webhook URLs are restricted, payloads are signed and minimal, and failures never break requests',async()=>{
 const {assertSafeWebhookUrl,deliver,signPayload,emitWebhook}=api.webhookLib;
 for(const bad of ['http://example.com/h','https://localhost/h','https://127.0.0.1/h','https://10.0.0.5/h','https://192.168.1.2/h','https://169.254.169.254/latest','https://[::1]/h','https://user:pw@example.com/h','https://example.com:8443/h','https://intranet/h','https://db.internal/h','https://2130706433/h','not a url'])assert.throws(()=>assertSafeWebhookUrl(bad),bad);
 assert.doesNotThrow(()=>assertSafeWebhookUrl('https://hooks.example.com/csirt'));
 let seen:any=null;const transport=async(url:any,init:any)=>{seen={url,init};return new Response(null,{status:204})};
 const result=await deliver({id:'h',url:'https://hooks.example.com/csirt',secret:'s3cret'},'case.created',{caseId:'1'},transport as any);assert.equal(result.ok,true);assert.equal(seen.init.redirect,'manual');
 assert.equal(seen.init.headers['X-CSIRT-Signature'],await signPayload('s3cret',seen.init.headers['X-CSIRT-Timestamp'],seen.init.body));
 assert.equal((await deliver({id:'h',url:'https://hooks.example.com/x',secret:'s'},'e',{},(async()=>new Response('',{status:302}))as any)).ok,false);
 assert.equal((await deliver({id:'h',url:'https://hooks.example.com/x',secret:'s'},'e',{},(async()=>{throw new Error('boom')})as any)).error,'boom');
 const admin='hook-admin';await makeAdmin(admin);
 assert.equal((await api.webhooks.POST(asUser('hook-user','webhooks','POST',{name:'x',url:'https://hooks.example.com/a',events:['case.created']}))).status,403);
 assert.equal((await api.webhooks.POST(asUser(admin,'webhooks','POST',{name:'x',url:'http://hooks.example.com/a',events:['case.created']}))).status,400);
 const hook=await value(await api.webhooks.POST(asUser(admin,'webhooks','POST',{name:'SIEM',url:'https://hooks.example.com/a',events:['case.created']})));assert.equal(hook.status,201);assert.equal(hook.body.secret.length,64);
 assert.ok(!JSON.stringify((await value(await api.webhooks.GET(asUser(admin,'webhooks')))).body).includes(hook.body.secret));
 const sent:any[]=[];const capture=async(url:any,init:any)=>{sent.push(JSON.parse(init.body));return new Response('',{status:200})};
 const DBlike={prepare:(q:string)=>({bind:(...a:any[])=>({all:async()=>({results:sql.prepare(q).all(...a)}),run:async()=>sql.prepare(q).run(...a),first:async()=>sql.prepare(q).get(...a)}),all:async()=>({results:sql.prepare(q).all()})})};
 await emitWebhook(DBlike as any,'case.created',{caseId:'c1',reference:'R1',title:'Secret title',client:'Secret client'},capture as any);
 assert.equal(sent.length,1);assert.equal(sent[0].data.caseId,'c1');assert.equal(sent[0].data.title,undefined);assert.equal(sent[0].data.client,undefined);
 await emitWebhook(DBlike as any,'record.created',{caseId:'c1'},capture as any);assert.equal(sent.length,1);
 assert.ok((sql.prepare('SELECT COUNT(*) AS n FROM webhook_deliveries WHERE webhook_id=?').get(hook.body.id) as any).n>=1);
 assert.equal((await api.cases.POST(asUser(admin,'cases','POST',{title:'Hooked',reference:'HOOK-1',client:'C',date:'2026-10-01'}))).status,201);
 assert.equal((await api.webhookItem.DELETE(asUser(admin,'webhooks/'+hook.body.id,'DELETE'),ctx(hook.body.id))).status,200);
});

test('custom fields and case templates apply to new cases and are validated',async()=>{
 const admin='attr-admin';await makeAdmin(admin);
 assert.equal((await api.attributes.POST(asUser('attr-user','attributes','POST',{label:'BU',key:'business_unit',type:'text'}))).status,403);
 assert.equal((await api.attributes.POST(asUser(admin,'attributes','POST',{label:'Bad',key:'Bad Key',type:'text'}))).status,400);
 assert.equal((await api.attributes.POST(asUser(admin,'attributes','POST',{label:'Choice',key:'choice',type:'select'}))).status,400);
 for(const def of [{label:'Business unit',key:'business_unit',type:'select',options:['Retail','HR']},{label:'Affected users',key:'affected_users',type:'number'},{label:'Regulator notified',key:'regulator_notified',type:'boolean'}])assert.equal((await api.attributes.POST(asUser(admin,'attributes','POST',def))).status,201);
 assert.equal((await api.attributes.POST(asUser(admin,'attributes','POST',{label:'Dup',key:'business_unit',type:'text'}))).status,409);
 const base={title:'Attr case',reference:'ATTR-1',client:'C',date:'2026-10-01'};
 assert.equal((await api.cases.POST(asUser(admin,'cases','POST',{...base,attributes:{business_unit:'Finance'}}))).status,400);
 assert.equal((await api.cases.POST(asUser(admin,'cases','POST',{...base,attributes:{affected_users:'lots'}}))).status,400);
 const good=await value(await api.cases.POST(asUser(admin,'cases','POST',{...base,attributes:{business_unit:'HR',affected_users:'1900',regulator_notified:true,unknown_field:'dropped'}})));assert.equal(good.status,201);assert.deepEqual(good.body.attributes,{business_unit:'HR',affected_users:1900,regulator_notified:true});
 assert.equal((await api.templates.POST(asUser('attr-user','templates','POST',{name:'T',data:{}}))).status,403);
 const template=await value(await api.templates.POST(asUser(admin,'templates','POST',{name:'Ransomware first response',description:'Standard',data:{incidentType:'Ransomware',priority:'P1',tlp:'TLP:RED',playbook:'ransomware',tags:['ransomware'],actions:[{title:'Notify the DPO',priority:'High'}]}})));assert.equal(template.status,201);
 assert.equal((await api.templates.POST(asUser(admin,'templates','POST',{name:'ransomware FIRST response',data:{}}))).status,409);
 const fromTemplate=await value(await api.cases.POST(asUser(admin,'cases','POST',{...base,reference:'ATTR-2',templateId:template.body.id})));assert.equal(fromTemplate.status,201);
 const snap=(await value(await api.caseItem.GET(asUser(admin,'cases/'+fromTemplate.body.id),ctx(fromTemplate.body.id)))).body;assert.ok(snap.entries.some((e:any)=>e.kind==='action'&&e.data.title==='Notify the DPO'));
 assert.equal((await api.cases.POST(asUser(admin,'cases','POST',{...base,reference:'ATTR-3',templateId:crypto.randomUUID()}))).status,400);
 assert.equal((await api.templateItem.DELETE(asUser(admin,'templates/'+template.body.id,'DELETE'),ctx(template.body.id))).status,200);
});

test('threat intel matches cover every accessible open case and exclude closed or hidden ones',async()=>{
 const owner='match-owner',open=await mkCase(owner,'MATCH-OPEN'),closed=await mkCase(owner,'MATCH-CLOSED'),hidden=await mkCase('match-hidden','MATCH-HIDDEN');
 for(const [id,value,type] of [[open,'203.0.113.99','IP'],[open,'https://evil-host.invalid/payload','URL'],[closed,'203.0.113.99','IP'],[hidden,'203.0.113.99','IP']] as const)assert.equal((await api.records.POST(asUser(id===hidden?'match-hidden':owner,'records','POST',{caseId:id,kind:'ioc',data:{type,value,include:true}}))).status,201);
 const closedGet=(await value(await api.caseItem.GET(asUser(owner,'cases/'+closed),ctx(closed)))).body;await api.caseItem.PUT(asUser(owner,'cases/'+closed,'PUT',{version:closedGet.case.version,data:{...closedGet.case,status:'Closed'}}),ctx(closed));
 await api.intel.POST(asUser(owner,'intel','POST',{kind:'indicator',value:'203.0.113.99',label:'Test C2',tags:['t']}));await api.intel.POST(asUser(owner,'intel','POST',{kind:'indicator',value:'evil-host.invalid',label:'Bad host'}));
 const result=(await value(await api.intelMatches.GET(asUser(owner,'intel/matches')))).body;
 const refs=result.cases.map((c:any)=>c.reference);assert.ok(refs.includes('MATCH-OPEN'));assert.ok(!refs.includes('MATCH-CLOSED'));assert.ok(!refs.includes('MATCH-HIDDEN'));
 const row=result.cases.find((c:any)=>c.reference==='MATCH-OPEN');assert.equal(row.matches.length,2);assert.ok(row.matches.some((m:any)=>m.hits.some((h:any)=>h.via==='host')));
 const single=(await value(await api.caseIntel.GET(asUser(owner,'cases/'+open+'/intel'),ctx(open)))).body;assert.equal(single.matches.length,2);
 assert.equal((await api.caseIntel.GET(asUser('match-hidden','cases/'+open+'/intel'),ctx(open))).status,404);
});
