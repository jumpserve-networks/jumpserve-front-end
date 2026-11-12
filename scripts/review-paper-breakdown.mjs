// Privileged operator review, with no browser session or inference call.
import {parseArgs} from 'node:util';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import env from '@next/env';
import {connectPaperMCP} from './lib/paper-intake-mcp.mjs';
import {privateDirectory,privateJSON,lockRun} from './lib/paper-evaluation-store.mjs';
import {paperCLIError} from './lib/paper-cli-errors.mjs';
import {validatePaperBreakdownCorrection} from '../lib/paper-breakdown-review.ts';

async function main(){
 const {values}=parseArgs({options:{assessment:{type:'string'},correction:{type:'string'},apply:{type:'boolean'},help:{type:'boolean'}}});
 if(values.help){console.log('npm run review:paper -- --assessment UUID --correction PRIVATE_JSON [--apply]\nChecks a source-grounded versioned correction; --apply saves it through the service-only review RPC. Requires the reviewed-evidence migration. Never confirms scope or starts models/experiments.');return;}
 if(!/^[a-f0-9-]{36}$/i.test(values.assessment??'')||!values.correction)throw new Error('Supply an existing assessment UUID and private correction JSON.');
 env.loadEnvConfig(process.cwd());
 const project=process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co$/)?.[1];
 if(!project)throw new Error('Configure the intended Supabase project URL.');
 const directory=resolve('.test-artifacts/paper-breakdown-reviews',values.assessment);await privateDirectory(directory);const release=await lockRun(directory);
 let mcp;
 try{
  const trace=join(directory,new Date().toISOString().replaceAll(':','-'));await privateDirectory(trace);mcp=await connectPaperMCP(project,trace);
  const owner=await mcp.original(values.assessment),row=await mcp.load(owner.id,owner.owner_id);
  if(row?.status!=='ready'||!row.paper_text)throw new Error('A ready original extraction and retained text are required.');
  const payload=validatePaperBreakdownCorrection(row.breakdown,row.paper_text,JSON.parse(await readFile(resolve(values.correction),'utf8')));
  const state=await mcp.reviewState(row.study_id,row.owner_id);
  if(state.deleted||(state.confirmed||state.revision!==payload.base_revision)&&state.review_id!==payload.review_id)throw new Error('The assessment is deleted, already confirmed, or the correction is stale.');
  await privateJSON(join(trace,'correction.json'),payload);
  const saved=values.apply?await mcp.review(row,payload):null;
  const after=await mcp.load(row.study_id,row.owner_id);
  if(JSON.stringify(after)!==JSON.stringify(row))throw new Error('The original intake changed; inspect retained audit evidence.');
  const report={checked:true,applied:Boolean(saved),assessment:row.study_id,review_id:payload.review_id,revision:saved?.revision??payload.base_revision+1,original_intake_preserved:true,new_model_calls:0,experiments_started:0};
  await privateJSON(join(trace,'report.json'),report);console.log(JSON.stringify(report));
 }finally{await mcp?.close();await release();}
}
await main().catch(error=>{console.error(paperCLIError(error));process.exitCode=1;});
