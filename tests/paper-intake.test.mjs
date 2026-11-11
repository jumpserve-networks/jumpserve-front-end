import assert from 'node:assert/strict';
import {test} from 'node:test';
import {paperModelRequest,validatePaperExtraction,extractionBreakdown,PAPER_INTAKE_MODEL,serializePaperText,sha256} from '../lib/paper-intake-model.ts';
import {refreshPaperIntake,cancelPaperIntake} from '../lib/paper-intake-runner.ts';
import {validatePaperBreakdown} from '../lib/research-paper-breakdown.ts';
import {validatePaperIntake} from '../lib/paper-intake.ts';

const text='An Explicit Test Paper\nTest Author\nTwo Linux hosts measured latency in milliseconds. We compared the baseline.';
const paper={totalPages:2,pages:[{page:1,text},{page:2,text:''}]};
const extraction=()=>({title:{text:'An Explicit Test Paper',quote:'An Explicit Test Paper',page:1},domain:{text:'Networking',quote:'Two Linux hosts',page:1},authors:[{name:'Test Author',quote:'Test Author',page:1}],sections:Object.fromEntries(['access','experiment','data','validate'].map(id=>[id,[{description:'An explicit software fixture.',quote:'Two Linux hosts',page:1}]]))});
const row=()=>({study_id:'10000000-0000-4000-8000-000000000001',owner_id:'owner',status:'processing',source_id:'20000000-0000-4000-8000-000000000001',text_artifact_id:'30000000-0000-4000-8000-000000000001',submit_token:'token',provider_response_id:'resp_original',paper_text:paper,updated_at:new Date().toISOString(),deadline_at:new Date(Date.now()+86400000).toISOString()});
const response=(value=extraction())=>({id:'resp_original',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
function operations(result=response()){const calls=[];return{calls,retrieve:async id=>{calls.push(['retrieve',id]);return result;},cancel:async id=>{calls.push(['cancel',id]);return{...result,status:'cancelled'};},save:async(op,current,payload)=>{calls.push([op,payload]);return{...current,status:op==='finish'?'ready':op,...payload};}};}

test('one background request reads complete ordered text without tools or truncated pages',()=>{
 const request=paperModelRequest(paper);assert.equal(request.model,PAPER_INTAKE_MODEL);assert.equal(request.background,true);assert.equal(request.text.format.strict,true);assert.deepEqual(JSON.parse(request.input).pages,paper.pages);assert.equal(request.tools,undefined);
 for(const value of [{...paper,totalPages:201},{totalPages:1,pages:[{page:1,text:''}]},{totalPages:1,pages:[{page:1,text:'x'.repeat(200001)}]},{totalPages:2,pages:[paper.pages[1],paper.pages[0]]}])assert.throws(()=>paperModelRequest(value));
});
test('all four sections and metadata must have exact quotes on retained readable pages',()=>{
 assert.deepEqual(validatePaperExtraction(extraction(),paper),extraction());
 for(const edit of [v=>v.sections.access[0].quote='invented',v=>v.sections.access[0].page=2,v=>v.title.text='Another title',v=>v.authors[0].name='someone@example.test',v=>delete v.sections.validate,v=>v.sections.access.push(...Array(8).fill(v.sections.access[0]))]){const value=extraction();edit(value);assert.throws(()=>validatePaperExtraction(value,paper));}
 const value=extraction();value.sections.validate=[];assert.deepEqual(validatePaperExtraction(value,paper).sections.validate,[]);
});
test('one pass allows 32 details on one readable page without inventing chunk counts',()=>{
 const value=extraction();for(const key of Object.keys(value.sections))value.sections[key]=Array(8).fill(value.sections[key][0]);const saved=extractionBreakdown(value,paper,row().source_id,row().text_artifact_id);validatePaperBreakdown(saved);assert.equal(saved.total_chunks,1);assert.equal(saved.cursor,1);assert.deepEqual(saved.missing_text_pages,[2]);assert.equal(saved.sections.access.length,8);
});
test('completed response saves verified breakdown and original response without new inference',async()=>{
 const ops=operations();const result=await refreshPaperIntake(row(),ops);assert.equal(result.status,'ready');assert.deepEqual(ops.calls.map(c=>c[0]),['retrieve','finish']);assert.equal(result.response.id,'resp_original');assert.equal(result.breakdown.sections.data[0].page,1);assert.equal(result.title,'An Explicit Test Paper');
});
test('Postgres JSONB property order cannot change the text artifact identity',()=>{
 const decoded={pages:paper.pages.map(p=>({text:p.text,page:p.page})),totalPages:paper.totalPages};
 assert.notEqual(JSON.stringify(decoded),JSON.stringify(paper));assert.equal(serializePaperText(decoded),serializePaperText(paper));
 assert.equal(extractionBreakdown(extraction(),decoded,row().source_id,row().text_artifact_id).text_sha256,sha256(serializePaperText(paper)));
});
test('queued status only retrieves the same response and terminal records are inert',async()=>{
 const ops=operations({...response(),status:'in_progress'});assert.equal((await refreshPaperIntake(row(),ops)).status,'processing');for(const status of ['ready','failed','uncertain','cancelled'])await refreshPaperIntake({...row(),status},ops);assert.deepEqual(ops.calls,[['retrieve','resp_original']]);
});
test('wrong response identity and transient retrieval failures never create replacement calls',async()=>{
 await assert.rejects(()=>refreshPaperIntake(row(),operations({...response(),id:'resp_other'})),/identity/);const ops=operations();ops.retrieve=async()=>{throw new Error('Temporary outage');};await assert.rejects(()=>refreshPaperIntake(row(),ops),/Temporary outage/);assert.deepEqual(ops.calls,[]);
});
test('refusals incomplete invalid JSON and invented quotes retain failed raw responses',async()=>{
 for(const value of [{...response(),status:'incomplete'},{...response(),output:[{type:'message',content:[{type:'refusal',refusal:'Declined'}]}]},{...response(),output:[{type:'message',content:[{type:'output_text',text:'not json'}]}]},response({...extraction(),title:{text:'Invented',quote:'Invented',page:1}})]){const ops=operations(value);const result=await refreshPaperIntake(row(),ops);assert.equal(result.status,'failed');assert.equal(result.response,value);assert.equal(ops.calls.at(-1)[0],'failed');}
});
test('a failed database save retries retrieval and persistence only',async()=>{
 const ops=operations();ops.save=async()=>{throw new Error('Database unavailable');};await assert.rejects(()=>refreshPaperIntake(row(),ops),/Database unavailable/);assert.deepEqual(ops.calls,[['retrieve','resp_original']]);
});
test('exhausted OpenAI credits remain an explicit retained failure without a replacement call',async()=>{
 const ops=operations({...response(),status:'failed',error:{code:'credit_balance_exhausted',message:'No credits remaining'}});const result=await refreshPaperIntake(row(),ops);assert.equal(result.status,'failed');assert.match(result.reason,/no credits remaining/);assert.deepEqual(ops.calls.map(c=>c[0]),['retrieve','failed']);assert.equal(result.response.error.code,'credit_balance_exhausted');
});
test('lost submission acknowledgements become uncertain and cannot be replayed by status polling',async()=>{
 const current={...row(),status:'submitting',provider_response_id:null,updated_at:new Date(Date.now()-130000).toISOString()},ops=operations();const result=await refreshPaperIntake(current,ops);assert.equal(result.status,'uncertain');assert.deepEqual(ops.calls.map(c=>c[0]),['uncertain']);await refreshPaperIntake(result,ops);assert.equal(ops.calls.length,1);
});
test('deadline and cancellation operate on the retained provider identity',async()=>{
 const ops=operations();await refreshPaperIntake({...row(),deadline_at:'2000-01-01T00:00:00Z'},ops);assert.deepEqual(ops.calls.map(c=>c[0]),['cancel','failed']);const other=operations();const cancelled=await cancelPaperIntake(row(),other);assert.equal(cancelled.status,'cancel');assert.equal(cancelled.response.status,'cancelled');await assert.rejects(()=>cancelPaperIntake({...row(),status:'submitting'},other),/confirmed/);
});
test('public projection cannot include a private breakdown or manufacture an empty ready result',()=>{
 const view={version:'paper-intake-next-v1',id:'id',status:'ready',stage:'ready',owner:false,breakdown:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),title:null,authors:null,domain:null,reason:null,experiment_jobs:0};validatePaperIntake(view,'id');assert.throws(()=>validatePaperIntake({...view,breakdown:{}},'id'));assert.throws(()=>validatePaperIntake({...view,owner:true},'id'));assert.throws(()=>validatePaperIntake({...view,experiment_jobs:null},'id'));
});
