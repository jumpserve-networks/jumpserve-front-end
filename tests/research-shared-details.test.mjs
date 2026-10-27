import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(s,c,next){return next(s.startsWith('@/lib/')?new URL('../lib/'+s.slice(6)+'.ts',import.meta.url).href:s,c);}});
const {loadSharedRecords,loadSharedTurnHistory,validateSharedRecords,validateSharedTurnHistory}=await import('../lib/research-public-queue.ts');hook.deregister();
const study='11111111-1111-4111-8111-111111111111',task='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',stamp='2026-10-22T00:00:00Z';
const projection={policy:'research-shared-details-v1',redacted:1,truncated:0,note:'Hashes refer to originals; shared copies are transformed.'};
const page=()=>({version:'research-shared-records-v1',access:'public-read-only',study_id:study,kind:'configurations',records:[{id,study_id:study,details:{latency_ms:0,missing:null,api_key:'[redacted]'}}],next_after:null,coverage:{returned:1},projection});
const history=()=>({version:'research-shared-turns-v1',access:'public-read-only',study_id:study,task_id:task,turns:[{id,study_id:study,task_id:task,number:1,stage:'planning',prompt_version_id:id,model_id:'fixed-model',request:{system:[{text:'Check latency in ms.'}]},request_sha256:'a'.repeat(64),status:'failed',reserved_cents:0,estimated_cents:null,raw_response:null,response_sha256:null,output:null,usage:{input_tokens:0},reason:'Input missing',created_at:stamp,ended_at:null}],next_before:null,coverage:{returned:1,total:1},projection});

test('shared records and turns retain missing values, zero, identities and explicit transformation provenance',()=>{
 assert.equal(validateSharedRecords(page(),study,'configurations').records[0].details.latency_ms,0);
 assert.equal(validateSharedRecords(page(),study,'configurations').records[0].details.missing,null);
 assert.equal(validateSharedTurnHistory(history(),study,task).turns[0].estimated_cents,null);
 for(const change of [p=>p.access='owner-private',p=>p.study_id=task,p=>p.kind='profiles',p=>p.coverage.returned=2,p=>p.records[0].study_id=task,p=>p.next_after=task,p=>p.projection=null,p=>p.owner_id=task]){const p=page();change(p);assert.throws(()=>validateSharedRecords(p,study,'configurations'));}
 for(const change of [p=>p.access='owner-private',p=>p.turns[0].study_id=id,p=>p.turns[0].request=null,p=>p.coverage.returned=2,p=>p.next_before=2,p=>p.projection=null]){const p=history();change(p);assert.throws(()=>validateSharedTurnHistory(p,study,task));}
});

test('all shared detail reads use fixed anonymous GETs and reject invalid selections before fetching',async()=>{
 const prior=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://example.org';
 const calls=[];
 const read=async(url,options)=>{calls.push(url);assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.deepEqual(options.headers,{Accept:'application/json'});return Response.json(url.includes('/autonomy?')?history():page());};
 try{
  await loadSharedRecords(study,'configurations',undefined,undefined,read);
  await loadSharedTurnHistory(study,task,undefined,undefined,read);
  assert.deepEqual(calls,[`https://example.org/research/studies/${study}/queue?public=1&records=configurations`,`https://example.org/research/studies/${study}/autonomy?public=1&task=${task}`]);
  for(const args of [['bad','configurations'],[study,'profiles'],[study,'constructor'],[study,'configurations','bad']])await assert.rejects(()=>loadSharedRecords(...args),/invalid/);
  await assert.rejects(()=>loadSharedTurnHistory(study,task,0),/invalid/);
  const controller=new AbortController();controller.abort(new Error('Stopped'));
  await assert.rejects(()=>loadSharedRecords(study,'claims',undefined,controller.signal,()=>{throw Error('must not fetch');}),/Stopped/);
  await assert.rejects(()=>loadSharedTurnHistory(study,task,1,undefined,read),/invalid or incomplete/);
 }finally{if(prior===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=prior;}
});
