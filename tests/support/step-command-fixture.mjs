import {terminalActionRefs,terminalBlockedActionRefs} from '../../lib/paper-terminal-commands.ts';
import {hierarchicalImplementationPlan,implementationBreakdown} from './implementation-plan-fixture.mjs';
import {STEP_COMMANDS_VERSION} from '../../lib/paper-step-commands.ts';
export const stepPlan=hierarchicalImplementationPlan,stepBreakdown=implementationBreakdown;
export function stepCommandFixture(ref='1.1.1',plan=stepPlan(),breakdown=stepBreakdown(),index=1){
 const block=kind=>({kind,commands:kind==='terminal'?'printf "Synthetic step fixture\\n"':null,prerequisites:[],verification:'Inspect the synthetic fixture output.',notes:'Software fixture only; never executed.',needs_sudo:false});
 return{setup:block('manual'),actions:{[ref]:block(terminalBlockedActionRefs(plan,index,breakdown).includes(ref)?'blocked':'terminal')},cleanup:block('manual'),inputs:[]};
}
export function stepView(study,ref='1.1.1',stage='ready',plan=stepPlan(),breakdown=stepBreakdown(),index=1){return{version:STEP_COMMANDS_VERSION,study_id:study,experiment_index:index,action_ref:ref,stage,command_set:stage==='ready'?stepCommandFixture(ref,plan,breakdown,index):null,reason:null,generated_at:stage==='ready'?'2026-11-16T12:00:00Z':null};}
export function stepSummary(study,views=new Map(),plan=stepPlan(),index=1){return{version:STEP_COMMANDS_VERSION,study_id:study,experiment_index:index,actions:terminalActionRefs(plan,index).map(ref=>{const v=views.get(ref);return{action_ref:ref,stage:v?.stage??'not_generated',reason:v?.reason??null,generated_at:v?.generated_at??null};})};}
