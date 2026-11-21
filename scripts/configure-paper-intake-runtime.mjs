// Amplify build hook: persist the secret reference, never credential values.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const id=process.env.PAPER_INTAKE_SECRET_ID;
const updates = {};
if(id){
 if(!/^arn:aws:secretsmanager:us-east-1:395567831870:secret:jumpserve\/frontend\/paper-intake-[A-Za-z0-9]+$/.test(id))throw new Error('Unexpected production paper-intake secret reference.');
 updates.PAPER_INTAKE_SECRET_ID = id;
}
const connector = process.env.JUMPSERVE_MCP_ENABLED;
if (connector === 'true') {
 const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? '');
 if (origin.protocol !== 'https:' || origin.origin !== process.env.NEXT_PUBLIC_SITE_URL) {
  throw new Error('Set NEXT_PUBLIC_SITE_URL to the HTTPS origin of the JumpServe connector.');
 }
 updates.NEXT_PUBLIC_SITE_URL = origin.origin;
}
if (connector === 'true' || connector === 'false') updates.JUMPSERVE_MCP_ENABLED = connector;
if (Object.keys(updates).length) {
 const path = '.env.production';
 const old = existsSync(path) ? readFileSync(path, 'utf8') : '';
 const retained = old.split(/\r?\n/).filter(line => !Object.hasOwn(updates, line.split('=')[0])).join('\n').trimEnd();
 const configured = Object.entries(updates).map(([key,value]) => `${key}=${value}`);
 writeFileSync(path, [retained, ...configured].filter(Boolean).join('\n') + '\n', { mode: 0o600 });
 console.log('Configured the JumpServe SSR environment.');
}
