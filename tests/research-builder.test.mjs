import assert from 'node:assert/strict';
import test from 'node:test';
import {validateTurnHistory,validateBuilderEvidence} from '../lib/research-autonomy.ts';
import {loadSharedBuilderEvidence} from '../lib/research-public-queue.ts';
const study='10000000-0000-4000-8000-000000000001',task='10000000-0000-4000-8000-000000000002',call='10000000-0000-4000-8000-000000000003';
function history(){return {version:'research-autonomy-v3',access:'owner-private',study_id:study,task_id:task,turns:[],builder_calls:[{id:call,study_id:study,task_id:task,dispatch_id:call,number:31,prompt_version_id:call,model_id:'gpt-6.1-sol',request_artifact_id:call,request_sha256:'a'.repeat(64),request_bytes:100,status:'complete',reserved_cents:0,response_artifact_id:call,response_sha256:'b'.repeat(64),usage:null,created_at:'2026-10-27T00:00:00Z',ended_at:'2026-10-27T00:00:01Z',reason:null}],next_before:null,coverage:{returned:0,builder_calls_returned:1,total:31}};}
test('native history rejects ascending calls and missing response hashes without changing original records',()=>{
 const value=history();const first=value.builder_calls[0];value.builder_calls.push({...first,id:study,number:30});value.coverage.builder_calls_returned=2;
 assert.equal(validateTurnHistory(value,study,task).builder_calls.length,2);
 value.builder_calls[1].number=31;assert.throws(()=>validateTurnHistory(value,study,task),/call history/);
 value.builder_calls.pop();value.coverage.builder_calls_returned=1;first.response_sha256=null;assert.throws(()=>validateTurnHistory(value,study,task),/call history/);
 const evidence={version:'builder-evidence-v1',study_id:study,task_id:task,call_id:call,kind:'response',status:'recorded',fragment:'Original',cursor:0,next_cursor:null,original_sha256:null,reason:'Original evidence'};
 assert.throws(()=>validateBuilderEvidence(evidence,study,task,call,'response',0),/fragment is invalid/);
});
test('native builder calls preserve uncapped numbering, parent reservation and missing usage',()=>{
 const value=validateTurnHistory(history(),study,task);assert.equal(value.builder_calls[0].number,31);assert.equal(value.builder_calls[0].reserved_cents,0);assert.equal(value.builder_calls[0].usage,null);
});
test('native history refuses wrong claim identities and falsely complete responses',()=>{
 for(const change of [v=>v.builder_calls[0].task_id=study,v=>v.builder_calls[0].response_artifact_id=null,v=>v.coverage.builder_calls_returned=2,v=>v.builder_calls[0].number=32,v=>v.builder_calls[0].reserved_cents=1]){
  const value=history();change(value);assert.throws(()=>validateTurnHistory(value,study,task));
 }
});
test('evidence fragments require matching call, kind and increasing bounded cursor',()=>{
 const value={version:'builder-evidence-v1',study_id:study,task_id:task,call_id:call,kind:'request',status:'recorded',fragment:'actual retained text',cursor:0,next_cursor:1500,original_sha256:'a'.repeat(64),reason:'Derived text fragment of the retained original.'};
 assert.equal(validateBuilderEvidence(value,study,task,call,'request',0).fragment,value.fragment);
 for(const altered of [{...value,call_id:task},{...value,next_cursor:0},{...value,fragment:'x'.repeat(1501)}])assert.throws(()=>validateBuilderEvidence(altered,study,task,call,'request',0));
 const missing={...value,kind:'response',status:'missing',fragment:null,next_cursor:null,original_sha256:null};assert.equal(validateBuilderEvidence(missing,study,task,call,'response',0).status,'missing');
});

test('shared native evidence uses a bounded anonymous read and validates every retained identity',async t=>{
 const previous=process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;t.after(()=>{if(previous===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL=previous;});process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://example.test';const value={version:'builder-evidence-v1',study_id:study,task_id:task,call_id:call,kind:'response',status:'recorded',fragment:'Original retained fragment',cursor:1500,next_cursor:null,original_sha256:'a'.repeat(64),reason:'Derived text; original hash retained.'};const fetch=t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'https://example.test/research/studies/'+study+'/autonomy?'+new URLSearchParams({public:'1',task,builder_call:call,kind:'response',cursor:'1500'}));assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,undefined);return Response.json(value);});assert.deepEqual(await loadSharedBuilderEvidence(study,task,call,'response',1500),value);for(const args of [['invalid',task,call,'response',1500],[study,'invalid',call,'response',1500],[study,task,'invalid','response',1500],[study,task,call,'response',-1]])await assert.rejects(loadSharedBuilderEvidence(...args),/Invalid native evidence/);assert.equal(fetch.mock.callCount(),1);
});
