import {parseArgs} from 'node:util';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import env from '@next/env';
import OpenAI from 'openai';
import {paperModelRequest,sha256,PAPER_INTAKE_RESERVATION_CENTS} from '../lib/paper-intake-model.ts';
import {extractPaperPDF} from '../lib/paper-intake-pdf.ts';
import {PAPER_CASES,CORPUS_VERSION,gradePaperCase,referenceResponse,quoteDiagnostics} from './lib/paper-intake-cases.mjs';
import {RUN_NAME,privateDirectory,privateJSON,readJSON,lockRun} from './lib/paper-evaluation-store.mjs';
import {assessmentEvaluationSource} from './lib/paper-evaluation-source.mjs';
import {paperCLIError} from './lib/paper-cli-errors.mjs';

async function main(){
const {values}=parseArgs({options:{live:{type:'boolean'},run:{type:'string'},replay:{type:'string'},pdf:{type:'string'},'from-assessment':{type:'string'},prompt:{type:'string'},case:{type:'string'},baseline:{type:'string'},'max-calls':{type:'string',default:'3'},help:{type:'boolean'}}});
if(values.help){console.log('npm run eval:paper [-- --live --run NAME [--case ID | --pdf FILE | --from-assessment UUID] [--prompt FILE] [--baseline NAME] [--max-calls N]]\nnpm run eval:paper -- --replay NAME\nDefault: offline reference checks; no model or database calls. Named live runs resume saved response IDs. --from-assessment reads its private source without changing assessment state.');process.exit(0);}
env.loadEnvConfig(process.cwd());
const root=resolve('.test-artifacts/paper-intake-evaluations');
function named(name){if(!RUN_NAME.test(name??''))throw new Error('Supply a run name with 1–80 letters, digits, dots, underscores or hyphens.');return join(root,name);}
function revision(){
 let git;try{git={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(),dirty:Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim())};}catch{git={commit:null,dirty:null};}
 const files=['lib/paper-intake-model.ts','lib/paper-intake-runner.ts','lib/paper-intake-pdf.ts','lib/research-paper-breakdown.ts','scripts/lib/paper-intake-cases.mjs','package-lock.json'];
 return {...git,node:process.version,source_hashes:Object.fromEntries(files.map(path=>[path,sha256(readFileSync(path))]))};
}
const failures=[];
if(values.replay){
 if(values.live||values.pdf||values['from-assessment']||values.prompt||values.run||values.case)throw new Error('Replay uses the frozen inputs and responses of its named run.');
 const directory=named(values.replay),manifest=await readJSON(join(directory,'manifest.json'));if(!manifest)throw new Error('Saved evaluation run not found.');
 const cases=[];
 for(const item of manifest.cases){
  const saved=await readJSON(join(directory,item.id+'.json'));if(!saved?.response)throw new Error('A saved case has no retained response to replay.');
  if(sha256(JSON.stringify(saved.testCase))!==item.input_sha256||sha256(JSON.stringify(saved.request))!==item.request_sha256)throw new Error('Saved evaluation inputs do not match their manifest.');
  try{const result=gradePaperCase(saved.testCase,saved.response);cases.push({id:item.id,...result});if(!result.passed)failures.push(item.id);}
  catch(error){cases.push({id:item.id,passed:false,error:error.message,quote_issues:quoteDiagnostics(saved.response,saved.testCase.paper)});failures.push(item.id);}
 }
 const report={mode:'replay',run:values.replay,passed:!failures.length,cases,model_calls:0,validator_revision:revision()};await privateDirectory(join(directory,'replays'));await privateJSON(join(directory,'replays',Date.now()+'.json'),report);
 console.log(JSON.stringify({mode:'replay',passed:report.passed,cases:cases.map(c=>({id:c.id,passed:c.passed})),model_calls:0,report:directory}));process.exitCode=failures.length?1:0;
}else{
 let cases=values.case?PAPER_CASES.filter(c=>c.id===values.case):PAPER_CASES;
 if(!cases.length)throw new Error('Unknown evaluation case.');
 if([values.pdf,values.case,values['from-assessment']].filter(Boolean).length>1)throw new Error('Choose one input: --pdf, --case or --from-assessment.');
 let source=null;
 if(values.pdf){const bytes=new Uint8Array(await readFile(values.pdf));source={sha256:sha256(bytes),byte_count:bytes.length};cases=[{id:'provided-paper',paper:await extractPaperPDF(bytes),expected:null}];}
 if(values['from-assessment']){const saved=await assessmentEvaluationSource(values['from-assessment']);source=saved.source;cases=[{id:'provided-paper',paper:saved.paper,expected:null}];}
 const instructions=values.prompt?await readFile(values.prompt,'utf8'):null;
 if(instructions!==null&&(!instructions.trim()||Buffer.byteLength(instructions)>40000))throw new Error('Candidate instructions must contain 1–40,000 UTF-8 bytes.');
 if(!values.live){
  if(values.run||values.baseline||values.prompt)throw new Error('Named runs and candidate prompts require --live; use --replay for saved outputs.');
  for(const c of cases){paperModelRequest(c.paper);if(c.reference)gradePaperCase(c,referenceResponse(c.reference));}
  console.log(JSON.stringify({mode:'offline',passed:true,cases:cases.map(c=>c.id),model_calls:0,meaning:source?'PDF extraction and complete-input bounds only; no model output evaluated.':'Hand-authored fixture/schema/grounding checks; no model quality measured.'}));
 }else{
  const directory=named(values.run),maxCalls=Number(values['max-calls']);if(!Number.isSafeInteger(maxCalls)||maxCalls<1||maxCalls>20)throw new Error('max-calls must be an integer from 1 to 20.');
  if(!process.env.OPENAI_API_KEY)throw new Error('Configure server-only OPENAI_API_KEY before a live evaluation.');
  const release=await lockRun(directory);
  try{
   const requests=cases.map(c=>{const request=paperModelRequest(c.paper);if(instructions!==null)request.instructions=instructions;return {id:c.id,input_sha256:sha256(JSON.stringify(c)),request_sha256:sha256(JSON.stringify(request)),request,testCase:c};});
   const baseline=values.baseline?await readJSON(join(named(values.baseline),'report.json')):null;
   if(values.baseline&&!baseline)throw new Error('Baseline report not found.');
   const old=await readJSON(join(directory,'manifest.json'));
   const identity=requests.map(({id,input_sha256,request_sha256})=>({id,input_sha256,request_sha256}));
   if(old&&JSON.stringify(old.cases)!==JSON.stringify(identity))throw new Error('This run name belongs to different inputs or prompt settings. Choose a new run name.');
   if(!old)await privateJSON(join(directory,'manifest.json'),{version:CORPUS_VERSION,created_at:new Date().toISOString(),revision:revision(),source,cases:identity});
   const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,baseURL:'https://api.openai.com/v1',maxRetries:0,timeout:25000});
   const newCases=[];for(const item of requests)if(!await readJSON(join(directory,item.id+'.json')))newCases.push(item);
   if(newCases.length>maxCalls)throw new Error('The selected cases exceed max-calls; no new model calls were admitted.');
   if(newCases.length)await client.models.retrieve(requests[0].request.model); // Network/key preflight before any inference.
   let newCalls=0;const reportCases=[];
   for(const item of requests){
    const path=join(directory,item.id+'.json');let saved=await readJSON(path);
    if(!saved){
     saved={testCase:item.testCase,request:item.request,token:randomUUID(),status:'submitting',started_at:new Date().toISOString()};await privateJSON(path,saved);newCalls++;
     try{saved.response=await client.responses.create(item.request,{headers:{'X-Client-Request-Id':saved.token}});saved.status=saved.response.status;}
     catch(error){saved.status=error instanceof OpenAI.APIError&&error.status>=400&&error.status<500&&![408,409].includes(error.status)?'rejected':'uncertain';saved.error={http_status:error.status??null,code:error.code??null};}
     await privateJSON(path,saved);
    }
    if(!saved.response){failures.push(item.id);reportCases.push({id:item.id,passed:false,status:saved.status,error:'No confirmed response identity; this request will not be submitted again.'});continue;}
    const end=Date.now()+180000;
    while(['queued','in_progress'].includes(saved.response.status)&&Date.now()<end){await new Promise(r=>setTimeout(r,2000));saved.response=await client.responses.retrieve(saved.response.id);saved.status=saved.response.status;await privateJSON(path,saved);}
    if(!['queued','in_progress'].includes(saved.response.status)&&!saved.terminal_observed_at){saved.terminal_observed_at=new Date().toISOString();await privateJSON(path,saved);}
    let graded;try{graded=gradePaperCase(item.testCase,saved.response);}catch(error){graded={passed:false,error:error.message,quote_issues:quoteDiagnostics(saved.response,item.testCase.paper)};}
    if(!graded.passed)failures.push(item.id);
    const row={id:item.id,status:saved.response.status,response_id:saved.response.id,model:saved.response.model,usage:saved.response.usage??null,observed_duration_ms:saved.terminal_observed_at?Date.parse(saved.terminal_observed_at)-Date.parse(saved.started_at):null,...graded};reportCases.push(row);
    console.log(JSON.stringify({case:item.id,status:row.status,passed:row.passed,sections:row.sections??null,response_id:row.response_id}));
   }
   const report={version:CORPUS_VERSION,run:values.run,mode:'live',passed:!failures.length,new_model_calls:newCalls,total_admitted_calls:requests.length,reservation_cents:newCalls*PAPER_INTAKE_RESERVATION_CENTS,actual_charge_cents:null,validator_revision:revision(),cases:reportCases,limitations:'Exposed software regressions; a passing score is not a scientific review or exhaustive semantic validation.'};
   if(baseline){report.comparison=reportCases.map(c=>({id:c.id,previous:baseline.cases.find(p=>p.id===c.id)?.passed??null,current:c.passed}));}
   await privateDirectory(join(directory,'reports'));await privateJSON(join(directory,'reports',Date.now()+'-'+randomUUID()+'.json'),report);await privateJSON(join(directory,'report.json'),report);console.log(JSON.stringify({passed:report.passed,new_model_calls:newCalls,total_admitted_calls:report.total_admitted_calls,reservation_cents:report.reservation_cents,comparison:report.comparison??null,report:join(directory,'report.json')}));process.exitCode=failures.length?1:0;
  }finally{await release();}
 }
}
}
await main().catch(error=>{console.error(paperCLIError(error));process.exitCode=1;});
