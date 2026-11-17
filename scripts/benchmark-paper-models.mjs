// Fixed-purpose, browser-free model comparison. Never writes assessments or runs generated code.
import {parseArgs} from 'node:util';
import {readFileSync} from 'node:fs';
import {readFile as readAsync,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import env from '@next/env';
import OpenAI from 'openai';
import {extractPaperPDF} from '../lib/paper-intake-pdf.ts';
import {paperModelRequest,sha256} from '../lib/paper-intake-model.ts';
import {readPaperExtraction} from '../lib/paper-intake-runner.ts';
import {resolvePaperSources} from '../lib/paper-source-references.ts';
import {experimentPlanRequest} from '../lib/paper-experiment-plan-model.ts';
import {readExperimentPlan} from '../lib/paper-experiment-plan-runner.ts';
import {stepCommandsRequest} from '../lib/paper-step-commands-model.ts';
import {readTerminalCommands} from '../lib/paper-terminal-commands-runner.ts';
import {INDIVIDUAL_TERMINAL_LAYOUT} from '../lib/paper-terminal-commands.ts';
import {terminalSyntaxChecks} from './lib/terminal-command-checks.mjs';
import {SYNTHETIC_PAPERS,BENCHMARK_VERSION,reviewedSyntheticCase,syntheticQualityChecks} from './lib/synthetic-paper-benchmark-cases.mjs';
import {RUN_NAME,privateJSON,readJSON,lockRun} from './lib/paper-evaluation-store.mjs';
import {paperCLIError} from './lib/paper-cli-errors.mjs';

export const MODELS=['gpt-5.4-2026-03-05','gpt-5.4-mini-2026-03-17'];
export const EFFORTS=['low','medium','high'];
const STUDY='00000000-0000-4000-8000-000000000001';
const PRICES={
 'gpt-5.4-2026-03-05':{input:2.5,cached:0.25,output:15},
 'gpt-5.4-mini-2026-03-17':{input:0.75,cached:0.075,output:4.5},
};
const POLICY={version:BENCHMARK_VERSION,max_calls:48,budget_usd:40,concurrency:3,run_minutes:60,response_minutes:20,output_caps:{breakdown:32768,plan:32768,'commands-collect':49152,'commands-analyze':49152},pricing_as_of:'2026-11-16',pricing_sources:['https://developers.openai.com/api/docs/models/gpt-5.4','https://developers.openai.com/api/docs/models/gpt-5.4-mini'],prices:PRICES,limitations:'Two exposed synthetic manuscripts, one sample per setting/task; rubric is lexical development coverage plus application validators, not a held-out scientific evaluation. Generated commands receive static parsing only and are never executed.'};
const pending=r=>['queued','in_progress'].includes(r?.status);
const raw=r=>JSON.parse(r.output.filter(i=>i.type==='message').flatMap(i=>i.content).filter(i=>i.type==='output_text').map(i=>i.text).join(''));
const nulPaths=(v,path='$')=>typeof v==='string'?(v.includes('\0')?[path]:[]):v&&typeof v==='object'?Object.entries(v).flatMap(([k,x])=>nulPaths(x,path+'.'+k)):[];
const usageCost=(usage,model)=>{if(!usage)return null;const p=PRICES[model];const cached=usage.input_tokens_details?.cached_tokens??0;return((usage.input_tokens-cached)*p.input+cached*p.cached+usage.output_tokens*p.output)/1e6;};
const reserve=request=>{const p=PRICES[request.model];return(JSON.stringify(request).length*p.input+request.max_output_tokens*2*p.output)/1e6;};
function grade(job,response){
 let value,validation_error=null,syntax=null;
 try{
  if(job.task==='breakdown')value=readPaperExtraction(response,job.testCase.paper);
  else if(job.task==='plan')value=readExperimentPlan(response,job.testCase.breakdown,job.request.text.format.name);
  else{
   value=readTerminalCommands(response,{source_plan:job.testCase.plan,confirmed_breakdown:job.testCase.breakdown,experiment_index:1,action_ref:job.action_ref,command_layout:INDIVIDUAL_TERMINAL_LAYOUT});
   syntax=terminalSyntaxChecks([['setup',value.setup],[job.action_ref,value.actions[job.action_ref]],['cleanup',value.cleanup]],STUDY,1,INDIVIDUAL_TERMINAL_LAYOUT);
  }
 }catch(error){validation_error=paperCLIError(error);}
 if(!value&&response.status==='completed')try{value=job.task==='breakdown'?resolvePaperSources(raw(response),job.testCase.paper,true,true,true):raw(response);}catch{}
 const checks=[{name:'provider completed',passed:response.status==='completed'},{name:'production validation',passed:!validation_error},...(syntax?[{name:'Bash and embedded Python static syntax',passed:syntax.passed}]:[]),...(value?syntheticQualityChecks(job.task,value,job.testCase):[])];
 // Keep the frozen task denominator even when a response never yields parseable output.
 const expected=syntheticQualityChecks(job.task,{},job.testCase).length+2+(job.task.startsWith('commands')?1:0);
 if(job.task.startsWith('commands')&&!syntax)checks.push({name:'Bash and embedded Python static syntax',passed:false});
 return{checks,passed:checks.every(c=>c.passed)&&checks.length===expected,passed_checks:checks.filter(c=>c.passed).length,total_checks:expected,validation_error,syntax,value:value??null};
}
async function prepare(){
 const cases=[];
 for(const spec of SYNTHETIC_PAPERS){const bytes=new Uint8Array(await readAsync(resolve('pdfs/synthetic_papers',spec.file)));const paper=await extractPaperPDF(bytes);cases.push({...reviewedSyntheticCase(spec.id,paper),pdf_sha256:sha256(bytes),filename:spec.file});}
 const jobs=[];
 for(const testCase of cases)for(const model of MODELS)for(const effort of EFFORTS)for(const task of ['breakdown','plan','commands-collect','commands-analyze']){
  const action_ref=task==='commands-collect'?'1.3.3':task==='commands-analyze'?'1.4.1':null;
  const request=task==='breakdown'?paperModelRequest(testCase.paper):task==='plan'?experimentPlanRequest(testCase.breakdown):stepCommandsRequest(STUDY,1,action_ref,testCase.plan,testCase.breakdown);
  request.model=model;request.reasoning={effort};request.max_output_tokens=POLICY.output_caps[task];
  jobs.push({id:[testCase.id,task,model.includes('mini')?'mini':'full',effort].join('--'),task,model,effort,action_ref,testCase,request});
 }
 // Deterministic shuffle mixes cases/effort/models and reduces ordering bias.
 let seed=20261117;for(let i=jobs.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[jobs[i],jobs[j]]=[jobs[j],jobs[i]];}
 const sourceFiles=['scripts/benchmark-paper-models.mjs','scripts/lib/synthetic-paper-benchmark-cases.mjs','lib/paper-intake-model.ts','lib/paper-experiment-plan-model.ts','lib/paper-step-commands-model.ts','lib/paper-terminal-commands-model.ts'];
 return{policy:POLICY,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source_hashes:Object.fromEntries(sourceFiles.map(f=>[f,sha256(readFileSync(f))])),jobs};
}
async function report(directory,manifest){
 const rows=[];
 for(const job of manifest.jobs){const saved=await readJSON(join(directory,job.id+'.json'));if(!saved)continue;if(saved.identity!==sha256(JSON.stringify(job)))throw new Error('Saved call identity does not match its frozen benchmark job.');const graded=saved.response?grade(job,saved.response):{passed:false,checks:[],passed_checks:0,total_checks:syntheticQualityChecks(job.task,{},job.testCase).length+2+(job.task.startsWith('commands')?1:0)};
  if(graded.value)await privateJSON(join(directory,job.id+'.output.json'),graded.value);
  let nul_paths=null;try{nul_paths=nulPaths(raw(saved.response));}catch{}
  const scoring={...graded};delete scoring.value;rows.push({id:job.id,task:job.task,paper:job.testCase.id,model:job.model,effort:job.effort,status:saved.response?.status??saved.status,response_id:saved.response?.id??null,incomplete_reason:saved.response?.incomplete_details?.reason??null,error:saved.error??null,nul_paths,latency_seconds:saved.terminal_observed_at?(Date.parse(saved.terminal_observed_at)-Date.parse(saved.started_at))/1000:null,usage:saved.response?.usage??null,estimated_usd:usageCost(saved.response?.usage,job.model),...scoring});
 }
 const manual=await readJSON(join(directory,'manual-review.json'));
 const result={version:BENCHMARK_VERSION,run:manifest.run,generated_at:new Date().toISOString(),validator_source_hashes:Object.fromEntries(['scripts/benchmark-paper-models.mjs','scripts/lib/synthetic-paper-benchmark-cases.mjs','scripts/lib/terminal-command-checks.mjs','scripts/lib/check-terminal-python.py'].map(f=>[f,sha256(readFileSync(f))])),policy:manifest.policy,admitted_calls:rows.length,estimated_usd:rows.reduce((n,r)=>n+(r.estimated_usd??0),0),manual_review:manual,rows};
 await privateJSON(join(directory,'report.json'),result);
 const lines=['# Synthetic paper model and reasoning comparison','',`Run: ${manifest.run}. ${rows.length}/${manifest.jobs.length} calls admitted. Estimated standard API cost: $${result.estimated_usd.toFixed(3)}; actual invoice charges unavailable.`,'',POLICY.limitations,'','The input, prompt and token allowance are identical across candidates within each task. Downstream stages use hand-reviewed fixed inputs. See manifest.json for exact frozen requests and source hashes.','', '## Measured results','', '| Task | Model | Effort | Completed / planned | App valid | Static syntax | Frozen rubric | Mean observed seconds | Estimated USD |','|---|---|---|---:|---:|---:|---:|---:|---:|'];
 for(const task of ['breakdown','plan','commands-collect','commands-analyze'])for(const model of MODELS)for(const effort of EFFORTS){
  const group=rows.filter(r=>r.task===task&&r.model===model&&r.effort===effort),times=group.filter(r=>r.latency_seconds!==null).map(r=>r.latency_seconds);
  lines.push(`| ${task} | ${model.includes('mini')?'GPT-5.4 mini':'GPT-5.4'} | ${effort} | ${group.filter(r=>r.status==='completed').length} / 2 | ${group.filter(r=>r.checks.some(c=>c.name==='production validation'&&c.passed)).length} | ${task.startsWith('commands')?group.filter(r=>r.syntax?.passed).length:'—'} | ${group.reduce((n,r)=>n+r.passed_checks,0)} / ${group.reduce((n,r)=>n+r.total_checks,0)} | ${times.length?(times.reduce((a,b)=>a+b,0)/times.length).toFixed(1):'—'} | ${group.reduce((n,r)=>n+(r.estimated_usd??0),0).toFixed(3)} |`);
 }
 lines.push('','Frozen rubric coverage is not a scientific accuracy percentage. Missing outputs count as failed checks; lexical false positives/negatives remain in the frozen score and are documented below. Mean times include failed/incomplete terminal responses when observed. App validation covers the local application reader, not a database write or all semantic requirements. Static checks never execute generated code.','', '## Output integrity','', 'A post-hoc NUL check supplements the frozen rubric: PostgreSQL jsonb cannot store NUL in parsed strings. No database write is performed by this check.','');
 const nulRows=rows.filter(r=>r.nul_paths?.length);lines.push(...(nulRows.length?nulRows.map(r=>`- ${r.id}: ${r.nul_paths.join(', ')}`):['No NUL characters detected in parseable outputs.']),'','[PostgreSQL JSON representation constraints](https://www.postgresql.org/docs/current/datatype-json.html)','', '## Developer review','');
 if(manual){lines.push(manual.reviewer,manual.method,'');for(const finding of manual.findings){lines.push(`### ${finding.id}`, '',`Disposition: **${finding.disposition}** (${finding.severity}).`,'',...finding.findings.map(f=>'- '+f));if(finding.positive)lines.push('',finding.positive);if(finding.automated_false_positive)lines.push('','Rubric adjudication: '+finding.automated_false_positive);if(finding.source)lines.push('',`[Supporting documentation](${finding.source})`);lines.push('');}}
 else lines.push('Not yet reviewed.');
 lines.push('## Limitations and replay','', 'This is one sample per setting/task from two exposed papers. The review is unblinded and performed by the same developer who built the evaluation; it is not independent human review. No general optimum or runtime correctness is established.','', 'The larger output-token budgets do not change the application schema: each terminal script still has a 16,000-character field limit. Inspect command completeness independently of provider status and application validation.','', 'The original responses are immutable evaluation evidence. Replaying may strengthen the validator without making new model calls; report.json records the grading source hashes. Production settings and assessment records are unchanged.','', 'Pricing: [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4), [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini). See the frozen pricing date and policy in manifest.json.','');
 await writeFile(join(directory,'report.md'),lines.join('\n'),{mode:0o600});
 return result;
}
async function main(){
 const {values}=parseArgs({options:{run:{type:'string'},prepare:{type:'boolean'},live:{type:'boolean'},replay:{type:'boolean'},stage:{type:'string',default:'all'},help:{type:'boolean'}}});
 if(values.help){console.log('npm run eval:models -- --run NAME --prepare\nnpm run eval:models -- --run NAME --live [--stage breakdown|plan|commands|all]\nnpm run eval:models -- --run NAME --replay\nFixed 48-call matrix, $40 estimated ceiling, 3 concurrent background responses. Frozen inputs/prompts/rubrics. Reuses original response IDs; uncertain submissions never repeated. No database writes, generated-code execution or production changes.');return;}
 if(!RUN_NAME.test(values.run??''))throw new Error('Supply a bounded run name.');
 if([values.prepare,values.live,values.replay].filter(Boolean).length!==1)throw new Error('Choose prepare, live or replay.');
 if(!['all','breakdown','plan','commands'].includes(values.stage))throw new Error('Unknown benchmark stage.');
 const directory=resolve('.test-artifacts/synthetic-model-benchmarks',values.run);const release=await lockRun(directory);
 try{
  const path=join(directory,'manifest.json');let manifest=await readJSON(path);
  if(values.prepare){if(manifest)throw new Error('Run is already frozen; choose a new name.');manifest={...await prepare(),run:values.run,created_at:new Date().toISOString()};manifest.identity=sha256(JSON.stringify(manifest.jobs));await privateJSON(path,manifest);console.log(JSON.stringify({prepared:true,jobs:manifest.jobs.length,identity:manifest.identity,report:directory}));return;}
  if(!manifest||manifest.identity!==sha256(JSON.stringify(manifest.jobs)))throw new Error('Missing or modified frozen benchmark inputs.');
  if(values.replay){const r=await report(directory,manifest);console.log(JSON.stringify({replayed:true,admitted:r.admitted_calls,estimated_usd:r.estimated_usd,report:join(directory,'report.json')}));return;}
  env.loadEnvConfig(process.cwd());if(!process.env.OPENAI_API_KEY)throw new Error('Configure server-only OPENAI_API_KEY.');
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,baseURL:'https://api.openai.com/v1',maxRetries:0,timeout:25000});
  for(const model of MODELS)await client.models.retrieve(model);
  if(!manifest.deadline_at){manifest.deadline_at=new Date(Date.now()+POLICY.run_minutes*60000).toISOString();await privateJSON(path,manifest);}
  const states=new Map();for(const job of manifest.jobs){const state=await readJSON(join(directory,job.id+'.json'));if(state)states.set(job.id,state);}
  let stop=false,newCalls=0;const queue=manifest.jobs.filter(j=>values.stage==='all'||values.stage==='commands'&&j.task.startsWith('commands')||j.task===values.stage);let index=0;
  process.once('SIGINT',()=>{stop=true;});
  const spentOrReserved=()=>manifest.jobs.reduce((sum,j)=>{const s=states.get(j.id);return sum+(!s?0:s.terminal_observed_at?usageCost(s.response?.usage,j.model)??reserve(j.request):reserve(j.request));},0);
  async function worker(){while(index<queue.length&&!stop){const job=queue[index++],file=join(directory,job.id+'.json');let saved=states.get(job.id);
   if(!saved){
    if(Date.now()>=Date.parse(manifest.deadline_at))throw new Error('Frozen benchmark deadline reached.');
    if(states.size>=POLICY.max_calls||spentOrReserved()+reserve(job.request)>POLICY.budget_usd){stop=true;console.log(JSON.stringify({admission_stopped:'budget_or_call_ceiling',reserved_usd:spentOrReserved()}));break;}
    saved={identity:sha256(JSON.stringify(job)),started_at:new Date().toISOString(),deadline_at:new Date(Math.min(Date.parse(manifest.deadline_at),Date.now()+POLICY.response_minutes*60000)).toISOString(),token:randomUUID(),status:'submitting'};states.set(job.id,saved);await privateJSON(file,saved);newCalls++;
    console.log(JSON.stringify({submitted:job.id}));
    try{saved.response=await client.responses.create(job.request,{headers:{'X-Client-Request-Id':saved.token}});saved.status=saved.response.status;}
    catch(error){saved.status=error instanceof OpenAI.APIError&&error.status>=400&&error.status<500&&![408,409].includes(error.status)?'rejected':'uncertain';saved.error={http_status:error.status??null,code:/^[a-z][a-z0-9_]{0,80}$/i.test(error.code??'')?error.code:null};if(saved.error.code==='credit_balance_exhausted'||saved.error.code==='insufficient_quota')stop=true;}
    await privateJSON(file,saved);
   }
   if(saved.identity!==sha256(JSON.stringify(job)))throw new Error('Saved call identity changed.');
   if(!saved.response){console.log(JSON.stringify({id:job.id,status:saved.status,retained:true}));continue;}
   while(pending(saved.response)){
    await delay(3000);let response;
    try{response=stop||Date.now()>=Date.parse(saved.deadline_at)?await client.responses.cancel(saved.response.id):await client.responses.retrieve(saved.response.id);}catch(error){saved.poll_error=paperCLIError(error);await privateJSON(file,saved);console.log(JSON.stringify({id:job.id,poll_error:saved.poll_error,retained:true}));break;}
    if(response.id!==saved.response.id)throw new Error('Response identity changed.');saved.response=response;saved.status=response.status;await privateJSON(file,saved);
   }
   if(!pending(saved.response)&&!saved.terminal_observed_at){saved.terminal_observed_at=new Date().toISOString();await privateJSON(file,saved);}
   const score=grade(job,saved.response);console.log(JSON.stringify({finished:job.id,status:saved.response.status,score:score.passed_checks+'/'+score.total_checks,valid:!score.validation_error,seconds:saved.terminal_observed_at?(Date.parse(saved.terminal_observed_at)-Date.parse(saved.started_at))/1000:null,estimated_usd:usageCost(saved.response.usage,job.model)}));
  }}
  const workers=await Promise.allSettled(Array.from({length:POLICY.concurrency},worker));for(const w of workers)if(w.status==='rejected')throw w.reason;
  const r=await report(directory,manifest);console.log(JSON.stringify({finished:true,new_calls:newCalls,admitted:r.admitted_calls,estimated_usd:r.estimated_usd,report:join(directory,'report.json')}));
 }finally{await release();}
}
await main().catch(error=>{console.error(paperCLIError(error));process.exitCode=1;});
