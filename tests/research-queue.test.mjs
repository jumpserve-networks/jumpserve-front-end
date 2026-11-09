import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
// Resolve this one application alias for Node's TypeScript development runner.
const hook = registerHooks({resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === '@/lib/research-workflow' ? new URL('../lib/research-workflow.ts', import.meta.url).href : specifier, context);
}});
const { validateQueue, claimQueueRows } = await import('../lib/research-queue.ts');
hook.deregister();
import { RECORD_KINDS } from '../lib/research-workflow.ts';

test('queue contracts reject absent payloads invalid resource limits retries leases and incomplete event details',()=>{
 for(const value of [null,0,'original'])assert.throws(()=>validateQueue(value,study),/missing/);for(const field of ['global_jobs','study_jobs','invocation_jobs','lease_seconds'])for(const value of [0,1.5]){const q=fixture();q.limits[field]=value;assert.throws(()=>validateQueue(q,study),/resource limits/);}const retry=fixture();retry.limits.automatic_retries=1;assert.throws(()=>validateQueue(retry,study),/retry policy/);
 for(const change of [{blockers:[0]},{updated_at:'invalid'},{status:'running',lease_until:'invalid'},{dependencies:[{job_id:id,requirement:'invented'}]}]){const q=fixture();Object.assign(q.jobs[0],change);assert.throws(()=>validateQueue(q,study));}
 for(const change of [{reason:0},{details:null},{details:'unstructured'}]){const q=fixture();q.events=[{id:campaign,job_id:id,study_id:study,status:'failed',created_at:'2026-10-07T00:00:00Z',reason:'Original failure',details:{zero:0},...change}];q.coverage.events=1;assert.throws(()=>validateQueue(q,study),/event history/);}
});

test('queue count limits refuse a complete but excessive response instead of truncating it into a result',()=>{
 for(const [field,count]of [['jobs',1001],['events',5001]]){const q=fixture(),base=field==='jobs'?q.jobs[0]:{job_id:id,study_id:study,status:'failed',created_at:'2026-10-07T00:00:00Z',reason:'Original event',details:{}};q[field]=Array.from({length:count},(_,index)=>({...base,id:'40000000-0000-4000-8000-'+String(index+1).padStart(12,'0')}));q.coverage[field]=count;assert.throws(()=>validateQueue(q,study),/declared budget/);}
 const records=Object.fromEntries(RECORD_KINDS.map(kind=>[kind,[]]));records.claims=[{id:'claim'}];records.claim_checks=[{claim_id:'claim',campaign_id:'not-queued',applicability:'applicable'}];assert.deepEqual(claimQueueRows({records},fixture())[0].jobs,[]);
});
const study='11111111-1111-4111-8111-111111111111', campaign='22222222-2222-4222-8222-222222222222', id='33333333-3333-4333-8333-333333333333';
function fixture(){return {version:'research-queue-v1',study_id:study,access:'owner-private',workers_enabled:false,limits:{global_jobs:4,study_jobs:2,invocation_jobs:2,lease_seconds:600,automatic_retries:0},jobs:[{id,study_id:study,campaign_id:campaign,status:'awaiting-review',readiness:'awaiting-review',execution_mode:'automatic',priority:3,reason:'Recorded evidence',blockers:[],dependencies:[],exclusive_resources:[],created_at:'2026-10-07T00:00:00Z',updated_at:'2026-10-07T00:00:00Z'}],events:[],coverage:{jobs:1,events:0},limitations:'Parallel work does not establish independent evidence.'};}
test('queue coverage, ownership and missing states cannot silently become empty results',()=>{assert.equal(validateQueue(fixture(),study).jobs.length,1);for(const mutate of [q=>q.coverage.jobs=0,q=>q.study_id=campaign,q=>q.jobs[0].status='complete',q=>q.jobs[0].dependencies=[{job_id:campaign,requirement:'complete-run'}],q=>q.jobs[0].status='running',q=>q.workers_enabled=null]){const q=fixture();mutate(q);assert.throws(()=>validateQueue(q,study));}});
test('shared campaign tracks two claims without counting it as two experiments',()=>{const q=fixture(),records=Object.fromEntries(RECORD_KINDS.map(k=>[k,[]]));records.claims=[{id:'c1'},{id:'c2'},{id:'c3'}];records.claim_checks=[{claim_id:'c1',campaign_id:campaign,applicability:'applicable'},{claim_id:'c2',campaign_id:campaign,applicability:'applicable'},{claim_id:'c3',campaign_id:campaign,applicability:'inapplicable'}];records.assessments=[{id:'a1',claim_id:'c1',label:'discrepant',created_at:'2026-10-07T00:00:00Z'}];const rows=claimQueueRows({records},q);assert.equal(rows[0].jobs[0].id,rows[1].jobs[0].id);assert.equal(rows[0].assessment.label,'discrepant');assert.equal(rows[1].assessment,undefined);assert.equal(rows[2].jobs.length,0);assert.equal(q.jobs.length,1);});
test('event history must identify a recorded job; no orphaned history is accepted',()=>{const q=fixture();q.events=[{id:campaign,job_id:campaign,study_id:study,status:'failed',created_at:'2026-10-07T00:00:00Z',reason:'Failure',details:{}}];q.coverage.events=1;assert.throws(()=>validateQueue(q,study));});
