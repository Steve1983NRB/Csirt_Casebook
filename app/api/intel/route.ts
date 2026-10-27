import {z} from 'zod';
import {currentAccount} from '@/lib/auth';
import {body,database,guard,HttpError,json} from '@/lib/server';
import {detectType,iocTypes,normalizeKey,refang,MAX_VALUE} from '@/lib/intel';
import {intelItem} from '@/lib/intel-store';

const tags=z.array(z.string().trim().min(1).max(40)).max(20).default([]);
const reference=z.string().trim().max(2000).refine(v=>!v||/^https?:\/\//i.test(v),'Reference must be an http(s) link.').default('');
const technique=z.string().regex(/^(T\d{4}(\.\d{3})?|AML\.T\d{4}(\.\d{3})?)$/);
const indicator=z.object({kind:z.literal('indicator'),type:z.enum(iocTypes).optional(),value:z.string().trim().max(MAX_VALUE).optional(),values:z.array(z.string().trim().min(1).max(MAX_VALUE)).max(200).optional(),label:z.string().trim().max(100).default(''),threatType:z.string().trim().max(60).default(''),confidence:z.number().int().min(0).max(100).nullable().default(null),tags,reference,description:z.string().max(5000).default('')});
const actor=z.object({kind:z.literal('actor'),name:z.string().trim().min(2).max(120),aliases:z.array(z.string().trim().min(1).max(120)).max(30).default([]),country:z.string().trim().max(80).default(''),motivation:z.string().trim().max(120).default(''),description:z.string().max(8000).default(''),techniques:z.array(technique).max(150).default([]),tags,reference});
const schema=z.discriminatedUnion('kind',[indicator,actor]);

const like=(s:string)=>'%'+s.replace(/[\\%_]/g,'\\$&')+'%';
export async function GET(req:Request){return guard(req,async()=>{
 const url=new URL(req.url),kind=url.searchParams.get('kind')==='actor'?'actor':'indicator',q=refang(url.searchParams.get('q')||'').toLowerCase().slice(0,200),source=url.searchParams.get('source')||'',type=url.searchParams.get('type')||'';
 const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit'))||50)),offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
 const where=['kind=?'],args:any[]=[kind];
 if(q){const fields=["key LIKE ? ESCAPE '\\'","lower(label) LIKE ? ESCAPE '\\'","lower(tags) LIKE ? ESCAPE '\\'",...(kind==='actor'?["lower(data) LIKE ? ESCAPE '\\'"]:[])];where.push('('+fields.join(' OR ')+')');fields.forEach(()=>args.push(like(q)))}
 if(source){where.push('source=?');args.push(source)}
 if(type&&(iocTypes as readonly string[]).includes(type)){where.push('type=?');args.push(type)}
 const db=database(),clause=where.join(' AND ');
 const [rows,total]=await db.batch([db.prepare(`SELECT * FROM intel_items WHERE ${clause} ORDER BY COALESCE(last_seen,updated_at) DESC,id LIMIT ? OFFSET ?`).bind(...args,limit,offset),db.prepare(`SELECT COUNT(*) AS n FROM intel_items WHERE ${clause}`).bind(...args)]);
 return json({items:(rows.results as any[]).map(intelItem),total:(total.results as any[])[0]?.n||0,limit,offset});
})}

const INSERT='INSERT INTO intel_items(id,kind,source,type,value,key,label,threat_type,confidence,tags,reference,data,first_seen,last_seen,created_at,updated_at,author,author_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(kind,source,key) DO UPDATE SET type=excluded.type,value=excluded.value,label=excluded.label,threat_type=excluded.threat_type,confidence=excluded.confidence,tags=excluded.tags,reference=excluded.reference,data=excluded.data,last_seen=excluded.last_seen,updated_at=excluded.updated_at,author=excluded.author,author_id=excluded.author_id';
export async function POST(req:Request){return guard(req,async who=>{
 const me=await currentAccount(req),input=schema.parse(await body(req)),db=database(),at=new Date().toISOString();
 const insert=(row:{kind:string;type:string;value:string;label?:string;threatType?:string;confidence?:number|null;tags:string[];reference:string;data:any})=>db.prepare(INSERT).bind(crypto.randomUUID(),row.kind,'manual',row.type,row.value,normalizeKey(row.value),row.label||'',row.threatType||'',row.confidence??null,JSON.stringify(row.tags),row.reference,JSON.stringify(row.data),null,at,at,at,who,me.id);
 if(input.kind==='actor'){
  await db.batch([insert({kind:'actor',type:'actor',value:input.name,tags:input.tags,reference:input.reference,data:{aliases:input.aliases,country:input.country,motivation:input.motivation,description:input.description,techniques:[...new Set(input.techniques)]}})]);
  const row=await db.prepare("SELECT * FROM intel_items WHERE kind='actor' AND source='manual' AND key=?").bind(normalizeKey(input.name)).first();
  return json({created:1,items:[intelItem(row)]},201);
 }
 const raw=[...(input.value?[input.value]:[]),...(input.values||[])].map(v=>refang(v)).filter(Boolean);
 if(!raw.length)throw new HttpError(400,'Enter at least one indicator value.');
 if(raw.length>200)throw new HttpError(400,'Add at most 200 indicators at once.');
 const values=[...new Map(raw.map(v=>[normalizeKey(v),v])).values()];
 await db.batch(values.map(value=>insert({kind:'indicator',type:input.type||detectType(value),value,label:input.label,threatType:input.threatType,confidence:input.confidence,tags:input.tags,reference:input.reference,data:input.description?{description:input.description}:{}})));
 return json({created:values.length},201);
})}
