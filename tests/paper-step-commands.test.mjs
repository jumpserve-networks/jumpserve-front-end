import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stepCommandFixture,stepView,stepSummary,stepPlan,stepBreakdown} from './support/step-command-fixture.mjs';
import {stepCommandsRequest} from '../lib/paper-step-commands-model.ts';
import {validateStepCommandSet,validateStepCommandsView,validateStepCommandsList,selectedCommandStep} from '../lib/paper-step-commands.ts';
import {terminalActionRefs,terminalClipboard,INDIVIDUAL_TERMINAL_LAYOUT} from '../lib/paper-terminal-commands.ts';
import {readTerminalCommands,generateTerminalCommands,refreshTerminalCommands} from '../lib/paper-terminal-commands-runner.ts';
import {spawnSync} from 'node:child_process';
const id='11111111-1111-4111-8111-111111111111',plan=stepPlan(),breakdown=stepBreakdown();
test('a step request contains one output action, exact confirmed context and only earlier prerequisites',()=>{
 for(const ref of terminalActionRefs(plan,1)){
  const request=stepCommandsRequest(id,1,ref,plan,breakdown),input=JSON.parse(request.input),schema=request.text.format.schema;
  assert.deepEqual(schema.properties.actions.required,[ref]);assert.deepEqual(Object.keys(schema.properties.actions.properties),[ref]);
  const previous=selectedCommandStep(plan,1,ref).earlier,prerequisites=schema.properties.actions.properties[ref].properties.prerequisites;
  assert.deepEqual(prerequisites.items.enum??[],previous);assert.deepEqual(input.earlier_action_refs,previous);assert.equal(input.action_ref,ref);assert.deepEqual(input.selected_action,selectedCommandStep(plan,1,ref).action);
  assert.deepEqual(input.experiment,plan.experiments[0]);assert.equal(input.artifact_contract,'step-manifest-v1');assert.equal(request.background,true);assert.equal(request.store,true);assert.equal(request.max_output_tokens,16000);assert.equal(request.tools,undefined);
  assert.match(request.instructions,/selected_action at action_ref ONLY/);assert.equal(request.instructions.includes('Cover EVERY action'),false);
 }
 assert.throws(()=>stepCommandsRequest(id,1,'1.9.1',plan,breakdown),/existing numbered/);
});
test('selected output retains ordinary guards, genuine earlier dependencies and frozen scientific blockers',()=>{
 const set=stepCommandFixture('1.2.1');set.actions['1.2.1'].prerequisites=['1.1.1'];assert.equal(validateStepCommandSet(set,plan,breakdown,1,'1.2.1'),set);
 for(const change of [s=>s.actions['1.1.1']=s.actions['1.2.1'],s=>s.actions['1.2.1'].prerequisites=['1.4.1'],s=>s.actions['1.2.1'].prerequisites=['1.2.1'],s=>s.actions['1.2.1'].prerequisites=['setup'],s=>s.actions['1.2.1'].commands='tc qdisc add dev eth0 root netem delay 20ms',s=>s.actions['1.2.1'].commands='python3 "$HELPER" run']){const bad=structuredClone(set);change(bad);assert.throws(()=>validateStepCommandSet(bad,plan,breakdown,1,'1.2.1'));}
 const blocked=stepCommandFixture('1.4.1');assert.equal(blocked.actions['1.4.1'].kind,'blocked');const bad=structuredClone(blocked);bad.actions['1.4.1']={...stepCommandFixture().actions['1.1.1']};assert.throws(()=>validateStepCommandSet(bad,plan,breakdown,1,'1.4.1'),/undefined scientific/);
 blocked.cleanup=stepCommandFixture().actions['1.1.1'];assert.throws(()=>validateStepCommandSet(blocked,plan,breakdown,1,'1.4.1'),/cleanup/);
 const oversized=stepCommandFixture();oversized.actions['1.1.1'].commands='🧪'.repeat(16000);oversized.cleanup={...oversized.actions['1.1.1']};assert.throws(()=>validateStepCommandSet(oversized,plan,breakdown,1,'1.1.1'),/storage limit/);
 const schema=stepCommandsRequest(id,1,'1.4.1',plan,breakdown).text.format.schema;assert.deepEqual(schema.properties.actions.properties['1.4.1'].properties.kind.enum,['blocked']);assert.deepEqual(schema.properties.cleanup.properties.commands,{type:'null'});
});
test('views, lists and copied commands remain bound to the selected step and separate workspace',()=>{
 const view=stepView(id),refs=terminalActionRefs(plan,1);assert.equal(validateStepCommandsView(view,id,1,'1.1.1',plan,breakdown),view);assert.equal(validateStepCommandsList(stepSummary(id),id,1,refs).actions.length,6);
 assert.throws(()=>validateStepCommandsView(view,id,1,'1.2.1',plan,breakdown));assert.throws(()=>validateStepCommandsList({...stepSummary(id),actions:[]},id,1,refs));
 const script=terminalClipboard(view.command_set.actions['1.1.1'],id,1,INDIVIDUAL_TERMINAL_LAYOUT);assert.match(script,/experiment-1\/action-v1/);assert.match(script,/JUMPSERVE_NAMESPACE_PREFIX="a11111111"/);
});
test('the retained-response runner validates only the requested action and never resubmits uncertain calls',async()=>{
 let row={study_id:id,owner_id:'owner',experiment_index:1,action_ref:'1.1.1',command_layout:INDIVIDUAL_TERMINAL_LAYOUT,source_plan:plan,confirmed_breakdown:breakdown,status:'submitting',submit_token:'token',provider_response_id:null,command_set:null,updated_at:new Date().toISOString(),deadline_at:'2099-01-01T00:00:00Z'};let creates=0;
 const response={id:'resp_step_fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(stepCommandFixture())}]}]};
 const ops={save:async(op,payload)=>{if(op==='generate')return{...row,admitted:creates===0};if(op==='submitted')row={...row,status:'processing',provider_response_id:payload.response_id};else row={...row,status:op==='finish'?'ready':op,command_set:payload.command_set??null};return row;},create:async()=>{creates++;return{id:response.id,status:'queued'};},retrieve:async()=>response,cancel:async()=>({id:response.id,status:'cancelled'})};
 await generateTerminalCommands(stepCommandsRequest(id,1,'1.1.1',plan,breakdown),ops);assert.equal((await refreshTerminalCommands(row,ops)).status,'ready');assert.deepEqual(row.command_set,stepCommandFixture());assert.equal(creates,1);
 const other=structuredClone(response);other.output[0].content[0].text=JSON.stringify(stepCommandFixture('1.2.1'));assert.throws(()=>readTerminalCommands(other,row));
 row={...row,status:'submitting',provider_response_id:null,command_set:null};creates=0;ops.create=async()=>{creates++;throw new Error('Lost acknowledgement');};await generateTerminalCommands(stepCommandsRequest(id,1,'1.1.1',plan,breakdown),ops);await generateTerminalCommands(stepCommandsRequest(id,1,'1.1.1',plan,breakdown),ops);assert.equal(creates,1);assert.equal(row.status,'uncertain');
});
test('the browser-free evaluator tests an individual action offline without model or database calls',()=>{
 const result=spawnSync(process.execPath,['--import','./scripts/lib/register-typescript.mjs','scripts/evaluate-terminal-commands.mjs','--step','1.2.1'],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout);assert.equal(report.actions,1);assert.equal(report.command_layout,'action-v1');assert.equal(report.model_calls,0);assert.equal(report.commands_executed,0);
});
