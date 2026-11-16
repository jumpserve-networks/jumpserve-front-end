import {TERMINAL_COMMAND_LAYOUT,terminalActionRefs,terminalBlockedActionRefs} from '../../lib/paper-terminal-commands.ts';
import {hierarchicalImplementationPlan,implementationBreakdown} from './implementation-plan-fixture.mjs';
export {hierarchicalImplementationPlan,implementationBreakdown};
export const terminalBlock=(prerequisites=[])=>({kind:'terminal',commands:'printf "%s\\n" "Synthetic software fixture. No experiment ran." > fixture.txt',prerequisites,verification:'The synthetic fixture file exists.',notes:'Exposed software fixture only, not generated experiment commands.',needs_sudo:false});
export function terminalCommandFixture(plan=hierarchicalImplementationPlan(),index=1){
 const refs=terminalActionRefs(plan,index);
 const blocked=terminalBlockedActionRefs(plan,index,implementationBreakdown());
 return{setup:{kind:'manual',commands:null,prerequisites:[],verification:'Each action supplies its own code.',notes:'No shared setup script is needed.',needs_sudo:false},actions:Object.fromEntries(refs.map((ref,i)=>[ref,blocked.includes(ref)?{kind:'blocked',commands:null,prerequisites:[],verification:'A frozen pre-observation criterion is required.',notes:'The confirmed scientific acceptance rule is undefined.',needs_sudo:false}:i===1?{kind:'manual',commands:null,prerequisites:[],verification:'Human review is recorded.',notes:'Review the supplied scientific criterion.',needs_sudo:false}:i===2?{kind:'blocked',commands:null,prerequisites:[],verification:'A supported import contract is required.',notes:'Operator measurement ingestion is not configured.',needs_sudo:false}:terminalBlock(i?[refs[0]]:[])])),cleanup:terminalBlock([refs[0]]),inputs:[{name:'JUMPSERVE_EXAMPLE_INPUT',description:'A synthetic software input name, with no credential value.',secret:false}]};
}
export function legacyTerminalCommandFixture(){const set=terminalCommandFixture();set.setup=terminalBlock();for(const block of [...Object.values(set.actions),set.cleanup])block.prerequisites=['setup'];return set;}
export function terminalFixtureRecord(){
 const plan=hierarchicalImplementationPlan(),request={model:'synthetic',text:{format:{name:'paper_terminal_commands_v1'}}};
 return{study_id:'11111111-1111-4111-8111-111111111111',owner_id:'owner',experiment_index:1,command_layout:TERMINAL_COMMAND_LAYOUT,status:'processing',source_plan:plan,confirmed_breakdown:implementationBreakdown(),request,provider_response_id:'resp_terminal_fixture',submit_token:'token',updated_at:'2099-01-01T00:00:00Z',deadline_at:'2099-01-02T00:00:00Z',command_set:null,reason:null,generated_at:null};
}
