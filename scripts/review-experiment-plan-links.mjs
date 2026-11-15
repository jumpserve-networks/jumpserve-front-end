// Explicit reviewed annotation recovery; no model call or original-row update.
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
import env from '@next/env';
import {connectPaperMCP} from './lib/paper-intake-mcp.mjs';
import {privateDirectory,privateJSON,readJSON,lockRun} from './lib/paper-evaluation-store.mjs';
import {paperCLIError} from './lib/paper-cli-errors.mjs';
import {reviewExperimentPlanLinks,applyExperimentPlanLinkReview} from '../lib/paper-experiment-plan-review.ts';
import {sha256} from '../lib/paper-intake-model.ts';

async function main(){
 const {values}=parseArgs({options:{assessment:{type:'string'},keep:{type:'string',multiple:true},reason:{type:'string'},apply:{type:'boolean'},help:{type:'boolean'}}});
 if(values.help){console.log('npm run review:experiment-plan-links -- --assessment UUID --keep validate-3=1.5.3 --reason "Explain why this is the dedicated claim evaluator" [--apply]\nOne-based experiment.stage.step positions explicitly retain one dedicated validation assignment per duplicated claim. Dry run by default. Apply appends an immutable reviewed projection through Supabase MCP; original response, confirmation, failed history and limits stay unchanged. No model calls or experiments.');return;}
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(values.assessment??'')||!values.keep?.length||!values.reason?.trim()||values.reason.length>2000)throw new Error('Supply an assessment, explicit retained validation-step positions and bounded review reason.');
 const keep=values.keep.map(value=>{const match=value.match(/^(validate-[1-9][0-9]*)=([1-8])\.([1-8])\.([1-8])$/);if(!match)throw new Error('Use --keep validate-N=experiment.stage.step with one-based positions.');return{claim_ref:match[1],experiment:Number(match[2]),stage:Number(match[3]),step:Number(match[4])};});
 env.loadEnvConfig(process.cwd());const project=process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co$/)?.[1];if(!project)throw new Error('Configure the intended Supabase project URL.');
 const directory=resolve('.test-artifacts/experiment-plan-link-reviews',values.assessment);await privateDirectory(directory);const release=await lockRun(directory);let mcp;
 try{
  const trace=join(directory,new Date().toISOString().replaceAll(':','-'));await privateDirectory(trace);mcp=await connectPaperMCP(project,trace);
  const owner=await mcp.original(values.assessment,{allowConfirmed:true}),row=await mcp.experimentPlan(owner.id,owner.owner_id);if(!row)throw new Error('Private confirmed experiment plan not found.');
  const expected=reviewExperimentPlanLinks(row,keep),identity=sha256(JSON.stringify({row,keep,reason:values.reason})),path=join(directory,'review.json');
  let saved=await readJSON(path);
  if(saved&&saved.identity!==identity)throw new Error('The retained review inputs changed; inspect the existing review identity before continuing.');
  if(!saved){saved={identity,payload:{review_id:randomUUID(),base_revision:row.revision,keep_validation_steps:keep,reason:values.reason,reviewer_type:'AI'}};await privateJSON(path,saved);}
  await privateJSON(join(trace,'original.json'),row);await privateJSON(join(trace,'candidate.json'),expected);
  let review;
  if(values.apply){review=await mcp.reviewExperimentPlanLinks(row,saved.payload);applyExperimentPlanLinkReview(row,review);await privateJSON(join(trace,'review.json'),review);}
  const after=await mcp.experimentPlan(row.study_id,row.owner_id);if(!isDeepStrictEqual(row,after))throw new Error('The original planning call changed during review.');
  const report={assessment:row.study_id,verified:true,applied:Boolean(values.apply),original_status:row.status,effective_status:review?'ready':null,original_revision:row.revision,changes:expected.changes,original_call_unchanged:true,new_model_calls:0,experiments_started:0};
  await privateJSON(join(trace,'report.json'),report);console.log(JSON.stringify(report));
 }finally{await mcp?.close();await release();}
}
await main().catch(error=>{console.error(paperCLIError(error));process.exitCode=1;});
