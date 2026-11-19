import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {duplicatedClaimFixture} from './support/experiment-plan-link-review-fixture.mjs';
import {reviewExperimentPlanLinks} from '../lib/paper-experiment-plan-review.ts';
const hook=registerHooks({resolve(name,context,next){
 if(name==='server-only')return{shortCircuit:true,url:'data:text/javascript,export {};'};
 if(name==='./paper-intake-server')return{shortCircuit:true,url:'data:text/javascript,export const intakeConfigured=async()=>true;export const intakeDatabase=async()=>globalThis.__reviewPlanDatabase;export const modelClient=()=>{throw new Error("No model calls during review reads");};'};
 return next(name,context);
}});
const {loadExperimentPlan}=await import('../lib/paper-experiment-plan-server.ts');hook.deregister();
let row,review,missing,calls;
beforeEach(()=>{
 const f=duplicatedClaimFixture();row=f.row;review={id:'review',study_id:row.study_id,owner_id:row.owner_id,base_revision:row.revision,provider_response_id:row.provider_response_id,keep_validation_steps:f.keep,...reviewExperimentPlanLinks(row,f.keep)};missing=false;calls=[];
 globalThis.__reviewPlanDatabase={from(table){const filters=[];calls.push({table,filters});const builder={select(){return builder;},eq(key,value){filters.push([key,value]);return builder;},async maybeSingle(){if(table==='research_experiment_plan_link_reviews'&&missing)return{data:null,error:{code:'PGRST205'}};const value=table==='research_experiment_plans'?row:review;return{data:value&&filters.every(([k,v])=>value[k]===v)?value:null,error:null};}};return builder;}};
});
test('owner reads overlay only the validated review while leaving the original failed row and response unchanged',async()=>{
 const original=structuredClone(row),saved=await loadExperimentPlan(row.study_id,row.owner_id);assert.equal(saved.status,'ready');assert.deepEqual(saved.plan,review.plan);assert.deepEqual(saved.response,row.response);assert.deepEqual(row,original);assert.equal(calls.length,2);
 assert.equal(await loadExperimentPlan(row.study_id,'different-owner'),null);
});
test('missing reviews retain the original failure and tampered reviewed content is rejected',async()=>{
 missing=true;assert.deepEqual(await loadExperimentPlan(row.study_id,row.owner_id),row);missing=false;
 review.plan.experiments[0].stages[0].steps[0].instructions='Changed evidence';await assert.rejects(()=>loadExperimentPlan(row.study_id,row.owner_id),/changed more/);
});
