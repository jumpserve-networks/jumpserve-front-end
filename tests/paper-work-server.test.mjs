import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import OpenAI from 'openai';
globalThis.__workServer={};
const hook=registerHooks({resolve(name,context,next){
 const values={
  'server-only':'export {};',
  './paper-intake-server':'export const intakeDatabase=async()=>globalThis.__workServer.db;',
  './paper-experiment-plan-server':'export class ExperimentPlanError extends Error{constructor(message,status){super(message);this.status=status;}}export const loadExperimentPlan=(...a)=>globalThis.__workServer.loadPlan(...a);export const refreshPlan=(...a)=>globalThis.__workServer.refreshPlan(...a);',
  './paper-experiment-scripts-server':'export const loadExperimentScripts=(...a)=>globalThis.__workServer.loadScripts(...a);export const refreshExperimentScripts=(...a)=>globalThis.__workServer.refreshScripts(...a);',
 };return values[name]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(values[name])}:next(name,context);
}});
const {ownerPaperWork}=await import('../lib/paper-work-server.ts');hook.deregister();
const id='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222',third='33333333-3333-4333-8333-333333333333',stamp='2026-11-17T12:00:00Z';
let s,tables,queries,polls,errorTable;
const plan=(study=id,status='processing')=>({study_id:study,owner_id:'owner',status,updated_at:stamp,reason:null,revision:3,provider_response_id:'resp_'+study,experiment_0:status==='ready'?'Experiment 1':null});
beforeEach(()=>{
 s=globalThis.__workServer;queries=[];polls=[];errorTable=null;tables={research_study_owners:[{study_id:id,owner_id:'owner',active_study:{deleted_at:null}}],research_studies:[{id,title:'Paper',study_kind:'paper'}],research_experiment_plans:[plan()],research_experiment_scripts:[],research_experiment_plan_link_reviews:[]};
 const field=(row,key)=>key.split('.').reduce((v,k)=>v?.[k],row);
 s.db={from(table){const filters=[];let limit=Infinity;return{select(columns){queries.push({table,columns});return this;},eq(key,value){filters.push(row=>field(row,key)===value);return this;},in(key,values){filters.push(row=>values.includes(field(row,key)));return this;},is(key,value){filters.push(row=>field(row,key)===value);return this;},limit(value){limit=value;return this;},then(resolve,reject){return Promise.resolve({data:(tables[table]??[]).filter(row=>filters.every(f=>f(row))).slice(0,limit),error:table===errorTable?{code:'test',message:'Private unavailable'}:null}).then(resolve,reject);}};},rpc(){throw Error('Status polling must never admit a request');}};
 s.loadPlan=async(study,owner)=>{assert.equal(owner,'owner');polls.push('plan:'+study);return{...plan(study),original_id:'resp_original'};};s.refreshPlan=async row=>({...row,status:'processing'});
 s.loadScripts=async(study,owner,index)=>{assert.equal(owner,'owner');polls.push('script:'+study+':'+index);return{study_id:study,status:'processing',reason:null,updated_at:stamp,provider_response_id:'resp_original_script'};};s.refreshScripts=async row=>({...row,status:'ready'});
});
test('metadata reads remain owner-scoped and two original calls are reconciled fairly per poll',async()=>{
 for(const study of [second,third]){tables.research_study_owners.push({study_id:study,owner_id:'owner',active_study:{deleted_at:null}});tables.research_studies.push({id:study,title:'Another paper',study_kind:'paper'});tables.research_experiment_plans.push(plan(study));}
 tables.research_study_owners.push({study_id:'44444444-4444-4444-8444-444444444444',owner_id:'other',active_study:{deleted_at:null}});
 const first=await ownerPaperWork('owner',0);assert.equal(first.units.length,3);assert.equal(polls.length,2);assert.equal(first.next_cursor,2);await ownerPaperWork('owner',first.next_cursor);assert.ok(polls.includes('plan:'+third));
 for(const query of queries.filter(q=>q.table==='research_experiment_plans'||q.table==='research_experiment_scripts')){assert.notEqual(query.columns,'*');assert.ok(!query.columns.includes('confirmed_breakdown'));assert.ok(!query.columns.includes('command_set'));assert.ok(!query.columns.includes('source_plan'));}
 assert.ok(queries.find(q=>q.table==='research_experiment_plans').columns.includes('plan->experiments->0->>title'));
});
test('Step 4 reports every expected package and never counts missing packages as complete',async()=>{
 tables.research_experiment_plans=[{...plan(id,'ready'),experiment_1:'Experiment 2'}];tables.research_experiment_scripts=[{study_id:id,owner_id:'owner',target:'ubuntu-debian',experiment_index:1,status:'processing',updated_at:stamp,reason:null,plan_revision:3,link_review_id:null}];
 const result=await ownerPaperWork('owner',0),scripts=result.units.filter(u=>u.step===4);assert.equal(scripts.length,2);assert.equal(scripts[0].stage,'ready');assert.equal(scripts[1].stage,'not_generated');assert.equal(scripts[1].total,2);assert.deepEqual(polls,['script:'+id+':1']);
});
test('uncertain calls are retained without replay and provider failures preserve last recorded progress',async()=>{
 tables.research_experiment_plans=[plan(id,'uncertain')];let result=await ownerPaperWork('owner',0);assert.equal(result.units[0].stage,'uncertain');assert.deepEqual(polls,[]);
 tables.research_experiment_plans=[plan()];s.refreshPlan=async()=>{throw new OpenAI.APIError(401,{},'Incorrect key: sk-synthetic-secret',new Headers());};result=await ownerPaperWork('owner',0);assert.equal(result.units[0].stage,'processing');assert.match(result.units[0].status_error,/HTTP 401/);assert.ok(!JSON.stringify(result).includes('sk-synthetic'));
});
test('reviewed original plans keep their ready status without rewriting a failed call',async()=>{
 const original=plan(id,'failed');tables.research_experiment_plans=[original];tables.research_experiment_plan_link_reviews=[{id:'review',study_id:id,owner_id:'owner',base_revision:3,provider_response_id:original.provider_response_id,updated_at:stamp,experiment_0:'Reviewed experiment'}];
 const result=await ownerPaperWork('owner',0);assert.equal(result.units[0].stage,'ready');assert.equal(original.status,'failed');assert.deepEqual(polls,[]);
});
test('deleted assessments, ideas and read failures do not create misleading completion notices',async()=>{
 tables.research_study_owners[0].active_study.deleted_at=stamp;assert.deepEqual((await ownerPaperWork('owner',0)).units,[]);tables.research_study_owners[0].active_study.deleted_at=null;tables.research_studies[0].study_kind='idea';assert.deepEqual((await ownerPaperWork('owner',0)).units,[]);assert.deepEqual(polls,[]);
 tables.research_studies[0].study_kind='paper';errorTable='research_experiment_scripts';await assert.rejects(()=>ownerPaperWork('owner',0),e=>e.status===503);
});
