'use client';
import {useEffect,useState} from 'react';
import {Label} from '@/components/ui/label';
import {Input} from '@/components/ui/input';
import {Checkbox} from '@/components/ui/checkbox';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import type {AttributeDef} from '@/lib/attributes';
import {call} from './workspace-api';

// Template picker (new cases only) and the workspace's custom fields, inside the case form.
export default function CaseExtras({data,change,isNew}:{data:any;change:(key:string,value:any)=>void;isNew:boolean}){
 const [defs,setDefs]=useState<AttributeDef[]>([]),[templates,setTemplates]=useState<any[]>([]);
 useEffect(()=>{call('attributes').then(d=>setDefs(d.attributes)).catch(()=>{});if(isNew)call('templates').then(d=>setTemplates(d.templates)).catch(()=>{})},[isNew]);
 const attrs=data.attributes||{},setAttr=(key:string,value:any)=>change('attributes',{...attrs,[key]:value});
 function apply(id:string){
  change('templateId',id==='none'?undefined:id);if(id==='none')return;
  const t=templates.find(x=>x.id===id)?.data;if(!t)return;
  for(const k of ['incidentType','tlp','priority','urgency','playbook','team','tags','scope','impact'])if(t[k]!==undefined&&t[k]!==''&&!(Array.isArray(t[k])&&!t[k].length))change(k,t[k]);
 }
 if(!defs.length&&!templates.length)return null;
 return <>
  {isNew&&templates.length>0&&<div className="field wide"><Label>Start from a template</Label><p className="meta">Fills classification, scope and tags, and adds the template&apos;s tasks to the action plan.</p>
   <Select value={data.templateId||'none'} onValueChange={apply}><SelectTrigger aria-label="Case template"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">No template</SelectItem>{templates.map(t=><SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>}
  {defs.map(d=><div className={d.type==='boolean'?'checkline wide':'field'} key={d.key}>
   {d.type==='boolean'?<><Checkbox id={'attr-'+d.key} checked={!!attrs[d.key]} onCheckedChange={v=>setAttr(d.key,v===true)}/><Label htmlFor={'attr-'+d.key}>{d.label}</Label></>:<>
    <Label htmlFor={'attr-'+d.key}>{d.label}</Label>{d.help&&<p className="meta">{d.help}</p>}
    {d.type==='select'?<Select value={attrs[d.key]||''} onValueChange={v=>setAttr(d.key,v)}><SelectTrigger id={'attr-'+d.key} aria-label={d.label}><SelectValue placeholder="Select…"/></SelectTrigger><SelectContent>{d.options.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>
     :<Input id={'attr-'+d.key} type={d.type==='number'?'number':d.type==='date'?'date':d.type==='url'?'url':'text'} value={attrs[d.key]??''} onChange={e=>setAttr(d.key,d.type==='number'&&e.target.value!==''?Number(e.target.value):e.target.value)}/>}</>}
  </div>)}
 </>;
}
