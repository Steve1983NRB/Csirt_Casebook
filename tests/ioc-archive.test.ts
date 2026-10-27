import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {parseArchive,sha256} from '../lib/archive';
import {caseSchema} from '../lib/model';

const caseId='00000000-0000-4000-8000-000000000001';
const recordId='00000000-0000-4000-8000-000000000002';
const fileId='00000000-0000-4000-8000-000000000003';
const bytes=strToU8('suspicious sample content');
const snapshot=()=>({format:'csirt-casebook',version:1,case:{...caseSchema.parse({title:'Archive validation',reference:'IOC-1',client:'Validation client',date:'2026-10-16'}),id:caseId},entries:[{id:recordId,kind:'ioc',data:{type:'SHA256',value:'a'.repeat(64),description:'Sample',assetId:'',include:true}}],attachments:[],iocFiles:[{id:fileId,recordId,name:'sample.bin',mime:'application/octet-stream',sha256:'',size:bytes.length,createdAt:'2026-10-16T08:00:00Z'}],comments:[{id:'00000000-0000-4000-8000-000000000004',recordId,body:'Please review @analyst@example.com',mentions:['analyst@example.com'],authorId:'old-user',author:'Analyst',createdAt:'2026-10-16T08:00:00Z'}],audit:[]});
async function archive(fileBytes=bytes){const data=snapshot();data.iocFiles[0].sha256=await sha256(fileBytes);return zipSync({'case.json':strToU8(JSON.stringify(data)),['ioc-files/'+fileId+'.bin']:fileBytes})}

test('case archives validate and restore IOC file bytes and discussion comments',async()=>{const parsed=await parseArchive(await archive());assert.equal(parsed.iocFiles.length,1);assert.equal(parsed.iocFiles[0].metadata.recordId,recordId);assert.deepEqual(parsed.iocFiles[0].bytes,bytes);assert.equal(parsed.comments[0].recordId,recordId);assert.deepEqual(parsed.comments[0].mentions,['analyst@example.com'])});
test('case archives reject tampered IOC file bytes',async()=>{const valid=await parseArchive(await archive()),changed=strToU8('altered sample bytes'),data=snapshot();data.iocFiles[0].sha256=valid.iocFiles[0].metadata.sha256;await assert.rejects(()=>parseArchive(zipSync({'case.json':strToU8(JSON.stringify(data)),['ioc-files/'+fileId+'.bin']:changed})),/Indicator file integrity check failed/)}); 
