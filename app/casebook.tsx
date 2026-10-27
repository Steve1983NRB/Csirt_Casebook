'use client';
import {useEffect,useRef,useState} from 'react';
import {FolderOpen,Plus,BookOpen,FileText,ShieldCheck,ArrowRight,Monitor,Clock,Layers,CheckCircle2,Search,ChevronRight,Download,Pencil,Link2,Paperclip,Save,RefreshCw,ListChecks,Activity,Plug,Cloud,ImagePlus,Upload,FileCheck2,Network,Lock,Trash2,Rss,Grid3X3,Share2,Inbox,LayoutDashboard,MessageSquare,Building2,Radar,KeyRound} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {CommandDialog,CommandInput,CommandList,CommandEmpty,CommandGroup,CommandItem,CommandSeparator} from '@/components/ui/command';
import {Label} from '@/components/ui/label';
import {Badge} from '@/components/ui/badge';
import {Checkbox} from '@/components/ui/checkbox';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {SidebarProvider,Sidebar,SidebarHeader,SidebarContent,SidebarFooter,SidebarInset,SidebarTrigger,SidebarMenu,SidebarMenuItem,SidebarMenuButton} from '@/components/ui/sidebar';
import {Toaster,toast} from 'sonner';
import Markdown from 'react-markdown';
import {zipSync,strToU8} from 'fflate';
import {caseSchema,categories,eligible,readiness,type Case,type CaseData,type Entry,type Kind,type Snapshot} from '@/lib/model';
import {generateReport,type ReportImage} from '@/lib/report/generate';
import {integrationCatalog} from '@/lib/integrations';
import AttackMatrix from './attack-catalog';
import DfirNews from './dfir-news';
import DfirToolkit from './dfir-toolkit';
import ThreatIntel from './threat-intel';
import CaseIntel from './case-intel';
import {provenanceJson,provenanceLabel} from '@/lib/provenance';
import ApiKeys from './api-keys';
import CaseFiles from './case-files';
import CaseLinks from './case-links';
import CaseExtras from './case-extras';
import TaxiiPanel from './taxii-panel';
import SocradarPanel from './socradar-panel';
import MispPanel from './misp-panel';
import IntegrationHealth from './integration-health';
import AccessPanel from './access-panel';
import RestoreDialog from './restore-dialog';
import {revisionHash,parseArchive} from '@/lib/archive';
import {useAuth} from './auth-gate';
import AdminPanel from './admin-panel';
import {playbooks,type PlaybookId} from '@/lib/playbooks';
import InvestigationGraph from './investigation-graph';
import AlertInbox from './alert-inbox';
import ClientDirectory from './client-directory';
import CaseDiscussion from './case-discussion';
import WorkspaceViews,{type OperationViewId} from './workspace-views';
import RelatedCases from '@/components/related-cases';
const tabs=[['overview','Overview',Layers],['notebook','Notebook',BookOpen],['timeline','Timeline',Clock],['evidence','Evidence',ShieldCheck],['intelligence','Intelligence',Network],['enrichment','Enrichment',Radar],['actions','Action plan',ListChecks],['graph','Relationships',Share2],['links','Linked cases',Link2],['files','Files',Paperclip],['discussion','Discussion',MessageSquare],['report','Report',FileText],['activity','Activity',Activity],['access','Access',ShieldCheck]] as const;
const kindLabel:Record<string,string>={asset:'Asset',note:'Note',event:'Timeline event',evidence:'Evidence',ioc:'Indicator',identity:'Compromised identity',technique:'ATT&CK / ATLAS technique',action:'Action'};
type SearchResult={id:string;caseId:string;type:'case'|'record';kind?:Kind;title:string;context:string;reference:string;updatedAt:string};
const defaults:Record<Kind,any>={asset:{name:'',type:'Windows',address:'',description:'',compromised:false},note:{title:'',assetId:'',category:'Evidence of Execution',content:'',source:'',evidenceIds:[],status:'Draft',include:false,confidence:'Unassessed'},event:{title:'',assetId:'',noteId:'',evidenceId:'',occurredAt:'',originalTimestamp:'',source:'',description:'',status:'Unconfirmed',include:false},evidence:{name:'',assetId:'',description:'',sha256:'',location:'',acquiredAt:'',collector:'',include:true},ioc:{type:'IP',value:'',description:'',assetId:'',include:false},identity:{account:'',sid:'',description:'',include:false},technique:{techniqueId:'',name:'',tactics:'',rationale:'',include:false},action:{title:'',description:'',owner:'',dueDate:'',status:'To do',priority:'Medium',recommendation:true,include:true}};
async function api(path:string,method='GET',data?:any):Promise<any>{const r=await fetch('/api/'+path,{method,headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});const v:any=await r.json();if(!r.ok)throw new Error(v.error||'Request failed.');return v}
function download(bytes:Uint8Array|string,name:string,mime:string){const blob=new Blob([typeof bytes==='string'?bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer],{type:mime}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function safeFilename(s:string){return s.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100)}
const date=(value:string)=>new Date(value).toLocaleString('en-GB',{timeZone:'UTC',hour12:false})+' UTC';
function Choice({value,onChange,options,label,disabled}:{value:string;onChange:(v:string)=>void;options:(string|[string,string])[];label:string;disabled?:boolean}){return <Select disabled={disabled} value={value||'__none'} onValueChange={v=>onChange(v==='__none'?'':v)}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return <SelectItem key={v||'__none'} value={v||'__none'}>{l}</SelectItem>})}</SelectContent></Select>}
function Empty({icon:Icon=BookOpen,title,description,action}:{icon?:any;title:string;description:string;action?:React.ReactNode}){return <div className="empty"><div className="empty-icon"><Icon size={28}/></div><h3>{title}</h3><p>{description}</p>{action}</div>}
function Metric({label,value,icon:Icon}:{label:string;value:number|string;icon:any}){return <div className="metric"><Icon size={19}/><strong>{value}</strong><span>{label}</span></div>}
export default function Casebook(){
 const auth=useAuth();
 const [cases,setCases]=useState<Case[]>([]),[selected,setSelected]=useState(''),[snap,setSnap]=useState<Snapshot|null>(null),[tab,setTab]=useState('overview'),[section,setSection]=useState('dashboard'),[statusFilter,setStatusFilter]=useState('all'),[priorityFilter,setPriorityFilter]=useState('all'),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[asset,setAsset]=useState('*'),[note,setNote]=useState(''),[modal,setModal]=useState<{kind:Kind|'case';entry?:Entry;editCase?:boolean;seed?:any}|null>(null),[busy,setBusy]=useState(false),[restoreOpen,setRestoreOpen]=useState(false),[reportData,setReportData]=useState<CaseData|null>(null),[dirty,setDirty]=useState(false),[palette,setPalette]=useState(false),[paletteQuery,setPaletteQuery]=useState(''),[searchResults,setSearchResults]=useState<SearchResult[]>([]),[searchLoading,setSearchLoading]=useState(false);
 const [deleteTarget,setDeleteTarget]=useState<{id:string;reference:string}|null>(null),[deleteReference,setDeleteReference]=useState('');
 const [highlightEvidence,setHighlightEvidence]=useState('');
 const [folder,setFolder]=useState('*'),[reportProfile,setReportProfile]=useState<'full'|'executive'>('full');
 const fileInput=useRef<HTMLInputElement>(null);const loadToken=useRef(0);const [intTab,setIntTab]=useState('ioc'),[operationView,setOperationView]=useState<OperationViewId>('tasks');const snapRef=useRef(snap);const dirtyRef=useRef(dirty);
 async function loadCases(){try{setCases(await api('cases'));setError('')}catch(e:any){setError(e.message)}finally{setLoading(false)}}
 async function loadCase(id:string,discardReport=false){const token=++loadToken.current;setLoading(true);setError('');try{const s=await api('cases/'+id);if(token!==loadToken.current)return;const keepDraft=!discardReport&&dirtyRef.current&&snapRef.current?.case.id===id;setSnap(s);if(!keepDraft){setReportData(s.case);setDirty(false)}}catch(e:any){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{loadCases()},[]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setPalette(true)}if(e.key==='/'&&!['INPUT','TEXTAREA'].includes((e.target as HTMLElement)?.tagName)){e.preventDefault();setPalette(true)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
 useEffect(()=>{if(!palette||paletteQuery.trim().length<2){setSearchResults([]);setSearchLoading(false);return}const controller=new AbortController(),timer=setTimeout(async()=>{setSearchLoading(true);try{const r=await fetch('/api/search?q='+encodeURIComponent(paletteQuery.trim()),{signal:controller.signal}),v:any=await r.json();if(!r.ok)throw new Error(v.error||'Search failed.');setSearchResults(v.results||[])}catch(e:any){if(e.name!=='AbortError')toast.error(e.message)}finally{if(!controller.signal.aborted)setSearchLoading(false)}},250);return()=>{clearTimeout(timer);controller.abort()}},[palette,paletteQuery]);
 useEffect(()=>{const context=(document as any).modelContext;if(!context?.registerTool)return;const controller=new AbortController();Promise.resolve(context.registerTool({name:'get_current_investigation_summary',title:'Read investigation summary',description:'Read the selected case reference and counts of assets, notes and report-ready findings. Does not modify the investigation.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input:unknown){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object.');const s=snapRef.current;if(!s)return {selected:false};return {selected:true,reference:s.case.reference,status:s.case.status,assets:s.entries.filter(e=>e.kind==='asset').length,notes:s.entries.filter(e=>e.kind==='note').length,reportFindings:s.entries.filter(e=>e.kind==='note'&&eligible(e)).length}}},{signal:controller.signal})).catch(()=>{});return()=>controller.abort()},[]);
 useEffect(()=>{if(selected)loadCase(selected);else{loadToken.current++;setSnap(null);setLoading(false)}},[selected]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
 useEffect(()=>{snapRef.current=snap;dirtyRef.current=dirty},[snap,dirty]);
 const canWrite=!!snap?.permissions?.canWrite,canReview=!!snap?.permissions?.canReview,canManage=!!snap?.permissions?.canManage;
 const entries=snap?.entries||[],assets=entries.filter(e=>e.kind==='asset'),notes=entries.filter(e=>e.kind==='note'),selectedNote=notes.find(n=>n.id===note),assetName=(id:string)=>assets.find(a=>a.id===id)?.data.name||'Case-wide',filteredNotes=notes.filter(n=>(asset==='*'||n.data.assetId===asset)&&(folder==='*'||(n.data.folder||'')===folder)&&(n.data.title+' '+n.data.content+' '+(n.data.folder||'')).toLowerCase().includes(query.toLowerCase())),folders=[...new Set(notes.map(n=>n.data.folder).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 const normalizedQuery=query.trim().toLowerCase();
 const filteredCases=cases.filter(c=>(statusFilter==='all'||c.status===statusFilter)&&(priorityFilter==='all'||c.priority===priorityFilter)&&(c.title+' '+c.client+' '+c.reference+' '+(c.tags||[]).join(' ')).toLowerCase().includes(normalizedQuery));
 function openCase(id:string){if(dirty&&!confirm('Leave the unsaved report changes?'))return;setDirty(false);setSelected(id);setTab('overview');setAsset('*');setNote('');setQuery('');setSection('cases')}
 function openSearchResult(result:SearchResult){setPalette(false);openCase(result.caseId);if(result.type==='case')return;const target:Record<Kind,string>={asset:'overview',note:'notebook',event:'timeline',evidence:'evidence',ioc:'intelligence',identity:'intelligence',technique:'intelligence',action:'actions'};setTab(target[result.kind!]);if(result.kind==='note')setNote(result.id);if(['ioc','identity','technique'].includes(result.kind!))setIntTab(result.kind!)}
 function openEntry(entry:Entry){const target:Record<Kind,string>={asset:'overview',note:'notebook',event:'timeline',evidence:'evidence',ioc:'intelligence',identity:'intelligence',technique:'intelligence',action:'actions'};setTab(target[entry.kind]);if(entry.kind==='note'){setAsset('*');setNote(entry.id)}if(['ioc','identity','technique'].includes(entry.kind))setIntTab(entry.kind)}
 function openEvidence(id:string){setTab('evidence');setHighlightEvidence(id);setTimeout(()=>document.getElementById('evidence-'+id)?.scrollIntoView({behavior:'smooth',block:'center'}),60);setTimeout(()=>setHighlightEvidence(prev=>prev===id?'':prev),2200)}
 async function refresh(){if(dirty&&!confirm('Reload and discard unsaved report changes?'))return;if(selected)await loadCase(selected,true);await loadCases()}
 async function saveRecord(kind:Kind|'case',data:any,entry?:Entry,editCase?:boolean){if((kind!=='case'||editCase)&&!canWrite)throw new Error('This case is read-only for your role.');if(kind==='case'){if(editCase){const c=await api('cases/'+selected,'PUT',{version:snap!.case.version,data});setSnap(s=>s?{...s,case:c}:s);setReportData(c)}else{const c=await api('cases','POST',data);setSelected(c.id)}await loadCases()}else{await api(entry?'records/'+entry.id:'records',entry?'PUT':'POST',entry?{version:entry.version,data}:{caseId:selected,kind,data});await loadCase(selected)}toast.success('Saved');setModal(null)}
 async function upload(file:File){if(!selectedNote||!canWrite)return;setBusy(true);try{const f=new FormData();f.set('noteId',selectedNote.id);f.set('file',file);const r=await fetch('/api/attachments',{method:'POST',body:f}),v:any=await r.json();if(!r.ok)throw new Error(v.error);await loadCase(selected);toast.success('Screenshot saved and hashed')}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 async function uploadIocFile(recordId:string,file:File){if(!canWrite)return;setBusy(true);try{const form=new FormData();form.set('recordId',recordId);form.set('file',file);const r=await fetch('/api/ioc-files',{method:'POST',body:form}),v:any=await r.json();if(!r.ok)throw new Error(v.error||'Indicator file could not be uploaded.');await loadCase(selected);toast.success('File attached and SHA-256 calculated.')}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 async function changeRecord(e:Entry,patch:any){if(!canWrite)return;try{await api('records/'+e.id,'PUT',{version:e.version,data:{...e.data,...patch}});await loadCase(selected)}catch(e:any){toast.error(e.message)}}
 async function confirmTimeline(){const pending=entries.filter(e=>e.kind==='event'&&e.data.status!=='Confirmed');if(!pending.length)return;if(!confirm('Confirm '+pending.length+' timeline event'+(pending.length===1?'':'s')+'? Each change remains individually audited.'))return;setBusy(true);try{for(const event of pending)await api('records/'+event.id,'PUT',{version:event.version,data:{...event.data,status:'Confirmed'}});await loadCase(selected);toast.success(pending.length+' timeline event'+(pending.length===1?'':'s')+' confirmed')}catch(e:any){toast.error(e.message);await loadCase(selected)}finally{setBusy(false)}}
 async function saveReport(){if(!reportData||!snap||!canWrite)return;setBusy(true);try{const c=await api('cases/'+selected,'PUT',{version:snap.case.version,data:reportData});setSnap({...snap,case:c});setReportData(c);setDirty(false);toast.success('Report sections saved')}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 async function getImages(s:Snapshot){const result:ReportImage[]=[];let total=0;for(const a of s.attachments.filter(a=>s.entries.some(n=>n.id===a.noteId&&eligible(n)))){const r=await fetch('/api/attachments/'+a.id);if(!r.ok)throw new Error('Could not read screenshot: '+a.name);const bytes=new Uint8Array(await r.arrayBuffer());const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');if(digest!==a.sha256)throw new Error('Screenshot integrity check failed: '+a.name);total+=bytes.length;if(total>10*1024*1024)throw new Error('The report contains more than 10 MB of screenshots. Reduce the selected images.');const bitmap=await createImageBitmap(new Blob([bytes],{type:a.mime}));result.push({id:a.id,bytes,width:bitmap.width,height:bitmap.height});bitmap.close()}return result}
 async function exportReport(){if(!canReview){toast.error('Only a reviewer or case owner can publish a Word report.');return}if(dirty){toast.error('Save the report sections before exporting.');return}setBusy(true);try{const s:Snapshot=await api('cases/'+selected),r=await fetch('/CSIRT_Template_Report.docx');if(!r.ok)throw new Error('The Word template is unavailable.');const bytes=generateReport(new Uint8Array(await r.arrayBuffer()),s,await getImages(s),reportProfile);const saved=await fetch('/api/cases/'+selected+'/reports',{method:'POST',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','X-Case-Revision':await revisionHash(s),'X-Report-Profile':reportProfile},body:new Blob([bytes])});const version:any=await saved.json();if(!saved.ok)throw new Error(version.error);download(bytes,version.name,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');await loadCase(selected);toast.success('Word report generated and archived')}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 async function deleteCase(){if(!deleteTarget||deleteReference!==deleteTarget.reference)return;setBusy(true);try{await api('cases/'+deleteTarget.id,'DELETE',{reference:deleteReference});setDeleteTarget(null);setDeleteReference('');if(selected===deleteTarget.id){setSelected('');setSnap(null)}await loadCases();toast.success('Investigation permanently deleted')}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 async function backup(){if(!canManage)return;setBusy(true);try{const s:Snapshot=await api('cases/'+selected+'?archive=1');let archiveSize=0;const files:Record<string,Uint8Array>={'case.json':strToU8(JSON.stringify({format:'csirt-casebook',version:1,exportedAt:new Date().toISOString(),...s},null,2))};for(const a of s.attachments){archiveSize+=a.size;if(archiveSize>15*1024*1024)throw new Error('This case exceeds the 16 MB interactive archive limit. Use an administrator-managed backup.');const r=await fetch('/api/attachments/'+a.id);if(!r.ok)throw new Error('Could not include '+a.name);files['screenshots/'+a.id+(a.mime==='image/png'?'.png':'.jpg')]=new Uint8Array(await r.arrayBuffer())}for(const a of s.iocFiles||[]){archiveSize+=a.size;if(archiveSize>15*1024*1024)throw new Error('This case exceeds the 16 MB interactive archive limit. Use an administrator-managed backup.');const r=await fetch('/api/ioc-files/'+a.id);if(!r.ok)throw new Error('Could not include '+a.name);files['ioc-files/'+a.id+'.bin']=new Uint8Array(await r.arrayBuffer())}const archive=zipSync(files);if(archive.length>16*1024*1024)throw new Error('The archive exceeds the 16 MB interactive restore limit.');await parseArchive(archive);download(archive,safeFilename(s.case.reference)+'_case_archive.zip','application/zip');toast.success('Archive includes notes, evidence, screenshots and indicator files')}catch(e:any){toast.error(e.message)}finally{setBusy(false)}}
 const newButton=(kind:Kind,label?:string,seed?:any)=><Button disabled={!canWrite} onClick={()=>setModal({kind,seed})}><Plus/>{label||'Add '+kindLabel[kind].toLowerCase()}</Button>;
 return (
   <>
     <CommandDialog
       open={palette}
       onOpenChange={setPalette}
      title="CSIRT Investigate command palette"
       description="Search accessible investigations and workspace tools"
     >
       <CommandInput value={paletteQuery} onValueChange={setPaletteQuery} placeholder="Search cases, indicators, assets, notes…" />
       <CommandList>
         <CommandEmpty>{searchLoading?'Searching…':'No matching result.'}</CommandEmpty>
         {searchResults.length>0&&<>
          <CommandGroup heading="Investigation results">
           {searchResults.map(result=><CommandItem key={`${result.type}-${result.id}`} value={`${result.reference} ${result.title} ${result.context} ${result.kind||'case'}`} onSelect={()=>openSearchResult(result)}>
            <Search/><span className="command-result"><b>{result.title}</b><small>{result.reference} · {result.kind?kindLabel[result.kind]:result.context}</small></span>
           </CommandItem>)}
          </CommandGroup>
          <CommandSeparator/>
         </>}
         <CommandGroup heading="Workspace">
           <CommandItem
             onSelect={() => {
               setPalette(false);
               openCase("");
             }}
           >
             <FolderOpen />
             Investigations
           </CommandItem>
           <CommandItem
             onSelect={() => {
               setPalette(false);
               setSection("alerts");
             }}
           >
             <Inbox />
             Alert intake
           </CommandItem>
           <CommandItem
             onSelect={() => {
               setPalette(false);
               setSection("attack");
             }}
           >
             <Grid3X3 />
             ATT&CK / ATLAS
           </CommandItem>
           <CommandItem
             onSelect={() => {
               setPalette(false);
               setSection("news");
             }}
           >
             <Rss />
             DFIR News
           </CommandItem>
           <CommandItem
             onSelect={() => {
               setPalette(false);
               setSection("fieldbook");
             }}
           >
             <BookOpen />
             DFIR Fieldbook
           </CommandItem>
           <CommandItem
             onSelect={() => {
               setPalette(false);
               setSection("intel");
             }}
           >
             <Radar />
             Threat intel
           </CommandItem>
           <CommandItem
             onSelect={() => {
               setPalette(false);
               setSection("integrations");
             }}
           >
             <Plug />
             Integrations
           </CommandItem>
         </CommandGroup>
         {cases.length > 0 && (
           <>
             <CommandSeparator />
             <CommandGroup heading="Recent investigations">
               {cases.slice(0, 8).map((c) => (
                 <CommandItem
                   key={c.id}
                   value={`${c.reference} ${c.title} ${c.client}`}
                   onSelect={() => {
                     setPalette(false);
                     openCase(c.id);
                   }}
                 >
                   <span className="case-dot" />
                   <span>
                     {c.reference} · {c.title}
                   </span>
                 </CommandItem>
               ))}
             </CommandGroup>
           </>
         )}
       </CommandList>
     </CommandDialog>
     <SidebarProvider>
       <Toaster richColors position="bottom-right" />
       <Sidebar>
         <SidebarHeader>
           <button
             className="brand"
             onClick={() => openCase("")}
             aria-label="CSIRT Investigate home"
           >
             <img
               className="brand-logo"
               src="/csirt-dfir-white.png"
               alt="CSIRT DFIR"
             />
             <span>INVESTIGATE</span>
           </button>
         </SidebarHeader>
         <SidebarContent>
           <div className="rail-label">WORKSPACE</div>
           <SidebarMenu>
             <SidebarMenuItem>
               <SidebarMenuButton isActive={section === "dashboard"} onClick={() => setSection("dashboard")}>
                 <LayoutDashboard />
                 <span>Dashboard</span>
               </SidebarMenuButton>
             </SidebarMenuItem>
             <SidebarMenuItem>
               <SidebarMenuButton
                 isActive={section === "cases"}
                 onClick={() => openCase("")}
               >
                 <FolderOpen />
                 <span>Investigations</span>
                 <span className="rail-count">{cases.length}</span>
               </SidebarMenuButton>
             </SidebarMenuItem>
             <SidebarMenuItem>
               <SidebarMenuButton isActive={section === "operations"} onClick={() => setSection("operations")}>
                 <Activity />
                 <span>Operations</span>
               </SidebarMenuButton>
             </SidebarMenuItem>
             <SidebarMenuItem>
               <SidebarMenuButton isActive={section === "clients"} onClick={() => setSection("clients")}>
                 <Building2 />
                 <span>Clients</span>
               </SidebarMenuButton>
             </SidebarMenuItem>
             <SidebarMenuItem>
               <SidebarMenuButton
                 isActive={section === "alerts"}
                 onClick={() => setSection("alerts")}
               >
                 <Inbox />
                 <span>Alert intake</span>
               </SidebarMenuButton>
             </SidebarMenuItem>
             <SidebarMenuItem>
               <SidebarMenuButton
                 isActive={section === "attack"}
                 onClick={() => setSection("attack")}
               >
                 <Grid3X3 />
                 <span>ATT&CK / ATLAS</span>
               </SidebarMenuButton>
             </SidebarMenuItem>
             <SidebarMenuItem>
               <SidebarMenuButton
                 isActive={section === "news"}
                 onClick={() => setSection("news")}
               >
                 <Rss />
                 <span>DFIR News</span>
               </SidebarMenuButton>
             </SidebarMenuItem>
             <SidebarMenuItem>
               <SidebarMenuButton
                 isActive={section === "fieldbook"}
                 onClick={() => setSection("fieldbook")}
               >
                 <BookOpen />
                 <span>DFIR Fieldbook</span>
               </SidebarMenuButton>
             </SidebarMenuItem>
             <SidebarMenuItem>
               <SidebarMenuButton
                 isActive={section === "intel"}
                 onClick={() => setSection("intel")}
               >
                 <Radar />
                 <span>Threat intel</span>
               </SidebarMenuButton>
             </SidebarMenuItem>
             <SidebarMenuItem>
               <SidebarMenuButton
                 isActive={section === "integrations"}
                 onClick={() => {
                   setSection("integrations");
                 }}
               >
                 <Plug />
                 <span>Integrations</span>
               </SidebarMenuButton>
             </SidebarMenuItem>
             <SidebarMenuItem>
               <SidebarMenuButton
                 isActive={section === "apikeys"}
                 onClick={() => setSection("apikeys")}
               >
                 <KeyRound />
                 <span>API keys</span>
               </SidebarMenuButton>
             </SidebarMenuItem>
             {auth.user?.isAdmin && (
               <SidebarMenuItem>
                 <SidebarMenuButton
                   isActive={section === "admin"}
                   onClick={() => setSection("admin")}
                 >
                   <ShieldCheck />
                   <span>Accounts & access</span>
                 </SidebarMenuButton>
               </SidebarMenuItem>
             )}
           </SidebarMenu>
           <div className="rail-label">RECENT CASES</div>
           <SidebarMenu>
             {cases.slice(0, 8).map((c) => (
               <SidebarMenuItem key={c.id}>
                 <SidebarMenuButton
                   isActive={selected === c.id && section === "cases"}
                   onClick={() => openCase(c.id)}
                   title={c.title}
                 >
                   <span
                     className={
                       "case-dot " + (c.status === "Closed" ? "closed" : "")
                     }
                   />
                   <span className="rail-case">
                     <b>{c.reference}</b>
                     <span>{c.client}</span>
                   </span>
                 </SidebarMenuButton>
               </SidebarMenuItem>
             ))}
           </SidebarMenu>
         </SidebarContent>
         <SidebarFooter>
           <div className="rail-footer">
             <ShieldCheck size={18} />
             <div>
               {auth.user?.displayName || "CSIRT workspace"}
               <span>{auth.user?.email || "CSIRT · Digital solutions"}</span>
             </div>
           </div>
           <Button variant="outline" size="sm" onClick={() => auth.signOut()}>
             <Lock />
             Sign out
           </Button>
         </SidebarFooter>
       </Sidebar>
       <SidebarInset>
         <header className="topbar">
           <SidebarTrigger />
           <button onClick={() => openCase("")}>Investigations</button>
           {selected && section === "cases" && (
             <>
               <ChevronRight size={14} />
               <span>{snap?.case.reference || "Loading…"}</span>
             </>
           )}
           <span className="privacy">
             <Lock size={14} /> Private workspace
           </span>
           <Button
             size="icon"
             variant="ghost"
             aria-label="Refresh"
             onClick={refresh}
           >
             <RefreshCw size={16} />
           </Button>
         </header>
         <main className="workspace">
           {error && (
             <div className="error" role="alert">
               {error}{" "}
               <Button variant="outline" onClick={refresh}>
                 Retry
               </Button>
               {error.includes("Sign in") && (
                 <Button variant="outline" onClick={() => auth.refresh()}>
                   Sign in
                 </Button>
               )}
             </div>
           )}
           {section === "clients" ? (
             <ClientDirectory cases={cases} currentUser={auth.user} onOpen={openCase} />
           ) : ["dashboard","operations"].includes(section) ? (
             <WorkspaceViews
               view={section as "dashboard"|"operations"}
               operationView={operationView}
               onOperationViewChange={setOperationView}
               currentUser={auth.user||null}
               onOpen={(id, t) => { openCase(id); setTab(t); }}
             />
           ) : section === "admin" ? (
             <AdminPanel />
           ) : section === "apikeys" ? (
             <ApiKeys />
           ) : section === "alerts" ? (
             <AlertInbox onCaseCreated={loadCases} onOpenCase={openCase}/>
           ) : section === "news" ? (
             <DfirNews />
           ) : section === "fieldbook" ? (
             <DfirToolkit />
           ) : section === "intel" ? (
             <ThreatIntel onOpenCase={(id, t) => { openCase(id); setTab(t); }} />
           ) : section === "attack" ? (
             <AttackMatrix snapshot={snap} onSaved={() => loadCase(selected)} />
           ) : section === "integrations" ? (
             <>
               <div className="page-title">
                 <div>
                   <div className="eyebrow">CONNECTED INVESTIGATIONS</div>
                   <h1>Integrations</h1>
                   <p>
                     Configure intelligence exchange and review future source
                     adapters.
                   </p>
                 </div>
                 <Badge variant="outline">Optional connections</Badge>
               </div>
               <IntegrationHealth />
               <TaxiiPanel
                 snapshot={snap}
                 onImported={() => loadCase(selected)}
               />
               <MispPanel
                 snapshot={snap}
                 onImported={() => loadCase(selected)}
               />
               <div className="integration-grid">
                 {integrationCatalog.map((i) => (
                   <article className="panel integration" key={i.id}>
                     <Plug />
                     <Badge variant="outline">Planned adapter</Badge>
                     <h2>{i.name}</h2>
                     <p>{i.description}</p>
                     <div className="meta">{i.capabilities.join(" · ")}</div>
                   </article>
                 ))}
               </div>
               <div className="notice">
                 <ShieldCheck />
                 <p>
                   The adapters above are planned. AI suggestions will require
                   analyst review and evidence references before entering a
                   report.
                 </p>
               </div>
             </>
           ) : !selected ? (
             <>
               <div className="page-title">
                 <div>
                   <div className="eyebrow">CASE MANAGEMENT</div>
                   <h1>Your investigations</h1>
                   <p>From the first observation to the final report.</p>
                 </div>
                 <div className="button-row">
                   <Button
                     variant="outline"
                     onClick={() => setRestoreOpen(true)}
                   >
                     <Upload />
                     Restore archive
                   </Button>
                   <Button onClick={() => setModal({ kind: "case" })}>
                     <Plus />
                     New investigation
                   </Button>
                 </div>
               </div>
               {loading ? (
                 <div className="loading">Loading investigations…</div>
               ) : cases.length ? (
                 <>
                   <div className="metrics">
                     <Metric
                       value={cases.filter((c) => c.status === "Open").length}
                       label="Open investigations"
                       icon={FolderOpen}
                     />
                     <Metric
                       value={
                         cases.filter((c) => c.status === "In review").length
                       }
                       label="Awaiting review"
                       icon={FileCheck2}
                     />
                     <Metric
                       value={cases.filter((c) => c.status === "Closed").length}
                       label="Closed cases"
                       icon={CheckCircle2}
                     />
                   </div>
                   <div className="search">
                     <Search size={17} />
                     <Input
                       value={query}
                       onChange={(e) => setQuery(e.target.value)}
                       placeholder="Find a case, client or reference…"
                       aria-label="Search investigations"
                     />
                   </div>
                   <div className="filters">
                     <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                       <option value="all">All statuses</option><option>Open</option><option>In review</option><option>Closed</option>
                     </select>
                     <select aria-label="Priority" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                       <option value="all">Any priority</option><option>P1</option><option>P2</option><option>P3</option><option>P4</option><option>Unassessed</option>
                     </select>
                   </div>
                   <div className="case-grid">
                     {filteredCases.map((c) => (
                         <button
                           className="case-card"
                           key={c.id}
                           onClick={() => openCase(c.id)}
                         >
                           <div className="card-top">
                             <span className="reference">{c.reference}</span>
                             <span className="card-badges">
                               {c.priority && c.priority !== "Unassessed" && <Badge variant={c.priority === "P1" ? "destructive" : "secondary"}>{c.priority}</Badge>}
                               <Badge variant="outline">{c.status}</Badge>
                             </span>
                           </div>
                           <h2>{c.title}</h2>
                           <p>{c.client}</p>
                           {c.tags && c.tags.length > 0 && (
                             <div className="case-tags">
                               {c.tags.map((t) => (
                                 <Badge variant="secondary" key={t}>
                                   {t}
                                 </Badge>
                               ))}
                             </div>
                           )}
                           <div className="card-foot">
                             <span>
                               {c.date} · {c.tlp}
                             </span>
                             <ArrowRight size={18} />
                           </div>
                         </button>
                       ))}
                   </div>
                   {(normalizedQuery||statusFilter!=='all'||priorityFilter!=='all') && filteredCases.length === 0 && (
                     <Empty
                       icon={Search}
                       title="No matching investigation"
                       description={`No case matches “${query.trim()}”. Try another reference, client, title or tag.`}
                       action={
                         <Button variant="outline" onClick={() => { setQuery(""); setStatusFilter("all"); setPriorityFilter("all"); }}>
                           Clear filters
                         </Button>
                       }
                     />
                   )}
                 </>
               ) : (
                 <>
                   <div className="welcome">
                     <BookOpen size={42} />
                     <h2>Every finding, in the right place.</h2>
                     <p>
                       Open a case, organise your assets and document your
                       investigation. Your validated findings become your CSIRT
                       incident report.
                     </p>
                     <Button onClick={() => setModal({ kind: "case" })}>
                       Create an investigation <ArrowRight />
                     </Button>
                     <div className="workflow">
                       <span>01 / INVESTIGATE</span>
                       <span>02 / VALIDATE</span>
                       <span>03 / REPORT</span>
                     </div>
                   </div>
                   <div className="template-banner">
                     <FileText />
                     <div>
                       <b>Your CSIRT report is connected</b>
                       <p>
                         Original cover, analysis by asset, timeline and
                         evidence inventory.
                       </p>
                     </div>
                   </div>
                 </>
               )}
             </>
           ) : loading || snap?.case.id !== selected ? (
             <div className="loading">Opening investigation…</div>
           ) : snap ? (
             <>
               <div className="page-title">
                 <div>
                   <div className="eyebrow">
                     {snap.case.reference} <span className="sep">/</span>{" "}
                     {snap.case.client}
                   </div>
                   <h1>{snap.case.title}</h1>
                   <div className="case-meta">
                     <Badge variant="outline">{snap.case.tlp}</Badge>
                     <Badge variant="secondary">{snap.case.status}</Badge>
                     {snap.case.priority !== "Unassessed" && (
                       <Badge variant={snap.case.priority === "P1" ? "destructive" : "outline"}>{snap.case.priority}</Badge>
                     )}
                     <span>{snap.case.date}</span>
                     <Badge variant="outline">
                       {snap.permissions?.role || "Loading access…"}
                     </Badge>
                     <span>{snap.case.team || "Team not assigned"}</span>
                   </div>
                 </div>
                 <div className="button-row">
                   {canManage&&<Button variant="destructive" onClick={()=>{setDeleteReference('');setDeleteTarget({id:snap.case.id,reference:snap.case.reference})}}><Trash2/>Delete case</Button>}
                   <Button
                     variant="outline"
                     disabled={!canWrite}
                     onClick={() => setModal({ kind: "case", editCase: true })}
                   >
                     <Pencil />
                     Case details
                   </Button>
                   <Button onClick={() => setTab("report")}>
                     <FileText />
                     Prepare report
                   </Button>
                 </div>
               </div>
               <Tabs
                 value={tab}
                 onValueChange={(v) => {
                   if (dirty && !confirm("Leave unsaved report changes?"))
                     return;
                   setTab(v);
                 }}
               >
                 <TabsList className="case-tabs" variant="line">
                   {tabs
                     .filter(([v]) => v !== "access" || canManage)
                     .map(([v, label, Icon]) => (
                       <TabsTrigger key={v} value={v}>
                         <Icon size={16} />
                         {label}
                         {v === "notebook" && (
                           <span className="tab-count">{notes.length}</span>
                         )}
                       </TabsTrigger>
                     ))}
                 </TabsList>
                 <TabsContent value="overview">
                   <div className="metrics">
                     <Metric
                       value={assets.length}
                       label="Assets in scope"
                       icon={Monitor}
                     />
                     <Metric
                       value={notes.length}
                       label="Investigation notes"
                       icon={BookOpen}
                     />
                     <Metric
                       value={notes.filter(eligible).length}
                       label="Findings for report"
                       icon={FileCheck2}
                     />
                     <Metric
                       value={entries.filter((e) => e.kind === "event").length}
                       label="Timeline events"
                       icon={Clock}
                     />
                   </div>
                   <div className="overview-grid">
                     <article className="panel">
                       <div className="panel-head">
                         <h2>Investigation scope</h2>
                         <Button
                           size="sm"
                           variant="ghost"
                           disabled={!canWrite}
                           onClick={() => setTab("report")}
                         >
                           <Pencil />
                           Edit
                         </Button>
                       </div>
                       {snap.case.scope ? (
                         <div className="prose">
                           <Markdown
                             components={{
                               img: () => (
                                 <span>
                                   [Image reference — attach the screenshot to
                                   the note]
                                 </span>
                               ),
                             }}
                           >
                             {snap.case.scope}
                           </Markdown>
                         </div>
                       ) : (
                         <Empty
                           title="Define the investigation"
                           description="Describe the assignment, systems covered and any collection limits."
                           action={
                             <Button
                               variant="outline"
                               onClick={() => setTab("report")}
                             >
                               Define scope
                             </Button>
                           }
                         />
                       )}
                       <div className="panel-head spaced">
                         <h3>Assets</h3>
                         {newButton("asset")}
                       </div>
                       {assets.length ? (
                         <div className="asset-grid">
                           {assets.map((a) => (
                             <button
                               className="asset-card"
                               key={a.id}
                               onClick={() => {
                                 setAsset(a.id);
                                 setTab("notebook");
                                 setNote("");
                               }}
                             >
                               <Monitor size={21} />
                               <div>
                                 <b>{a.data.name}</b>
                                 <span>
                                   {a.data.type}{" "}
                                   {a.data.address && "· " + a.data.address}
                                 </span>
                               </div>
                               <ChevronRight size={17} />
                             </button>
                           ))}
                         </div>
                       ) : (
                         <p className="muted">
                           Add the machines, cloud tenants or network equipment
                           in scope.
                         </p>
                       )}
                     </article>
                     <aside className="panel readiness">
                       <div className="panel-head">
                         <h2>Report preparation</h2>
                         <FileText size={20} />
                       </div>
                       {readiness(snap).map((r) => (
                         <div className="readiness-row" key={r.label}>
                           {r.ok ? (
                             <CheckCircle2 className="green" size={18} />
                           ) : (
                             <span className="empty-circle" />
                           )}
                           <span>{r.label}</span>
                         </div>
                       ))}
                       <Button
                         variant="outline"
                         onClick={() => setTab("report")}
                       >
                         Open report workspace <ArrowRight />
                       </Button>
                       <p>
                         Only validated, selected notes and confirmed, selected
                         events enter the report.
                       </p>
                     </aside>
                   </div>
                 </TabsContent>
                 <TabsContent value="notebook">
                   <div className="notebook">
                     <aside className="asset-rail">
                       <div className="panel-head">
                         <h3>Assets</h3>
                         <Button
                           variant="ghost"
                           size="icon"
                           aria-label="Add asset"
                           disabled={!canWrite}
                           onClick={() => setModal({ kind: "asset" })}
                         >
                           <Plus />
                         </Button>
                       </div>
                       <button
                         className={asset === "*" ? "active" : ""}
                         onClick={() => {
                           setAsset("*");
                           setNote("");
                         }}
                       >
                         <Layers size={17} />
                         All assets<span>{notes.length}</span>
                       </button>
                       <button
                         className={asset === "" ? "active" : ""}
                         onClick={() => {
                           setAsset("");
                           setNote("");
                         }}
                       >
                         <BookOpen size={17} />
                         Case-wide
                         <span>
                           {notes.filter((n) => !n.data.assetId).length}
                         </span>
                       </button>
                       {assets.map((a) => (
                         <div className="asset-rail-row" key={a.id}>
                           <button
                             className={asset === a.id ? "active" : ""}
                             onClick={() => {
                               setAsset(a.id);
                               setNote("");
                             }}
                           >
                             {a.data.type === "Cloud" ? (
                               <Cloud size={17} />
                             ) : (
                               <Monitor size={17} />
                             )}
                             <span>{a.data.name}</span>
                             <span>
                               {
                                 notes.filter((n) => n.data.assetId === a.id)
                                   .length
                               }
                             </span>
                           </button>
                           <Button
                             size="icon-xs"
                             variant="ghost"
                             aria-label={"Edit " + a.data.name}
                             disabled={!canWrite}
                             onClick={() =>
                               setModal({ kind: "asset", entry: a })
                             }
                           >
                             <Pencil />
                           </Button>
                         </div>
                       ))}
                     </aside>
                     <section className="note-list">
                       <div className="panel-head">
                         <h3>Notes</h3>
                         <Button
                           size="icon"
                           aria-label="New note"
                           disabled={!canWrite}
                           onClick={() =>
                             setModal({
                               kind: "note",
                               seed: { assetId: asset === "*" ? "" : asset },
                             })
                           }
                         >
                           <Plus />
                         </Button>
                       </div>
                       <div className="search">
                         <Search size={15} />
                         <Input
                           placeholder="Search notes…"
                           value={query}
                           onChange={(e) => setQuery(e.target.value)}
                           aria-label="Search notes"
                         />
                       </div>
                       <div className="folder-filter">
                         <FolderOpen size={15} />
                         <select value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Filter notes by folder">
                           <option value="*">All folders</option>
                           <option value="">Unfiled</option>
                           {folders.map((name) => <option key={name} value={name}>{name}</option>)}
                         </select>
                       </div>
                       {filteredNotes.map((n) => (
                         <button
                           key={n.id}
                           className={
                             "note-item " + (n.id === note ? "active" : "")
                           }
                           onClick={() => setNote(n.id)}
                         >
                           <div className="note-item-top">
                             <span>{n.data.category}</span>
                             {eligible(n) && <FileCheck2 size={15} />}
                           </div>
                           <b>{n.data.title}</b>
                           <p>
                             {n.data.content.slice(0, 100) || "No content yet"}
                           </p>
                           <span className="meta">
                             {assetName(n.data.assetId)} · {n.data.folder ? n.data.folder + " · " : ""}{n.data.status}
                           </span>
                         </button>
                       ))}
                       {!filteredNotes.length && (
                         <p className="list-empty">No notes here yet.</p>
                       )}
                     </section>
                     <article
                       className="note-view"
                       onPaste={(e) => {
                         const f = Array.from(e.clipboardData.files).find((f) =>
                           f.type.startsWith("image/"),
                         );
                         if (f && selectedNote) {
                           e.preventDefault();
                           upload(f);
                         }
                       }}
                     >
                       {selectedNote ? (
                         <>
                           <div className="note-toolbar">
                             <Badge
                               variant={
                                 eligible(selectedNote)
                                   ? "default"
                                   : "secondary"
                               }
                             >
                               {eligible(selectedNote)
                                 ? "Selected for report"
                                 : selectedNote.data.status}
                             </Badge>
                             <Button
                               variant="outline"
                               size="sm"
                               disabled={!canWrite}
                               onClick={() =>
                                 setModal({ kind: "note", entry: selectedNote })
                               }
                             >
                               <Pencil />
                               Edit note
                             </Button>
                           </div>
                           <div className="eyebrow">
                             {assetName(selectedNote.data.assetId)} /{" "}
                             {selectedNote.data.category}
                           </div>
                           <h2>{selectedNote.data.title}</h2>
                           <div className="meta">
                             Updated {date(selectedNote.updatedAt)} ·{" "}
                             {selectedNote.author}
                           </div>
                           <div className="prose note-content">
                             <Markdown
                               components={{
                                 img: () => (
                                   <span>
                                     [Image reference — attach the screenshot to
                                     the note]
                                   </span>
                                 ),
                               }}
                             >
                               {selectedNote.data.content || "No content yet."}
                             </Markdown>
                           </div>
                           <div className="note-source">
                             <Link2 size={16} />
                             <div>
                               <b>Source</b>
                               <p>
                                 {selectedNote.data.source || "Not specified"}
                               </p>
                               <span>
                                 Confidence: {selectedNote.data.confidence}
                               </span>
                             </div>
                           </div>
                           {selectedNote.data.evidenceIds.length > 0 && (
                             <div className="linked-evidence">
                               <h3>Linked evidence</h3>
                               {entries
                                 .filter((e) =>
                                   selectedNote.data.evidenceIds.includes(e.id),
                                 )
                                 .map((e) => (
                                   <div key={e.id}>
                                     <Paperclip size={14} />
                                     {e.data.name}
                                   </div>
                                 ))}
                             </div>
                           )}
                           <div className="panel-head spaced">
                             <h3>Screenshots</h3>
                             <Button
                               size="sm"
                               variant="outline"
                               disabled={busy || !canWrite}
                               onClick={() => fileInput.current?.click()}
                             >
                               <ImagePlus />
                               Add image
                             </Button>
                           </div>
                           <input
                             type="file"
                             accept="image/png,image/jpeg"
                             hidden
                             ref={fileInput}
                             onChange={(e) => {
                               if (e.target.files?.[0])
                                 upload(e.target.files[0]);
                               e.target.value = "";
                             }}
                           />
                           <p className="meta">
                             PNG or JPEG, up to 8 MB. You can also paste a
                             screenshot here.
                           </p>
                           <div className="screenshots">
                             {snap.attachments
                               .filter((a) => a.noteId === selectedNote.id)
                               .map((a) => (
                                 <figure key={a.id}>
                                   <a
                                     href={"/api/attachments/" + a.id}
                                     target="_blank"
                                     rel="noreferrer"
                                   >
                                     <img
                                       src={"/api/attachments/" + a.id}
                                       alt={a.name}
                                     />
                                   </a>
                                   <figcaption>
                                     {a.name}
                                     <code title={a.sha256}>
                                       SHA256 {a.sha256}
                                     </code>
                                   </figcaption>
                                 </figure>
                               ))}
                           </div>
                           {selectedNote.data.externalSource && (
                             <details className="external-provenance">
                               <summary>
                                 External intelligence provenance
                               </summary>
                               <p>
                                 {selectedNote.data.externalSource.provider} ·{" "}
                                 {selectedNote.data.externalSource.stixId}
                               </p>
                               <pre>
                                 {provenanceJson(selectedNote.data.externalSource)}
                               </pre>
                             </details>
                           )}
                           <div className="note-actions">
                             <Button
                               variant="outline"
                               disabled={!canWrite}
                               onClick={() =>
                                 setModal({
                                   kind: "event",
                                   seed: {
                                     title: selectedNote.data.title,
                                     description: selectedNote.data.content,
                                     assetId: selectedNote.data.assetId,
                                     noteId: selectedNote.id,
                                     source: selectedNote.data.source,
                                   },
                                 })
                               }
                             >
                               <Clock />
                               Create timeline event
                             </Button>
                           </div>
                         </>
                       ) : (
                         <Empty
                           icon={BookOpen}
                           title="Your investigation notebook"
                           description="Choose a note, or document a new finding. Organise notes by asset and attach the supporting evidence."
                           action={newButton("note", "Write a note", {
                             assetId: asset === "*" ? "" : asset,
                           })}
                         />
                       )}
                     </article>
                   </div>
                 </TabsContent>
                 <TabsContent value="timeline">
                   <div className="section-head">
                     <div>
                       <h2>Incident timeline</h2>
                       <p>
                         UTC order · original timestamps and sources preserved
                       </p>
                     </div>
                     <div className="button-row">
                       {canReview && entries.some((e) => e.kind === "event" && e.data.status !== "Confirmed") && (
                         <Button variant="outline" disabled={busy} onClick={confirmTimeline}>
                           <CheckCircle2 />
                           Confirm pending
                         </Button>
                       )}
                       {newButton("event")}
                     </div>
                   </div>
                   {entries.some((e) => e.kind === "event") ? (
                     <div className="timeline">
                       {entries
                         .filter((e) => e.kind === "event")
                         .sort(
                           (a, b) =>
                             Date.parse(a.data.occurredAt) -
                             Date.parse(b.data.occurredAt),
                         )
                         .map((e) => (
                           <article className="timeline-item" key={e.id}>
                             <time>{date(e.data.occurredAt)}</time>
                             <span
                               className={
                                 "timeline-marker " +
                                 (e.data.status === "Confirmed"
                                   ? "confirmed"
                                   : "")
                               }
                             />
                             <div className="panel">
                               <div className="panel-head">
                                 <h3>{e.data.title}</h3>
                                 <Button
                                   variant="ghost"
                                   size="icon"
                                   aria-label="Edit event"
                                   disabled={!canWrite}
                                   onClick={() =>
                                     setModal({ kind: "event", entry: e })
                                   }
                                 >
                                   <Pencil />
                                 </Button>
                               </div>
                               <div className="case-meta">
                                 <Badge variant="secondary">
                                   {assetName(e.data.assetId)}
                                 </Badge>
                                 <Badge variant="outline">
                                   {e.data.status}
                                 </Badge>
                                 {eligible(e) && <Badge>In report</Badge>}
                               </div>
                               <p>{e.data.description}</p>
                               <div className="meta">
                                 Source: {e.data.source}
                                 <br />
                                 Original: {e.data.originalTimestamp}
                               </div>
                               {e.data.noteId && (
                                 <Button
                                   variant="link"
                                   onClick={() => {
                                     setNote(e.data.noteId);
                                     setAsset("*");
                                     setTab("notebook");
                                   }}
                                 >
                                   <Link2 />
                                   Open source note
                                 </Button>
                               )}
                               {e.data.evidenceId && (
                                 <Button
                                   variant="link"
                                   onClick={() => openEvidence(e.data.evidenceId)}
                                 >
                                   <ShieldCheck />
                                   Open source evidence
                                 </Button>
                               )}
                             </div>
                           </article>
                         ))}
                     </div>
                   ) : (
                     <Empty
                       icon={Clock}
                       title="Reconstruct the sequence"
                       description="Create an event from a notebook finding or add a timestamped event with its source."
                       action={newButton("event")}
                     />
                   )}
                 </TabsContent>
                 <TabsContent value="evidence">
                   <div className="section-head">
                     <div>
                       <h2>Evidence register</h2>
                       <p>
                         Track forensic acquisitions, locations and hashes.
                         Attach screenshots to notes.
                       </p>
                     </div>
                     {newButton("evidence")}
                   </div>
                   <div className="record-grid">
                     {entries
                       .filter((e) => e.kind === "evidence")
                       .map((e) => (
                         <article
                           key={e.id}
                           id={"evidence-" + e.id}
                           className={
                             "panel evidence-card" +
                             (highlightEvidence === e.id ? " highlight" : "")
                           }
                         >
                           <div className="panel-head">
                             <ShieldCheck size={22} />
                             <Button
                               variant="ghost"
                               size="icon"
                               aria-label="Edit evidence"
                               disabled={!canWrite}
                               onClick={() =>
                                 setModal({ kind: "evidence", entry: e })
                               }
                             >
                               <Pencil />
                             </Button>
                           </div>
                           <h3>{e.data.name}</h3>
                           <Badge variant="secondary">
                             {assetName(e.data.assetId)}
                           </Badge>
                           <p>{e.data.description}</p>
                           <div className="evidence-detail">
                             <span>LOCATION</span>
                             <code>{e.data.location || "Not recorded"}</code>
                             <span>SHA256</span>
                             <code>{e.data.sha256 || "Not supplied"}</code>
                             <span>ACQUISITION</span>
                             <p>
                               {e.data.acquiredAt || "Not recorded"} ·{" "}
                               {e.data.collector || "Collector not recorded"}
                             </p>
                           </div>
                           <div className="meta">
                             Acquisition hashes are analyst-supplied. Screenshot
                             hashes are computed on upload.
                           </div>
                           <div className="note-actions">
                             <Button
                               variant="outline"
                               disabled={!canWrite}
                               onClick={() =>
                                 setModal({
                                   kind: "event",
                                   seed: {
                                     title: e.data.name,
                                     description: e.data.description,
                                     assetId: e.data.assetId,
                                     evidenceId: e.id,
                                     source:
                                       e.data.collector ||
                                       e.data.location ||
                                       "Evidence register: " + e.data.name,
                                   },
                                 })
                               }
                             >
                               <Clock />
                               Create timeline event
                             </Button>
                           </div>
                         </article>
                       ))}
                   </div>
                   {!entries.some((e) => e.kind === "evidence") && (
                     <Empty
                       icon={ShieldCheck}
                       title="Start the evidence register"
                       description="Reference your E01, memory captures, log exports or other evidence in their existing storage location."
                       action={newButton("evidence")}
                     />
                   )}
                 </TabsContent>
                 <TabsContent value="intelligence">
                   <Tabs value={intTab} onValueChange={setIntTab}>
                     <div className="section-head">
                       <TabsList>
                         <TabsTrigger value="ioc">Indicators</TabsTrigger>
                         <TabsTrigger value="identity">
                           Compromised identities
                         </TabsTrigger>
                         <TabsTrigger value="technique">
                           MITRE ATT&CK
                         </TabsTrigger>
                       </TabsList>
                       {intTab !== "technique" && newButton(intTab as Kind)}
                     </div>
                     {intTab === "technique" ? (
                       <AttackMatrix
                         snapshot={snap}
                         onSaved={() => loadCase(selected)}
                       />
                     ) : (
                       <>
                         <div className="record-grid">
                           {entries
                             .filter((e) => e.kind === intTab)
                             .map((e) => (
                               <article className="panel" key={e.id}>
                                 <div className="panel-head">
                                   <Badge variant="outline">
                                     {e.kind === "ioc"
                                       ? e.data.type
                                       : e.kind === "technique"
                                         ? e.data.techniqueId
                                         : "Identity"}
                                   </Badge>
                                   <Button
                                     variant="ghost"
                                     size="icon"
                                     aria-label="Edit record"
                                     disabled={!canWrite}
                                     onClick={() =>
                                       setModal({ kind: e.kind, entry: e })
                                     }
                                   >
                                     <Pencil />
                                   </Button>
                                 </div>
                                 <h3 className="wrap">
                                   {e.data.value ||
                                     e.data.account ||
                                     e.data.name}
                                 </h3>
                                 {e.data.externalSource && (
                                   <details className="external-provenance">
                                     <summary>{provenanceLabel(e.data.externalSource)}</summary>
                                     <pre>
                                       {provenanceJson(e.data.externalSource)}
                                     </pre>
                                   </details>
                                 )}
                                 <p>{e.data.description || e.data.rationale}</p>
                                 {e.data.tactics && <p>{e.data.tactics}</p>}
                                 {e.data.sid && (
                                   <code className="wrap">{e.data.sid}</code>
                                 )}
                                 {e.kind === "ioc" && (
                                   <RelatedCases
                                     kind="ioc"
                                     value={e.data.value}
                                     caseId={selected}
                                     onOpen={openCase}
                                   />
                                 )}
                                 {e.kind === "ioc" && (
                                   <div className="ioc-files">
                                     <div className="panel-head"><h3>Indicator files</h3>
                                       <Button size="sm" variant="outline" disabled={!canWrite||busy} onClick={()=>document.getElementById("ioc-file-"+e.id)?.click()}><Upload/>Attach file</Button>
                                     </div>
                                     <input id={"ioc-file-"+e.id} type="file" hidden onChange={event=>{const file=event.target.files?.[0];if(file)uploadIocFile(e.id,file);event.target.value=""}}/>
                                     <p className="meta">Any file type, up to 8 MB. SHA-256 is calculated on upload; files are never rendered inline.</p>
                                     {(snap.iocFiles||[]).filter(f=>f.recordId===e.id).map(f=><div className="ioc-file" key={f.id}><a href={"/api/ioc-files/"+f.id}>{f.name}</a><code>{f.sha256}</code><span>{Math.ceil(f.size/1024)} KB</span></div>)}
                                     {!(snap.iocFiles||[]).some(f=>f.recordId===e.id)&&<span className="muted">No file attached.</span>}
                                   </div>
                                 )}
                                 <div className="checkline">
                                   <Checkbox
                                     disabled={!canReview}
                                     checked={e.data.include}
                                     id={"include-" + e.id}
                                     onCheckedChange={(v) =>
                                       changeRecord(e, { include: v === true })
                                     }
                                   />
                                   <Label htmlFor={"include-" + e.id}>
                                     Include in report
                                   </Label>
                                 </div>
                               </article>
                             ))}
                         </div>
                         {!entries.some((e) => e.kind === intTab) && (
                           <Empty
                             icon={Network}
                             title={
                               "No " +
                               (intTab === "ioc"
                                 ? "indicators"
                                 : intTab === "identity"
                                   ? "compromised identities"
                                   : "ATT&CK / ATLAS techniques") +
                               " recorded"
                             }
                             description="Add evidence-backed observations and select which ones should enter the client report."
                             action={newButton(intTab as Kind)}
                           />
                         )}
                       </>
                     )}
                   </Tabs>
                 </TabsContent>
                 <TabsContent value="actions">
                   <div className="section-head">
                     <div>
                       <h2>Action plan</h2>
                       <p>
                         Response tasks and recommendations, with owners and
                         progress.
                       </p>
                     </div>
                     {newButton("action")}
                   </div>
                   <div className="kanban">
                     {["To do", "In progress", "Done"].map((status) => (
                       <section key={status}>
                         <div className="kanban-head">
                           <h3>{status}</h3>
                           <Badge variant="secondary">
                             {
                               entries.filter(
                                 (e) =>
                                   e.kind === "action" &&
                                   e.data.status === status,
                               ).length
                             }
                           </Badge>
                         </div>
                         {entries
                           .filter(
                             (e) =>
                               e.kind === "action" && e.data.status === status,
                           )
                           .map((e) => (
                             <article key={e.id} className="panel task">
                               <div className="panel-head">
                                 <Badge variant="outline">
                                   {e.data.priority}
                                 </Badge>
                                 <Button
                                   variant="ghost"
                                   size="icon"
                                   aria-label="Edit action"
                                   disabled={!canWrite}
                                   onClick={() =>
                                     setModal({ kind: "action", entry: e })
                                   }
                                 >
                                   <Pencil />
                                 </Button>
                               </div>
                               <h3>{e.data.title}</h3>
                               <p>{e.data.description}</p>
                               <div className="meta">
                                 {e.data.owner || "Unassigned"}
                                 {e.data.dueDate && " · Due " + e.data.dueDate}
                               </div>
                               {e.data.recommendation && (
                                 <span className="recommendation">
                                   Client recommendation
                                 </span>
                               )}
                               <Choice
                                 disabled={!canWrite}
                                 label="Action status"
                                 value={e.data.status}
                                 options={["To do", "In progress", "Done"]}
                                 onChange={(v) =>
                                   changeRecord(e, { status: v })
                                 }
                               />
                             </article>
                           ))}
                         <Button
                           variant="ghost"
                           disabled={!canWrite}
                           onClick={() =>
                             setModal({ kind: "action", seed: { status } })
                           }
                         >
                           <Plus />
                           Add action
                         </Button>
                       </section>
                     ))}
                   </div>
                 </TabsContent>
                 <TabsContent value="graph">
                   <div className="section-head">
                     <div>
                       <h2>Investigation relationships</h2>
                       <p>Assets, findings, evidence, events and intelligence. Double-click an artefact to open it.</p>
                     </div>
                   </div>
                   <InvestigationGraph snapshot={snap} onOpen={openEntry}/>
                 </TabsContent>
                 <TabsContent value="discussion">
                   <CaseDiscussion caseId={selected} entries={entries} canWrite={canWrite} />
                 </TabsContent>
                 <TabsContent value="report">
                   {reportData && (
                     <>
                       <div className="section-head">
                         <div>
                           <h2>Report workspace</h2>
                           <p>
                             Your original CSIRT Word template, populated from
                             this investigation.
                           </p>
                         </div>
                         <div className="button-row">
                           <label className="report-profile">Report format
                             <select value={reportProfile} onChange={e=>setReportProfile(e.target.value as 'full'|'executive')} aria-label="Report format">
                               <option value="full">Full technical report</option>
                               <option value="executive">Executive brief</option>
                             </select>
                           </label>
                           <Button
                             disabled={!dirty || busy || !canWrite}
                             variant="outline"
                             onClick={saveReport}
                           >
                             <Save />
                             {dirty ? "Save changes" : "Saved"}
                           </Button>
                           <Button
                             disabled={busy || dirty || !canReview}
                             onClick={exportReport}
                           >
                             <Download />
                             {busy ? "Preparing…" : "Export Word"}
                           </Button>
                         </div>
                       </div>
                       <div className="report-grid">
                         <fieldset
                           disabled={!canWrite}
                           className="panel report-editor"
                         >
                           {[
                             [
                               "summary",
                               "Executive summary",
                               "Assignment, main findings and business impact.",
                             ],
                             [
                               "scope",
                               "Scope",
                               "Systems, period, data sources and limitations.",
                             ],
                             [
                               "conclusion",
                               "Conclusions",
                               "What the evidence supports, remaining uncertainty and next steps.",
                             ],
                             [
                               "impact",
                               "Impact assessment",
                               "Confirmed operational, data or identity impacts.",
                             ],
                           ].map(([key, label, help]) => (
                             <div className="field" key={key}>
                               <Label htmlFor={"report-" + key}>{label}</Label>
                               <p className="meta">{help}</p>
                               <Textarea
                                 id={"report-" + key}
                                 rows={key === "summary" ? 7 : 5}
                                 value={(reportData as any)[key]}
                                 onChange={(e) => {
                                   setReportData({
                                     ...reportData,
                                     [key]: e.target.value,
                                   });
                                   setDirty(true);
                                 }}
                               />
                             </div>
                           ))}
                           <div className="form-grid">
                             {[
                               ["incidentType", "Incident type"],
                               ["urgency", "Urgency"],
                               ["reportVersion", "Report version"],
                             ].map(([key, label]) => (
                               <div className="field" key={key}>
                                 <Label htmlFor={key}>{label}</Label>
                                 <Input
                                   id={key}
                                   value={(reportData as any)[key]}
                                   onChange={(e) => {
                                     setReportData({
                                       ...reportData,
                                       [key]: e.target.value,
                                     });
                                     setDirty(true);
                                   }}
                                 />
                               </div>
                             ))}
                           </div>
                         </fieldset>
                         <aside>
                           <figure className="template-preview">
                             <img
                               src="/template-cover.png"
                               alt="Original CSIRT report cover"
                               loading="lazy"
                             />
                             <figcaption>Original CSIRT template</figcaption>
                           </figure>
                           <div className="panel report-mapping">
                             <h3>Automatic sections</h3>
                             {[
                               [
                                 "Analysis by asset",
                                 notes.filter(eligible).length,
                               ],
                               [
                                 "Recommendations",
                                 entries.filter(
                                   (e) =>
                                     e.kind === "action" &&
                                     eligible(e) &&
                                     e.data.recommendation,
                                 ).length,
                               ],
                               [
                                 "ATT&CK / ATLAS techniques",
                                 entries.filter(
                                   (e) => e.kind === "technique" && eligible(e),
                                 ).length,
                               ],
                               [
                                 "Indicators",
                                 entries.filter(
                                   (e) => e.kind === "ioc" && eligible(e),
                                 ).length,
                               ],
                               [
                                 "Timeline events",
                                 entries.filter(
                                   (e) => e.kind === "event" && eligible(e),
                                 ).length,
                               ],
                               [
                                 "Evidence records",
                                 entries.filter(
                                   (e) => e.kind === "evidence" && eligible(e),
                                 ).length,
                               ],
                             ].map(([label, n]) => (
                               <div key={label}>
                                 <span>{label}</span>
                                 <b>{n}</b>
                               </div>
                             ))}
                             <p>
                               Draft notes and unconfirmed events are excluded.
                               Empty sections are marked as not documented.
                             </p>
                             <p>
                               Word can refresh the table of contents when the
                               document opens. The original cover artwork is
                               preserved.
                             </p>
                             <a
                               href="/CSIRT_Template_Report.docx"
                               download
                             >
                               Download original template
                             </a>
                           </div>
                         </aside>
                       </div>
                       <div className="panel report-history">
                         <h3>Archived Word reports</h3>
                         <p className="meta">
                           Each file retains the source revision and SHA-256
                           recorded at generation.
                         </p>
                         {(snap.reports || []).map((r) => (
                           <div className="report-version" key={r.id}>
                             <div>
                               <b>{r.name}</b>
                               <span>
                                 {date(r.createdAt)} · {r.author}
                               </span>
                               <code>{r.sha256}</code>
                             </div>
                             <Button variant="outline" asChild>
                               <a href={"/api/reports/" + r.id}>
                                 <Download />
                                 Word
                               </a>
                             </Button>
                             <Button variant="ghost" asChild>
                               <a href={"/api/reports/" + r.id + "?source=1"}>
                                 Source snapshot
                               </a>
                             </Button>
                           </div>
                         ))}
                         {!snap.reports?.length && (
                           <p className="meta">
                             No archived report yet. A reviewer or owner can
                             generate the first version.
                           </p>
                         )}
                       </div>
                     </>
                   )}
                 </TabsContent>
                 <TabsContent value="enrichment">
                   <SocradarPanel
                     snapshot={snap}
                     onImported={() => loadCase(selected)}
                   />
                   <CaseIntel caseId={selected} key={selected} entries={entries} canWrite={canWrite} onChanged={() => loadCase(selected)} />
                 </TabsContent>
                 <TabsContent value="links">
                   <CaseLinks caseId={selected} key={selected} canWrite={canWrite} cases={cases} onOpenCase={(id) => { openCase(id); setTab("overview"); }} />
                 </TabsContent>
                 <TabsContent value="files">
                   <CaseFiles caseId={selected} key={selected} canWrite={canWrite} />
                 </TabsContent>
                 <TabsContent value="access">
                   {canManage && (
                     <AccessPanel caseId={selected} key={selected} />
                   )}
                 </TabsContent>
                 <TabsContent value="activity">
                   <div className="section-head">
                     <div>
                       <h2>Investigation activity</h2>
                       <p>
                         Who changed what, and when. The latest 200 changes are
                         shown. The case archive contains records, screenshots
                         and history; download archived Word files separately.
                       </p>
                     </div>
                     <Button
                       variant="outline"
                       disabled={busy || !canManage}
                       onClick={backup}
                     >
                       <Download />
                       Export case archive
                     </Button>
                   </div>
                   <div className="panel activity-list">
                     {snap.audit.map((a: any) => (
                       <details key={a.id}>
                         <summary>
                           <Activity size={16} />
                           <b>{a.action.replaceAll(".", " · ")}</b>
                           <span>{a.actor}</span>
                           <time>{date(a.at)}</time>
                         </summary>
                         <pre>
                           {JSON.stringify(JSON.parse(a.details), null, 2)}
                         </pre>
                       </details>
                     ))}
                   </div>
                 </TabsContent>
               </Tabs>
             </>
           ) : null}
         </main>
       </SidebarInset>
      {deleteTarget&&<Dialog open onOpenChange={open=>!open&&!busy&&setDeleteTarget(null)}><DialogContent><DialogHeader><DialogTitle>Delete {deleteTarget.reference} permanently?</DialogTitle><DialogDescription>This removes the investigation, records, evidence metadata, screenshots, access list and archived reports. This action cannot be undone.</DialogDescription></DialogHeader><div className="field"><Label htmlFor="delete-reference">Type <b>{deleteTarget.reference}</b> to confirm</Label><Input id="delete-reference" value={deleteReference} onChange={e=>setDeleteReference(e.target.value)} autoComplete="off"/></div><DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setDeleteTarget(null)}>Cancel</Button><Button variant="destructive" disabled={busy||deleteReference!==deleteTarget.reference} onClick={deleteCase}><Trash2/>{busy?'Deleting…':'Delete permanently'}</Button></DialogFooter></DialogContent></Dialog>}
       {restoreOpen && (
         <RestoreDialog
           onClose={() => setRestoreOpen(false)}
           onRestored={(id) => {
             setRestoreOpen(false);
             loadCases();
             openCase(id);
             toast.success("Investigation restored as a new case");
           }}
         />
       )}
       {modal && (
         <Editor
           modal={modal}
           snapshot={snap}
           onClose={() => setModal(null)}
           onSave={saveRecord}
         />
       )}
     </SidebarProvider>
   </>
 );
}
function Editor({modal,snapshot,onClose,onSave}:{modal:{kind:Kind|'case';entry?:Entry;editCase?:boolean;seed?:any};snapshot:Snapshot|null;onClose:()=>void;onSave:(kind:any,data:any,entry?:Entry,editCase?:boolean)=>Promise<void>}){
 const kind=modal.kind;const canReview=!!snapshot?.permissions?.canReview;const canManage=!!snapshot?.permissions?.canManage;const [data,setData]=useState<any>(()=>kind==='case'?modal.editCase?{...snapshot!.case}:{...caseSchema.parse({title:'_',reference:'_',client:'_',date:new Date().toISOString().slice(0,10)}),title:'',reference:'',client:''}:{...defaults[kind],...modal.seed,...modal.entry?.data,...(!canReview&&modal.entry&&kind==='note'?{status:'Draft'}:{}),...(!canReview&&modal.entry&&kind==='event'?{status:'Unconfirmed'}:{})});const [error,setError]=useState(''),[saving,setSaving]=useState(false),[changed,setChanged]=useState(false),[preview,setPreview]=useState(false);
 const change=(k:string,v:any)=>{setData((d:any)=>({...d,[k]:v}));setChanged(true)};
 const text=(key:string,label:string,large=false,type='text',help?:string)=><div className={'field '+(large?'wide':'')} key={key}><Label htmlFor={'f-'+key}>{label}</Label>{help&&<p className="meta">{help}</p>}{large?<Textarea id={'f-'+key} rows={kind==='note'&&key==='content'?14:4} value={data[key]||''} onChange={e=>change(key,e.target.value)}/>:<Input id={'f-'+key} type={type} value={data[key]||''} onChange={e=>change(key,e.target.value)}/>}</div>;
 const choice=(key:string,label:string,options:(string|[string,string])[])=><div className="field" key={key}><Label>{label}</Label><Choice value={data[key]||''} label={label} options={options} onChange={v=>change(key,v)}/></div>;
 const check=(key:string,label:string)=><div className="checkline" key={key}><Checkbox id={'f-'+key} disabled={!canReview&&((key==='include'&&['ioc','identity','technique'].includes(kind))||key==='compromised')} checked={!!data[key]} onCheckedChange={v=>change(key,v===true)}/><Label htmlFor={'f-'+key}>{label}</Label></div>;
 const assetField=()=>choice('assetId','Asset',[['','Case-wide'],...(snapshot?.entries.filter(e=>e.kind==='asset').map(e=>[e.id,e.data.name] as [string,string])||[])]);
 const close=()=>{if(changed&&!confirm('Discard unsaved changes?'))return;onClose()};
 async function save(e:React.FormEvent){e.preventDefault();setSaving(true);setError('');try{const d={...data};if(kind==='event'){if(!/(Z|[+-]\d{2}:\d{2})$/.test(d.originalTimestamp)||!Number.isFinite(Date.parse(d.originalTimestamp)))throw new Error('Use an ISO 8601 timestamp with timezone, for example 2026-09-14T14:32:00+02:00.');d.occurredAt=new Date(d.originalTimestamp).toISOString()}await onSave(kind,d,modal.entry,modal.editCase)}catch(e:any){setError(e.message)}finally{setSaving(false)}}
 return <Dialog open onOpenChange={open=>!open&&close()}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>{modal.entry||modal.editCase?'Edit':'New'} {kind==='case'?'investigation':kindLabel[kind].toLowerCase()}</DialogTitle><DialogDescription>{kind==='note'?'Record observations, source references and your analysis. Markdown formatting is supported.':kind==='case'?'Define the case metadata used on your CSIRT report.':'Keep each record linked to its source and investigation.'}</DialogDescription></DialogHeader><form onSubmit={save}><div className="editor-scroll"><div className="form-grid">
 {kind==='case'&&<>{text('title','Investigation title')}{text('reference','Case reference')}{text('client','Client')}{text('date','Notification date',false,'date')}{text('team','Project team')}{!modal.editCase&&choice('playbook','Response playbook',Object.entries(playbooks).map(([id,playbook])=>[id,playbook.label] as [string,string]))}{!modal.editCase&&<p className="meta wide">{playbooks[(data.playbook||'standard') as PlaybookId].description} The playbook creates an editable action plan when the case is opened.</p>}{choice('tlp','Classification',['TLP:AMBER','TLP:AMBER+STRICT','TLP:RED','TLP:GREEN','TLP:CLEAR'])}{choice('status','Case status',canReview||!modal.editCase?['Open','In review','Closed']:['Open','In review'])}{choice('priority','Priority',['Unassessed','P1','P2','P3','P4'])}<div className="field wide" key="tags"><Label htmlFor="f-tags">Tags / campaign labels (comma separated)</Label><Input id="f-tags" value={(data.tags||[]).join(', ')} onChange={e=>change('tags',e.target.value.split(',').map((s:string)=>s.trim()).filter(Boolean))}/></div>{modal.editCase&&<div className="checkline wide" key="requireDualReview"><Checkbox id="f-requireDualReview" disabled={!canManage} checked={!!data.requireDualReview} onCheckedChange={v=>change('requireDualReview',v===true)}/><Label htmlFor="f-requireDualReview">Require a different reviewer than the author before validating findings (four-eyes)</Label></div>}<CaseExtras data={data} change={change} isNew={!modal.editCase}/></>}
 {kind==='asset'&&<>{text('name','Asset name')}{choice('type','Platform',['Windows','Linux','macOS','Cloud','Network','Other'])}{text('address','IP address / identifier')}{text('description','Description and role',true)}{check('compromised','Confirmed compromised device')}</>}
 {kind==='note'&&<>{text('title','Note title')}{text('folder','Notebook folder',false,'text','Organize notes with a folder name, for example: Initial access or Persistence.')}{assetField()}{choice('category','Analysis category',[...categories])}{choice('confidence','Confidence',['Unassessed','Low','Medium','High'])}<div className="wide"><div className="panel-head"><Label>Observation and analysis</Label><Button size="sm" variant="ghost" type="button" onClick={()=>setPreview(!preview)}>{preview?'Edit':'Preview'}</Button></div>{preview?<div className="prose markdown-preview"><Markdown components={{img:()=> <span>[Image reference — attach the screenshot to the note]</span>}}>{data.content||'Nothing to preview.'}</Markdown></div>:text('content','Note content',true)}</div>{text('source','Source / tool / artefact reference')}{choice('status','Review state',canReview?['Draft','Validated']:['Draft'])}<div className="wide field"><Label>Linked forensic evidence</Label><div className="evidence-picker">{snapshot?.entries.filter(e=>e.kind==='evidence').map(e=><div className="checkline" key={e.id}><Checkbox id={'ev-'+e.id} checked={data.evidenceIds.includes(e.id)} onCheckedChange={v=>change('evidenceIds',v?[...data.evidenceIds,e.id]:data.evidenceIds.filter((id:string)=>id!==e.id))}/><Label htmlFor={'ev-'+e.id}>{e.data.name}</Label></div>)}{!snapshot?.entries.some(e=>e.kind==='evidence')&&<p className="meta">Add records in Evidence to link them here.</p>}</div></div>{check('include','Include this note in the report after validation')}</>}
 {kind==='event'&&<>{text('title','Event title')}{assetField()}{text('originalTimestamp','Original timestamp with timezone',false,'text','Example: 2026-09-14T14:32:00+02:00')}{text('source','Source reference')}{text('description','Event details',true)}{choice('status','Confirmation',canReview?['Unconfirmed','Confirmed']:['Unconfirmed'])}{check('include','Include in report when confirmed')}</>}
 {kind==='evidence'&&<>{text('name','Evidence filename / name')}{assetField()}{text('description','Description',true)}{text('location','Storage location / S3 reference')}{text('sha256','SHA256 (64 hexadecimal characters)')}{text('acquiredAt','Acquisition date and timezone')}{text('collector','Collected by')}{check('include','Include in evidence appendix')}</>}
 {kind==='ioc'&&<>{choice('type','Indicator type',['IP','Domain','URL','SHA256','SHA1','MD5','File name','Other'])}{text('value','Indicator value')}{assetField()}{text('description','Context and source',true)}{check('include','Confirmed indicator — include in report')}</>}
 {kind==='identity'&&<>{text('account','Account / identity')}{text('sid','SID / immutable identifier')}{text('description','Evidence of compromise',true)}{check('include','Confirmed compromised identity — include in report')}</>}
 {kind==='technique'&&<>{text('techniqueId','ATT&CK or ATLAS technique ID')}{text('name','Technique name')}{text('tactics','Tactics')}{text('rationale','Evidence and mapping rationale',true)}{check('include','Validated technique — include in report')}</>}
 {kind==='action'&&<>{text('title','Action title')}{text('owner','Owner')}{text('description','Details',true)}{text('dueDate','Due date',false,'date')}{choice('priority','Priority',['High','Medium','Low'])}{choice('status','Status',['To do','In progress','Done'])}{check('recommendation','Also include as a client recommendation')}{check('include','Include in report action plan')}</>}
 </div>{error&&<div className="error" role="alert">{error}</div>}</div><DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={close}>Cancel</Button><Button type="submit" disabled={saving}><Save/>{saving?'Saving…':'Save '+(kind==='case'?'case':kindLabel[kind].toLowerCase())}</Button></DialogFooter></form></DialogContent></Dialog>
}
