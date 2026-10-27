import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configFromEnvironment,MispClient,normalizeAttribute,toCandidate} from '../lib/misp';

test('MISP config requires a public HTTPS base URL and server-side API key',()=>{
 assert.equal(configFromEnvironment({}),null);
 assert.throws(()=>configFromEnvironment({MISP_API_ROOT:'https://misp.example.org/'}),/MISP_API_KEY/);
 assert.throws(()=>configFromEnvironment({MISP_API_KEY:'secret'}),/MISP_API_ROOT/);
 for(const apiRoot of ['http://misp.example.org/','https://127.0.0.1/','https://misp.local/','https://user:pass@misp.example.org/','https://misp.example.org/?key=secret'])assert.throws(()=>configFromEnvironment({MISP_API_ROOT:apiRoot,MISP_API_KEY:'secret'}));
 assert.equal(configFromEnvironment({MISP_API_ROOT:'https://misp.example.org/misp',MISP_API_KEY:'secret'})?.apiRoot,'https://misp.example.org/misp/');
});

test('MISP API searches published event metadata with read-only authenticated requests',async()=>{
 const calls:{url:URL;init:RequestInit}[]=[];
 const client=new MispClient({apiRoot:'https://misp.example.org/misp/',apiKey:'server-secret'},(async(input:any,init:any)=>{calls.push({url:new URL(input),init});return Response.json([{Event:{id:'42',uuid:'11111111-1111-4111-8111-111111111111',info:'Incident',date:'2026-10-01',Orgc:{name:'CERT'}}}])}) as typeof fetch);
 const events=await client.events();
 assert.equal(events[0].info,'Incident');assert.equal(events[0].org,'CERT');
 assert.equal(calls[0].url.href,'https://misp.example.org/misp/events/restSearch');
 assert.equal(calls[0].init.method,'POST');assert.equal((calls[0].init.headers as any).Authorization,'server-secret');
 assert.equal((calls[0].init as any).redirect,'manual');
 assert.deepEqual(JSON.parse(String(calls[0].init.body)),{returnFormat:'json',published:true,metadata:true,last:'30d',limit:50,page:1});
});

test('MISP event attributes are normalized conservatively and preserve source properties',()=>{
 const source=normalizeAttribute({id:'5',uuid:'11111111-1111-4111-8111-111111111111',type:'ip-src|port',value:'203.0.113.7|443',category:'Network activity',to_ids:true,Tag:[{name:'tlp:amber'}]})!;
 assert.deepEqual(toCandidate(source),{attribute:source,type:'IP',value:'203.0.113.7'});
 assert.equal(source.toIds,true);assert.deepEqual(source.tags,['tlp:amber']);
 assert.equal(toCandidate({...source,type:'domain',value:'malware.example'})?.type,'Domain');
 assert.equal(toCandidate({...source,type:'domain',value:'not a domain'}),null);
 assert.equal(toCandidate({...source,type:'url',value:'not a url'}),null);
 assert.equal(normalizeAttribute({id:'5',uuid:'not-a-uuid',type:'domain',value:'example.org'}),null);
 assert.equal(toCandidate({...source,type:'email-src',value:'analyst@example.org'}),null);
});

test('MISP client rejects redirects, invalid event IDs, and oversized/untrusted responses without exposing keys',async()=>{
 const redirected=new MispClient({apiRoot:'https://misp.example.org/',apiKey:'secret'},(async()=>new Response(null,{status:302,headers:{Location:'https://evil.example/'}})) as typeof fetch);
 await assert.rejects(()=>redirected.events(),/redirected/);
 const client=new MispClient({apiRoot:'https://misp.example.org/',apiKey:'secret'},(async()=>Response.json({Event:{id:'2',Attribute:[]}})) as typeof fetch);
 await assert.rejects(()=>client.event('../escape'),/Invalid MISP event ID/);
 await assert.rejects(()=>new MispClient({apiRoot:'https://misp.example.org/',apiKey:'secret'},(async()=>new Response('secret',{status:401})) as typeof fetch).events(),e=>e instanceof Error&&/access denied/i.test(e.message)&&!e.message.includes('secret'));
});
