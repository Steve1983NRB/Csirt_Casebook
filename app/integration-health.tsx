'use client';
import {useState} from 'react';
import {CircleAlert,CircleCheck,Plug,RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';

type CheckResult={id:string;name:string;status:'connected'|'failed'|'not-configured';message:string};
const labels={connected:'Connected',failed:'Failed', 'not-configured':'Not configured'};

export default function IntegrationHealth(){
 const [results,setResults]=useState<CheckResult[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function check(){
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/integrations/check',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   const value:{error?:string;results?:CheckResult[]}=await response.json();
   if(!response.ok)throw new Error(value.error||'Connection checks could not be run.');
   if(!Array.isArray(value.results))throw new Error('The connection check response is invalid.');
   setResults(value.results);
  }catch(error){setError(error instanceof Error?error.message:'Connection checks could not be run.')}
  finally{setBusy(false)}
 }
 return <section className="panel integration-health" aria-labelledby="integration-health-title">
  <div className="section-head"><div><div className="eyebrow">LIVE CONNECTIVITY</div><h2 id="integration-health-title">API connection tests</h2><p>Run read-only checks against configured providers. No indicators or case data are imported.</p></div><Button onClick={check} disabled={busy}><RefreshCw className={busy?'spin':''}/>{busy?'Testing…':'Test all connections'}</Button></div>
  {error&&<div className="error" role="alert">{error}</div>}
  {results.length>0&&<div className="integration-health-list" aria-live="polite">{results.map(result=><article key={result.id} className={'integration-health-result '+result.status}>
   {result.status==='connected'?<CircleCheck aria-hidden="true"/>:result.status==='failed'?<CircleAlert aria-hidden="true"/>:<Plug aria-hidden="true"/>}
   <div><strong>{result.name}</strong><p>{result.message}</p></div>
   <Badge variant="outline">{labels[result.status]}</Badge>
  </article>)}</div>}
 </section>;
}
