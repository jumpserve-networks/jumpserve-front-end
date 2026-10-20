import assert from 'node:assert/strict';
import test from 'node:test';
import { startAutonomousPaper, validateAutonomy, validateTurnHistory } from '../lib/research-autonomy.ts';
const id='10000000-0000-4000-8000-000000000001',taskId='10000000-0000-4000-8000-000000000002';
function fixture(){return {version:'research-autonomy-v1',enabled:true,defaults:{maximum_spend_usd:100,elapsed_days:7,attempts_per_claim:25},workflows:[{study_id:id,initial_prompt:'Original user request',initial_sha256:'a'.repeat(64),max_spend_cents:10000,max_attempts:25,committed_cents:500,status:'running',reason:'Background intake pending',created_at:'2026-10-18T00:00:00Z',deadline_at:'2026-10-25T00:00:00Z',updated_at:'2026-10-18T00:00:00Z'}],tasks:[{id:taskId,study_id:id,claim_id:null,claim_title:null,stage:'intake',status:'queued',label:null,attempts:0,reason:'Awaiting source retrieval',required_inputs:[],next_at:'2026-10-18T00:00:00Z',created_at:'2026-10-18T00:00:00Z',updated_at:'2026-10-18T00:00:00Z'}],coverage:{workflows:1,tasks:1}};}
test('one submission atomically starts autonomy with fixed application defaults',async()=>{
 const calls=[];const paper={title:'Paper',paper_url:'https://example.org/paper.pdf'};
 const request=async(path,options)=>{calls.push({path,options});return path==='/capabilities'?{autonomy:{version:'research-autonomy-v1'}}:{id,autonomy:fixture().workflows[0]};};
 assert.equal((await startAutonomousPaper(request,id,paper)).id,id);
 assert.deepEqual(JSON.parse(calls[1].options.body),{request_id:id,paper,autonomous:true});
 assert.equal(calls.filter(c=>c.options?.method==='POST').length,1);
});
test('older services cannot silently turn autonomous submission into a draft',async()=>{
 const calls=[];await assert.rejects(()=>startAutonomousPaper(async(path)=>{calls.push(path);return {};},id,{}),/No paper was submitted/);assert.deepEqual(calls,['/capabilities']);
});
test('uncertain intake preserves the original identity and requests inspection',async()=>{
 await assert.rejects(()=>startAutonomousPaper(async(path)=>path==='/capabilities'?{autonomy:{version:'research-autonomy-v1'}}:{id:taskId},id,{}),/original request ID|Preserve this request ID/);
});
test('queue coverage retains blocked, unknown and unfinished claims honestly',()=>{
 const value=fixture();value.tasks.push({...value.tasks[0],id:'10000000-0000-4000-8000-000000000003',claim_id:taskId,claim_title:'A claim',stage:'planning',status:'blocked',label:'untested',attempts:1,reason:'Equipment absent'});value.coverage.tasks=2;
 const parsed=validateAutonomy(value);assert.equal(parsed.tasks[1].label,'untested');assert.equal(parsed.tasks[0].label,null);
 value.tasks[1].status='resolved';assert.throws(()=>validateAutonomy(value),/no conclusive finding/);
});
test('budget overruns, missing task coverage and altered limits are rejected',()=>{
 for(const mutate of [v=>v.workflows[0].committed_cents=10001,v=>v.defaults.attempts_per_claim=26,v=>v.tasks[0].attempts=26,v=>v.coverage.tasks=2]){const v=fixture();mutate(v);assert.throws(()=>validateAutonomy(v));}
});
test('prompt history is scoped to owner study and task with declared pagination',()=>{
 const turn={id,study_id:id,task_id:taskId,number:1,stage:'planning',prompt_version_id:id,model_id:'fixed-model',request:{system:[{text:'Exact prompt'}]},request_sha256:'b'.repeat(64),status:'failed',reserved_cents:50,estimated_cents:null,raw_response:null,response_sha256:null,output:null,usage:{measured_charges_usd:null},reason:'Provider completion unconfirmed',created_at:'2026-10-18T00:00:00Z',ended_at:'2026-10-18T00:00:01Z'};
 const value={version:'research-autonomy-v1',access:'owner-private',study_id:id,task_id:taskId,turns:[turn],next_before:null,coverage:{returned:1,total:1}};
 assert.equal(validateTurnHistory(value,id,taskId).turns[0].estimated_cents,null);
 assert.throws(()=>validateTurnHistory(value,taskId,id),/another claim/);
 value.turns[0].status='complete';assert.throws(()=>validateTurnHistory(value,id,taskId),/Invalid retained prompt/);
});
test('v2 retains explicit check coverage without treating it as a scientific finding',()=>{
 const value=fixture();value.version='research-autonomy-v2';value.tasks[0].evidence_progress={required_checks:6,completed_checks:1,scope:'Execution coverage only'};
 assert.equal(validateAutonomy(value).tasks[0].evidence_progress.completed_checks,1);
 assert.equal(value.tasks[0].label,null);
 value.tasks[0].evidence_progress.completed_checks=7;assert.throws(()=>validateAutonomy(value),/check coverage/);
 value.tasks[0].evidence_progress=null;assert.equal(validateAutonomy(value).tasks[0].evidence_progress,null);
 value.version='research-autonomy-v99';assert.throws(()=>validateAutonomy(value),/coverage/);
});
