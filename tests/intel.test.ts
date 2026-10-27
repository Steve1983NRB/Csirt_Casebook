import test from 'node:test';
import assert from 'node:assert/strict';
import {detectType,refang,normalizeKey,parseUrlhaus,parseBazaar,parseFeodo,parseDFIRReportIndicators,loadDFIRReportIndicators,rankActors,mentionedActors,fetchFeedText,intelFeeds} from '../lib/intel';
import {dfirResources} from '../lib/dfir-resources';

test('defanged values are refanged and typed',()=>{
 assert.equal(refang('hxxps://evil[.]example[.]com/a'),'https://evil.example.com/a');
 assert.equal(normalizeKey(' EVIL[.]Example[.]com '),'evil.example.com');
 assert.equal(detectType('198[.]51[.]100[.]7'),'IP');
 assert.equal(detectType('a'.repeat(64)),'SHA256');
 assert.equal(detectType('a'.repeat(32)),'MD5');
 assert.equal(detectType('evil.example.com'),'Domain');
 assert.equal(detectType('https://x.test/y'),'URL');
 assert.equal(detectType('free text here'),'Other');
});

test('feed parsers tolerate comments, blanks and junk',()=>{
 assert.equal(parseUrlhaus('# comment\n\nhttps://bad.example/a.exe\nnot a url\n').length,1);
 assert.equal(parseUrlhaus('"1","2026-10-26 12:23:11","https://bad.example/a.zip","online","2026-10-26 12:23:11","malware_download","zip,Loader","https://urlhaus.abuse.ch/url/1/","me"')[0].tags.length,2);
 assert.equal(parseBazaar('# c\n'+'b'.repeat(64)+'\nshort\n').length,1);
 assert.equal(parseBazaar(JSON.stringify({data:[{sha256_hash:'c'.repeat(64)}]}))[0].value,'c'.repeat(64));
 assert.throws(()=>parseFeodo('not json'));
});

test('DFIR Report indicators are extracted only from IOC sections with report attribution',()=>{
 const markdown=`# Example intrusion

This is described [here](https://thedfirreport.com/2026/01/01/example/).

### Redirect Domains
\`\`\`
bad.example
198.51.100.7
\`\`\`

### Github User accounts
\`\`\`
analyst-account
\`\`\`

### Github Repositories
\`\`\`
https://github.com/example/repository
\`\`\`
`;
 const items=parseDFIRReportIndicators(markdown);
 assert.deepEqual(items.map(item=>item.value),['bad.example','198.51.100.7']);
 assert.ok(items.every(item=>item.reference==='https://thedfirreport.com/2026/01/01/example/'));
 assert.ok(items.every(item=>item.data.report==='Example intrusion'&&item.threatType==='reported_ioc'));
});

test('DFIR Report feed loads only dated markdown articles from its fixed repository',async()=>{
 const urls:string[]=[];
 const transport=(async(input:RequestInfo|URL)=> {
  const url=String(input);urls.push(url);
  if(url.includes('/git/trees/'))return new Response(JSON.stringify({truncated:false,tree:[
   {type:'blob',path:'2026-01-01-example.md'},
   {type:'blob',path:'README.md'},
   {type:'blob',path:'../2026-01-02-outside.md'}
  ]}));
  return new Response('# Example\n### Domains\n```\nbad.example\n```\n');
 }) as typeof fetch;
 const items=await loadDFIRReportIndicators(transport);
 assert.deepEqual(urls,[
  'https://api.github.com/repos/The-DFIR-Report/DFIR-Report-Indicators/git/trees/main?recursive=1',
  'https://raw.githubusercontent.com/The-DFIR-Report/DFIR-Report-Indicators/main/2026-01-01-example.md'
 ]);
 assert.equal(items[0].value,'bad.example');
 assert.match(items[0].reference,/github\.com\/The-DFIR-Report\/DFIR-Report-Indicators\/blob\/main\/2026-01-01-example\.md$/);
});

test('actor ranking needs overlapping techniques and name matching uses whole words',()=>{
 const actors=[{name:'Alpha',aliases:[],techniques:['T1486','T1490','T1059']},{name:'Beta',aliases:[],techniques:['T1486']},{name:'Gamma',aliases:[],techniques:['T9999']}];
 const ranked=rankActors(actors,['T1486','T1490']);
 assert.deepEqual(ranked.map(r=>r.actor.name),['Alpha']);
 assert.deepEqual(mentionedActors([{name:'Lazarus Group',aliases:['Hidden Cobra']}],'Linked to hidden cobra activity').map(a=>a.name),['Lazarus Group']);
 assert.equal(mentionedActors([{name:'APT',aliases:[]}],'aptitude').length,0);
});

test('feeds are fetched from fixed https URLs with a bounded response',async()=>{
 for(const f of intelFeeds)assert.match(f.url,/^https:\/\//);
 assert.equal(intelFeeds.find(f=>f.id==='dfir-report')?.pruneMissing,false);
 let seen='';
 const text=await fetchFeedText(intelFeeds[0],(async(u:any)=>{seen=String(u);return new Response('ok')}) as any);
 assert.equal(text,'ok');assert.equal(seen,intelFeeds[0].url);
 await assert.rejects(()=>fetchFeedText(intelFeeds[0],(async()=>new Response('x',{status:503})) as any));
});

test('abuse.ch feeds use their authenticated API endpoints and parse their responses',async()=>{
 const requests:{url:string;init?:RequestInit}[]=[];
 const transport=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);requests.push({url,init});
  if(url.includes('threatfox-api'))return Response.json({query_status:'ok',data:[{id:'1',ioc_type:'domain',ioc:'bad.example',malware_printable:'Example',first_seen:'2026-10-26 12:00:00 UTC'}]});
  if(url.includes('urlhaus-api'))return new Response('# header\n"1","2026-10-26 12:23:11","https://bad.example/payload","online","2026-10-26 12:23:11","malware_download","zip","https://urlhaus.abuse.ch/url/1/","me"\n');
  return Response.json({query_status:'ok',data:[{sha256_hash:'d'.repeat(64)}]});
 }) as typeof fetch;
 const threatfox=intelFeeds.find(feed=>feed.id==='threatfox')!;
 const urlhaus=intelFeeds.find(feed=>feed.id==='urlhaus')!;
 const bazaar=intelFeeds.find(feed=>feed.id==='bazaar')!;
 assert.equal((await threatfox.load!(transport,'test-key'))[0].value,'bad.example');
 assert.equal((await urlhaus.load!(transport,'test-key'))[0].value,'https://bad.example/payload');
 assert.equal((await bazaar.load!(transport,'test-key'))[0].value,'d'.repeat(64));
 assert.equal(requests[0].url,'https://threatfox-api.abuse.ch/api/v1/');
 assert.equal(requests[0].init?.headers&&new Headers(requests[0].init.headers).get('Auth-Key'),'test-key');
 assert.equal(JSON.parse(String(requests[0].init?.body)).query,'get_iocs');
 assert.equal(requests[1].url,'https://urlhaus-api.abuse.ch/v2/files/exports/test-key/recent.csv');
 assert.equal(requests[2].url,'https://mb-api.abuse.ch/api/v1/');
 assert.equal(new URLSearchParams(String(requests[2].init?.body)).get('query'),'get_recent');
 await assert.rejects(()=>threatfox.load!(transport),/ABUSECH_AUTH_KEY/);
});

test('The DFIR Report public repositories are indexed without embedding repository content',()=>{
 assert.deepEqual(dfirResources.map(resource=>resource.id),['indicators','artifacts','sigma','yara','suricata','cyberchef','scripts']);
 assert.ok(dfirResources.every(resource=>resource.repository.startsWith('https://github.com/The-DFIR-Report/')));
 assert.match(dfirResources.find(resource=>resource.id==='artifacts')!.handling,/No artifact content is fetched, copied or displayed/);
 assert.equal(dfirResources.find(resource=>resource.id==='sigma')!.relatedUrl,'https://github.com/search?q=repo%3ASigmaHQ%2Fsigma+%22TheDFIRReport%22+path%3Arules&type=code');
});
