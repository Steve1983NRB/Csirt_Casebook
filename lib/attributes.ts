import {HttpError} from './server';

import {attributeTypes,type AttributeType} from './templates';
export {attributeTypes};
export type AttributeDef={id:string;key:string;label:string;type:AttributeType;options:string[];help:string;position:number};
type Db={prepare:(q:string)=>any};

export async function loadAttributeDefs(db:Db):Promise<AttributeDef[]>{
 const rows=(await db.prepare('SELECT * FROM attribute_defs ORDER BY position,label COLLATE NOCASE LIMIT 100').all()).results as any[];
 return rows.map(r=>({id:r.id,key:r.key,label:r.label,type:r.type,options:JSON.parse(r.options||'[]'),help:r.help,position:r.position}));
}

// Keeps only values for currently defined fields and checks each against its declared type.
export function cleanAttributes(defs:AttributeDef[],input:Record<string,unknown>|undefined):Record<string,string|number|boolean>{
 const out:Record<string,string|number|boolean>={};
 for(const def of defs){
  const value=input?.[def.key];if(value===undefined||value===null||value==='')continue;
  const bad=()=>{throw new HttpError(400,`"${def.label}" has an invalid value.`)};
  if(def.type==='number'){const n=typeof value==='number'?value:Number(value);if(!Number.isFinite(n))bad();out[def.key]=n}
  else if(def.type==='boolean'){if(typeof value!=='boolean')bad();out[def.key]=value as boolean}
  else{
   if(typeof value!=='string'||value.length>2000)bad();const s=value as string;
   if(def.type==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(s))bad();
   if(def.type==='select'&&!def.options.includes(s))bad();
   if(def.type==='url'&&!/^https?:\/\/[^\s]+$/i.test(s))bad();
   out[def.key]=s;
  }
 }
 return out;
}
