export async function call(path:string,method='GET',body?:any):Promise<any>{
 const r=await fetch('/api/'+path,{method,headers:body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:undefined,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
 const data:any=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(data.error||'Request failed.');
 return data;
}
export const fmtSize=(n:number)=>n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?Math.round(n/1024)+' KB':n+' B';
export const fmtDate=(v?:string|null)=>v?new Date(v).toLocaleString('en-GB',{timeZone:'UTC'})+' UTC':'—';
