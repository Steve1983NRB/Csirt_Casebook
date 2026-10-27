'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {FileUp,Download,Trash2,Folder,Hash} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {call,fmtDate,fmtSize} from './workspace-api';

type FileRow={id:string;folder:string;name:string;size:number;sha256:string;description:string;createdAt:string;author:string};

// Case file store: working files kept with the investigation, separate from report evidence records.
export default function CaseFiles({caseId,canWrite}:{caseId:string;canWrite:boolean}){
 const [data,setData]=useState<{files:FileRow[];limits:any;used:number}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[folder,setFolder]=useState(''),[description,setDescription]=useState('');
 const input=useRef<HTMLInputElement>(null);
 const load=useCallback(()=>{call(`cases/${caseId}/datastore`).then(d=>{setData(d);setError('')}).catch(e=>setError(e.message))},[caseId]);
 useEffect(()=>{load()},[load]);
 async function upload(file:File){setBusy(true);try{const form=new FormData();form.set('file',file);form.set('folder',folder);form.set('description',description);await call(`cases/${caseId}/datastore`,'POST',form);setDescription('');load()}catch(e:any){setError(e.message)}finally{setBusy(false);if(input.current)input.current.value=''}}
 async function remove(f:FileRow){if(!confirm(`Delete ${f.name}? This cannot be undone.`))return;try{await call('datastore/'+f.id,'DELETE');load()}catch(e:any){setError(e.message)}}
 const folders=[...new Set((data?.files||[]).map(f=>f.folder))].sort();
 return <div className="case-intel">
  <div className="section-head"><div><h2>Case files</h2><p>Working files for this investigation: samples, exports, notes. Each file is hashed on upload and downloaded as an opaque attachment, never opened in the app.</p></div></div>
  {error&&<div className="error" role="alert">{error}</div>}
  {canWrite&&<div className="panel"><div className="access-form">
   <Input aria-label="Folder" placeholder="Folder (optional)" list="case-folders" value={folder} onChange={e=>setFolder(e.target.value)} maxLength={100}/><datalist id="case-folders">{folders.filter(Boolean).map(f=><option key={f} value={f}/>)}</datalist>
   <Input aria-label="Description" placeholder="Description (optional)" value={description} onChange={e=>setDescription(e.target.value)} maxLength={1000}/>
   <input ref={input} type="file" hidden onChange={e=>{const f=e.target.files?.[0];if(f)upload(f)}}/>
   <Button disabled={busy} onClick={()=>input.current?.click()}><FileUp/>{busy?'Uploading…':'Upload file'}</Button></div>
   {data&&<p className="meta">{fmtSize(data.used)} of {fmtSize(data.limits.maxTotal)} used · up to {fmtSize(data.limits.maxFile)} per file</p>}</div>}
  <div className="panel">{!data?<p className="meta">Loading…</p>:!data.files.length?<p className="meta">No files yet.</p>:folders.map(fd=><div key={fd||'_'}>
   <h3><Folder size={15}/> {fd||'Unfiled'}</h3>
   {data.files.filter(f=>f.folder===fd).map(f=><div className="ioc-file" key={f.id}><div><b>{f.name}</b> <Badge variant="outline">{fmtSize(f.size)}</Badge><div className="meta"><Hash size={12}/> <code>{f.sha256}</code></div>{f.description&&<div className="meta">{f.description}</div>}<div className="meta">{f.author} · {fmtDate(f.createdAt)}</div></div>
    <div className="button-row"><Button size="sm" variant="outline" asChild><a href={'/api/datastore/'+f.id} download><Download/>Download</a></Button>{canWrite&&<Button size="sm" variant="ghost" aria-label={'Delete '+f.name} onClick={()=>remove(f)}><Trash2/></Button>}</div></div>)}
  </div>)}</div>
 </div>;
}
