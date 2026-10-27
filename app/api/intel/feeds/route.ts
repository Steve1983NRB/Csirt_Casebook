import {z} from 'zod';
import {env} from 'cloudflare:workers';
import {body,database,guard,json} from '@/lib/server';
import {intelFeeds} from '@/lib/intel';
import {readStatuses,syncFeed} from '@/lib/intel-store';

export async function GET(req:Request){return guard(req,async()=>{
 const db=database(),statuses=await readStatuses(db);
 return json({feeds:intelFeeds.map(({id,name,site,description,license,limit})=>({id,name,site,description,license,limit,status:statuses[id]||{id,lastSuccessAt:null,checkedAt:null,error:null,count:0}})),manual:(await db.prepare("SELECT kind,COUNT(*) AS n FROM intel_items WHERE source='manual' GROUP BY kind").all()).results});
})}

// One feed per request keeps each Worker invocation short; the UI iterates.
export async function POST(req:Request){return guard(req,async()=>{
 const input=z.object({feed:z.string().min(1).max(40),force:z.boolean().default(false)}).parse(await body(req));
 const result=await syncFeed(database(),input.feed,{force:input.force,authKey:env.ABUSECH_AUTH_KEY});
 return json({id:result.feed.id,skipped:result.skipped,status:result.status});
})}
