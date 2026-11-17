import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {experimentScriptsRecord,experimentScriptsFixture} from './support/experiment-scripts-fixture.mjs';
import {legacyTerminalCommandFixture} from './support/terminal-command-fixture.mjs';
import {LEGACY_TERMINAL_LAYOUT} from '../lib/paper-terminal-commands.ts';
globalThis.__scriptsServer={};
const hook=registerHooks({resolve(name,context,next){
 if(name==='server-only')return{shortCircuit:true,url:'data:text/javascript,export {};'};
 if(name==='./paper-intake-server')return{shortCircuit:true,url:'data:text/javascript,export const intakeDatabase=async()=>globalThis.__scriptsServer.db;export const modelClient=async()=>globalThis.__scriptsServer.model;'};
 if(name==='./paper-experiment-plan-server')return{shortCircuit:true,url:'data:text/javascript,export class ExperimentPlanError extends Error {constructor(message,status){super(message);this.status=status;}}'};
 return next(name,context);
}});
const server=await import('../lib/paper-experiment-scripts-server.ts');hook.deregister();
let s,calls,tables,error,admitted;
beforeEach(()=>{
 calls=[];tables={};error=null;admitted=false;s=globalThis.__scriptsServer;
 s.db={from(table){const filters={};let limit=Infinity;const result=()=>{calls.push(['read',table,{...filters}]);return{error,data:(tables[table]??[]).filter(row=>Object.entries(filters).every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value)).slice(0,limit)};};return{select(){return this;},eq(key,value){filters[key]=value;return this;},in(key,value){filters[key]=value;return this;},limit(value){limit=value;return this;},async maybeSingle(){const r=result();return{...r,data:r.data[0]??null};},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};},async rpc(name,args){calls.push(['save',name,args]);return{error,data:{...experimentScriptsRecord(),status:args.p_operation==='finish'?'ready':args.p_operation==='cancel'?'cancelled':'processing',command_layout:args.p_payload.command_layout??experimentScriptsRecord().command_layout,admitted}};}};
 s.model={responses:{async create(request,options){calls.push(['create',request,options]);return{id:'resp_created_shared',status:'queued'};},async retrieve(id){calls.push(['retrieve',id]);return{id,status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(experimentScriptsFixture())}]}]};},async cancel(id){calls.push(['cancel',id]);return{id,status:'cancelled'};}}};
});
const row=()=>({...experimentScriptsRecord(),target:'ubuntu-debian'});
test('private shared reads filter owner, assessment, experiment and target before returning records',async()=>{
 const r=row();tables.research_experiment_scripts=[r];assert.equal(await server.loadExperimentScripts(r.study_id,r.owner_id,1),r);assert.equal(await server.loadExperimentScripts(r.study_id,'other',1),null);
 assert.deepEqual(calls[0][2],{study_id:r.study_id,owner_id:r.owner_id,experiment_index:1,target:'ubuntu-debian'});
 error={code:'42P01',message:'missing relation'};await assert.rejects(()=>server.loadExperimentScripts(r.study_id,r.owner_id,1),e=>e.status===424&&/database update/.test(e.message));
});
test('shared admission uses its own RPC and only an admitted call reaches the provider with its saved token',async()=>{
 const r=row(),plan={study_id:r.study_id,owner_id:r.owner_id,status:'ready',plan:r.source_plan,confirmed_breakdown:r.confirmed_breakdown};await server.prepareExperimentScripts(plan,1);assert.equal(calls.some(c=>c[0]==='create'),false);
 admitted=true;await server.prepareExperimentScripts(plan,1);const saved=calls.find(c=>c[0]==='save');assert.equal(saved[1],'research_experiment_scripts_control');assert.equal(saved[2].p_actor,r.owner_id);assert.equal(saved[2].p_payload.request.text.format.name,'paper_experiment_scripts_v1');
 const created=calls.find(c=>c[0]==='create');assert.equal(created[2].headers['X-Client-Request-Id'],r.submit_token);assert.equal(created[1].model,'gpt-5.4-2026-03-05');assert.deepEqual(created[1].reasoning,{effort:'medium'});
});
test('shared completion saves the original response and full package without any replacement inference',async()=>{
 const r=row();await server.refreshExperimentScripts(r);const saved=calls.find(c=>c[0]==='save');assert.equal(saved[2].p_operation,'finish');assert.deepEqual(saved[2].p_payload.command_set,experimentScriptsFixture());assert.equal(saved[2].p_payload.response_id,r.provider_response_id);assert.equal(calls.some(c=>c[0]==='create'),false);
});
test('legacy completion uses the old RPC and unresolved individual submissions fence new generation',async()=>{
 const r=row(),old={...r,command_layout:LEGACY_TERMINAL_LAYOUT};tables.research_terminal_commands=[old];tables.research_step_commands=[{...r,command_layout:'action-v1',action_ref:'1.1.1',status:'uncertain',provider_response_id:null}];
 s.model.responses.retrieve=async id=>{calls.push(['retrieve',id]);return{id,status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(legacyTerminalCommandFixture())}]}]};};
 assert.equal(await server.reconcileEarlierCommands(r.study_id,r.owner_id,1),1);assert.equal(calls.filter(c=>c[0]==='retrieve').length,1);const saved=calls.find(c=>c[0]==='save');assert.equal(saved[1],'research_terminal_commands_control');assert.equal(saved[2].p_payload.command_layout,LEGACY_TERMINAL_LAYOUT);assert.equal(calls.some(c=>c[0]==='create'),false);
});
