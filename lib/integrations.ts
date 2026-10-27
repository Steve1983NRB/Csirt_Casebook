import type {Entry,Snapshot} from './model';
// Future evidence/AI contracts. The operational TAXII pull client is in lib/taxii.ts.
export type ConnectorContext={caseId:string;actorId:string;signal:AbortSignal};
export type ImportedObservation={externalId:string;source:string;observedAt:string;originalTimestamp:string;assetExternalId?:string;content:string;rawEvidenceReference:string};
export interface EvidenceConnector{id:string;capabilities:readonly string[];testConnection(context:ConnectorContext):Promise<{ok:boolean;message:string}>;collect(context:ConnectorContext,cursor?:string):Promise<{observations:ImportedObservation[];nextCursor?:string}>}
export interface AIProposal{text:string;sourceRecordIds:string[];uncertainties:string[];provider:string;model:string;generatedAt:string}
export interface AIConnector{id:string;suggest(context:ConnectorContext,input:{records:Entry[];purpose:'summary'|'timeline'|'report-draft'}):Promise<AIProposal>}
export function validateAIProposal(proposal:AIProposal,snapshot:Snapshot){const ids=new Set(snapshot.entries.map(e=>e.id));if(!proposal.sourceRecordIds.length||proposal.sourceRecordIds.some(id=>!ids.has(id)))throw new Error('AI proposals must reference existing case records.');return {...proposal,reviewState:'pending' as const}}
export const integrationCatalog=[
 {id:'splunk',name:'Splunk',description:'Bring selected search results into the evidence-backed timeline.',capabilities:['Search results','Event references']},
 {id:'cortex',name:'Cortex XDR',description:'Associate endpoint alerts and investigation exports with case assets.',capabilities:['Alerts','Endpoints']},
 {id:'defender',name:'Microsoft Defender',description:'Connect incident evidence and advanced hunting results.',capabilities:['Incidents','Hunting results']},
 {id:'velociraptor',name:'Velociraptor',description:'Reference collected artefacts, flows and forensic acquisition results.',capabilities:['Collections','Evidence references']},
 {id:'ai',name:'Optional AI assistance',description:'Propose summaries and report drafts with citations to case records.',capabilities:['Human review','Source-bound proposals']}
];
