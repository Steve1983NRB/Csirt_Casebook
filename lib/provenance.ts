// Pretty-prints the raw source object kept with imported intelligence (TAXII object or SOCradar item).
// Never throws: a malformed or missing payload must not break the case view.
export function provenanceJson(source:any):string{
 const raw=source?.rawObject??source?.rawItem??source?.rawAttribute;
 if(typeof raw!=='string'||!raw)return '';
 try{return JSON.stringify(JSON.parse(raw),null,2)}catch{return raw.slice(0,5000)}
}
export const provenanceLabel=(source:any)=>source?.provider==='SOCradar Premium Feeds'?`SOCradar feed: ${source.feedName||source.feedId||''}`:source?.provider==='TAXII 2.1'?'TAXII source object':source?.provider==='MISP'?`MISP event: ${source.eventInfo||source.eventId||''}`:'External source';