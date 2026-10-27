import catalogue from './attack-index.json';
export const attackDomains=['enterprise','mobile','ics','atlas'] as const;
export type AttackDomain=typeof attackDomains[number];
export type AttackTechnique={id:string;stixId:string;name:string;description:string;url:string;tactics:string[];platforms:string[];parentId:string|null;revoked:boolean;deprecated:boolean;modified:string;objectVersion:string;maturity?:string;mitigationIds?:string[];caseStudyIds?:string[]};
export type AttackMitigation={id:string;name:string;description:string;url:string;categories:string[];lifecyclePhases:string[];techniqueIds:string[]};
export type AttackCaseStudy={id:string;name:string;description:string;url:string;type:string;actor:string;target:string;date:string;dateGranularity:string;steps:{techniqueId:string;description:string;tacticId:string;stepId:string;leadsTo:string[]}[]};
export type AttackCatalogue={domain:AttackDomain;name:string;description?:string;version:string;source:string;sourceSha256:string;retrievedAt:string;tactics:{id:string;slug:string;name:string}[];techniques:AttackTechnique[];mitigations?:AttackMitigation[];caseStudies?:AttackCaseStudy[]};
type IndexEntry={id:string;name:string;stixId:string;tactics:string[];tacticNames:string[];domain:AttackDomain;version:string;revoked:boolean;deprecated:boolean};
export function lookupTechnique(domain:string,id:string){return (catalogue as Record<string,IndexEntry>)[domain+':'+id]}
export function canonicalMapping(data:any){const t=lookupTechnique(data.domain||'enterprise',data.techniqueId);if(!t)throw new Error('Select a technique from the official ATT&CK catalogue.');return {...data,name:t.name,tactics:t.tacticNames.join(', '),attackVersion:t.version,stixId:t.stixId}}
