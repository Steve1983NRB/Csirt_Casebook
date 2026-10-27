import {createHash} from 'node:crypto';
import {deflateSync,crc32} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {generateReport,type ReportImage} from '../lib/report/generate';
import {revisionHash} from '../lib/archive';

export const DEMO_REFERENCE='DEMO-DLH-2026-001';
export type CallInit={json?:unknown;form?:FormData;raw?:Uint8Array;headers?:Record<string,string>};
export type Call=(method:string,path:string,init?:CallInit)=>Promise<{status:number;body:any}>;

const t=(day:number,time:string)=>`2026-10-${String(day).padStart(2,'0')}T${time}:00+02:00`;
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');

function png(width:number,height:number,accent:[number,number,number]){
 const rows=Buffer.alloc((width*3+1)*height);
 const paint=(x0:number,y0:number,w:number,h:number,c:[number,number,number])=>{for(let y=y0;y<Math.min(height,y0+h);y++)for(let x=x0;x<Math.min(width,x0+w);x++){const o=y*(width*3+1)+1+x*3;rows[o]=c[0];rows[o+1]=c[1];rows[o+2]=c[2]}};
 paint(0,0,width,height,[24,26,34]);paint(0,0,width,34,[48,52,68]);paint(14,11,12,12,[237,106,94]);paint(34,11,12,12,[245,191,79]);paint(54,11,12,12,[97,197,84]);
 paint(0,34,width,56,accent);paint(24,52,360,18,[255,255,255]);
 for(let i=0;i<9;i++)paint(24,120+i*44,260+((i*97)%420),14,i%3===0?accent:[96,104,128]);
 paint(width-300,120,260,200,[36,40,54]);paint(width-280,140,220,16,accent);paint(width-280,176,180,10,[96,104,128]);paint(width-280,200,200,10,[96,104,128]);
 const chunk=(type:string,data:Buffer)=>{const head=Buffer.alloc(8);head.writeUInt32BE(data.length,0);head.write(type,4,'ascii');const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4),data])),0);return Buffer.concat([head,data,crc])};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;
 return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));
}

const caseData={
 title:'Ransomware attack on Delhaize — double extortion',reference:DEMO_REFERENCE,client:'Delhaize',date:'2026-10-14',
 team:'CSIRT — Incident Response',status:'In review' as const,tlp:'TLP:AMBER+STRICT' as const,reportVersion:'1.0',
 incidentType:'Ransomware (double extortion)',priority:'P1' as const,urgency:'Immediate — business operations impacted',playbook:'ransomware' as const,
 tags:['demo','ransomware','double-extortion','data-theft','critical'],requireDualReview:false,
 summary:'FICTIONAL DEMONSTRATION SCENARIO — all people, hosts, addresses and indicators are invented (documentation address ranges and reserved domains only).\n\nOn 14 October 2026 at 03:20, the NightHarvest ransomware crew encrypted file servers and virtualisation backups across the Delhaize head-office network. The intrusion began on 12 October with a phishing e-mail delivering an ISO container to a finance workstation. The attacker obtained domain administrator privileges within 30 hours, exfiltrated about 480 GB of finance and HR data to a cloud storage provider, deleted shadow copies and stopped the backup agent before launching encryption through a Group Policy scheduled task.\n\nThe EDR raised a critical alert at 03:52 and the network was segmented at 04:10. Stores and the e-commerce platform were not impacted because they run in a separate environment. Containment is complete; recovery of file services from offline backups is in progress.',
 scope:'In scope: Delhaize head-office Active Directory domain (DLH.LOCAL), finance and HR file shares, backup infrastructure, Microsoft 365 tenant mail flow, perimeter firewall logs from 2026-10-12 to 2026-10-14.\nOut of scope: store point-of-sale network, e-commerce platform, third-party logistics partners.',
 impact:'Head-office file services unavailable (about 1,900 users). Approximately 480 GB of finance and HR documents exfiltrated, with a ransom demand of 40 BTC and a threat of publication in 7 days. Potential GDPR notification (Belgian DPA) within 72 hours of confirmation.',
 conclusion:'The attacker gained initial access through a phishing e-mail, escalated to domain administrator through credential theft, exfiltrated data and then deployed ransomware. The access paths used (stolen credentials, RDP/SMB lateral movement, unprotected backup server) were all preventable. Containment is effective: no further attacker activity has been observed since 04:10 on 14 October. Recommendations focus on credential hygiene, backup isolation, e-mail attachment controls and detection of mass exfiltration.'
};

const assets=[
 {name:'DLH-FIN-WS042',type:'Windows',address:'10.20.4.42',description:'Finance workstation of the first victim (patient zero). Received and opened the phishing attachment.',compromised:true},
 {name:'DLH-FS01',type:'Windows',address:'10.20.1.15',description:'Head-office file server hosting finance and HR shares. Data staged here and encrypted on 14 October.',compromised:true},
 {name:'DLH-DC01',type:'Windows',address:'10.20.1.5',description:'Primary domain controller. Credentials harvested and GPO used to deploy the ransomware.',compromised:true},
 {name:'DLH-BKP01',type:'Windows',address:'10.20.1.30',description:'Backup server. Backup agent stopped and repository encrypted. Offline copies were not reachable.',compromised:true},
 {name:'DLH-ERP-DB02',type:'Linux',address:'10.20.2.20',description:'ERP database server. Isolated before the attacker reached it; no evidence of compromise.',compromised:false},
 {name:'DLH Microsoft 365 tenant',type:'Cloud',address:'delhaize-demo.example',description:'Mail flow and sign-in logs used to trace the phishing delivery.',compromised:false},
 {name:'DLH-FW-EDGE01',type:'Network',address:'10.20.0.1',description:'Perimeter firewall. Source of outbound traffic logs showing command-and-control and exfiltration.',compromised:false}
];

const evidence=[
 {name:'phishing-invoice-4471.eml',asset:5,description:'Original phishing e-mail with headers, exported from the Microsoft 365 tenant.',location:'evidence://DEMO-DLH-2026-001/mail/phishing-invoice-4471.eml',acquiredAt:t(14,'09:30'),collector:'CSIRT — analyst A'},
 {name:'DLH-FIN-WS042-memory.raw',asset:0,description:'Live memory capture of the patient-zero workstation before isolation.',location:'evidence://DEMO-DLH-2026-001/memory/DLH-FIN-WS042-memory.raw',acquiredAt:t(14,'05:15'),collector:'CSIRT — analyst A'},
 {name:'DLH-FS01-triage.zip',asset:1,description:'KAPE triage collection: MFT, USN journal, event logs, prefetch, shimcache.',location:'evidence://DEMO-DLH-2026-001/triage/DLH-FS01-triage.zip',acquiredAt:t(14,'06:40'),collector:'CSIRT — analyst B'},
 {name:'DLH-DC01-Security.evtx',asset:2,description:'Windows Security log from the domain controller (logons, group policy and account activity).',location:'evidence://DEMO-DLH-2026-001/logs/DLH-DC01-Security.evtx',acquiredAt:t(14,'07:20'),collector:'CSIRT — analyst B'},
 {name:'fw-edge01-outbound-2026-10-12_14.csv',asset:6,description:'Firewall outbound session export for the intrusion window.',location:'evidence://DEMO-DLH-2026-001/network/fw-edge01-outbound.csv',acquiredAt:t(14,'08:05'),collector:'Delhaize network team'},
 {name:'README_RESTORE_FILES.txt',asset:1,description:'Ransom note dropped in every encrypted folder.',location:'evidence://DEMO-DLH-2026-001/malware/README_RESTORE_FILES.txt',acquiredAt:t(14,'06:50'),collector:'CSIRT — analyst B'}
];

const iocs=[
 {type:'IP',value:'203.0.113.45',description:'Cobalt-Strike-style command-and-control server contacted from DLH-FIN-WS042.',asset:0},
 {type:'Domain',value:'cdn-update-service.invalid',description:'C2 domain resolved by the loader. Reserved TLD used for this demo.',asset:0},
 {type:'URL',value:'hxxps://cdn-update-service[.]invalid/api/v2/sync',description:'Beacon URL observed in proxy logs.',asset:0},
 {type:'IP',value:'198.51.100.77',description:'Cloud storage endpoint that received the exfiltrated archives.',asset:1},
 {type:'Domain',value:'invoices-delhaize-portal.example',description:'Phishing sender domain (typosquat).',asset:5},
 {type:'SHA256',value:sha('demo:Supplier_Invoice_4471.iso'),description:'Phishing ISO container.',asset:0},
 {type:'SHA256',value:sha('demo:loader.dll'),description:'Loader DLL side-loaded by the LNK payload.',asset:0},
 {type:'SHA256',value:sha('demo:nightharvest.exe'),description:'Ransomware encryptor deployed through GPO.',asset:1},
 {type:'File name',value:'rclone.exe',description:'Legitimate sync utility renamed to svchost-update.exe on DLH-FS01 and used for exfiltration.',asset:1},
 {type:'File name',value:'README_RESTORE_FILES.txt',description:'Ransom note filename.',asset:1,file:true},
 {type:'File name',value:'\\\\DLH-DC01\\SYSVOL\\dlh.local\\scripts\\enc.ps1',description:'Script used by the GPO scheduled task to launch the encryptor.',asset:2},
 {type:'Other',value:'.nhv3',description:'Extension appended to encrypted files.',asset:1}
];

const identities=[
 {account:'DLH\\j.peeters',sid:'S-1-5-21-1000000001-2000000002-3000000003-1142',description:'Finance accountant who opened the phishing attachment. Account used by the attacker until password reset on 14 October.'},
 {account:'DLH\\adm_lmartin',sid:'S-1-5-21-1000000001-2000000002-3000000003-1008',description:'Domain administrator whose credentials were dumped from memory on DLH-FS01.'},
 {account:'DLH\\svc_backup',sid:'S-1-5-21-1000000001-2000000002-3000000003-1219',description:'Backup service account with excessive privileges, used to stop the backup agent.'}
];

const techniques=[
 ['T1566.001','Phishing: Spearphishing Attachment','Initial Access','ISO attachment delivered by a typosquatted supplier domain.',[0],[0]],
 ['T1204.002','User Execution: Malicious File','Execution','Finance user mounted the ISO and opened the LNK file.',[1],[1]],
 ['T1059.001','Command and Scripting Interpreter: PowerShell','Execution','Obfuscated PowerShell stager launched by the LNK file.',[1],[1]],
 ['T1574.002','Hijack Execution Flow: DLL Side-Loading','Defense Evasion','Loader DLL side-loaded by a signed binary inside the ISO.',[1],[1]],
 ['T1071.001','Application Layer Protocol: Web Protocols','Command and Control','HTTPS beaconing every 60 seconds to the C2 server.',[2],[4]],
 ['T1003.001','OS Credential Dumping: LSASS Memory','Credential Access','LSASS dump on DLH-FS01 gave the domain administrator hash.',[3],[2]],
 ['T1078.002','Valid Accounts: Domain Accounts','Defense Evasion, Persistence, Privilege Escalation, Initial Access','Domain admin account used for all later movement.',[3],[3]],
 ['T1021.001','Remote Services: Remote Desktop Protocol','Lateral Movement','RDP from the workstation to DLH-FS01 and DLH-BKP01.',[3],[3]],
 ['T1021.002','Remote Services: SMB/Windows Admin Shares','Lateral Movement','Remote service execution through admin shares.',[3],[2]],
 ['T1018','Remote System Discovery','Discovery','Network and share enumeration scripts executed before staging.',[4],[2]],
 ['T1567.002','Exfiltration Over Web Service: Exfiltration to Cloud Storage','Exfiltration','rclone upload of about 480 GB to a cloud storage endpoint.',[5],[4]],
 ['T1562.001','Impair Defenses: Disable or Modify Tools','Defense Evasion','EDR agent tampering attempted and backup agent stopped.',[6],[2]],
 ['T1490','Inhibit System Recovery','Impact','Shadow copies deleted with vssadmin and backup catalogue wiped.',[6],[2]],
 ['T1484.001','Domain or Tenant Policy Modification: Group Policy Modification','Defense Evasion, Privilege Escalation','GPO created on DLH-DC01 to launch the encryptor on all servers.',[7],[3]],
 ['T1486','Data Encrypted for Impact','Impact','Mass encryption of file shares and virtualisation backups.',[7],[2,5]],
 ['T1070.001','Indicator Removal: Clear Windows Event Logs','Defense Evasion','Security log cleared on DLH-FS01 at the end of the operation.',[8],[2]]
] as const;

export async function seedDemoCase(call:Call,ctx:{email:string;readTemplate?:()=>Uint8Array}){
 const step=async(method:string,path:string,init?:CallInit,ok=[200,201])=>{const r=await call(method,path,init);if(!ok.includes(r.status))throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(r.body)}`);return r.body};

 const existing:any[]=await step('GET','cases');
 if(existing.some(c=>c.reference===DEMO_REFERENCE))throw new Error(`Demo case ${DEMO_REFERENCE} already exists. Run with --reset to rebuild it.`);

 await call('POST','clients',{json:{name:'Delhaize',contactName:'Sophie Janssens (CISO)',email:'ciso@delhaize-demo.example',phone:'+32 2 000 00 00',notes:'Fictional demo client. 24/7 escalation: SOC duty manager. Preferred language: French/English.'}});

 const alertDefs=[
  {title:'EDR: mass file modification on DLH-FS01',source:'EDR',severity:'Critical',client:'Delhaize',occurredAt:t(14,'03:52'),description:'More than 12,000 files renamed with the .nhv3 extension in 90 seconds on DLH-FS01. Ransom note README_RESTORE_FILES.txt created.',sourceReference:'EDR-ALERT-884201'},
  {title:'Suspicious ISO mounted from e-mail attachment',source:'Mail gateway',severity:'High',client:'Delhaize',occurredAt:t(12,'08:19'),description:'ISO attachment mounted on DLH-FIN-WS042 two minutes after delivery (not escalated at the time).',sourceReference:'MG-2026-10-12-7731'},
  {title:'Large outbound transfer to unknown cloud storage',source:'Firewall',severity:'Medium',client:'Delhaize',occurredAt:t(13,'22:41'),description:'480 GB outbound HTTPS volume from DLH-FS01 to 198.51.100.77 over 85 minutes.',sourceReference:'FW-ANOM-5521'},
  {title:'Failed login burst on VPN gateway',source:'VPN',severity:'Low',client:'Delhaize',occurredAt:t(11,'19:03'),description:'Password spraying from a consumer ISP; no successful logon. Judged unrelated after review.',sourceReference:'VPN-0991'}
 ];
 const current:any=await step('GET','alerts'),alerts:any[]=current.alerts;
 const ensureAlert=async(def:any)=>alerts.find(a=>a.title===def.title)||await step('POST','alerts',{json:def});
 const [mainAlert,phish,exfil,spray]=[await ensureAlert(alertDefs[0]),await ensureAlert(alertDefs[1]),await ensureAlert(alertDefs[2]),await ensureAlert(alertDefs[3])];
 if(mainAlert.caseId)throw new Error('The main demo alert is still linked to another case.');
 await call('PATCH','alerts/'+phish.id,{json:{action:'triage'}});await call('PATCH','alerts/'+exfil.id,{json:{action:'triage'}});await call('PATCH','alerts/'+spray.id,{json:{action:'dismiss'}});
 const promoted=await step('PATCH','alerts/'+mainAlert.id,{json:{action:'promote',case:caseData}});
 const caseId:string=promoted.caseId;

 const create=async(kind:string,data:any)=>(await step('POST','records',{json:{caseId,kind,data}})).id as string;
 const assetIds:string[]=[];for(const a of assets)assetIds.push(await create('asset',{...a,description:a.description}));
 const evidenceIds:string[]=[];for(const e of evidence)evidenceIds.push(await create('evidence',{name:e.name,assetId:assetIds[e.asset],description:e.description,sha256:sha('demo:'+e.name),location:e.location,acquiredAt:e.acquiredAt,collector:e.collector,include:true}));

 const note=(title:string,asset:number|null,category:string,content:string,source:string,ev:number[],extra:any={})=>({title,assetId:asset===null?'':assetIds[asset],folder:extra.folder||'',category,content,source,evidenceIds:ev.map(i=>evidenceIds[i]),status:extra.status||'Validated',include:extra.include??true,confidence:extra.confidence||'High'});
 const noteIds:string[]=[];
 const notes=[
  note('Phishing e-mail delivered a malicious ISO to finance',5,'Threat Analysis','On 12 October at 08:14 the user j.peeters received an e-mail from billing@invoices-delhaize-portal.example with the attachment Supplier_Invoice_4471.iso. SPF and DKIM passed for the attacker-controlled domain, so the message was not quarantined.\nThe same message reached three other finance mailboxes; none of them opened it.','Microsoft 365 message trace',[0],{folder:'1 - Initial access'}),
  note('Execution chain: ISO, LNK, PowerShell, DLL side-loading',0,'Evidence of Execution','Mounting the ISO exposed a LNK file disguised as an invoice. The LNK launched an obfuscated PowerShell command that executed a signed binary and side-loaded loader.dll. Memory analysis shows the beacon injected into explorer.exe.','Memory image and prefetch analysis',[1],{folder:'1 - Initial access'}),
  note('Command-and-control beaconing',0,'Remote Connections','The workstation beaconed to 203.0.113.45 over HTTPS every 60 seconds with a 10% jitter from 08:23 on 12 October. The domain cdn-update-service.invalid was registered 6 days earlier.','Firewall outbound sessions',[4],{folder:'2 - Foothold'}),
  note('Domain administrator credentials stolen from LSASS',1,'Evidence of Execution','On 12 October at 14:40 a process accessed LSASS memory on DLH-FS01, followed by the first interactive logon of DLH\\adm_lmartin from the finance workstation. The administrator had logged on to the file server earlier that day.','Triage collection and Security log',[2,3],{folder:'3 - Privilege escalation'}),
  note('Lateral movement with RDP and SMB admin shares',2,'Sign-in Logs','Event 4624 (type 10 and type 3) shows DLH\\adm_lmartin from DLH-FIN-WS042 to DLH-FS01, DLH-BKP01 and DLH-DC01 between 12 October 15:00 and 13 October 02:10. All logons occurred outside the administrator\'s normal hours.','DC01 Security log',[3],{folder:'3 - Privilege escalation'}),
  note('Data staging and exfiltration to cloud storage',1,'Files and Folders Access','About 480 GB of finance and HR shares were archived into split 7z files in C:\\ProgramData\\Intel\\ and uploaded with a renamed rclone binary (svchost-update.exe) between 22:30 and 23:55 on 13 October.','MFT/USN journal and firewall logs',[2,4],{folder:'4 - Exfiltration'}),
  note('Defences disabled and recovery inhibited',3,'Audit Logs','At 03:05 on 14 October vssadmin delete shadows /all /quiet was executed on DLH-FS01 and DLH-BKP01, the backup agent was stopped using svc_backup, and the Security log was cleared on DLH-FS01.','Security and System logs',[2,3],{folder:'5 - Impact'}),
  note('Ransomware deployment through Group Policy',2,'File System Analysis','A GPO named "Maintenance-Update" created at 03:12 on DLH-DC01 ran enc.ps1 as a scheduled task on all servers. The encryptor nightharvest.exe renamed files with the .nhv3 extension and dropped README_RESTORE_FILES.txt in each folder.','DC01 Security log and FS01 triage',[2,3,5],{folder:'5 - Impact'}),
  note('EDR detection and containment',1,'Risk Detections','The EDR raised a critical alert at 03:52. The SOC isolated DLH-FS01 at 04:03 and the network team segmented head-office VLANs at 04:10. No further attacker activity has been observed since.','EDR console and network change record',[2],{folder:'6 - Response'}),
  note('ERP database preserved',4,'Other','DLH-ERP-DB02 was isolated before the attacker could reach it. Authentication logs show no attacker logons. Backups of the ERP data are intact.','Authentication logs and network segmentation records',[3],{folder:'6 - Response',confidence:'Medium'}),
  note('Open question: initial access vector confirmation',null,'Other','The ISO is the likeliest entry point but the VPN password spray on 11 October has not been fully ruled out. Waiting for VPN gateway logs from the vendor.','',[],{status:'Draft',include:false,confidence:'Low',folder:'7 - Open questions'})
 ];
 for(const n of notes)noteIds.push(await create('note',n));

 const events=[
  [12,'08:14','Phishing e-mail received by j.peeters',5,0,'Microsoft 365 message trace','E-mail with ISO attachment delivered.','Confirmed'],
  [12,'08:19','ISO mounted and LNK opened',0,1,'Memory image','Execution chain starts on DLH-FIN-WS042.','Confirmed'],
  [12,'08:23','First beacon to command-and-control server',0,4,'Firewall logs','HTTPS session to 203.0.113.45.','Confirmed'],
  [12,'14:40','LSASS memory access on DLH-FS01',1,2,'Triage collection','Credential dumping.','Confirmed'],
  [12,'15:02','Domain admin logon from finance workstation',2,3,'Security log 4624','First use of the stolen administrator account.','Confirmed'],
  [13,'02:10','RDP session to the backup server',3,3,'Security log 4624','Attacker maps the backup infrastructure.','Confirmed'],
  [13,'22:30','Exfiltration starts to 198.51.100.77',1,4,'Firewall logs','Outbound volume spike from DLH-FS01.','Confirmed'],
  [13,'23:55','Exfiltration ends (about 480 GB)',1,4,'Firewall logs','Last transfer to the cloud storage endpoint.','Confirmed'],
  [14,'03:05','Shadow copies deleted and backup agent stopped',3,2,'System log','Recovery inhibited.','Confirmed'],
  [14,'03:12','Malicious GPO created',2,3,'Security log 5136','GPO "Maintenance-Update" deployed.','Confirmed'],
  [14,'03:20','Encryption starts on file servers',1,2,'USN journal','First .nhv3 rename on DLH-FS01.','Confirmed'],
  [14,'03:41','Ransom note created',1,5,'MFT','README_RESTORE_FILES.txt appears in shares.','Confirmed'],
  [14,'03:52','EDR critical alert',1,2,'EDR console','Mass file modification alert.','Confirmed'],
  [14,'04:10','Head-office network segmented',null,null,'Network change record','Containment effective.','Confirmed'],
  [11,'19:03','VPN password-spraying burst',6,null,'VPN gateway','Unconfirmed link with the intrusion.','Unconfirmed']
 ] as const;
 const eventIds:string[]=[];
 for(const [day,time,title,asset,ev,source,description,status] of events)eventIds.push(await create('event',{title,assetId:asset===null?'':assetIds[asset],noteId:'',evidenceId:ev===null?'':evidenceIds[ev],occurredAt:t(day,time),originalTimestamp:t(day,time),source,description,status,include:status==='Confirmed'}));

 const iocIds:string[]=[];
 for(const i of iocs)iocIds.push(await create('ioc',{type:i.type,value:i.value,description:i.description,assetId:assetIds[i.asset],include:true}));
 for(const i of identities)await create('identity',{...i,include:true});
 for(const [techniqueId,name,tactics,rationale,noteRefs,evRefs] of techniques)await create('technique',{techniqueId,name,tactics,rationale,include:true,domain:'enterprise',sourceNoteIds:noteRefs.map(i=>noteIds[i]),evidenceIds:evRefs.map(i=>evidenceIds[i]),confidence:'High',assetId:''});

 const ransomNote=new TextEncoder().encode('*** DEMO FILE — fictional ransom note ***\n\nYour files have been encrypted by NightHarvest.\nWe copied 480 GB of confidential data.\nContact: restore-demo@nightharvest.invalid within 7 days.\nPayment demanded: 40 BTC (fictional).\n');
 const iocFileForm=new FormData();iocFileForm.set('recordId',iocIds[9]);iocFileForm.set('file',new File([ransomNote],'README_RESTORE_FILES.txt',{type:'text/plain'}));
 await step('POST','ioc-files',{form:iocFileForm});

 const shots:{note:number;name:string;accent:[number,number,number];bytes:Uint8Array}[]=[
  {note:7,name:'edr-mass-rename-alert.png',accent:[196,48,64],bytes:png(960,540,[196,48,64])},
  {note:7,name:'ransom-note-on-share.png',accent:[222,120,36],bytes:png(960,540,[222,120,36])},
  {note:5,name:'rclone-transfer-volume.png',accent:[40,120,200],bytes:png(960,540,[40,120,200])}
 ];
 const images:ReportImage[]=[];
 for(const s of shots){const form=new FormData();form.set('noteId',noteIds[s.note]);form.set('file',new File([s.bytes as BlobPart],s.name,{type:'image/png'}));const a=await step('POST','attachments',{form});images.push({id:a.id,bytes:s.bytes,width:960,height:540})}

 const snapshot:any=await step('GET','cases/'+caseId);
 const actions=snapshot.entries.filter((e:any)=>e.kind==='action');
 const owners=['Analyst A','Analyst B','Delhaize IT lead','Delhaize CISO'];
 for(const [index,action] of actions.entries()){
  const done=index<Math.ceil(actions.length*0.5),running=index===Math.ceil(actions.length*0.5);
  await step('PUT','records/'+action.id,{json:{version:action.version,data:{...action.data,status:done?'Done':running?'In progress':'To do',owner:owners[index%owners.length],dueDate:`2026-10-${String(15+index).padStart(2,'0')}`,description:done?'Completed during the first 24 hours of the response.':action.data.description}}});
 }
 const recommendations=[
  ['Enforce MFA and tiered administration','Require phishing-resistant MFA for all administrators and forbid domain admin logons on workstations and file servers.','Delhaize CISO','2026-11-15','High'],
  ['Isolate and immutably store backups','Move backup repositories to a dedicated network with immutable or offline copies and a restricted service account.','Delhaize IT lead','2026-11-30','High'],
  ['Block ISO and LNK attachments at the mail gateway','Strip container formats from external e-mail and enable attachment detonation.','Delhaize IT lead','2026-11-05','Medium'],
  ['Alert on bulk outbound transfers','Create detections for volumetric exfiltration and unsanctioned sync tools such as rclone.','Analyst A','2026-11-20','Medium'],
  ['Prepare GDPR notification','Assess the personal data involved and prepare notification to the Belgian DPA within the 72-hour window if confirmed.','Delhaize CISO','2026-10-17','High']
 ] as const;
 for(const [title,description,owner,dueDate,priority] of recommendations)await create('action',{title,description,owner,dueDate,status:'To do',priority,recommendation:true,include:true});

 const comments:[string,string|null][]=[
  ['Containment confirmed at 04:10. All head-office VLANs are segmented; store traffic is unaffected.',null],
  [`@${ctx.email} please confirm that the memory image hash matches the chain-of-custody form.`,null],
  ['Exfiltration volume matches the firewall export. We should assume the finance and HR shares are in the attacker\'s hands.',noteIds[5]],
  ['The renamed rclone binary was found under C:\\ProgramData\\Intel. Hash added to the IOC register.',iocIds[8]],
  ['Draft left open: VPN logs requested from the vendor. Not included in the report until confirmed.',noteIds[10]]
 ];
 for(const [body,recordId] of comments)await step('POST',`cases/${caseId}/comments`,{json:{body,recordId}});

 const users:any=await call('GET','users?caseId='+caseId);
 if(users.status===200)for(const [index,u] of (users.body.users||[]).filter((u:any)=>u.id!==users.body.me?.id).slice(0,2).entries())await call('POST',`cases/${caseId}/members`,{json:{userId:u.id,role:index===0?'reviewer':'analyst'}});

 const template=ctx.readTemplate?.()??new Uint8Array(readFileSync(new URL('../public/CSIRT_Template_Report.docx',import.meta.url)));
 for(const profile of ['full','executive'] as const){
  const fresh:any=await step('GET','cases/'+caseId);
  const bytes=generateReport(template,fresh,images,profile);
  await step('POST',`cases/${caseId}/reports`,{raw:bytes,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','X-Case-Revision':await revisionHash(fresh),'X-Report-Profile':profile}});
 }
 return {caseId,reference:DEMO_REFERENCE};
}
