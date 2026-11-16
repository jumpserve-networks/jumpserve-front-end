import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {TERMINAL_COMMAND_LAYOUT,LEGACY_TERMINAL_LAYOUT,terminalActionRefs,terminalBlockedActionRefs,terminalCommandsInput,validateTerminalCommandSet,validateTerminalCommandsView,terminalClipboard,terminalInputsClipboard,terminalSetupRequired} from '../lib/paper-terminal-commands.ts';
import {terminalCommandsRequest} from '../lib/paper-terminal-commands-model.ts';
import {readTerminalCommands,generateTerminalCommands,refreshTerminalCommands,cancelTerminalCommands} from '../lib/paper-terminal-commands-runner.ts';
import {terminalCommandFixture,legacyTerminalCommandFixture,terminalBlock,terminalFixtureRecord,hierarchicalImplementationPlan,implementationBreakdown} from './support/terminal-command-fixture.mjs';
const study='11111111-1111-4111-8111-111111111111';
test('command generation uses the exact saved scope, target and action identities without changing the original plan',()=>{
 const plan=hierarchicalImplementationPlan(),before=structuredClone(plan),breakdown=implementationBreakdown(),request=terminalCommandsRequest(study,1,plan,breakdown),input=JSON.parse(request.input);
 assert.deepEqual(input,terminalCommandsInput(study,1,plan,breakdown));assert.equal(request.tools,undefined);assert.equal(request.background,true);assert.equal(request.text.format.strict,true);assert.equal(input.target,'ubuntu-debian');assert.deepEqual(Object.keys(request.text.format.schema.properties.actions.properties),terminalActionRefs(plan,1));assert.deepEqual(plan,before);
 assert.match(request.instructions,/Never change the host's default routes/);assert.match(request.instructions,/no selected owner measurement-ingestion contract/);assert.throws(()=>terminalCommandsRequest(study,2,plan,breakdown));
 const blocked=terminalBlockedActionRefs(plan,1,breakdown);assert.deepEqual(blocked,['1.4.1','1.4.3']);assert.deepEqual(request.text.format.schema.properties.actions.properties[blocked[0]].properties.commands,{type:'null'});
 const unsafe=terminalCommandFixture();unsafe.actions[blocked[0]]=terminalBlock(['setup']);assert.throws(()=>validateTerminalCommandSet(unsafe,terminalActionRefs(plan,1),blocked),/undefined scientific/);
 const schema=request.text.format.schema.properties;assert.deepEqual(schema.setup.properties.commands,{type:'null'});assert.deepEqual(schema.setup.properties.kind.enum,['manual']);assert.equal(schema.setup.properties.prerequisites.maxItems,0);
 for(const block of [...Object.values(schema.actions.properties),schema.cleanup])assert.equal(block.properties.prerequisites.items.enum.includes('setup'),false);
});
test('standalone packages reject shared setup and helper dependencies while retaining original legacy packages',()=>{
 const row=terminalFixtureRecord(),refs=terminalActionRefs(row.source_plan,1),set=terminalCommandFixture(),legacy=legacyTerminalCommandFixture();
 assert.equal(validateTerminalCommandSet(set,refs,[],true),set);assert.equal(terminalSetupRequired(set),false);assert.equal(terminalSetupRequired(legacy),true);
 for(const change of [c=>c.setup=terminalBlock(),c=>c.actions[refs[0]].prerequisites=['setup'],c=>c.actions[refs[0]].commands='python3 "$HELPER" run',c=>c.actions[refs[0]].commands='python3 experiment_helper.py run',c=>c.cleanup.commands='source "$JUMPSERVE_WORKSPACE/common.sh"',c=>c.actions[refs[0]].commands="os.readlink(f'/proc/{pid}/exe')"]){const bad=structuredClone(set);change(bad);assert.throws(()=>validateTerminalCommandSet(bad,refs,[],true),/shared|Privileged/);}
 const original={id:'resp_legacy',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(legacy)}]}]};assert.deepEqual(readTerminalCommands(original,{...row,command_layout:LEGACY_TERMINAL_LAYOUT}),legacy);assert.throws(()=>readTerminalCommands(original,row),/shared setup/);
 const local=structuredClone(set);local.actions[refs[0]].commands="python3 - <<'PY'\nfrom pathlib import Path\nPath('own-step.txt').write_text('own inline program')\nPY\n";assert.equal(validateTerminalCommandSet(local,refs,[],true),local);
 const modern=terminalClipboard(local.actions[refs[0]],study,1),old=terminalClipboard(legacy.actions[refs[0]],study,1,LEGACY_TERMINAL_LAYOUT);assert.match(modern,/experiment-1\/per-step-v1/);assert.doesNotMatch(old,/per-step-v1/);assert.match(modern,/PREFIX="p/);assert.match(old,/PREFIX="j/);
 assert.equal(row.command_layout,TERMINAL_COMMAND_LAYOUT);
});
test('all steps are covered and command kinds, input names and prerequisite ordering are validated',()=>{
 const plan=hierarchicalImplementationPlan(),refs=terminalActionRefs(plan,1),commands=terminalCommandFixture();assert.equal(validateTerminalCommandSet(commands,refs),commands);
 for(const change of [c=>delete c.actions[refs[0]],c=>c.actions.extra=terminalBlock(),c=>c.actions[refs[0]].prerequisites=[refs.at(-1)],c=>c.setup.prerequisites=['setup'],c=>c.actions[refs[0]].prerequisites=['setup','setup'],c=>c.actions[refs[0]].commands=null,c=>c.actions[refs[1]].commands='echo invalid',c=>c.actions[refs[1]].needs_sudo=true,c=>c.inputs[0].name='HOME',c=>c.inputs.push(c.inputs[0]),c=>c.setup.commands='x'.repeat(64001),c=>c.actions[refs[0]].commands='sudo tc qdisc replace dev eth0 root netem delay 10ms']){const bad=structuredClone(commands);change(bad);assert.throws(()=>validateTerminalCommandSet(bad,refs));}
 const flat={experiments:[{title:'Legacy',experiment_refs:['experiment-1'],steps:[{}],open_questions:[]}]};assert.deepEqual(terminalActionRefs(flat,1),['1.1']);
 const view={version:'paper-terminal-commands-v1',study_id:study,experiment_index:1,target:'ubuntu-debian',command_layout:'per-step-v1',stage:'ready',command_set:commands,reason:null,generated_at:'2026-11-15T00:00:00Z'};assert.equal(validateTerminalCommandsView(view,study,1,refs),view);assert.throws(()=>validateTerminalCommandsView({...view,stage:'processing'},study,1,refs));
 assert.throws(()=>validateTerminalCommandsView({...view,command_layout:LEGACY_TERMINAL_LAYOUT},study,1,refs),/earlier format/);assert.throws(()=>validateTerminalCommandsView({...view,command_layout:undefined},study,1,refs),/earlier format/);
});
test('clipboard blocks keep quoted scripts intact, isolate workspace names and pass Bash syntax checking without execution',()=>{
 const block=terminalBlock();block.commands="cat <<'JUMPSERVE_COMMAND_BLOCK'\nLiteral $HOME and `not-a-command`\nJUMPSERVE_COMMAND_BLOCK\nprintf '%s\\n' done\n";
 const text=terminalClipboard(block,study,1);assert.ok(text.startsWith("bash <<'JUMPSERVE_COMMAND_BLOCK_END'"));assert.ok(text.includes('export JUMPSERVE_WORKSPACE="$HOME/.local/share/jumpserve/'+study));assert.ok(text.includes(block.commands));assert.equal(spawnSync('/bin/bash',['-n'],{input:text,encoding:'utf8'}).status,0);assert.throws(()=>terminalClipboard(block,'$(danger)',1));assert.throws(()=>terminalClipboard({...block,kind:'manual',commands:null},study,1));
 const prefix=text.match(/JUMPSERVE_NAMESPACE_PREFIX="([a-z0-9]+)"/)[1];assert.ok(prefix.length<=9);assert.ok((prefix+'v_rtr0').length<=15);
 const inputs=terminalInputsClipboard([{name:'JUMPSERVE_PRIVATE_VALUE',description:'No real value.',secret:true}]);assert.match(inputs,/read -r -s -p/);assert.match(inputs,/export JUMPSERVE_PRIVATE_VALUE/);assert.ok(!inputs.includes('bash <<'));assert.throws(()=>terminalInputsClipboard([{name:'$(danger)'}]));
});
function operations(response){
 let row=terminalFixtureRecord(),admitted=false;const calls=[];
 const ops={save:async(op,payload)=>{calls.push([op,payload]);if(op==='generate'){const first=!admitted;admitted=true;return{...row,status:'submitting',admitted:first};}if(op==='submitted')row={...row,status:'processing',provider_response_id:payload.response_id};else if(op==='finish')row={...row,status:'ready',command_set:payload.command_set,generated_at:'2026-11-15T00:00:00Z'};else row={...row,status:op==='cancel'?'cancelled':op};return row;},create:async()=>{calls.push(['model']);return{id:'resp_terminal_fixture',status:'queued'};},retrieve:async()=>response,cancel:async()=>({id:'resp_terminal_fixture',status:'cancelled'})};return{ops,calls,get row(){return row;}};
}
const response=()=>({id:'resp_terminal_fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(terminalCommandFixture())}]}]});
test('concurrent generation admits one original call and polling saves validated commands without execution',async()=>{
 const f=operations(response()),request=terminalCommandsRequest(study,1,hierarchicalImplementationPlan(),implementationBreakdown());await Promise.all([generateTerminalCommands(request,f.ops),generateTerminalCommands(request,f.ops)]);assert.equal(f.calls.filter(c=>c[0]==='model').length,1);assert.equal((await refreshTerminalCommands(f.row,f.ops)).status,'ready');assert.equal(f.calls.at(-1)[0],'finish');
});
test('invalid and incomplete outputs preserve the response and uncertain submissions never repeat inference',async()=>{
 for(const value of [{...response(),status:'incomplete'}, {...response(),output:[{type:'message',content:[{type:'output_text',text:'{}'}]}]}]){const f=operations(value);assert.equal((await refreshTerminalCommands(f.row,f.ops)).status,'failed');assert.equal(f.calls.at(-1)[1].response,value);assert.equal(f.calls.filter(c=>c[0]==='model').length,0);}
 const f=operations(response());f.ops.create=async()=>{f.calls.push(['model']);throw new Error('Unknown submission');};const request=terminalCommandsRequest(study,1,hierarchicalImplementationPlan(),implementationBreakdown());const saved=await generateTerminalCommands(request,f.ops);assert.equal(saved.status,'uncertain');await generateTerminalCommands(request,f.ops);assert.equal(f.calls.filter(c=>c[0]==='model').length,1);await assert.rejects(()=>cancelTerminalCommands(saved,f.ops),/Reconcile/);
});
test('deadlines and cancellations reconcile the original response and refuse changed provider identities',async()=>{
 const f=operations({id:'resp_terminal_fixture',status:'in_progress'});assert.equal((await refreshTerminalCommands({...f.row,deadline_at:'2000-01-01'},f.ops)).status,'cancelled');
 f.ops.retrieve=async()=>({id:'resp_other',status:'completed'});await assert.rejects(()=>refreshTerminalCommands({...f.row,status:'processing'},f.ops),/does not match/);
 assert.throws(()=>readTerminalCommands({...response(),text:{format:{type:'json_schema',name:'unknown'}}},f.row),/format/);
});
