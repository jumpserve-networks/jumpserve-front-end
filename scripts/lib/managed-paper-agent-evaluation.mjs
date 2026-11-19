// Live smoke tests of the actual production runner against private local state.
// No Supabase writes, production assessments, experiment execution or approval.
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import env from '@next/env';
import OpenAI from 'openai';
import {privateDirectory,privateJSON,readJSON,lockRun} from './paper-evaluation-store.mjs';
await import('./register-typescript.mjs');
const {advancePaperAgent}=await import('../../lib/paper-agent-runner.ts');
const {qualityRow}=await import('../../tests/support/paper-quality-fixture.mjs');
const {deterministicQualityChecks}=await import('../../lib/paper-quality-checks.ts');
const {validateQualityContext,qualityReferenceMap}=await import('../../lib/paper-quality-context.ts');
const {validateQualityReview}=await import('../../lib/paper-quality.ts');
async function inputRow(step,workflowPath){
 let row=qualityRow(step);
 if(workflowPath){
  const raw=await readFile(resolve(workflowPath),'utf8');if(Buffer.byteLength(raw)>4000000)throw Error('The private workflow exceeds the evaluation bound.');
  row=JSON.parse(raw);
  if(row.step!==step||row.source_json?.step!==step||!row.original_request||!row.review_context||!row.review||row.review.decision!=='revise')throw Error('Use an exported failed-review workflow for the selected step.');
  validateQualityContext(row.review_context);validateQualityReview(row.review);
  if(!isDeepStrictEqual(row.review_context.reference_map,qualityReferenceMap(row.source_json.confirmed_breakdown)))throw Error('The exported reference map does not match its frozen source.');
  if(!deterministicQualityChecks({...row.source_json,candidate:row.candidate}).passed)throw Error('The exported candidate must pass the unchanged source/shape checks.');
 }else if(step===2){
  const evidence=JSON.parse(await readFile(resolve('.test-artifacts/assessment-review-c7493285-21c3-4897-b1c4-f8263e142957/evidence.json'),'utf8'));
  row={...evidence.quality[0],owner_id:'private-evaluation-owner'};
  row.review_context=JSON.parse(evidence.calls.filter(call=>call.kind==='review').at(-1).request.input).review_context;
 }else{
  row.review_context={version:'paper-quality-context-v1',generation_instructions:row.original_request.instructions,generation_input:row.original_request.input,reference_map:qualityReferenceMap(row.source_json.confirmed_breakdown),finding_ledger:[],prior_resolutions:[],previous_candidate:null};
  if(step===3)row.candidate.experiments[0].steps[0].instructions='Use the paper fabricated table as reproduction measurements.';
  else row.candidate.setup.commands='if true; then\n  printf "setup ready\\n"\n';
  row.source_json.candidate=structuredClone(row.candidate);
  row.review={decision:'revise',summary:'A deliberately seeded defect needs repair.',findings:[{id:'seeded-defect',severity:'blocking',location:step===3?'experiments[0].steps[0].instructions':'setup.commands',explanation:step===3?'A reproduction must collect fresh measurements; the fabricated paper table is not a validation dataset.':'The Bash if statement is missing its closing fi. Repair this syntax defect and retain the existing shared setup and action scope.',evidence:step===3?'The retained paper explicitly discloses fabricated results and requires independent measurements.':'setup.commands contains an if/then with no fi.'}]};
  row.checks=deterministicQualityChecks(row.source_json);
 }
 const created=new Date().toISOString(),deadline=new Date(Date.now()+240000).toISOString(),callId=randomUUID(),token=randomUUID();
 row.status='running';row.phase='repairing';row.round=0;row.deadline_at=deadline;
 row.call={id:callId,kind:'repair',provider_type:'managed_agent',status:'preparing',submit_token:token,provider_response_id:null,request:null,updated_at:created};
 row.agent={call_id:callId,workflow_id:row.id,study_id:row.study_id,owner_id:row.owner_id,submit_token:token,status:'preparing',provider_session_id:null,request:null,initial_candidate:structuredClone(row.candidate),candidate:structuredClone(row.candidate),candidate_version:0,session:null,turn:null,deadline_at:deadline,cancel_requested_at:null,created_at:created,updated_at:created};
 return row;
}
export async function evaluateManagedPaperRuntime(values){
 env.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
 if(!process.env.OPENAI_API_KEY)throw Error('OPENAI_API_KEY is not configured.');
 const directory=resolve('.test-artifacts/managed-paper-runtime-evaluations',values.run);await privateDirectory(directory);const release=await lockRun(directory);
 try{
  const path=join(directory,'run.json');let saved=await readJSON(path);
  const step=Number(values.step??'2');
  let workflowHash=null;
  if(values['from-workflow']){const bytes=await readFile(resolve(values['from-workflow']));if(bytes.length>4000000)throw Error('The private workflow exceeds its input bound.');workflowHash=createHash('sha256').update(bytes).digest('hex');}
  if(!saved){saved={version:'managed-paper-runtime-evaluation-v1',step,workflow_sha256:workflowHash,row:await inputRow(step,values['from-workflow']),actions:[],events:[],created_at:new Date().toISOString(),scope:'Independent development smoke test. No production assessment or original assessment limits are changed.'};await privateJSON(path,saved);}
  if((saved.workflow_sha256??null)!==workflowHash)throw Error('The frozen workflow input changed; use a new evaluation run name.');
  if(saved.step!==step)throw Error('Keep the frozen evaluation step unchanged.');
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,baseURL:'https://api.openai.com/v1',maxRetries:0,timeout:20000}),api=client.beta.agents.sessions;
  const persist=()=>privateJSON(path,saved);
  const ops={
   async save(operation,payload){
    saved.events.push({operation,at:new Date().toISOString(),payload});const row=saved.row;
    if(operation==='request'){row.agent.request=payload.request;row.agent.status='submitting';row.call.status='submitting';}
    if(operation==='submitted'){row.agent.provider_session_id=payload.session.id;row.agent.session=payload.session;row.agent.status='processing';row.call.status='processing';row.status='running';}
    if(operation==='observed'){row.agent.session=payload.session;if(payload.turn)row.agent.turn=payload.turn;}
    if(operation==='uncertain'){row.agent.status='uncertain';row.call.status='uncertain';row.status='uncertain';}
    if(operation==='cancel_requested')row.agent.cancel_requested_at=new Date().toISOString();
    if(operation==='action_result'){const action=saved.actions.find(action=>action.id===payload.action_id);action.result=payload.result;if(payload.candidate){row.agent.candidate=payload.candidate;row.agent.candidate_version++;}}
    if(operation==='completed'){row.candidate=row.agent.candidate;row.agent.status='completed';row.call.status='completed';row.status='review_pending';saved.finished_at=new Date().toISOString();saved.items=payload.items;}
    if(operation==='failed'||operation==='cancelled'){row.status=operation==='failed'?'needs_attention':'cancelled';row.agent.status=operation;row.call.status=operation;saved.finished_at=new Date().toISOString();saved.reason=payload.reason;saved.items=payload.items??[];}
    row.agent.updated_at=new Date().toISOString();await persist();
    if(!['observed','controller_checks'].includes(operation))console.log(JSON.stringify({step,operation}));return structuredClone(row);
   },
   create:(request,token)=>api.create(request,{headers:{'X-Client-Request-Id':token}}),retrieve:id=>api.retrieve(id),
   async find(call,token){const page=await api.list({limit:2,metadata:{runtime:'managed-agents-v1',call_id:call,submit_token:token}});if(page.hasNextPage())throw Error('Ambiguous original session.');return page.data;},
   async turn(id){return(await api.turns.list(id,{limit:1,order:'desc'})).data[0]??null;},
   async items(id){const items=[];let page=await api.items.list(id,{limit:100,order:'asc'});for(;;){items.push(...page.data);if(items.length>256)throw Error('History bound exceeded.');if(!page.hasNextPage())return items;page=await page.getNextPage();}},
   result:(id,turn,call,result,key)=>api.events.create(id,{events:[{type:'agent.session.input.tool_result',turn_id:turn,call_id:call,...result}]},{headers:{'Idempotency-Key':key}}),
   cancel:(id,key)=>api.events.create(id,{events:[{type:'agent.session.input.cancel'}]},{headers:{'Idempotency-Key':key}}),
   async limits(){return true;},
   async claim({action}){let savedAction=saved.actions.find(item=>item.call_id===action.call_id&&item.turn_id===action.turn_id);if(!savedAction){if(saved.actions.length>=24){saved.row.agent.cancel_requested_at=new Date().toISOString();await persist();throw Error('Evaluation action bound reached; resume to reconcile cancellation.');}savedAction={...action,id:randomUUID(),lease_token:randomUUID(),admitted:true,candidate_version:saved.row.agent.candidate_version,result:null};saved.actions.push(savedAction);await persist();}console.log(JSON.stringify({step,tool:action.name}));return{...structuredClone(savedAction),workflow:structuredClone(saved.row)};},
  };
  for(let i=0;i<150&&!saved.finished_at;i++){await advancePaperAgent(structuredClone(saved.row),ops,true);if(!saved.finished_at)await delay(2000);}
  if(!saved.finished_at)throw Error('The original runtime evaluation is pending; resume this exact named run without replacement inference.');
  const id=saved.row.agent.provider_session_id;
  if(id&&!saved.deleted_at){
   const session=await api.retrieve(id);saved.final_provider_session=session;await persist();
   if(!['idle','failed'].includes(session.status))throw Error('The provider session is not terminal; retain it for cancellation reconciliation.');
   const receipt=await api.delete(id);if(!receipt.deleted||receipt.id!==id)throw Error('Evaluation deletion was not confirmed.');saved.deleted_at=new Date().toISOString();await persist();
  }
  const report={step,provider_terminal_status:saved.row.agent.turn?.status??null,stage:saved.row.status,patch_versions:saved.row.agent.candidate_version,tool_calls:saved.actions.map(a=>a.name),checks:deterministicQualityChecks({...saved.row.source_json,candidate:saved.row.agent.candidate}),elapsed_seconds:(Date.parse(saved.finished_at)-Date.parse(saved.created_at))/1000,usage:saved.final_provider_session?.usage??null,deleted:Boolean(saved.deleted_at),independently_approved:false,database_writes:0,experiment_executions:0};
  await privateJSON(join(directory,'report.json'),report);console.log(JSON.stringify(report,null,2));if(saved.row.status!=='review_pending')process.exitCode=1;
 }finally{await release();}
}
