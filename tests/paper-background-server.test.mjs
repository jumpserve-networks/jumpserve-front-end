import assert from 'node:assert/strict';
import {after,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import OpenAI from 'openai';
globalThis.__paperBackgroundServer={};
const hook=registerHooks({resolve(name,context,next){const code=name==='server-only'?'export {};':name==='./paper-intake-server'?'export const intakeDatabase=async()=>globalThis.__paperBackgroundServer.db;export const modelClient=async()=>globalThis.__paperBackgroundServer.client;export const loadIntake=(...a)=>globalThis.__paperBackgroundServer.load(...a);export const prepareIntake=(...a)=>globalThis.__paperBackgroundServer.prepare(...a);':name==='./paper-experiment-plan-server'?'export const loadExperimentPlan=(...a)=>globalThis.__paperBackgroundServer.load(...a);export const refreshPlan=(...a)=>globalThis.__paperBackgroundServer.prepare(...a);':name==='./paper-experiment-scripts-server'?'export const loadExperimentScripts=(...a)=>globalThis.__paperBackgroundServer.load(...a);export const refreshExperimentScripts=(...a)=>globalThis.__paperBackgroundServer.prepare(...a);':name==='./paper-quality-server'?'export const loadPaperQuality=(...a)=>globalThis.__paperBackgroundServer.load(...a);export const drivePaperQuality=(...a)=>globalThis.__paperBackgroundServer.prepare(...a);':null;return code?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(code)}:next(name,context);}});
const {continuePaperBackground}=await import('../lib/paper-background-server.ts');after(()=>hook.deregister());
let work,calls,retained,provider;
beforeEach(()=>{
 work=[];calls=[];retained={call_id:'owned-call',submit_token:'owned-token',provider_session_id:'sess_owned',turn:{id:'turn_owned'},updated_at:'2026-01-01T00:00:00Z'};
 provider={retrieve:async()=>({id:'sess_owned',metadata:{call_id:'owned-call',submit_token:'owned-token'},status:'idle',usage:{total_tokens:1}}),turns:{list:async()=>({data:[{id:'turn_owned',status:'completed',usage:{total_tokens:1}}]})},delete:async id=>{calls.push(['delete',id]);return{id,deleted:true};}};
 Object.assign(globalThis.__paperBackgroundServer,{client:{beta:{agents:{sessions:provider}}},load:async(...args)=>{calls.push(['load',...args]);return{study_id:args[0]};},prepare:async(...args)=>{calls.push(['prepare',...args]);},db:{rpc:async(name,args)=>{calls.push(['rpc',name,args]);const op=args.p_operation;return{data:op==='claim'?work:op==='context'?{session:retained,done:false}:{retained:true},error:null};}}});
});
const cleanup=()=>({work_key:'agent_cleanup:owned-call',kind:'agent_cleanup',study_id:'owned-study',owner_id:'owner',workflow_id:'owned-call',experiment_index:0,lease_token:'lease'});
test('one failed saved intent does not starve another; all leases are released with recorded outcomes',async()=>{
 work=[{kind:'intake',work_key:'intake:first',study_id:'first',owner_id:'owner-a',lease_token:'a'},{kind:'scripts',work_key:'scripts:second',study_id:'second',owner_id:'owner-b',experiment_index:2,lease_token:'b'}];
 globalThis.__paperBackgroundServer.load=async(study,owner,index)=>{calls.push(['load',study,owner,index]);if(study==='first')throw Error('source read failed');return{study_id:study};};
 const result=await continuePaperBackground(2);assert.equal(result.advanced,1);assert.equal(result.unavailable,1);assert.ok(calls.some(c=>c[0]==='load'&&c[1]==='second'&&c[2]==='owner-b'&&c[3]===2));const releases=calls.filter(c=>c[0]==='rpc'&&c[2].p_operation==='release');assert.equal(releases.length,2);assert.equal(releases.find(c=>c[2].p_payload.work_key==='intake:first')[2].p_payload.failed,true);
});
test('terminal cleanup deletes only the unchanged recorded session and retains real usage and receipt',async()=>{
 work=[cleanup()];const result=await continuePaperBackground();assert.equal(result.unavailable,0);assert.deepEqual(calls.find(c=>c[0]==='delete'),['delete','sess_owned']);const recorded=calls.find(c=>c[0]==='rpc'&&c[2].p_operation==='record');assert.equal(recorded[2].p_payload.receipt.id,'sess_owned');assert.equal(recorded[2].p_payload.receipt.usage.total_tokens,1);
});
test('cleanup never deletes active, changed-owner or changed-turn provider work',async()=>{
 for(const change of ['active','owner','turn']){
  calls.length=0;work=[cleanup()];provider.retrieve=async()=>({id:'sess_owned',metadata:{call_id:change==='owner'?'different':'owned-call',submit_token:'owned-token'},status:change==='active'?'in_progress':'idle',usage:{total_tokens:1}});provider.turns.list=async()=>({data:[{id:change==='turn'?'different':'turn_owned',status:'completed'}]});const result=await continuePaperBackground();assert.equal(result.unavailable,1);assert.ok(!calls.some(c=>c[0]==='delete'));
 }
});
test('an already-absent provider resource is recorded as observed 404, without inventing a deletion response',async()=>{
 work=[cleanup()];provider.retrieve=async()=>{throw OpenAI.APIError.generate(404,{error:{message:'Not found',type:'invalid_request_error'}},'Not found',new Headers());};
 const result=await continuePaperBackground();assert.equal(result.unavailable,0);assert.ok(!calls.some(c=>c[0]==='delete'));const receipt=calls.find(c=>c[0]==='rpc'&&c[2].p_operation==='record')[2].p_payload.receipt;assert.equal(receipt.retrieval_http_status,404);assert.equal(receipt.deleted,undefined);
});
