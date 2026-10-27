'use client';
import {useEffect,useRef,useState} from 'react';
import {CheckCircle2,Download,ExternalLink,Link2,Search} from 'lucide-react';
import Markdown,{type Components} from 'react-markdown';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Textarea} from '@/components/ui/textarea';
import type {AttackCatalogue,AttackDomain,AttackTechnique} from '@/lib/attack';
import type {Entry,Snapshot} from '@/lib/model';

const frameworkName=(domain:AttackDomain)=>domain==='atlas'?'MITRE ATLAS':'MITRE ATT&CK';
const safeMarkdownComponents:Components={
 img:()=>null,
 a:({href,children})=>href?.startsWith('https://')?<a href={href} target="_blank" rel="noreferrer">{children}</a>:<span>{children}</span>,
};

export default function AttackCatalog({snapshot,onSaved}:{snapshot?:Snapshot|null;onSaved?:()=>Promise<void>}){
 const [domain,setDomain]=useState<AttackDomain>('enterprise');
 const [catalogue,setCatalogue]=useState<AttackCatalogue|null>(null);
 const [search,setSearch]=useState('');
 const [platform,setPlatform]=useState('all');
 const [mappedOnly,setMappedOnly]=useState(false);
 const [retired,setRetired]=useState(false);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const [selected,setSelected]=useState<AttackTechnique|null>(null);
 const [matrixWidth,setMatrixWidth]=useState(0);
 const topScrollRef=useRef<HTMLDivElement>(null);
 const bodyScrollRef=useRef<HTMLDivElement>(null);
 const matrixRef=useRef<HTMLDivElement>(null);

 useEffect(()=>{
  const abort=new AbortController();
  setLoading(true);
  setCatalogue(null);
  setPlatform('all');
  setError('');
  fetch('/attack/'+domain+'.json',{signal:abort.signal})
   .then(async response=>{if(!response.ok)throw new Error(`${frameworkName(domain)} catalogue is unavailable.`);return response.json()})
   .then(value=>setCatalogue(value as AttackCatalogue))
   .catch(reason=>{if(reason.name!=='AbortError')setError(reason.message)})
   .finally(()=>{if(!abort.signal.aborted)setLoading(false)});
  return()=>abort.abort();
 },[domain]);

 useEffect(()=>{
  const element=matrixRef.current;
  if(!element)return;
  const update=()=>setMatrixWidth(element.scrollWidth);
  update();
  const observer=new ResizeObserver(update);
  observer.observe(element);
  return()=>observer.disconnect();
 },[catalogue,domain]);

 const mappings=(snapshot?.entries||[]).filter(entry=>entry.kind==='technique'&&(entry.data.domain||'enterprise')===domain);
 const mappedIds=new Set(mappings.map(entry=>entry.data.techniqueId));
 const active=catalogue?.techniques.filter(technique=>!technique.revoked&&!technique.deprecated)||[];
 const platforms=[...new Set(active.flatMap(technique=>technique.platforms))].sort();
 const visible=catalogue?.techniques.filter(technique=>{
  if(!retired&&(technique.revoked||technique.deprecated))return false;
  if(platform!=='all'&&!technique.platforms.includes(platform))return false;
  if(mappedOnly&&!mappedIds.has(technique.id))return false;
  if(!search)return true;
  const term=search.toLowerCase();
  const mitigationTerms=(catalogue.mitigations||[]).filter(item=>technique.mitigationIds?.includes(item.id)).map(item=>item.name+' '+item.description);
  const caseStudyTerms=(catalogue.caseStudies||[]).filter(item=>technique.caseStudyIds?.includes(item.id)).map(item=>item.name+' '+item.description);
  return [technique.id,technique.name,technique.description,technique.maturity,...mitigationTerms,...caseStudyTerms].join(' ').toLowerCase().includes(term);
 })||[];

 function syncFromBody(event:React.UIEvent<HTMLDivElement>){if(topScrollRef.current)topScrollRef.current.scrollLeft=event.currentTarget.scrollLeft}
 function syncFromTop(event:React.UIEvent<HTMLDivElement>){if(bodyScrollRef.current)bodyScrollRef.current.scrollLeft=event.currentTarget.scrollLeft}
 function exportLayer(){
  if(!catalogue)return;
  const isAtlas=domain==='atlas';
  const framework=isAtlas?'ATLAS':'ATT&CK';
  const layer={
   name:(snapshot?.case.reference||framework)+' mappings',
   versions:{attack:catalogue.version,navigator:isAtlas?'5.3.2':'5.1.0',layer:'4.5'},
   domain:isAtlas?'atlas-atlas':domain+'-attack',
   description:`CSIRT Investigate ${framework} mappings. Orange: reviewed; blue: draft. Counts are mappings, not detection coverage.`,
   techniques:mappings.map(mapping=>({techniqueID:mapping.data.techniqueId,score:mapping.data.include?100:50,color:mapping.data.include?'#c8440d':'#2563eb',comment:mapping.data.rationale,enabled:true,metadata:[{name:'Case',value:snapshot!.case.reference},{name:'Confidence',value:mapping.data.confidence||'Unassessed'}]})),
   legendItems:[{label:'Reviewed mapping',color:'#c8440d'},{label:'Draft mapping',color:'#2563eb'}],
  };
  const url=URL.createObjectURL(new Blob([JSON.stringify(layer,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=(isAtlas?'atlas':'attack-'+domain)+'-layer.json';
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function tile(technique:AttackTechnique,child=false){
  const records=mappings.filter(mapping=>mapping.data.techniqueId===technique.id);
  const reviewed=records.some(mapping=>mapping.data.include);
  return <button key={technique.id} className={'attack-tile '+(child?'sub-technique ':'')+(records.length?(reviewed?'mapped-reviewed':'mapped-draft'):'')} onClick={()=>setSelected(technique)}>
   <span><code>{technique.id}</code>{records.length>0&&<span className="mapping-count">{reviewed?<CheckCircle2 size={13}/>:<Link2 size={13}/>} {records.length}</span>}</span>
   <b>{technique.name}</b>
   {(technique.revoked||technique.deprecated)&&<small>{technique.revoked?'Revoked':'Deprecated'}</small>}
  </button>;
 }

 const framework=frameworkName(domain);
 return <section className="attack-workspace">
  <div className="section-head">
   <div><h2>{framework}</h2><p>{snapshot?'Map observed behaviour to this investigation.':'Explore the complete catalogue. Open a case to map observed behaviour.'}</p></div>
   <Button variant="outline" disabled={!mappings.length} onClick={exportLayer}><Download/>Navigator layer</Button>
  </div>
  <div className="attack-controls">
   <Select value={domain} onValueChange={value=>setDomain(value as AttackDomain)}>
    <SelectTrigger aria-label="Threat framework"><SelectValue/></SelectTrigger>
    <SelectContent><SelectItem value="enterprise">ATT&CK Enterprise</SelectItem><SelectItem value="mobile">ATT&CK Mobile</SelectItem><SelectItem value="ics">ATT&CK ICS</SelectItem><SelectItem value="atlas">ATLAS · AI systems</SelectItem></SelectContent>
   </Select>
   <div className="search"><Search size={16}/><Input aria-label={`Search ${framework}`} placeholder="Search technique, ID or behaviour…" value={search} onChange={event=>setSearch(event.target.value)}/></div>
   <Select value={platform} onValueChange={setPlatform}>
    <SelectTrigger aria-label="Platform"><SelectValue/></SelectTrigger>
    <SelectContent><SelectItem value="all">All platforms</SelectItem>{platforms.map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
   </Select>
  </div>
  <div className="attack-summary">
   <span>{catalogue?framework+' '+catalogue.version:'Loading catalogue…'}</span>
   <span>{active.filter(technique=>!technique.parentId).length} techniques · {active.filter(technique=>technique.parentId).length} sub-techniques</span>
   <span>{mappedIds.size} mapped in this case</span>
   <label><Checkbox checked={mappedOnly} onCheckedChange={value=>setMappedOnly(value===true)}/>Mapped only</label>
   <label><Checkbox checked={retired} onCheckedChange={value=>setRetired(value===true)}/>Show retired</label>
  </div>
  <div className="attack-legend"><span><i className="reviewed"/>Reviewed</span><span><i className="draft"/>Draft</span><span>Mappings describe observed behaviour; they do not measure detection coverage.</span></div>
  {error&&<div className="error" role="alert">{error}</div>}
  {loading?<div className="loading">Loading the official {framework} catalogue…</div>:catalogue&&<>
   <div className="attack-scroll-top" ref={topScrollRef} onScroll={syncFromTop} aria-hidden="true"><div style={{width:matrixWidth}}/></div>
   <div className="attack-scroll" ref={bodyScrollRef} onScroll={syncFromBody} tabIndex={0} aria-label={`${framework} matrix, scroll horizontally to see all tactics`}>
    <div className="attack-matrix" ref={matrixRef} style={{gridTemplateColumns:`repeat(${catalogue.tactics.length},minmax(210px,1fr))`}}>
     {catalogue.tactics.map(tactic=>{
      const column=visible.filter(technique=>technique.tactics.includes(tactic.slug));
      const parents=column.filter(technique=>!technique.parentId);
      const orphans=column.filter(technique=>technique.parentId&&!column.some(parent=>parent.id===technique.parentId));
      return <section className="attack-column" key={tactic.slug}>
       <header><b>{tactic.name}</b><span>{tactic.id} · {column.length}</span></header>
       {parents.map(parent=>{
        const children=column.filter(technique=>technique.parentId===parent.id);
        return <div className="attack-family" key={parent.id}>{tile(parent)}{children.length>0&&<details open={!!search||mappedOnly}><summary>{children.length} sub-techniques</summary>{children.map(child=>tile(child,true))}</details>}</div>;
       })}
       {orphans.map(technique=>tile(technique,true))}
       {!column.length&&<p className="meta">No matching techniques</p>}
      </section>;
     })}
    </div>
   </div>
   {retired&&visible.some(technique=>!technique.tactics.some(tactic=>catalogue.tactics.some(item=>item.slug===tactic)))&&<div className="panel"><h3>Retired techniques outside current tactics</h3><div className="retired-grid">{visible.filter(technique=>!technique.tactics.some(tactic=>catalogue.tactics.some(item=>item.slug===tactic))).map(technique=>tile(technique))}</div></div>}
   <p className="meta attack-attribution">Source: <a href={domain==='atlas'?'https://atlas.mitre.org/':'https://attack.mitre.org/'} target="_blank" rel="noreferrer">{framework}</a> · Catalogue retrieved {new Date(catalogue.retrievedAt).toLocaleDateString('en-GB')} · <a href={catalogue.source} target="_blank" rel="noreferrer">Versioned source data</a> · <a href={domain==='atlas'?'/attack/ATLAS-ATTRIBUTION.txt':'/attack/LICENSE.txt'}>Attribution and terms</a></p>
  </>}
  {selected&&catalogue&&<MappingDialog key={domain+selected.id} technique={selected} catalogue={catalogue} snapshot={snapshot} mappings={mappings.filter(mapping=>mapping.data.techniqueId===selected.id)} onClose={()=>setSelected(null)} onSaved={onSaved}/>}
 </section>;
}

function MappingDialog({technique,catalogue,snapshot,mappings,onClose,onSaved}:{technique:AttackTechnique;catalogue:AttackCatalogue;snapshot?:Snapshot|null;mappings:Entry[];onClose:()=>void;onSaved?:()=>Promise<void>}){
 const [editing,setEditing]=useState<Entry|undefined>(mappings[0]);
 const [rationale,setRationale]=useState(mappings[0]?.data.rationale||'');
 const [notes,setNotes]=useState<string[]>(mappings[0]?.data.sourceNoteIds||[]);
 const [evidence,setEvidence]=useState<string[]>(mappings[0]?.data.evidenceIds||[]);
 const [asset,setAsset]=useState(mappings[0]?.data.assetId||'none');
 const [confidence,setConfidence]=useState(mappings[0]?.data.confidence||'Unassessed');
 const [include,setInclude]=useState(!!mappings[0]?.data.include&&!!snapshot?.permissions?.canReview);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const canWrite=!!snapshot?.permissions?.canWrite;
 const canReview=!!snapshot?.permissions?.canReview;
 function pick(entry?:Entry){setEditing(entry);setRationale(entry?.data.rationale||'');setNotes(entry?.data.sourceNoteIds||[]);setEvidence(entry?.data.evidenceIds||[]);setAsset(entry?.data.assetId||'none');setConfidence(entry?.data.confidence||'Unassessed');setInclude(!!entry?.data.include&&canReview)}
 async function save(){
  if(!snapshot)return;
  setBusy(true);
  setError('');
  try{
   const data={techniqueId:technique.id,name:technique.name,tactics:catalogue.tactics.filter(tactic=>technique.tactics.includes(tactic.slug)).map(tactic=>tactic.name).join(', '),domain:catalogue.domain,attackVersion:catalogue.version,stixId:technique.stixId,externalSource:editing?.data.externalSource,rationale,assetId:asset==='none'?'':asset,sourceNoteIds:notes,evidenceIds:evidence,confidence,include};
   const response=await fetch('/api/records'+(editing?'/'+editing.id:''),{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(editing?{version:editing.version,data}:{caseId:snapshot.case.id,kind:'technique',data})});
   const value:any=await response.json();
   if(!response.ok)throw new Error(value.error||'The mapping could not be saved.');
   await onSaved?.();
   onClose();
  }catch(reason){setError(reason instanceof Error?reason.message:'The mapping could not be saved.')}
  finally{setBusy(false)}
 }

 return <Dialog open onOpenChange={open=>!open&&!busy&&onClose()}>
  <DialogContent className="editor-dialog attack-dialog">
   <DialogHeader>
    <DialogTitle>{technique.id} · {technique.name}</DialogTitle>
    <DialogDescription>{catalogue.name} · {technique.platforms.join(' / ')||'Platform independent'} · {technique.maturity?`Maturity: ${technique.maturity} · `:''}{technique.revoked?'Revoked':technique.deprecated?'Deprecated':'Active'}</DialogDescription>
   </DialogHeader>
   <div className="editor-scroll">
    <div className="prose attack-description"><Markdown components={safeMarkdownComponents}>{technique.description}</Markdown></div>
    <Button asChild variant="link"><a href={technique.url} target="_blank" rel="noreferrer">Open {catalogue.name} reference <ExternalLink/></a></Button>
    <AtlasReferences catalogue={catalogue} technique={technique}/>
    {snapshot?<fieldset disabled={!canWrite||busy}>
     <h3>Case mapping · {snapshot.case.reference}</h3>
     {mappings.length>0&&<Select value={editing?.id||'new'} onValueChange={value=>pick(mappings.find(entry=>entry.id===value))}>
      <SelectTrigger aria-label="Existing mapping"><SelectValue/></SelectTrigger>
      <SelectContent>{mappings.map((mapping,index)=><SelectItem key={mapping.id} value={mapping.id}>Mapping {index+1} · {mapping.data.confidence||'Unassessed'}</SelectItem>)}<SelectItem value="new">Add another mapping</SelectItem></SelectContent>
     </Select>}
     <div className="field"><Label htmlFor="mapping-rationale">Observed behaviour and mapping rationale</Label><Textarea id="mapping-rationale" rows={4} value={rationale} onChange={event=>setRationale(event.target.value)} placeholder="Explain why the evidence supports this technique."/></div>
     <div className="form-grid">
      <div className="field"><Label>Asset</Label><Select value={asset} onValueChange={setAsset}><SelectTrigger aria-label="Mapping asset"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Case-wide</SelectItem>{snapshot.entries.filter(entry=>entry.kind==='asset').map(entry=><SelectItem key={entry.id} value={entry.id}>{entry.data.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="field"><Label>Confidence</Label><Select value={confidence} onValueChange={setConfidence}><SelectTrigger aria-label="Mapping confidence"><SelectValue/></SelectTrigger><SelectContent>{['Unassessed','Low','Medium','High'].map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
     </div>
     <div className="mapping-sources">
      {([['note','Supporting notes',notes,setNotes],['evidence','Supporting evidence',evidence,setEvidence]] as const).map(([kind,label,chosen,setter])=><div key={kind}>
       <h4>{label}</h4>
       {snapshot.entries.filter(entry=>entry.kind===kind).map(entry=><label className="checkline" key={entry.id}><Checkbox checked={chosen.includes(entry.id)} onCheckedChange={checked=>setter(checked?[...chosen,entry.id]:chosen.filter(id=>id!==entry.id))}/>{entry.data.title||entry.data.name}</label>)}
       {!snapshot.entries.some(entry=>entry.kind===kind)&&<p className="meta">No {kind==='note'?'notes':'evidence records'} in this case yet.</p>}
      </div>)}
     </div>
     <label className="checkline"><Checkbox checked={include} disabled={!canReview} onCheckedChange={value=>setInclude(value===true)}/>Validated mapping — include in the Word report</label>
     <p className="meta">Validation requires a rationale and at least one supporting note or evidence record.</p>
    </fieldset>:<p className="notice">Open an investigation to link this technique to your evidence.</p>}
    {error&&<div className="error" role="alert">{error}</div>}
   </div>
   <DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>{snapshot&&<Button onClick={save} disabled={!canWrite||busy}><Link2/>{busy?'Saving…':editing?'Save mapping':'Map technique'}</Button>}</DialogFooter>
  </DialogContent>
 </Dialog>;
}

function AtlasReferences({catalogue,technique}:{catalogue:AttackCatalogue;technique:AttackTechnique}){
 const mitigations=(catalogue.mitigations||[]).filter(mitigation=>technique.mitigationIds?.includes(mitigation.id));
 const caseStudies=(catalogue.caseStudies||[]).filter(study=>technique.caseStudyIds?.includes(study.id));
 if(!mitigations.length&&!caseStudies.length)return null;
 return <div className="atlas-references">
  {mitigations.length>0&&<details><summary>Related mitigations ({mitigations.length})</summary><div className="atlas-reference-list">{mitigations.map(mitigation=><article className="panel" key={mitigation.id}>
   <h4><a href={mitigation.url} target="_blank" rel="noreferrer">{mitigation.id} · {mitigation.name}</a></h4>
   <p className="meta">{[...mitigation.categories,...mitigation.lifecyclePhases].join(' · ')}</p>
   <div className="prose"><Markdown components={safeMarkdownComponents}>{mitigation.description}</Markdown></div>
  </article>)}</div></details>}
  {caseStudies.length>0&&<details><summary>Related case studies ({caseStudies.length})</summary><div className="atlas-reference-list">{caseStudies.map(study=>{
   const steps=study.steps.filter(step=>step.techniqueId===technique.id);
   return <article className="panel" key={study.id}>
    <h4><a href={study.url} target="_blank" rel="noreferrer">{study.id} · {study.name}</a></h4>
    <p className="meta">{[study.type,study.actor,study.target,study.date&&`${study.date}${study.dateGranularity?' ('+study.dateGranularity+')':''}`].filter(Boolean).join(' · ')}</p>
    <div className="prose"><Markdown components={safeMarkdownComponents}>{study.description}</Markdown></div>
    {steps.map((step,index)=><details key={step.stepId||index}><summary>{step.stepId||'Related technique step'}{step.tacticId?' · '+step.tacticId:''}</summary><div className="prose"><Markdown components={safeMarkdownComponents}>{step.description}</Markdown></div>{step.leadsTo.length>0&&<p className="meta">Leads to: {step.leadsTo.join(', ')}</p>}</details>)}
   </article>;
  })}</div></details>}
 </div>;
}
