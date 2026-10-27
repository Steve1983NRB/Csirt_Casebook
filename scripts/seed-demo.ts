import {existsSync,readFileSync} from 'node:fs';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {seedDemoCase,DEMO_REFERENCE,type Call} from './demo-case';

// Usage: pnpm demo:seed [--reset] (credentials are prompted locally if not set)
let email=process.env.DEMO_EMAIL,password=process.env.DEMO_PASSWORD;
if(!email||!password){
 if(!stdin.isTTY){console.error('Set DEMO_EMAIL and DEMO_PASSWORD, or run this command in an interactive terminal.');process.exit(1)}
 const prompt=createInterface({input:stdin,output:stdout});
 if(!email)email=await prompt.question('Account email: ');
 prompt.close();
 if(!password){
  stdout.write('Account password: ');
  password=await new Promise<string>((resolve,reject)=>{
   let value='';
   const onData=(input:Buffer)=>{
    for(const byte of input){
     if(byte===3){stdin.setRawMode(false);stdin.pause();stdin.off('data',onData);stdout.write('\n');reject(new Error('Credential prompt cancelled.'));return}
     if(byte===13||byte===10){stdin.setRawMode(false);stdin.pause();stdin.off('data',onData);stdout.write('\n');resolve(value);return}
     if(byte===127||byte===8){value=value.slice(0,-1);continue}
     value+=String.fromCharCode(byte);
    }
   };
   stdin.setRawMode(true);stdin.resume();stdin.on('data',onData);
  });
 }
}
if(!email||!password){console.error('Email and password are required.');process.exit(1)}
const lock='.vinext/dev/lock.json';
const base=(process.env.DEMO_URL||(existsSync(lock)?JSON.parse(readFileSync(lock,'utf8')).appUrl:'http://localhost:5173')).replace(/\/$/,'');
let cookie='';

async function send(method:string,path:string,init:Parameters<Call>[2]={}){
 const headers:Record<string,string>={Origin:base,...(cookie?{Cookie:cookie}:{}),...init.headers};
 let body:BodyInit|undefined;
 if(init.json!==undefined){body=JSON.stringify(init.json);headers['Content-Type']='application/json'}
 else if(init.form)body=init.form;
 else if(init.raw)body=new Blob([init.raw as BlobPart]);
 const response=await fetch(`${base}/api/${path}`,{method,headers,body});
 const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
 const text=await response.text();let parsed:any=text;try{parsed=JSON.parse(text)}catch{}
 return {status:response.status,body:parsed};
}

const login=await send('POST','auth/login',{json:{email,password}});
if(login.status!==200){console.error(`Sign-in failed (${login.status}): ${JSON.stringify(login.body)}`);process.exit(1)}
if(login.body.mfaRequired){
 const prompt=createInterface({input:stdin,output:stdout});
 let code:string;
 try{code=await prompt.question('MFA code: ')}finally{prompt.close()}
 const verification=await send('POST','auth/mfa-login',{json:{code}});
 if(verification.status!==200){console.error(`MFA verification failed (${verification.status}): ${JSON.stringify(verification.body)}`);process.exit(1)}
}

if(process.argv.includes('--reset')){
 const cases=await send('GET','cases'),found=(cases.body as any[]).find(c=>c.reference===DEMO_REFERENCE);
 if(found){const r=await send('DELETE','cases/'+found.id,{json:{reference:DEMO_REFERENCE}});if(r.status!==200){console.error('Reset failed:',r.body);process.exit(1)}console.log('Previous demo case deleted.')}
}

try{const result=await seedDemoCase(send,{email});console.log(`Demo case ${result.reference} created: ${base}/ (open the case "${DEMO_REFERENCE}")`)}
catch(e:any){console.error(e.message);process.exit(1)}
