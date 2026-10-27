import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.resolve('tsx'));
const {build}=require('esbuild');
function d1(sqlite:DatabaseSync){
 return {prepare(query:string){let bindings:any[]=[];const execute=()=>{const statement=sqlite.prepare(query);if(query.trimStart().toUpperCase().startsWith('SELECT'))return {results:statement.all(...bindings),meta:{changes:0}};const result=statement.run(...bindings);return {results:[],meta:{changes:Number(result.changes)}}};return {bind(...args:any[]){bindings=args;return this},async first(){return execute().results[0]||null},async all(){return execute()},async run(){return execute()}}}};
}
test('fresh local D1 bootstrap creates collaboration, IOC and rate-limit tables',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 (globalThis as any).__testEnv={DB:d1(sqlite)};
 try{
  const result=await build({entryPoints:['tests/auth-schema-entry.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'test-env',setup(b:any){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'environment',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__testEnv;'}))}}]});
  const auth=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  await auth.ensureSchema();
  const tables=new Set((sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(x=>x.name));
  for(const table of ['clients','case_comments','ioc_files','auth_login_limits','intel_items','api_keys','case_links','user_groups','group_members','case_group_access','datastore_files','webhooks','webhook_deliveries','case_templates','attribute_defs'])assert.ok(tables.has(table),`missing ${table}`);
  assert.ok(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='view' AND name='case_access'").get(),'missing view case_access');
  const indexes=new Set((sqlite.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as {name:string}[]).map(x=>x.name));
  for(const index of ['idx_clients_owner_name_unique','idx_comments_case_created','idx_ioc_files_case','idx_auth_login_limits_window','idx_intel_unique','idx_intel_key','idx_intel_source_updated'])assert.ok(indexes.has(index),`missing ${index}`);
 }finally{sqlite.close()}
});
