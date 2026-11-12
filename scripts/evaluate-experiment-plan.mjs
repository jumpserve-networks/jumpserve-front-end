import {parseArgs} from 'node:util';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import env from '@next/env';
import OpenAI from 'openai';
import {experimentPlanRequest} from '../lib/paper-experiment-plan-model.ts';
import {readExperimentPlan} from '../lib/paper-experiment-plan-runner.ts';
import {validateExperimentPlan} from '../lib/paper-experiment-plan.ts';
import {validatePaperBreakdown} from '../lib/research-paper-breakdown.ts';
import {sha256} from '../lib/paper-intake-model.ts';
import {breakdownFixture,planFixture} from '../tests/support/experiment-plan-fixture.mjs';
import {RUN_NAME,privateJSON,readJSON,lockRun} from './lib/paper-evaluation-store.mjs';
import {paperCLIError} from './lib/paper-cli-errors.mjs';
import {planQualityChecks,validatePlanExpectations} from './lib/experiment-plan-checks.mjs';

async function main(){
 const {values}=parseArgs({options:{live:{type:'boolean'},run:{type:'string'},replay:{type:'string'},confirmed:{type:'string'},expectations:{type:'string'},prompt:{type:'string'},help:{type:'boolean'}}});
 if(values.help){console.log('npm run eval:experiment-plan [-- --confirmed FILE] [--expectations FILE]\nnpm run eval:experiment-plan -- --live --run NAME [--confirmed FILE] [--expectations FILE] [--prompt FILE]\nnpm run eval:experiment-plan -- --replay NAME\nDefault: offline fixture/source and expectation bounds checks. Live: at most one original model call per named run, no database writes or experiment execution. Optional content expectations are frozen with the input and never sent to the model. Reusing the name retrieves the retained response; unknown submissions are never repeated.');return;}
 const root=resolve('.test-artifacts/experiment-plan-evaluations');
 function named(name){if(!RUN_NAME.test(name??''))throw new Error('Supply a run name with 1–80 letters, digits, dots, underscores or hyphens.');return join(root,name);}
 const identity=(breakdown,request,expectations)=>sha256(JSON.stringify({breakdown,request,...(expectations===undefined?{}:{expectations})}));
 function verify(saved){if(saved.identity!==identity(saved.breakdown,saved.request,saved.expectations))throw new Error('Saved evaluation inputs do not match their frozen identity.');validatePaperBreakdown(saved.breakdown);if(saved.expectations!==undefined)validatePlanExpectations(saved.expectations);}
 function grade(saved){const plan=readExperimentPlan(saved.response,saved.breakdown),checks=planQualityChecks(plan,saved.expectations);return{passed:checks.every(check=>check.passed),experiments:plan.experiments.length,steps:plan.experiments.reduce((n,e)=>n+e.steps.length,0),checks};}
 if(values.replay){
  if(values.live||values.run||values.confirmed||values.prompt||values.expectations)throw new Error('Replay uses only the frozen inputs and response.');
  const directory=named(values.replay),saved=await readJSON(join(directory,'run.json'));if(!saved?.response)throw new Error('No retained response is available for replay.');verify(saved);
  const report={mode:'replay',...grade(saved),model_calls:0};await privateJSON(join(directory,'replay-'+Date.now()+'.json'),report);console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;return;
 }
 const breakdown=validatePaperBreakdown(values.confirmed?JSON.parse(await readFile(values.confirmed,'utf8')):breakdownFixture());
 if(breakdown.status!=='ready')throw new Error('Supply a ready, reviewed four-section breakdown.');
 const expectations=values.expectations?validatePlanExpectations(JSON.parse(await readFile(values.expectations,'utf8'))):undefined;
 const request=experimentPlanRequest(breakdown);
 if(values.prompt){const instructions=await readFile(values.prompt,'utf8');if(!instructions.trim()||Buffer.byteLength(instructions)>40000)throw new Error('Candidate instructions must contain 1–40,000 UTF-8 bytes.');request.instructions=instructions;}
 if(!values.live){
  if(values.run||values.prompt)throw new Error('Named runs and candidate prompts require --live.');
  if(!values.confirmed)validateExperimentPlan(planFixture(),breakdown);
  console.log(JSON.stringify({mode:'offline',passed:true,model_calls:0,expectations_checked:expectations!==undefined,meaning:values.confirmed?'Confirmed-input and optional expectation bounds checked; no generated output evaluated.':'Hand-authored plan schema/source and optional expectation bounds checks; no model quality measured.'}));return;
 }
 env.loadEnvConfig(process.cwd());
 const directory=named(values.run),release=await lockRun(directory);
 try{
  const path=join(directory,'run.json');let saved=await readJSON(path);
  if(saved){verify(saved);if(saved.identity!==identity(breakdown,request,expectations))throw new Error('This run name belongs to different inputs, prompt settings or expectations. Choose a new name, or replay the frozen run.');}
  if(!process.env.OPENAI_API_KEY)throw new Error('Configure server-only OPENAI_API_KEY before a live planning evaluation.');
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,baseURL:'https://api.openai.com/v1',maxRetries:0,timeout:25000});let newCalls=0;
  if(!saved){
   if(breakdown.sections.experiment.length)await client.models.retrieve(request.model); // Read-only network/key preflight before admitting inference.
   saved={version:'experiment-plan-evaluation-v1',identity:identity(breakdown,request,expectations),breakdown,request,...(expectations===undefined?{}:{expectations}),token:randomUUID(),started_at:new Date().toISOString(),status:'submitting'};
   // The admission survives process failure. An unacknowledged call is retained
   // as uncertain and cannot be silently repeated by rerunning the command.
   await privateJSON(path,saved);
   if(!breakdown.sections.experiment.length){saved.response={id:'offline-empty-experiment-list',status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"experiments":[]}'}]}]};}
   else{
    newCalls=1;
    try{saved.response=await client.responses.create(request,{headers:{'X-Client-Request-Id':saved.token}});saved.status=saved.response.status;}
    catch(error){saved.status=error instanceof OpenAI.APIError&&error.status>=400&&error.status<500&&![408,409].includes(error.status)?'rejected':'uncertain';saved.error={http_status:error.status??null,code:error.code??null,transport_code:/^(?:E[A-Z]+|UND_ERR_[A-Z_]+)$/.test(error.cause?.code??'')?error.cause.code:null};}
   }
   await privateJSON(path,saved);
  }
  if(!saved.response)throw new Error('The original submission has no confirmed response identity. It will not be repeated; inspect the private named run.');
  const end=Date.now()+45000;
  while(['queued','in_progress'].includes(saved.response.status)&&Date.now()<end){await new Promise(resolve=>setTimeout(resolve,2000));const response=await client.responses.retrieve(saved.response.id);if(response.id!==saved.response.id)throw new Error('Provider response identity changed.');saved.response=response;saved.status=response.status;await privateJSON(path,saved);}
  const pending=['queued','in_progress'].includes(saved.response.status);
  let result;try{result=pending?{passed:null,status:saved.response.status}:grade(saved);}catch(error){result={passed:false,error:paperCLIError(error)};}
  const report={mode:'live',...result,new_model_calls:newCalls,response_id:saved.response.id,model:saved.response.model??null,usage:saved.response.usage??null,actual_charge_cents:null,identity:saved.identity,meaning:'Structural/source checks and exposed content expectations; semantic correctness requires reviewing the generated steps.'};
  await privateJSON(join(directory,'report-'+Date.now()+'.json'),report);console.log(JSON.stringify({...report,report:directory}));if(result.passed===false)process.exitCode=1;
 }finally{await release();}
}
await main().catch(error=>{console.error(paperCLIError(error));process.exitCode=1;});
