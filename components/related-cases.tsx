'use client';
import {useEffect,useState} from 'react';
import {Link2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';

type RelatedCase={caseId:string;reference:string;title:string;client:string;recordId:string};
export default function RelatedCases({kind,value,caseId,onOpen}:{kind:'ioc'|'technique';value:string;caseId:string;onOpen:(caseId:string)=>void}){
 const [results,setResults]=useState<RelatedCase[]>([]);
 useEffect(()=>{if(!value)return;const controller=new AbortController();fetch('/api/related?kind='+encodeURIComponent(kind)+'&value='+encodeURIComponent(value)+'&excludeCaseId='+encodeURIComponent(caseId),{signal:controller.signal}).then(async r=>(r.ok?await r.json():{results:[]}) as {results:RelatedCase[]}).then(v=>setResults(v.results||[])).catch(()=>{});return()=>controller.abort()},[kind,value,caseId]);
 if(!results.length)return null;
 return <details className="related-cases"><summary><Link2 size={15}/> Seen in {results.length} other investigation{results.length===1?'':'s'}</summary><div>{results.map(result=><Button key={result.caseId} variant="ghost" onClick={()=>onOpen(result.caseId)}><Badge variant="secondary">{result.reference}</Badge><span>{result.title} · {result.client}</span></Button>)}</div></details>;
}
