import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(s,c,next){return next(s.startsWith('@/lib/')?new URL('../lib/'+s.slice(6)+'.ts',import.meta.url).href:s,c);}});
const {validatePublicStudyQueue,loadPublicStudyQueue}=await import('../lib/research-public-queue.ts');hook.deregister();
const study='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',task='33333333-3333-4333-8333-333333333333',stamp='2026-10-22T00:00:00Z';
function fixture(){return {version:'research-public-queue-v1',access:'public-read-only',study:{id:study,title:'A paper'},jobs:[{id,study_id:study,status:'failed',execution_mode:'automatic',run_status:null,created_at:stamp,updated_at:stamp}],workers_enabled:true,coverage:{jobs:1},limitations:'Status only; private inputs omitted.',autonomy:{version:'research-autonomy-v3',access:'public-read-only',defaults:{maximum_spend_usd:100,elapsed_days:7,attempts_per_claim:null},enabled:true,workflows:[{study_id:study,max_spend_cents:10000,max_attempts:null,committed_cents:0,status:'running',reason:'Preparing',created_at:stamp,updated_at:stamp,deadline_at:stamp}],tasks:[{id:task,study_id:study,claim_id:id,claim_title:'A candidate claim',stage:'planning',status:'blocked',label:'untested',attempts:0,reason:'Paused',created_at:stamp,updated_at:stamp}],coverage:{workflows:1,tasks:1}}};}
test('public status preserves recorded zero missing run status and unresolved findings',()=>{
 const q=validatePublicStudyQueue(fixture(),study);assert.equal(q.autonomy.workflows[0].committed_cents,0);assert.equal(q.jobs[0].run_status,null);assert.equal(q.autonomy.tasks[0].attempts,0);assert.equal(q.autonomy.tasks[0].label,'untested');
 for(const label of ['reproduced','discrepant','inconclusive']){const v=fixture();v.autonomy.tasks[0].label=label;v.autonomy.tasks[0].status=label==='inconclusive'?'blocked':'resolved';assert.equal(validatePublicStudyQueue(v,study).autonomy.tasks[0].label,label);}
});
test('owner projections private fields mismatched studies and incomplete counts are rejected',()=>{
 for(const change of [q=>q.access='owner-private',q=>q.study.paper_upload={},q=>q.jobs[0].request={},q=>q.autonomy.workflows[0].initial_prompt='secret',q=>q.autonomy.tasks[0].required_inputs=['secret'],q=>q.autonomy.runtime={runtime:'openclaw-production-v1',model_id:'x',status:'ready',grant:'secret'},q=>q.autonomy.defaults.secret='secret',q=>q.coverage.jobs=0,q=>q.autonomy.coverage.tasks=0,q=>q.jobs[0].study_id=id,q=>q.autonomy.tasks[0].study_id=id,q=>q.autonomy.tasks[0].status='resolved',q=>q.jobs.push(q.jobs[0]),q=>q.autonomy.tasks[0].evidence_progress={required_checks:0,completed_checks:1,scope:'Invalid'},q=>q.autonomy.workflows=[],q=>q.jobs[0]=null]){const q=fixture();change(q);assert.throws(()=>validatePublicStudyQueue(q,study));}
 assert.throws(()=>validatePublicStudyQueue(fixture(),id));
});
test('empty preparation is distinct from absent data and never receives a scientific finding',()=>{
 const q=fixture();q.jobs=[];q.coverage.jobs=0;q.autonomy.tasks[0]={...q.autonomy.tasks[0],claim_id:null,claim_title:null,stage:'intake',label:null};
 assert.equal(validatePublicStudyQueue(q,study).autonomy.tasks[0].label,null);
 q.autonomy.tasks[0].label='reproduced';assert.throws(()=>validatePublicStudyQueue(q,study));
 q.autonomy.tasks=[];q.autonomy.workflows=[];q.autonomy.coverage={tasks:0,workflows:0};assert.equal(validatePublicStudyQueue(q,study).jobs.length,0);
});
test('shared status uses only the fixed anonymous GET and never forwards credentials',async()=>{
 const previous=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://example.org';
 try{let calls=0;const q=await loadPublicStudyQueue(study,undefined,async(url,options)=>{calls++;assert.equal(url,`https://example.org/research/studies/${study}/queue?public=1`);assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.deepEqual(options.headers,{Accept:'application/json'});return Response.json(fixture());});assert.equal(calls,1);assert.equal(q.study.id,study);
 await assert.rejects(()=>loadPublicStudyQueue('../private',undefined,()=>{throw Error('must not fetch');}),/invalid study/);
 const controller=new AbortController();controller.abort(new Error('Cancelled'));await assert.rejects(()=>loadPublicStudyQueue(study,controller.signal,()=>{throw Error('must not fetch');}),/Cancelled/);
 for(const [response,pattern] of [[new Response('<html>private canary</html>',{status:502}),/unreadable response/],[Response.json({error:'private canary'},{status:404}),/queue is unavailable/],[Response.json({error:'private canary'},{status:503}),/HTTP 503/]]){await assert.rejects(()=>loadPublicStudyQueue(study,undefined,async()=>response),pattern);}
 }finally{if(previous===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=previous;}
});
