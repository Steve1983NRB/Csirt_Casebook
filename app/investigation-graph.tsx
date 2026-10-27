'use client';
import {Background,Controls,MiniMap,ReactFlow,type Edge,type Node} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {Entry,Snapshot} from '@/lib/model';

const order=['asset','note','evidence','event','ioc','identity','technique','action'];
const colors:Record<string,string>={case:'#202633',asset:'#2563eb',note:'#d65a20',evidence:'#16805d',event:'#6d4fc2',ioc:'#b42318',identity:'#9b4d00',technique:'#3749a6',action:'#566273'};
function label(entry:Entry){const data=entry.data;return data.title||data.name||data.value||data.account||data.techniqueId||entry.kind}

export default function InvestigationGraph({snapshot,onOpen}:{snapshot:Snapshot;onOpen:(entry:Entry)=>void}){
 const entries=snapshot.entries,idSet=new Set(entries.map(entry=>entry.id)),groups=new Map<string,Entry[]>();
 for(const entry of entries)groups.set(entry.kind,[...(groups.get(entry.kind)||[]),entry]);
 const nodes:Node[]=[{id:'case',position:{x:0,y:0},data:{label:`${snapshot.case.reference} · ${snapshot.case.title}`},style:{background:colors.case,color:'white',border:'0',width:240,fontWeight:700}}];
 order.forEach((kind,column)=>{(groups.get(kind)||[]).forEach((entry,row)=>nodes.push({id:entry.id,position:{x:300+column*235,y:row*105},data:{label:label(entry)},style:{background:'white',border:`2px solid ${colors[kind]}`,width:205,color:'#20242c'}}))});
 const edges:Edge[]=[];
 const link=(source:string,target:string,label?:string)=>{if((source==='case'||idSet.has(source))&&idSet.has(target))edges.push({id:`${source}-${target}-${label||''}`,source,target,label,type:'smoothstep'})};
 for(const entry of entries){const data=entry.data;if(data.assetId)link(data.assetId,entry.id,'asset');else if(entry.kind==='asset'||!data.noteId)link('case',entry.id);if(data.noteId)link(data.noteId,entry.id,'source');for(const id of data.evidenceIds||[])link(id,entry.id,'evidence');for(const id of data.sourceNoteIds||[])link(id,entry.id,'finding')}
 return <div className="investigation-graph" aria-label="Investigation relationship graph"><ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.15} maxZoom={1.8} onNodeDoubleClick={(_,node)=>{const entry=entries.find(item=>item.id===node.id);if(entry)onOpen(entry)}}><Background/><MiniMap nodeColor={node=>colors[entries.find(entry=>entry.id===node.id)?.kind||'case']}/><Controls/></ReactFlow></div>
}
