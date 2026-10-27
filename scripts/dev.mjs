import {execFileSync,spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

if(process.platform==='win32'&&!process.env.NODE_EXTRA_CA_CERTS){
 const localAppData=process.env.LOCALAPPDATA||join(homedir(),'AppData','Local');
 const directory=join(localAppData,'csirt-casebook');
 const bundle=join(directory,'corporate-ca-bundle.pem');
 mkdirSync(directory,{recursive:true});
 const escapedPath=bundle.replaceAll("'","''");
 const command=`$ErrorActionPreference='Stop'; $certs=@(Get-ChildItem Cert:\\LocalMachine\\Root; Get-ChildItem Cert:\\CurrentUser\\Root); $pem=($certs | ForEach-Object { '-----BEGIN CERTIFICATE-----'; [Convert]::ToBase64String($_.RawData, 'InsertLineBreaks'); '-----END CERTIFICATE-----' }) -join [Environment]::NewLine; if(-not $pem){throw 'No trusted Windows root certificates were found.'}; [IO.File]::WriteAllText('${escapedPath}',$pem,[Text.Encoding]::ASCII)`;
 try{
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',command],{stdio:'inherit'});
 }catch(error){
  throw new Error('Could not load trusted Windows root certificates for local HTTPS connections.',{cause:error});
 }
 process.env.NODE_EXTRA_CA_CERTS=bundle;
}

const runner=fileURLToPath(new URL('./run-framework.mjs',import.meta.url));
const child=spawn(process.execPath,[runner,'dev',...process.argv.slice(2)],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM']){
 process.on(signal,()=>child.kill(signal));
}
child.once('error',error=>{console.error('Could not start the development server.',error);process.exitCode=1});
child.once('exit',(code,signal)=>{process.exitCode=code??(signal?1:0)});
