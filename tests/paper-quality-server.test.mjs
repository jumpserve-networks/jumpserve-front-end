import assert from 'node:assert/strict';
import{after,beforeEach,test}from'node:test';
import{registerHooks}from'node:module';
import{qualityRow,passReview,qualityResponse}from'./support/paper-quality-fixture.mjs';
import{deterministicQualityChecks}from'../lib/paper-quality-checks.ts';
import{sandboxQualityChecks}from'../lib/paper-quality-model.ts';
globalThis.__qualityServer={};
const hook=registerHooks({resolve(name,context,next){const code=name==='server-only'?'export {};':name==='./paper-intake-server'?'export const intakeDatabase=async()=>globalThis.__qualityServer.db;export const modelClient=async()=>{throw Error("Read-only overlays cannot create model calls");};':null;return code?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(code)}:next(name,context);}});
const{qualityIntake,qualityPlan,qualityScripts,advanceOwnerPaperQuality}=await import('../lib/paper-quality-server.ts');after(()=>hook.deregister());
let q,reads;
beforeEach(()=>{q=qualityRow();reads=0;globalThis.__qualityServer.db={from(table){reads++;assert.equal(table,'research_paper_quality_workflows');return{select(){return this;},eq(){return this;},async maybeSingle(){return{data:{...q,current_call_id:null},error:null};}};}};});
function row(step){q=qualityRow(step);const source=structuredClone(q.source_json);return{study_id:q.study_id,owner_id:q.owner_id,status:'ready',policy_snapshot:{quality_review:true},revision:4,provider_response_id:'resp_original_draft',paper_text:source.paper,breakdown:source.candidate.breakdown,title:null,authors:[],domain:null,plan:step===3?source.candidate:null,confirmed_breakdown:source.confirmed_breakdown,source_plan:source.plan,command_set:step===4?source.candidate:null,experiment_index:step===4?1:0,generated_at:'2026-11-18T12:00:00Z'};}
function approve(){q.status='approved';q.phase='approved';q.review=passReview();const source={...q.source_json,candidate:q.candidate};q.checks=deterministicQualityChecks(source);if(q.step===4)q.checks.sandbox=sandboxQualityChecks(qualityResponse(passReview(),source),source).sandbox;}
test('unreviewed drafts are hidden from every owner view, while legacy records make no extra database requests',async()=>{
 for(const[step,run,key]of[[2,qualityIntake,'breakdown'],[3,qualityPlan,'plan'],[4,qualityScripts,'command_set']]){const original=row(step),copy=structuredClone(original),waiting=await run(original);assert.equal(waiting.status,'processing');assert.equal(waiting[key],null);assert.equal(waiting.quality.phase,'reviewing');assert.deepEqual(original,copy);if(step===4)assert.equal(waiting.generated_at,null);}
 const legacy=row(3);delete legacy.policy_snapshot;reads=0;assert.equal(await qualityPlan(legacy),legacy);assert.equal(reads,0);
});
test('approved repaired outputs are separate overlays, not modifications of original records',async()=>{
 for(const[step,run,key]of[[2,qualityIntake,'breakdown'],[3,qualityPlan,'plan'],[4,qualityScripts,'command_set']]){const original=row(step),copy=structuredClone(original);if(step===2)q.candidate.breakdown.sections.access[0].description+=' Reviewed.';if(step===3)q.candidate.experiments[0].title+=' Reviewed.';if(step===4)q.candidate.setup.notes+=' Reviewed.';approve();const result=await run(original);assert.equal(result.status,'ready');assert.equal(result.quality.phase,'approved');assert.notDeepEqual(result[key],original[key]);assert.deepEqual(original,copy);}
});
test('rejected, cancelled and uncertain reviews cannot expose drafts or advance the wizard',async()=>{
 for(const[status,expected]of[['needs_attention','failed'],['uncertain','uncertain'],['cancelled','cancelled']]){const original=row(3);q.status=status;q.phase=status;const result=await qualityPlan(original);assert.equal(result.status,expected);assert.equal(result.plan,null);assert.equal(result.quality.phase,status);}
});
test('stale source revisions, changed frozen inputs and unverified approvals fail closed',async()=>{
 for(const mutate of [r=>r.revision++,r=>r.provider_response_id='resp_other',r=>r.confirmed_breakdown.sections.validate[0].description='Different frozen criterion']){const original=row(3);approve();mutate(original);await assert.rejects(()=>qualityPlan(original),/different original draft/);}
 const original=row(4);approve();delete q.checks.sandbox;await assert.rejects(()=>qualityScripts(original),/source checks/);
});
test('one unavailable saved workflow cannot starve other background work or force inference replay',async()=>{
 const pending=[{study_id:'first',step:3,experiment_index:0},{study_id:'second',step:4,experiment_index:1}],loaded=[];globalThis.__qualityServer.db={from(){let study;return{select(){return this;},eq(key,value){if(key==='study_id')study=value;return this;},in(){return this;},order(){return this;},range(){return Promise.resolve({data:pending,error:null});},async maybeSingle(){loaded.push(study);return{data:null,error:study==='first'?{code:'unavailable'}:null};}};}};
 const result=await advanceOwnerPaperQuality('owner');assert.deepEqual(loaded,['first','second']);assert.equal(result.next_cursor,2);assert.equal(result.unavailable,1);assert.equal(result.advanced,0);
});
