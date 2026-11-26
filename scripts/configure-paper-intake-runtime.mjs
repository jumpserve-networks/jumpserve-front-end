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
const batchOwnerKey = 'JUMPSERVE_SYNTHETIC_BATCH_OWNER_ID';
const batchInstanceKey = 'JUMPSERVE_SYNTHETIC_BATCH_INSTANCE_ID';
const batchBucketKey = 'JUMPSERVE_TRAINING_BATCH_BUCKET';
const batchOwner = process.env[batchOwnerKey]?.trim().toLowerCase();
const batchInstance = process.env[batchInstanceKey]?.trim();
const batchBucket = process.env[batchBucketKey]?.trim();
if (batchOwner || batchInstance) {
 if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(batchOwner ?? '') || !/^i-[a-f0-9]{17}$/.test(batchInstance ?? '')) {
  throw new Error('Set a valid synthetic batch owner ID and coordinator instance ID.');
 }
 updates[batchOwnerKey] = batchOwner;
 updates[batchInstanceKey] = batchInstance;
}
if (batchBucket) {
 if (!batchOwner || !batchInstance || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(batchBucket)) {
  throw new Error('Set a valid training batch bucket, owner ID and coordinator instance ID.');
 }
 updates[batchBucketKey] = batchBucket;
}
const path = '.env.production';
const old = existsSync(path) ? readFileSync(path, 'utf8') : '';
const lines = old.split(/\r?\n/);
const batchKeys = [batchOwnerKey, batchInstanceKey, batchBucketKey];
if (Object.keys(updates).length || lines.some(line => batchKeys.includes(line.split('=')[0]))) {
 const replaced = new Set([...Object.keys(updates), ...batchKeys]);
 const retained = lines.filter(line => !replaced.has(line.split('=')[0])).join('\n').trimEnd();
 const configured = Object.entries(updates).map(([key,value]) => `${key}=${value}`);
 writeFileSync(path, [retained, ...configured].filter(Boolean).join('\n') + '\n', { mode: 0o600 });
 console.log('Configured the JumpServe SSR environment.');
}
