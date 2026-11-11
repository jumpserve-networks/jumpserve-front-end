// Amplify build hook: persist the secret reference, never credential values.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const id=process.env.PAPER_INTAKE_SECRET_ID;
if(id){
 if(!/^arn:aws:secretsmanager:us-east-1:395567831870:secret:jumpserve\/frontend\/paper-intake-[A-Za-z0-9]+$/.test(id))throw new Error('Unexpected production paper-intake secret reference.');
 const path='.env.production',old=existsSync(path)?readFileSync(path,'utf8'):'';
 writeFileSync(path,old.split(/\r?\n/).filter(line=>!/^PAPER_INTAKE_SECRET_ID=/.test(line)).join('\n').trimEnd()+'\nPAPER_INTAKE_SECRET_ID='+id+'\n',{mode:0o600});
 console.log('Configured the paper-intake runtime secret reference.');
}
