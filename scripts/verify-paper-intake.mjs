// Privileged operator workflow, not a replacement for the website's Google checks.
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {join,resolve} from 'node:path';
import env from '@next/env';
import OpenAI from 'openai';
import {createClient} from '@supabase/supabase-js';
import {preparePaperIntake} from '../lib/paper-intake-service.ts';
import {refreshPaperIntake,cancelPaperIntake,readPaperExtraction} from '../lib/paper-intake-runner.ts';
import {PAPER_INTAKE_MODEL,sha256,extractionBreakdown,serializePaperText} from '../lib/paper-intake-model.ts';
import {validatePaperBreakdown} from '../lib/research-paper-breakdown.ts';
import {connectPaperMCP} from './lib/paper-intake-mcp.mjs';
import {privateDirectory,privateJSON,lockRun} from './lib/paper-evaluation-store.mjs';
import {paperCLIError} from './lib/paper-cli-errors.mjs';

async function main(){
const {values}=parseArgs({options:{assessment:{type:'string'},cancel:{type:'boolean'},'api-origin':{type:'string',default:'https://jumpserve.quaint-lab.org'},help:{type:'boolean'}}});
if(values.help){console.log('npm run verify:paper -- --assessment UUID [--cancel] [--api-origin https://jumpserve.quaint-lab.org]\nUses operator MCP authorization and server-side keys. Reuses the existing paper identity, budget and response. No browser or user JWT is created.');process.exit(0);}
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(values.assessment??''))throw new Error('Supply --assessment with an existing paper UUID.');
if(!['https://jumpserve.quaint-lab.org','http://localhost:6001'].includes(values['api-origin']))throw new Error('Use the canonical production origin or localhost:6001.');
env.loadEnvConfig(process.cwd());
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
const match=url?.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co$/);
if(!match||!key||!process.env.OPENAI_API_KEY)throw new Error('Configure the Supabase project URL, server secret and OPENAI_API_KEY.');
const directory=resolve('.test-artifacts/paper-intake-verification',values.assessment);await privateDirectory(directory);const release=await lockRun(directory);
const trace=join(directory,new Date().toISOString().replaceAll(':','-'));await privateDirectory(trace);
const model=new OpenAI({apiKey:process.env.OPENAI_API_KEY,baseURL:'https://api.openai.com/v1',maxRetries:0,timeout:25000});
const storage=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(25000)})}}).storage;
let mcp;
try{
 mcp=await connectPaperMCP(match[1],trace);
 const original=await mcp.original(values.assessment),before=await mcp.evidence(values.assessment);
 let row=await mcp.load(original.id,original.owner_id);
 const needsSubmission=!row||row.status==='uploaded';
 if(needsSubmission&&!values.cancel)await model.models.retrieve(PAPER_INTAKE_MODEL); // Fail before database admission if credentials/network are unavailable.
 if(!row)row=await mcp.save('reserve',{study_id:original.id,owner_id:original.owner_id},original.identity);
 const ops={
  save:mcp.save,retrieve:id=>model.responses.retrieve(id),cancel:id=>model.responses.cancel(id),
  create:(request,token)=>model.responses.create(request,{headers:{'X-Client-Request-Id':token}}),
  readOriginal:async current=>{const result=await storage.from('research-paper-uploads').download(`${current.study_id}/${current.sha256}`);if(result.error||!result.data)throw new Error('The original private PDF is unavailable.');return new Uint8Array(await result.data.arrayBuffer());},
  retainArtifact:async(current,id,bytes,media_type,kind)=>{
   const hash=sha256(bytes),path=`${current.study_id}/${hash}`,bucket=storage.from('research-workflow-raw');
   const result=await bucket.upload(path,bytes,{contentType:media_type,upsert:false});
   if(result.error){const existing=await bucket.download(path);if(existing.error||!existing.data||sha256(new Uint8Array(await existing.data.arrayBuffer()))!==hash)throw new Error('Immutable evidence could not be retained and verified.');}
   return {id,sha256:hash,byte_count:bytes.length,storage_path:path,media_type,provenance:{kind,version:'paper-intake-next-v1',original_sha256:current.sha256}};
  },
 };
 row=values.cancel?await cancelPaperIntake(row,ops):await preparePaperIntake(row,ops);
 const end=Date.now()+180000;
 while(row.status==='processing'&&Date.now()<end){await new Promise(r=>setTimeout(r,2000));row=await refreshPaperIntake(row,ops);}
 const after=await mcp.evidence(original.id);
 const checks={owner_and_original_preserved:row.owner_id===original.owner_id&&row.sha256===original.identity.sha256&&row.byte_count===original.identity.byte_count,no_new_tasks:after.tasks===before.tasks,no_new_model_dispatches:after.dispatches===before.dispatches,no_new_experiment_jobs:after.jobs===before.jobs,original_deadline_preserved:!before.workflow||row.deadline_at===before.workflow.deadline_at,original_commitments_preserved:!before.workflow||after.workflow?.committed_cents===before.workflow.committed_cents,one_admitted_model_call:row.status==='ready'?after.intake.model_calls===1:after.intake.model_calls<=1,event_history:after.events.length>0&&after.events.every((e,index)=>e.revision===index+1)&&after.events.at(-1).status===row.status};
 if(after.intake.model_calls){
  checks.original_artifact_hash=after.artifacts.find(a=>a.id===row.original_artifact_id)?.sha256===original.identity.sha256;
  checks.retained_text_hash=after.artifacts.find(a=>a.id===row.text_artifact_id)?.sha256===sha256(serializePaperText(after.intake.paper_text));
  checks.request_retained=after.intake.request?.model===PAPER_INTAKE_MODEL&&typeof after.intake.request.input==='string';
  checks.response_retained=!row.provider_response_id||after.intake.response?.id===row.provider_response_id;
 }
 if(row.status==='ready'){
  const breakdown=validatePaperBreakdown(row.breakdown),extracted=readPaperExtraction(after.intake.response,after.intake.paper_text),rebuilt=extractionBreakdown(extracted,after.intake.paper_text,row.source_id,row.text_artifact_id);
  checks.saved_breakdown_grounded=isDeepStrictEqual(breakdown.sections,rebuilt.sections);
  checks.source_artifacts_retained=[row.original_artifact_id,row.text_artifact_id].every(id=>after.artifacts.some(a=>a.id===id));
  checks.text_artifact_hash=after.artifacts.find(a=>a.id===row.text_artifact_id)?.sha256===breakdown.text_sha256;
  checks.original_artifact_hash=after.artifacts.find(a=>a.id===row.original_artifact_id)?.sha256===original.identity.sha256;
  checks.completed_response_saved=after.intake.response?.id===row.provider_response_id&&after.intake.response?.status==='completed';
 }
 const origin=values['api-origin'];
 const [capability,anonymous]=await Promise.all([fetch(origin+'/research-verification/api/paper-intake?capabilities=1',{signal:AbortSignal.timeout(25000)}),fetch(origin+'/research-verification/api/paper-intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'prepare',request_id:original.id}),signal:AbortSignal.timeout(25000)})]);
 checks.http_service_available=capability.ok&&(await capability.json()).paper_intake?.enabled===true;checks.http_anonymous_write_denied=anonymous.status===401;
 const passed=Object.values(checks).every(Boolean)&&(values.cancel?row.status==='cancelled':row.status==='ready');
 const report={passed,assessment:original.id,status:row.status,checks,model_calls:after.intake.model_calls,new_model_calls:after.intake.model_calls-(before.intake?.model_calls??0),response_id:row.provider_response_id,sections:row.breakdown?Object.fromEntries(Object.entries(row.breakdown.sections).map(([id,items])=>[id,items.length])):null,authorization:'Privileged local operator with Supabase MCP access; existing Google-linked owner. No user session or web authentication exception was created.',scope:'PDF -> shared Next.js service -> live OpenAI -> private Supabase persistence. HTTP probes cover public readiness and anonymous denial; Google SSO and browser rendering are not exercised.',reason:row.reason??null};
 await privateJSON(join(trace,'report.json'),report);await privateJSON(join(directory,'latest.json'),report);
 console.log(JSON.stringify({...report,authorization:undefined,scope:undefined,report:join(trace,'report.json')}));process.exitCode=passed?0:1;
}finally{if(mcp)await mcp.close();await release();}
}
await main().catch(error=>{console.error(paperCLIError(error));process.exitCode=1;});
