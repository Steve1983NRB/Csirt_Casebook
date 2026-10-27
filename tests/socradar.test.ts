import test from 'node:test';
import assert from 'node:assert/strict';
import {configFromEnvironment,SocradarClient,normalizeIndicatorType} from '../lib/socradar';

test('SOCradar Premium Feeds client uses the configured company and query API key',async()=>{
 const calls:URL[]=[];const client=new SocradarClient(configFromEnvironment({SOCRADAR_PREMIUM_FEEDS_API_KEY:'secret',SOCRADAR_COMPANY_ID:'15881'})!,async(input)=>{calls.push(new URL(String(input)));return new Response(JSON.stringify([{uuid:'feed-1',name:'Malware IPs',category:'Malware',feed_type:'ip'}]),{headers:{'content-type':'application/json'}})});
 const feeds=await client.feeds();assert.equal(feeds[0].uuid,'feed-1');assert.equal(calls[0].pathname,'/api/premium-feeds/15881/list-premium-feeds');assert.equal(calls[0].searchParams.get('key'),'secret');
});

test('SOCradar content pagination is bounded and normalized for IOC import',async()=>{
 let request=0;const client=new SocradarClient({apiKey:'secret',companyId:'15881',apiRoot:'https://platform.socradar.com/api'},async(input)=>{request++;const url=new URL(String(input));assert.equal(url.searchParams.get('page'),String(request));return new Response(JSON.stringify({content:[{indicator:'1.2.3.4',type:'ip',score:91,tags:['c2']}],page:request,has_next:request===1}),{headers:{'content-type':'application/json'}})});
 const items=await client.allContent('feed-1');assert.equal(request,2);assert.equal(items[0].indicator,'1.2.3.4');assert.equal(items[0].score,91);assert.equal(normalizeIndicatorType('hostname'),'Domain');
});

test('SOCradar configuration rejects missing company IDs and non-HTTPS roots',()=>{
 assert.throws(()=>configFromEnvironment({SOCRADAR_PREMIUM_FEEDS_API_KEY:'secret'}),/SOCRADAR_COMPANY_ID/);
 assert.throws(()=>configFromEnvironment({SOCRADAR_PREMIUM_FEEDS_API_KEY:'secret',SOCRADAR_COMPANY_ID:'1',SOCRADAR_API_ROOT:'http://localhost'}),/HTTPS/);
});

test('SOCradar accepts account catalogues larger than 500 feeds',async()=>{
 const catalogue=Array.from({length:717},(_,i)=>({uuid:'feed-'+i,name:'Feed '+i,category:'Behaviors',type:'premium',description:''}));
 const client=new SocradarClient({apiKey:'secret',companyId:'15881',apiRoot:'https://platform.socradar.com/api'},async()=>new Response(JSON.stringify(catalogue)));
 assert.equal((await client.feeds()).length,717);
 const huge=new SocradarClient({apiKey:'secret',companyId:'15881',apiRoot:'https://platform.socradar.com/api'},async()=>new Response(JSON.stringify(Array.from({length:3001},(_,i)=>({uuid:'f'+i,name:'F'+i})))));
 await assert.rejects(()=>huge.feeds(),/invalid feed list/);
});

test('provenance viewer handles TAXII objects, SOCradar items and malformed payloads without throwing',async()=>{
 const {provenanceJson,provenanceLabel}=await import('../lib/provenance');
 assert.match(provenanceJson({provider:'TAXII 2.1',rawObject:'{"id":"indicator--1"}'}),/indicator--1/);
 assert.match(provenanceJson({provider:'SOCradar Premium Feeds',rawItem:'{"indicator":"1.2.3.4"}'}),/1\.2\.3\.4/);
 assert.equal(provenanceJson({provider:'SOCradar Premium Feeds'}),'');assert.equal(provenanceJson(undefined),'');assert.equal(provenanceJson({rawItem:'not json'}),'not json');
 assert.match(provenanceLabel({provider:'SOCradar Premium Feeds',feedName:'Medusa'}),/Medusa/);
});
