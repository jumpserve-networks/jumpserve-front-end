import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {stepPlan,stepBreakdown,stepView} from './support/step-command-fixture.mjs';
import {INDIVIDUAL_TERMINAL_LAYOUT} from '../lib/paper-terminal-commands.ts';
globalThis.__stepServer={};
const hook=registerHooks({resolve(name,context,next){
 if(name==='server-only')return{shortCircuit:true,url:'data:text/javascript,export {};'};
 if(name==='./paper-intake-server')return{shortCircuit:true,url:'data:text/javascript,export const intakeDatabase=async()=>globalThis.__stepServer.db;export const modelClient=async()=>globalThis.__stepServer.model;'};
 if(name==='./paper-experiment-plan-server')return{shortCircuit:true,url:'data:text/javascript,export class ExperimentPlanError extends Error{constructor(m,s){super(m);this.status=s;}}'};
 return next(name,context);
}});
const server=await import('../lib/paper-step-commands-server.ts');hook.deregister();
const id='11111111-1111-4111-8111-111111111111';let s,rows,calls,queryError,admitted;
const plan=()=>({study_id:id,owner_id:'owner',revision:3,status:'ready',plan:stepPlan(),confirmed_breakdown:stepBreakdown()});
const record=()=>({...stepView(id),status:'ready',owner_id:'owner',experiment_index:1,target:'ubuntu-debian',command_layout:INDIVIDUAL_TERMINAL_LAYOUT,plan_revision:3,link_review_id:null,source_plan:stepPlan(),confirmed_breakdown:stepBreakdown()});
beforeEach(()=>{
 s=globalThis.__stepServer;rows=[];calls=[];queryError=null;admitted=false;
 s.db={from(table){assert.equal(table,'research_step_commands');const filters={};let columns;const result=()=>rows.filter(row=>Object.entries(filters).every(([k,v])=>row[k]===v));const builder={select(value){columns=value;return builder;},eq(k,v){filters[k]=v;return builder;},limit(n){calls.push(['limit',n]);return builder;},async maybeSingle(){calls.push(['read',columns,{...filters}]);return{data:result()[0]??null,error:queryError};},then(resolve,reject){calls.push(['list',columns,{...filters}]);const data=result().map(row=>Object.fromEntries(columns.split(',').map(k=>[k,row[k]])));return Promise.resolve({data,count:data.length,error:queryError}).then(resolve,reject);}};return builder;},async rpc(name,args){calls.push(['save',name,args]);return{data:{...record(),status:args.p_operation==='generate'?'submitting':'processing',action_ref:args.p_ref,admitted,submit_token:'token',provider_response_id:'resp_step'},error:null};}};
 s.model={responses:{async create(request){calls.push(['model',request]);return{id:'resp_step',status:'queued'};}}};
});
test('summary reads are bounded, private and omit every command body, prompt and response',async()=>{
 rows=[record()];const value=await server.stepCommandsList(plan(),1);assert.equal(value.actions.length,6);assert.equal(value.actions[0].stage,'ready');assert.equal(value.actions[1].stage,'not_generated');assert.equal(calls.some(c=>c[0]==='model'),false);
 const read=calls.find(c=>c[0]==='list');assert.equal(read[1],'action_ref,status,reason,generated_at,plan_revision,link_review_id');assert.deepEqual(read[2],{study_id:id,owner_id:'owner',experiment_index:1,target:'ubuntu-debian'});assert.ok(!JSON.stringify(value).includes('source_plan'));
});
test('loaded bodies require the exact owner, plan revision, review and confirmed source',async()=>{
 rows=[record()];assert.equal((await server.loadStepCommands(plan(),1,'1.1.1')).action_ref,'1.1.1');assert.equal(await server.loadStepCommands({...plan(),owner_id:'other'},1,'1.1.1'),null);
 for(const mutate of [r=>r.plan_revision=2,r=>r.link_review_id='other-review',r=>r.source_plan.experiments[0].title='Altered',r=>r.confirmed_breakdown.sections.access=[]]){const bad=record();mutate(bad);rows=[bad];await assert.rejects(()=>server.loadStepCommands(plan(),1,'1.1.1'));}
});
test('an existing admission never calls the model and a new admission creates only the selected schema',async()=>{
 await server.prepareStepCommands(plan(),1,'1.2.1');assert.equal(calls.filter(c=>c[0]==='model').length,0);admitted=true;await server.prepareStepCommands(plan(),1,'1.2.1');assert.equal(calls.filter(c=>c[0]==='model').length,1);
 const save=calls.find(c=>c[0]==='save');assert.equal(save[1],'research_step_commands_control');assert.equal(save[2].p_ref,'1.2.1');const model=calls.find(c=>c[0]==='model')[1];assert.deepEqual(model.text.format.schema.properties.actions.required,['1.2.1']);assert.equal(JSON.parse(model.input).action_ref,'1.2.1');
});
test('missing capability and stale source fail before inference',async()=>{
 queryError={code:'PGRST205',message:'Missing relation'};await assert.rejects(()=>server.stepCommandsList(plan(),1),e=>e.status===424);await assert.rejects(()=>server.prepareStepCommands({...plan(),revision:undefined},1,'1.1.1'),e=>e.status===409);assert.equal(calls.filter(c=>c[0]==='model').length,0);
});
