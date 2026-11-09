import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
const hook = registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(specifier.startsWith('@/lib/') ? new URL('../lib/' + specifier.slice(6) + '.ts', import.meta.url).href : specifier, context); } });
const { validateGapPreview, validateGapEnqueued, gapExperimentPath, experimentQueuePath } = await import('../lib/research-experiment-queue.ts');
const { RESEARCH_VERIFICATION_MODULE, RESEARCH_IDEAS_MODULE } = await import('../lib/test-modules.ts');
const { consumeGapRunIntent, saveGapRunIntent, runGapExperiments } = await import('../lib/research-gap-run.ts');
hook.deregister();
const study='11111111-1111-4111-8111-111111111111', campaign='22222222-2222-4222-8222-222222222222', job='33333333-3333-4333-8333-333333333333';
test('gap previews cannot queue stale identities, missing plan hashes or unavailable inputs',()=>{
 const p={version:'research-gap-queue-v1',study_id:study,gap_id:campaign,gap_sha256:'a'.repeat(64),plan_sha256:'b'.repeat(64),choices:[{key:'check',title:'Check',execution_mode:'manual',coverage_limits:'Operator preparation only',dependencies:[]}],limitation:'No measurement collected',unavailable_reason:null};
 assert.equal(validateGapPreview(p,study,campaign).choices[0].execution_mode,'manual');
 assert.throws(()=>validateGapPreview(p,campaign,campaign));assert.throws(()=>validateGapPreview({...p,plan_sha256:null},study,campaign));
 assert.equal(validateGapPreview({...p,choices:[],unavailable_reason:'No reviewed plan'},study,campaign).choices.length,0);
 assert.throws(()=>validateGapPreview({...p,choices:[],unavailable_reason:null},study,campaign));
});
test('partial handoff does not claim the selected job was queued',()=>{
 const r={version:'research-gap-queue-v1',study_id:study,job_id:job,queued_job_ids:[],complete:false,workers_enabled:false,limitation:'Not yet queued'};
 assert.equal(validateGapEnqueued(r).complete,false);assert.throws(()=>validateGapEnqueued({...r,complete:true}));
 assert.equal(validateGapEnqueued({...r,queued_job_ids:[job],complete:true}).job_id,job);
});
test('queue and gap links retain exact identities in the paper module only',()=>{
 const gapUrl=new URL(gapExperimentPath(study,campaign),'https://example.org');assert.equal(gapUrl.pathname,'/research-verification/assessment/'+study);assert.equal(gapUrl.searchParams.get('gap'),campaign);assert.equal(gapUrl.searchParams.has('sourceAssessment'),false);assert.equal(gapUrl.searchParams.has('sourceStudy'),false);
 const url=new URL(experimentQueuePath(study,job),'https://example.org');assert.equal(url.pathname,'/research-verification/assessment/'+study);assert.equal(url.searchParams.get('job'),job);assert.equal(url.hash,'#job-'+job);
 assert.equal(experimentQueuePath(study),'/research-verification/assessment/'+study+'#experiment-queue');assert.equal(url.searchParams.has('assessment'),false);assert.equal(url.searchParams.has('study'),false);
 assert.ok(!RESEARCH_VERIFICATION_MODULE.sections.some(s=>s.label==='Experiment Queue'));assert.ok(!RESEARCH_IDEAS_MODULE.sections.some(s=>s.label==='Experiment Queue'));
});
test('only a recent same-tab click resumes writes after sign-in; intent is consumed once',()=>{
 const values=new Map();const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const intent={version:1,studyId:study,gapId:campaign,requestId:job,createdAt:1000};
 assert.equal(consumeGapRunIntent(storage,job,study,campaign,1100),null);
 saveGapRunIntent(storage,intent);assert.deepEqual(consumeGapRunIntent(storage,job,study,campaign,1100),intent);assert.equal(consumeGapRunIntent(storage,job,study,campaign,1100),null);
 for(const [now,id] of [[1001+15*60*1000,study],[999,study],[1100,campaign]]){saveGapRunIntent(storage,intent);assert.equal(consumeGapRunIntent(storage,job,id,campaign,now),null);}
});
test('one run action prepares once and queues all retained claim checks; partial replies stop without pretending success',async()=>{
 const preview={study_id:study,gap_id:campaign,gap_sha256:'a'.repeat(64),plan_sha256:'b'.repeat(64),choices:[{key:'first',title:'First'},{key:'second',title:'Second'}]};const calls=[];
 const request=async(path,options)=>{const body=JSON.parse(options.body);calls.push(body);if(body.action==='create-followup')return {version:'research-gap-queue-v1',study_id:study};if(body.action==='prepare')return {};return {version:'research-gap-queue-v1',study_id:study,job_id:body.key==='first'?job:campaign,queued_job_ids:[body.key==='first'?job:campaign],complete:true,workers_enabled:true,limitation:'Software fixture'};};
 const result=await runGapExperiments(preview,job,request,()=>{});assert.deepEqual(calls.map(c=>c.action),['create-followup','prepare','enqueue','enqueue']);assert.deepEqual(result.jobIds,[job,campaign]);assert.equal(result.complete,true);
 const partial=await runGapExperiments(preview,job,async(path,options)=>JSON.parse(options.body).action==='enqueue'?{version:'research-gap-queue-v1',study_id:study,job_id:job,queued_job_ids:[],complete:false,workers_enabled:false,limitation:'Partial'}:request(path,options),()=>{});assert.equal(partial.complete,false);assert.deepEqual(partial.jobIds,[]);
 await assert.rejects(()=>runGapExperiments({...preview,choices:[],unavailable_reason:'Inputs missing'},job,request,()=>{}),/Inputs missing/);
 await assert.rejects(()=>runGapExperiments(preview,job,async()=>({version:'research-gap-queue-v1',study_id:'invalid'}),()=>{}),/follow-up identity/);
 await assert.rejects(()=>runGapExperiments(preview,job,async(path,options)=>JSON.parse(options.body).action==='enqueue'?{version:'research-gap-queue-v1',study_id:campaign,job_id:job,queued_job_ids:[job],complete:true,workers_enabled:true,limitation:'Different study'}:request(path,options),()=>{}),/another follow-up/);
});
