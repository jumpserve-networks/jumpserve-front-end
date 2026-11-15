import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {breakdownFixture} from './support/experiment-plan-fixture.mjs';
import {dependencyBreakdown} from './support/paper-dependency-fixture.mjs';
import {reviewedSections} from '../lib/paper-experiment-plan.ts';
const hook=registerHooks({resolve(specifier,context,next){
 if(specifier==='server-only')return{shortCircuit:true,url:'data:text/javascript,export {};'};
 if(specifier==='./paper-intake-server')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export const intakeDatabase=async()=>({rpc:async()=>({error:{message:"Plan only from the exact confirmed sections"}})});export const modelClient=()=>{throw new Error("No model call should be sent before database admission");};')};
 return next(specifier,context);
}});
const {confirmPlan}=await import('../lib/paper-experiment-plan-server.ts');hook.deregister();
test('missing database migrations reject before model creation and identify the dependency update separately from the hierarchy update',async()=>{
 for(const [breakdown,update] of [[dependencyBreakdown(),'paper-dependencies'],[breakdownFixture(),'hierarchical-steps']]){
  await assert.rejects(()=>confirmPlan({study_id:'study',owner_id:'owner',breakdown},4,reviewedSections(breakdown)),error=>error.status===424&&error.message.includes(update)&&error.message.includes('no model call was sent'));
 }
});
