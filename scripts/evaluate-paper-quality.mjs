// Browser-free quality reviewer qualification. One original model call per named
// run; no database writes and no networking experiment is ever launched here.
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import OpenAI from 'openai';
import env from '@next/env';
import {qualityAttachment,qualityReviewRequest,readQualityReview,sandboxQualityChecks,retrieveQualitySandboxArtifact} from '../lib/paper-quality-model.ts';
import {deterministicQualityChecks} from '../lib/paper-quality-checks.ts';
import {frozenQualityContext} from '../lib/paper-quality-runner.ts';
import {qualityReferenceMap,validateQualityContext} from '../lib/paper-quality-context.ts';
import {RUN_NAME,privateDirectory,privateJSON,readJSON,lockRun} from './lib/paper-evaluation-store.mjs';
import {paperCLIError} from './lib/paper-cli-errors.mjs';
import {qualitySource,qualityRow,qualityResponse,passReview} from '../tests/support/paper-quality-fixture.mjs';
function grade(source,response,artifact,request){const context=frozenQualityContext(request??null);if(context&&!isDeepStrictEqual(context.reference_map,qualityReferenceMap(source.confirmed_breakdown)))throw Error('The frozen reference map does not match the source.');const review=readQualityReview(response,context),checks=deterministicQualityChecks(source),sandbox=source.step===4?sandboxQualityChecks(response,source,artifact):null;return{review,checks,sandbox,approved:review.decision==='pass'&&checks.passed&&(!sandbox||sandbox.passed),scope:'Review and isolated fixture checks only; no measured experiment results.'};}
async function main(){
 const{values}=parseArgs({options:{live:{type:'boolean'},run:{type:'string'},replay:{type:'string'},'from-source':{type:'string'},'from-context':{type:'string'},help:{type:'boolean'}}});
 if(values.help){console.log('npm run eval:paper-quality\nnpm run eval:paper-quality -- --live --run NAME --from-source PRIVATE_JSON --from-context PRIVATE_CONTEXT_JSON\nnpm run eval:paper-quality -- --replay NAME\nOffline by default. New live runs require the original contract and cumulative history. Named runs never repeat an uncertain call. An existing provider ID can be resumed with the identical live invocation.');return;}
 const name=values.run??values.replay;if(name&&!RUN_NAME.test(name))throw Error('Use a bounded frozen-run name.');
 if(values.replay){if(values.live||values.run||values['from-source']||values['from-context'])throw Error('Replay uses only the original frozen inputs and response.');const saved=await readJSON(resolve('.test-artifacts/paper-quality-evaluations',name,'run.json'));if(!saved?.response||saved.response.status!=='completed')throw Error('No completed original reviewer response exists.');if(JSON.parse(saved.request.input).source_sha256!==qualityAttachment(saved.source).hash)throw Error('The frozen reviewer source identity changed.');const report={mode:'replay',...grade(saved.source,saved.response,saved.sandbox_artifact,saved.request),model_calls:0};console.log(JSON.stringify(report));return;}
 if(!values.live){if(name||values['from-source']||values['from-context'])throw Error('Use --live for an intentional provider call.');const source=qualitySource(4),original=qualityRow(4).original_request,context={version:'paper-quality-context-v1',generation_instructions:original.instructions,generation_input:original.input,reference_map:qualityReferenceMap(source.confirmed_breakdown),finding_ledger:[],prior_resolutions:[],previous_candidate:null};console.log(JSON.stringify({mode:'offline',...grade(source,qualityResponse({...passReview(),resolutions:[]},source),undefined,qualityReviewRequest(source,'file-fixture',context)),model_calls:0,meaning:'Synthetic contract fixtures, not reviewer quality or live sandbox qualification.'}));return;}
 if(!name||!values['from-source'])throw Error('Every live reviewer evaluation requires --run and --from-source.');
 const source=JSON.parse(await readFile(values['from-source'],'utf8'));if(!deterministicQualityChecks(source).passed)throw Error('Use a source-bound, structurally valid stage candidate.');
 const context=values['from-context']?validateQualityContext(JSON.parse(await readFile(values['from-context'],'utf8'))):undefined;
 if(context&&!isDeepStrictEqual(context.reference_map,qualityReferenceMap(source.confirmed_breakdown)))throw Error('The canonical reference map does not match the frozen source.');
 const directory=resolve('.test-artifacts/paper-quality-evaluations',name);await privateDirectory(directory);const release=await lockRun(directory);
 try{
  env.loadEnvConfig(process.cwd());const model=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:25000});let saved=await readJSON(join(directory,'run.json'));
  if(saved){if(!isDeepStrictEqual(saved.source,source)||!isDeepStrictEqual(saved.review_context,context))throw Error('The frozen reviewer source or context changed; use a new run name.');}
  else{if(!context)throw Error('New live runs require --from-context with the original contract and cumulative findings.');saved={source,review_context:context,status:'prepared',token:randomUUID(),created_at:new Date().toISOString()};await privateJSON(join(directory,'run.json'),saved);}
  if(!saved.response_id){
   if(saved.status!=='prepared')throw Error('The original upload/submission is uncertain or terminal. Reconcile it; it will not be repeated.');
   let file;
   if(source.step===4){saved.status='uploading_attachment';await privateJSON(join(directory,'run.json'),saved);const attachment=qualityAttachment(source);file=await model.files.create({file:new File([attachment.text],attachment.filename,{type:'application/json'}),purpose:'user_data',expires_after:{anchor:'created_at',seconds:86400}});saved.file_id=file.id;}
   saved.request=qualityReviewRequest(source,file?.id,saved.review_context);saved.status='submitting';await privateJSON(join(directory,'run.json'),saved);
   const response=await model.responses.create(saved.request,{headers:{'X-Client-Request-Id':saved.token}});saved={...saved,response_id:response.id,response,status:response.status};await privateJSON(join(directory,'run.json'),saved);console.log(JSON.stringify({submitted:true,run:name,reasoning:'high',model_calls:1}));
  }
  const retrieve=async()=>{const response=await model.responses.retrieve(saved.response_id,{include:['code_interpreter_call.outputs']});if(response.id!==saved.response_id)throw Error('The original reviewer response identity changed.');saved={...saved,response,status:response.status};await privateJSON(join(directory,'run.json'),saved);};
  if(source.step===4&&saved.response?.status==='completed'&&saved.response.output.some(o=>o.type==='code_interpreter_call'&&o.outputs===null))await retrieve();
  const end=Date.now()+1200000;
  while(['queued','in_progress'].includes(saved.response?.status)&&Date.now()<end){await delay(3000);await retrieve();}
  if(['queued','in_progress'].includes(saved.response?.status))throw Error('The original reviewer is pending. Resume this exact named run; no new inference is needed.');
  if(source.step===4&&!saved.sandbox_artifact){saved.sandbox_artifact=await retrieveQualitySandboxArtifact(model,saved.response,source);await privateJSON(join(directory,'run.json'),saved);}
  const report={mode:'live',...grade(source,saved.response,saved.sandbox_artifact,saved.request),model_calls:1,usage:saved.response.usage??null};await privateJSON(join(directory,'report.json'),report);console.log(JSON.stringify(report));
 }finally{await release();}
}
await main().catch(error=>{console.error(paperCLIError(error));process.exitCode=1;});
