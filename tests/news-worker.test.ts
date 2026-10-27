import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {build}=createRequire(import.meta.resolve('tsx'))('esbuild');
const {Miniflare}=createRequire(import.meta.resolve('wrangler'))('miniflare');

test('RSS and TAXII fetches run in the actual Worker runtime',async()=>{
 const bundle=await build({stdin:{contents:`
  import {fetchNews,newsSources} from './lib/news';
  import {TaxiiClient} from './lib/taxii';
  export default {async fetch(req){try{
   const data=new URL(req.url).pathname==='/news'
    ?await fetchNews(newsSources[0])
    :await new TaxiiClient({apiRoot:'https://opencti.example.com/root/',token:'test-only'}).collections();
   return Response.json(data);
  }catch(e){return Response.json({error:e.message},{status:500});}}};
 `,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'browser',write:false});
 let requests=0;
 const runtime=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',inspectorPort:0,
  outboundService:async(request:Request)=>{
   requests++;const url=new URL(request.url);
   if(url.hostname==='www.cisa.gov')return new Response('<rss><channel><item><title>Worker RSS regression</title><link>https://www.cisa.gov/regression/</link></item></channel></rss>',{headers:{'Content-Type':'application/rss+xml'}});
   assert.equal(request.headers.get('Authorization'),'Bearer test-only');
   return Response.json(url.pathname.endsWith('collections/')?{collections:[{id:'one',title:'Research',can_read:true}]}:{title:'Research root',versions:['application/taxii+json;version=2.1']},{headers:{'Content-Type':'application/taxii+json;version=2.1'}});
  }
 });
 try{
  const news=await runtime.dispatchFetch('http://localhost/news');const articles=await news.json();assert.equal(news.status,200,JSON.stringify(articles));assert.equal(articles[0].title,'Worker RSS regression');
  const taxii=await runtime.dispatchFetch('http://localhost/taxii');const collections=await taxii.json();assert.equal(taxii.status,200,JSON.stringify(collections));assert.equal(collections.collections.length,1);assert.equal(requests,3);
 }finally{await runtime.dispose();}
});
