import {mkdir,readFile,writeFile,rename,open,unlink,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';

export const RUN_NAME=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/;
export async function readJSON(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function privateJSON(path,value){
 const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temp,path);await chmod(path,0o600);
}
export async function privateDirectory(path){await mkdir(path,{recursive:true,mode:0o700});await chmod(path,0o700);}
export async function lockRun(directory){
 await privateDirectory(directory);const path=join(directory,'run.lock');
 try {const file=await open(path,'wx',0o600);await file.writeFile(JSON.stringify({pid:process.pid,host:hostname()}));await file.close();}
 catch(error){
  if(error.code!=='EEXIST')throw error;
  // Serialize stale-lock recovery so two resumptions cannot remove each other's new lock.
  const recoveryPath=path+'.recovery';let recovery;
  try{recovery=await open(recoveryPath,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw new Error('This run is already locked or its interrupted recovery needs operator inspection.');throw e;}
  try{
   const previous=await readJSON(path);let live=Boolean(previous);
   if(previous?.host===hostname()&&Number.isSafeInteger(previous.pid)){try{process.kill(previous.pid,0);}catch(e){if(e.code==='ESRCH')live=false;}}
   if(live)throw new Error('This run is already locked by another process.');
   if(previous)await unlink(path);return await lockRun(directory);
  }finally{await recovery.close();await unlink(recoveryPath);}
 }
 return async()=>unlink(path);
}
