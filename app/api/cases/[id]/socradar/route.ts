import {env} from 'cloudflare:workers';
import {access} from '@/lib/access';
import {body,guard,json,database,HttpError,auditStatement} from '@/lib/server';
import {configFromEnvironment,itemDescription,normalizeIndicatorType,SocradarClient,type SocradarFeed,type SocradarItem} from '@/lib/socradar';

type Ctx={params:Promise<{id:string}>};
function validDate(value:unknown){return value===undefined||value===''||typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)}
function externalSource(config:{apiRoot:string;companyId:string},feed:SocradarFeed,item:SocradarItem){return {provider:'SOCradar Premium Feeds' as const,apiRoot:config.apiRoot,companyId:config.companyId,feedId:feed.uuid,feedName:feed.name,observedAt:item.latestSeenDate||item.insertDate||new Date().toISOString(),...(item.score===undefined?{}:{score:item.score}),rawItem:JSON.stringify(item).slice(0,20000)}}
function sameIndicator(data:any,value:string){return typeof data?.value==='string'&&data.value.toLowerCase()===value.toLowerCase()}

export async function GET(req:Request,ctx:Ctx){return guard(req,async()=>{const {id}=await ctx.params;await access(req,id,'manage');const config=configFromEnvironment(env);if(!config)throw new HttpError(503,'SOCradar Premium Feeds is not configured.');try{return json({configured:true,companyId:config.companyId,feeds:await new SocradarClient(config).feeds()})}catch(e:any){throw new HttpError(502,e.message)}})}

export async function POST(req:Request,ctx:Ctx){return guard(req,async who=>{
 const {id}=await ctx.params;await access(req,id,'manage');const input=await body(req);const feedId=String(input.feedId||'');if(!/^[a-zA-Z0-9_-]{1,200}$/.test(feedId))throw new HttpError(400,'A valid SOCradar feed is required.');if(!validDate(input.startDate)||!validDate(input.endDate))throw new HttpError(400,'Dates must use YYYY-MM-DD.');
 const config=configFromEnvironment(env);if(!config)throw new HttpError(503,'SOCradar Premium Feeds is not configured.');const client=new SocradarClient(config);let feeds:SocradarFeed[];try{feeds=await client.feeds()}catch(e:any){throw new HttpError(502,e.message)}const feed=feeds.find(item=>item.uuid===feedId);if(!feed)throw new HttpError(404,'SOCradar feed not found or not available to this account.');
 let items:SocradarItem[];try{items=await client.allContent(feed.uuid,{startDate:input.startDate,endDate:input.endDate,checkAllowlist:input.checkAllowlist!==false})}catch(e:any){throw new HttpError(502,e.message)}
 const db=database(),query=await db.prepare("SELECT * FROM records WHERE case_id=? AND kind='ioc'").bind(id).all(),rows:any[]=query.results||[],existing=rows.map(row=>({...row,data:JSON.parse(row.data)})),statements:any[]=[],created:string[]=[],updated:string[]=[],seen=new Set<string>();
 for(const item of items){const value=item.indicator.trim();const key=value.toLowerCase();if(seen.has(key))continue;seen.add(key);const type=normalizeIndicatorType(item.type),source=externalSource(config,feed,item),description=itemDescription(item,feed),current=existing.find(row=>sameIndicator(row.data,value));
  if(current){const previous=current.data,next={...previous,type,value,description:previous.description?`${previous.description}\n\n${description}`:description,externalSource:source};if(JSON.stringify(previous)===JSON.stringify(next))continue;statements.push(db.prepare('UPDATE records SET data=?,version=version+1,updated_at=?,author=? WHERE id=? AND version=?').bind(JSON.stringify(next),new Date().toISOString(),who,current.id,current.version),auditStatement(id,current.id,'ioc.enriched',who,{before:previous,after:next},true));updated.push(current.id);continue;}
  const recordId=crypto.randomUUID(),data={type,value,description,assetId:'',include:false,externalSource:source},at=new Date().toISOString();statements.push(db.prepare('INSERT INTO records(id,case_id,kind,data,updated_at,author) VALUES(?,?,?,?,?,?)').bind(recordId,id,'ioc',JSON.stringify(data),at,who),auditStatement(id,recordId,'ioc.created',who,{after:data}));created.push(recordId);
 }
 if(statements.length)await db.batch(statements);return json({feed:{id:feed.uuid,name:feed.name},received:items.length,created:created.length,updated:updated.length,skipped:items.length-created.length-updated.length});
 })}
