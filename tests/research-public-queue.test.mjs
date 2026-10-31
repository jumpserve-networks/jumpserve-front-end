import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(s,c,next){return next(s.startsWith('@/lib/')?new URL('../lib/'+s.slice(6)+'.ts',import.meta.url).href:s,c);}});
const {validatePublicStudyQueue,loadPublicStudyQueue,assessmentSummaryFromPublicQueue,publicStatusReason}=await import('../lib/research-public-queue.ts');hook.deregister();
const study='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',task='33333333-3333-4333-8333-333333333333',stamp='2026-10-22T00:00:00Z';
function fixture(){return {version:'research-public-queue-v1',access:'public-read-only',study:{id:study,title:'A paper'},jobs:[{id,study_id:study,status:'failed',execution_mode:'automatic',run_status:null,created_at:stamp,updated_at:stamp}],workers_enabled:true,coverage:{jobs:1},limitations:'Status only; private inputs omitted.',autonomy:{version:'research-autonomy-v3',access:'public-read-only',defaults:{maximum_spend_usd:100,elapsed_days:7,attempts_per_claim:null},enabled:true,workflows:[{study_id:study,max_spend_cents:10000,max_attempts:null,committed_cents:0,status:'running',reason:'Preparing',created_at:stamp,updated_at:stamp,deadline_at:stamp}],tasks:[{id:task,study_id:study,claim_id:id,claim_title:'A candidate claim',stage:'planning',status:'blocked',label:'untested',attempts:0,reason:'Paused',created_at:stamp,updated_at:stamp}],coverage:{workflows:1,tasks:1}}};}
test('public status preserves recorded zero missing run status and unresolved findings',()=>{
 const q=validatePublicStudyQueue(fixture(),study);assert.equal(q.autonomy.workflows[0].committed_cents,0);assert.equal(q.jobs[0].run_status,null);assert.equal(q.autonomy.tasks[0].attempts,0);assert.equal(q.autonomy.tasks[0].label,'untested');
 for(const label of ['reproduced','discrepant','inconclusive']){const v=fixture();v.autonomy.tasks[0].label=label;v.autonomy.tasks[0].status=label==='inconclusive'?'blocked':'resolved';assert.equal(validatePublicStudyQueue(v,study).autonomy.tasks[0].label,label);}
});
test('shared queue accepts an amended $1000 budget without changing defaults or accepting an overrun',()=>{
 const q=fixture();q.autonomy.workflows[0].max_spend_cents=100000;q.autonomy.workflows[0].committed_cents=9980;
 assert.equal(validatePublicStudyQueue(q,study).autonomy.defaults.maximum_spend_usd,100);
 q.autonomy.workflows[0].committed_cents=100001;assert.throws(()=>validatePublicStudyQueue(q,study));
 q.autonomy.workflows[0].committed_cents=9980;q.autonomy.workflows[0].max_spend_cents=2147483648;assert.throws(()=>validatePublicStudyQueue(q,study));
});
test('shared unlimited authorization is explicit and never hides retained commitments or unresolved claims',()=>{
 const q=fixture(),w=q.autonomy.workflows[0];w.max_spend_cents=null;w.committed_cents=150000;
 const parsed=validatePublicStudyQueue(q,study);assert.equal(parsed.autonomy.workflows[0].max_spend_cents,null);assert.equal(parsed.autonomy.tasks[0].label,'untested');
 for(const cap of [undefined,0,Infinity,'unlimited']){w.max_spend_cents=cap;assert.throws(()=>validatePublicStudyQueue(q,study));}
 w.max_spend_cents=200000;assert.equal(validatePublicStudyQueue(q,study).autonomy.workflows[0].committed_cents,150000);
});

test('shared queues accept the explicit unlimited default while retaining historical finite caps',()=>{
 const q=fixture();q.autonomy.defaults.maximum_spend_usd=null;
 assert.equal(validatePublicStudyQueue(q,study).autonomy.defaults.maximum_spend_usd,null);
 assert.equal(q.autonomy.workflows[0].max_spend_cents,10000);
 for(const invalid of [undefined,0,'unlimited',Infinity,101]){q.autonomy.defaults.maximum_spend_usd=invalid;assert.throws(()=>validatePublicStudyQueue(q,study));}
});
test('operational recovery preserves scientific labels and rejects malformed or private progress fields',()=>{
 const q=fixture(),p={version:'autonomous-repair-v1',id,state:'diagnosing',category:'runtime',revision:0,updated_at:stamp};
 for(const state of ['diagnosing','repairing','validating','resuming','waiting','resolved','blocked','budget','deadline','cancelled']){
  q.autonomy.tasks[0].repair_progress={...p,state};assert.equal(validatePublicStudyQueue(q,study).autonomy.tasks[0].label,'untested');assert.equal(assessmentSummaryFromPublicQueue(q,study).counts.reproduced,0);
 }
 for(const mutate of [r=>r.revision=-1,r=>r.state='scientifically-proven',r=>r.id='invalid',r=>r.version='future-unsupported',r=>r.lease_token='private',r=>r.updated_at='invalid']){
  const bad={...p};mutate(bad);q.autonomy.tasks[0].repair_progress=bad;assert.throws(()=>validatePublicStudyQueue(q,study));
 }
});
test('owner projections private fields mismatched studies and incomplete counts are rejected',()=>{
 for(const change of [q=>q.access='owner-private',q=>q.study.paper_upload={},q=>q.jobs[0].request={},q=>q.autonomy.workflows[0].initial_prompt='secret',q=>q.autonomy.tasks[0].required_inputs=['secret'],q=>q.autonomy.runtime={runtime:'openclaw-production-v1',model_id:'x',status:'ready',grant:'secret'},q=>q.autonomy.defaults.secret='secret',q=>q.coverage.jobs=0,q=>q.autonomy.coverage.tasks=0,q=>q.jobs[0].study_id=id,q=>q.autonomy.tasks[0].study_id=id,q=>q.autonomy.tasks[0].status='resolved',q=>q.jobs.push(q.jobs[0]),q=>q.autonomy.tasks[0].evidence_progress={required_checks:0,completed_checks:1,scope:'Invalid'},q=>q.autonomy.workflows=[],q=>q.jobs[0]=null]){const q=fixture();change(q);assert.throws(()=>validatePublicStudyQueue(q,study));}
 assert.throws(()=>validatePublicStudyQueue(fixture(),id));
});
test('empty preparation is distinct from absent data and never receives a scientific finding',()=>{
 const q=fixture();q.jobs=[];q.coverage.jobs=0;q.autonomy.tasks[0]={...q.autonomy.tasks[0],claim_id:null,claim_title:null,stage:'intake',status:'resolved',label:null};
 assert.equal(validatePublicStudyQueue(q,study).autonomy.tasks[0].label,null);
 q.autonomy.tasks[0].label='reproduced';assert.throws(()=>validatePublicStudyQueue(q,study));
 q.autonomy.tasks=[];q.autonomy.workflows=[];q.autonomy.coverage={tasks:0,workflows:0};assert.equal(validatePublicStudyQueue(q,study).jobs.length,0);
});
test('shared status uses only the fixed anonymous GET and never forwards credentials',async()=>{
 const previous=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://example.org';
 try{let calls=0;const q=await loadPublicStudyQueue(study,undefined,async(url,options)=>{calls++;assert.equal(url,`https://example.org/research/studies/${study}/queue?public=1&diagnostics=1`);assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.deepEqual(options.headers,{Accept:'application/json'});return Response.json(fixture());});assert.equal(calls,1);assert.equal(q.study.id,study);
 await assert.rejects(()=>loadPublicStudyQueue('../private',undefined,()=>{throw Error('must not fetch');}),/invalid assessment/);
 const controller=new AbortController();controller.abort(new Error('Cancelled'));await assert.rejects(()=>loadPublicStudyQueue(study,controller.signal,()=>{throw Error('must not fetch');}),/Cancelled/);
 for(const [response,pattern] of [[new Response('<html>private canary</html>',{status:502}),/unreadable response/],[Response.json({error:'private canary'},{status:404}),/queue is unavailable/],[Response.json({error:'private canary'},{status:503}),/HTTP 503/]]){await assert.rejects(()=>loadPublicStudyQueue(study,undefined,async()=>response),pattern);}
 }finally{if(previous===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=previous;}
});
test('public failure details accept bounded text and retain compatibility without opening private fields',()=>{
 const q=fixture();q.jobs[0].reason='Runner stopped because its required dataset is unavailable.';q.jobs[0].run_reason=null;
 assert.equal(validatePublicStudyQueue(q,study).jobs[0].reason,q.jobs[0].reason);
 for(const bad of [{stack:'private'},42,'x'.repeat(4001)]){q.jobs[0].reason=bad;assert.throws(()=>validatePublicStudyQueue(q,study));}
 delete q.jobs[0].reason;delete q.jobs[0].run_reason;assert.equal(validatePublicStudyQueue(q,study).jobs[0].reason,undefined);
 const old='Paused. The study owner can inspect the recorded requirements or failure details.';
 assert.equal(publicStatusReason(old),'Paused. Recorded failure details were not returned by this server.');
 assert.equal(publicStatusReason('Dataset required.'),'Dataset required.');
});
test('notification summaries exclude intake, preserve missing workflows and require complete unique claims',()=>{
 const q=fixture();
 q.autonomy.tasks.push({...q.autonomy.tasks[0],id:'44444444-4444-4444-8444-444444444444',claim_id:null,claim_title:null,stage:'intake',status:'resolved',label:null});
 q.autonomy.coverage.tasks=2;
 const result=assessmentSummaryFromPublicQueue(q,study);
 assert.deepEqual(result,{status:'running',updated_at:stamp,counts:{total:1,finished:0,reproduced:0,discrepant:0,blocked:1,running:0,queued:0,waiting:0}});
 q.autonomy.tasks[0].status='resolved';q.autonomy.tasks[0].label='discrepant';
 assert.equal(assessmentSummaryFromPublicQueue(q,study).counts.discrepant,1);
 q.autonomy.tasks.push({...q.autonomy.tasks[0],id:'55555555-5555-4555-8555-555555555555'});q.autonomy.coverage.tasks=3;
 assert.throws(()=>assessmentSummaryFromPublicQueue(q,study),/invalid or incomplete/);
 const empty=fixture();empty.autonomy.tasks=[];empty.autonomy.coverage.tasks=0;
 assert.equal(assessmentSummaryFromPublicQueue(empty,study).counts.total,0);
 empty.autonomy.workflows=[];empty.autonomy.coverage.workflows=0;
 assert.equal(assessmentSummaryFromPublicQueue(empty,study),null);
 assert.throws(()=>assessmentSummaryFromPublicQueue(fixture(),id),/invalid or incomplete/);
 const partial=fixture();partial.autonomy.coverage.tasks=10;
 assert.throws(()=>assessmentSummaryFromPublicQueue(partial,study),/invalid or incomplete/);
});
