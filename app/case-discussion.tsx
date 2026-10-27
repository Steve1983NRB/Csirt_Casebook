'use client';
import {useEffect,useState} from 'react';
import {AtSign,MessageSquare,Send} from 'lucide-react';
import {toast} from 'sonner';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import type {Entry} from '@/lib/model';

type Comment={id:string;recordId:string|null;body:string;mentions:string[];authorId:string;author:string;createdAt:string};
export default function CaseDiscussion({caseId,entries,selectedRecord,canWrite}:{caseId:string;entries:Entry[];selectedRecord?:string;canWrite:boolean}){
 const [comments,setComments]=useState<Comment[]>([]),[body,setBody]=useState(''),[recordId,setRecordId]=useState(selectedRecord||''),[busy,setBusy]=useState(false);
 useEffect(()=>{setComments([]);setRecordId(selectedRecord||'');const controller=new AbortController();fetch(`/api/cases/${caseId}/comments`,{signal:controller.signal}).then(async r=>{const b:any=await r.json();if(!r.ok)throw new Error(b.error||'Discussion could not be loaded.');setComments(b)}).catch(e=>{if(e.name!=='AbortError')toast.error(e.message)});return()=>controller.abort()},[caseId,selectedRecord]);
 async function submit(e:React.FormEvent){e.preventDefault();if(!body.trim())return;setBusy(true);try{const r=await fetch(`/api/cases/${caseId}/comments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body,recordId:recordId||null})}),b:any=await r.json();if(!r.ok)throw new Error(b.error||'Comment could not be posted.');setComments(v=>[...v,b]);setBody('');toast.success('Comment added')}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 const names=new Map(entries.map(e=>[e.id,e.data.title||e.data.value||e.data.name||e.data.account||e.data.techniqueId||e.kind]));
 return <div className="discussion-grid">
  <section className="panel"><div className="panel-head"><div><h2><MessageSquare size={18}/> Case discussion</h2><p>Comments are visible to members of this investigation.</p></div><Badge variant="outline">{comments.length}</Badge></div>
   {comments.length?<ol className="comment-list">{comments.map(c=><li key={c.id}><div className="comment-meta"><b>{c.author}</b><time>{new Date(c.createdAt).toLocaleString()}</time>{c.recordId&&<Badge variant="secondary">{names.get(c.recordId)||'Linked record'}</Badge>}</div><p>{c.body.split(/(@[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g).map((part,i)=>part.startsWith('@')?<strong className="mention" key={i}>{part}</strong>:part)}</p>{c.mentions.length>0&&<div className="comment-mentions"><AtSign size={13}/>{c.mentions.join(', ')}</div>}</li>)}</ol>:<div className="empty"><MessageSquare size={26}/><h3>No comments yet</h3><p>Use the discussion to coordinate investigation work. Mention a case member with @email.</p></div>}
  </section>
  <form className="panel comment-form" onSubmit={submit}><h3>Add a comment</h3><p>Use <code>@name@example.com</code> to mention a case member.</p>
   <div className="field"><label htmlFor="comment-target">Link to record (optional)</label><select id="comment-target" value={recordId} onChange={e=>setRecordId(e.target.value)}><option value="">Case-wide discussion</option>{entries.map(e=><option key={e.id} value={e.id}>{e.kind}: {names.get(e.id)}</option>)}</select></div>
   <Textarea value={body} onChange={e=>setBody(e.target.value)} maxLength={5000} rows={7} placeholder="Share an update or ask a teammate…" disabled={!canWrite}/>
   <div className="comment-footer"><span>{body.length}/5000</span><Button type="submit" disabled={!canWrite||busy||!body.trim()}><Send/>{busy?'Posting…':'Post comment'}</Button></div>
  </form>
 </div>;
}
