// Privileged, source-grounded repair through the project-scoped Supabase MCP.
import {parseArgs} from 'node:util';
import {resolve,join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import env from '@next/env';
import {connectPaperMCP} from './lib/paper-intake-mcp.mjs';
import {privateDirectory,privateJSON,lockRun} from './lib/paper-evaluation-store.mjs';
import {paperCLIError} from './lib/paper-cli-errors.mjs';
import {retainedPaperRevalidation} from '../lib/paper-intake-revalidation.ts';

async function main(){
 const {values}=parseArgs({options:{assessment:{type:'string'},apply:{type:'boolean'},help:{type:'boolean'}}});
 if(values.help){console.log('npm run revalidate:paper -- --assessment UUID [--apply]\nRevalidates only the saved completed response after a source-format validation failure. Uses Supabase MCP and existing intake audit/finish operations; never invokes a model, changes limits, or starts experiments.');return;}
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(values.assessment??''))throw new Error('Supply an existing assessment UUID.');
 env.loadEnvConfig(process.cwd());const project=process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co$/)?.[1];
 if(!project)throw new Error('Configure the intended Supabase project URL.');
 const directory=resolve('.test-artifacts/paper-intake-revalidations',values.assessment);await privateDirectory(directory);const release=await lockRun(directory);let mcp;
 try{
  const trace=join(directory,new Date().toISOString().replaceAll(':','-'));await privateDirectory(trace);mcp=await connectPaperMCP(project,trace);
  const owner=await mcp.original(values.assessment),row=await mcp.load(owner.id,owner.owner_id);if(!row)throw new Error('Private paper intake not found.');
  const state=await mcp.reviewState(row.study_id,row.owner_id);if(state.deleted||state.confirmed)throw new Error('Deleted or confirmed assessments cannot be revalidated.');
  const payload=retainedPaperRevalidation(row);await privateJSON(join(trace,'before.json'),row);await privateJSON(join(trace,'validated-payload.json'),payload);
  const saved=values.apply&&row.status!=='ready'?await mcp.revalidate(row,payload):row;
  const after=await mcp.load(row.study_id,row.owner_id);if(!after)throw new Error('Revalidated paper could not be read back.');
  for(const key of ['study_id','owner_id','source_id','text_artifact_id','original_artifact_id','sha256','byte_count','paper_text','request','response','provider_response_id','created_at','deadline_at','model_calls','reserved_cents','submit_token'])if(!isDeepStrictEqual(row[key],after[key]))throw new Error('Revalidation changed protected identity, evidence or limits: '+key);
  if(values.apply&&(saved.status!=='ready'||after.status!=='ready'||!isDeepStrictEqual(after.breakdown,payload.breakdown)))throw new Error('The ready result did not match the validated retained response.');
  const report={assessment:row.study_id,checked:true,applied:Boolean(values.apply),already_ready:row.status==='ready',status:after.status,revision:after.revision,original_failed_revision:row.status==='failed'?row.revision:null,new_model_calls:0,experiments_started:0,limits_preserved:true};
  await privateJSON(join(trace,'after.json'),after);await privateJSON(join(trace,'report.json'),report);console.log(JSON.stringify(report));
 }finally{await mcp?.close();await release();}
}
await main().catch(error=>{console.error(paperCLIError(error));process.exitCode=1;});
