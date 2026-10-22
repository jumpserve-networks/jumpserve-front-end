import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
const hook=registerHooks({resolve(specifier,context,nextResolve){return nextResolve(specifier.startsWith('@/lib/')?new URL('../lib/'+specifier.slice(6)+'.ts',import.meta.url).href:specifier,context);}});
const {loadExperimentQueue,requireGapQueueApi}=await import('../lib/research-queue-api.ts');
const {RECORD_KINDS}=await import('../lib/research-workflow.ts');hook.deregister();
const study='11111111-1111-4111-8111-111111111111',campaign='22222222-2222-4222-8222-222222222222',job='33333333-3333-4333-8333-333333333333',idea='44444444-4444-4444-8444-444444444444';
const limits={global_jobs:4,study_jobs:2,invocation_jobs:2,lease_seconds:600,automatic_retries:0};
function fixture(){
 const paper={id:study,title:'Actual recorded paper',study_kind:'paper'};
 const q={version:'research-queue-v1',study_id:study,access:'owner-private',workers_enabled:true,limits:{...limits},jobs:[{id:job,study_id:study,campaign_id:campaign,execution_mode:'automatic',priority:3,status:'failed',readiness:'failed',reason:'Retained failure',blockers:[],dependencies:[],exclusive_resources:[],created_at:'2026-10-17T00:00:00Z',updated_at:'2026-10-17T01:00:00Z',request:{private:'not part of overview'},input_artifact_id:idea}],events:[],coverage:{jobs:1,events:0},limitations:'Recorded queue'};
 const records=Object.fromEntries(RECORD_KINDS.map(k=>[k,[]]));records.campaigns=[{id:campaign,study_id:study,title:'Recorded experiment'}];
 const snapshot={study:paper,records,coverage:Object.fromEntries(RECORD_KINDS.map(k=>[k,records[k].length])),access:'owner-draft'};
 const capabilities={queue:{version:'research-queue-v1',workers_enabled:true,limits:{...limits}}};
 return {paper,q,snapshot,capabilities};
}
test('deployed backend without overview is read via existing owner endpoints, with no missing-route probe',async()=>{
 const f=fixture(),paths=[];
 const result=await loadExperimentQueue(async(path,options)=>{
  paths.push(path);assert.equal(options.method,undefined);
  if(path==='/capabilities')return f.capabilities;
  if(path==='/studies?mine=1')return {access:'owner-drafts',studies:[f.paper,{id:idea,title:'Private idea',study_kind:'idea'}]};
  if(path===`/studies/${study}/queue`)return f.q;
  if(path===`/studies/${study}`)return f.snapshot;
  throw new Error('Unavailable route must never be called: '+path);
 });
 assert.deepEqual(paths,['/capabilities','/studies?mine=1',`/studies/${study}/queue`,`/studies/${study}`]);
 assert.deepEqual(result.coverage,{studies:1,jobs:1});assert.equal(result.jobs[0].campaign_title,'Recorded experiment');assert.equal(result.jobs[0].status,'failed');
 assert.ok(!('request' in result.jobs[0]));assert.ok(!('input_artifact_id' in result.jobs[0]));assert.match(result.limitations,/not an atomic global snapshot/);
});
test('empty owner queues are explicit; incomplete private coverage is not interpreted as zero',async()=>{
 const f=fixture();const empty=await loadExperimentQueue(async path=>path==='/capabilities'?f.capabilities:{access:'owner-drafts',studies:[]});assert.deepEqual(empty.coverage,{studies:0,jobs:0});
 await assert.rejects(()=>loadExperimentQueue(async path=>path==='/capabilities'?f.capabilities:{access:'published',studies:[]}),/coverage/);
 f.q.coverage.jobs=0;
 await assert.rejects(()=>loadExperimentQueue(async path=>path==='/capabilities'?f.capabilities:path==='/studies?mine=1'?{access:'owner-drafts',studies:[f.paper]}:f.q),/coverage/);
});
test('new backend uses its advertised overview; an overview failure is retained as failure',async()=>{
 const f=fixture();f.capabilities.queue.overview_version='research-queue-overview-v1';const paths=[];
 const overview={version:'research-queue-overview-v1',access:'owner-private',studies:[],jobs:[],workers_enabled:true,limits,coverage:{studies:0,jobs:0},limitations:'API overview'};
 assert.equal((await loadExperimentQueue(async path=>{paths.push(path);return path==='/capabilities'?f.capabilities:overview;})).coverage.jobs,0);assert.deepEqual(paths,['/capabilities','/queue']);
 await assert.rejects(()=>loadExperimentQueue(async path=>{if(path==='/capabilities')return f.capabilities;throw new Error('Original service failure');}),/Original service failure/);
});
test('selected paper title enrichment keeps the owner overview and rejects invalid identities before reads',async()=>{
 const f=fixture();f.capabilities.queue.overview_version='research-queue-overview-v1';const paths=[];
 const overview={version:'research-queue-overview-v1',access:'owner-private',studies:[{...f.paper,title:'Source Grounded Paper Title'}],jobs:[],workers_enabled:true,limits,coverage:{studies:1,jobs:0},limitations:'API overview'};
 const result=await loadExperimentQueue(async path=>{paths.push(path);return path==='/capabilities'?f.capabilities:overview;},undefined,study);
 assert.deepEqual(paths,['/capabilities','/queue?title_study='+study]);assert.equal(result.studies[0].title,'Source Grounded Paper Title');
 await assert.rejects(()=>loadExperimentQueue(async()=>assert.fail('Invalid identity must not send requests'),undefined,'not-a-study'),/identity is invalid/);
});
test('missing campaign metadata does not discard valid job statuses or invent a title',async()=>{
 const f=fixture();const result=await loadExperimentQueue(async path=>{if(path==='/capabilities')return f.capabilities;if(path==='/studies?mine=1')return {access:'owner-drafts',studies:[f.paper]};if(path.endsWith('/queue'))return f.q;throw new Error('Metadata unavailable');});
 assert.equal(result.coverage.jobs,1);assert.match(result.jobs[0].campaign_title,/title unavailable/);assert.match(result.limitations,/metadata could not/);assert.equal(result.jobs[0].run_status,null);
});
test('cancelled reads stop before sending requests; settings drift and private queue failures stay explicit',async()=>{
 const controller=new AbortController();controller.abort(new Error('Cancelled'));let calls=0;await assert.rejects(()=>loadExperimentQueue(async()=>{calls++;},controller.signal),/Cancelled/);assert.equal(calls,0);
 const f=fixture();f.q.workers_enabled=false;
 await assert.rejects(()=>loadExperimentQueue(async path=>path==='/capabilities'?f.capabilities:path==='/studies?mine=1'?{access:'owner-drafts',studies:[f.paper]}:f.q),/settings changed/);
});
test('unreleased gap launches fail clearly before calling unavailable routes or writing',async()=>{
 const f=fixture();let calls=0;await assert.rejects(()=>requireGapQueueApi(async path=>{calls++;assert.equal(path,'/capabilities');return f.capabilities;}),/backend has not released/);assert.equal(calls,1);
 f.capabilities.preparation={gap_queue_version:'research-gap-queue-v1'};await requireGapQueueApi(async()=>f.capabilities);
});
