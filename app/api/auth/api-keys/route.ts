import {z} from 'zod';
import {API_KEY_MAX_DAYS,createApiKey,requireInteractive} from '@/lib/auth';
import {body,database,guard,HttpError,json} from '@/lib/server';

const schema=z.object({name:z.string().trim().min(1).max(80),days:z.number().int().min(1).max(API_KEY_MAX_DAYS).default(90)});
const MAX_ACTIVE_KEYS=20;

// Keys belong to the signed-in user and carry exactly that user's case access.
export async function GET(req:Request){return guard(req,async()=>{
 const me=await requireInteractive(req);
 const rows=(await database().prepare('SELECT id,name,prefix,created_at AS createdAt,expires_at AS expiresAt,last_used_at AS lastUsedAt,revoked_at AS revokedAt FROM api_keys WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(me.id).all()).results;
 return json({keys:rows});
})}

export async function POST(req:Request){return guard(req,async()=>{
 const me=await requireInteractive(req),input=schema.parse(await body(req)),db=database();
 const active:any=await db.prepare('SELECT COUNT(*) AS n FROM api_keys WHERE user_id=? AND revoked_at IS NULL AND expires_at>?').bind(me.id,new Date().toISOString()).first();
 if((active?.n||0)>=MAX_ACTIVE_KEYS)throw new HttpError(409,`You can have at most ${MAX_ACTIVE_KEYS} active API keys. Revoke one first.`);
 const key=await createApiKey(me.id,input.name,input.days);
 return json({id:key.id,name:input.name,prefix:key.prefix,expiresAt:key.expiresAt,token:key.token},201);
})}
