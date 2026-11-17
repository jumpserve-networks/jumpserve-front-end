import {legacyTerminalCommandFixture,hierarchicalImplementationPlan,implementationBreakdown,terminalFixtureRecord} from './terminal-command-fixture.mjs';
import {SHARED_TERMINAL_LAYOUT} from '../../lib/paper-terminal-commands.ts';
import {EXPERIMENT_SCRIPTS_VERSION} from '../../lib/paper-experiment-scripts.ts';
export {hierarchicalImplementationPlan,implementationBreakdown};
export function experimentScriptsFixture(){
 const set=legacyTerminalCommandFixture();
 set.setup.commands=`cat > experiment_helper.py <<'JUMPSERVE_PY'
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['fixture'])
parser.parse_args()
print('Synthetic software fixture only; no experiment or measurement.')
JUMPSERVE_PY
python3 experiment_helper.py fixture`;
 set.setup.notes='Shared helper for exposed software tests only.';
 for(const block of [...Object.values(set.actions),set.cleanup])if(block.kind==='terminal')block.commands='python3 experiment_helper.py fixture';
 return set;
}
export function experimentScriptsRecord(){return{...terminalFixtureRecord(),command_layout:SHARED_TERMINAL_LAYOUT,request:{text:{format:{name:'paper_experiment_scripts_v1'}}}};}
export function experimentScriptsView(study,stage='ready',prior_pending=0){return{version:EXPERIMENT_SCRIPTS_VERSION,study_id:study,experiment_index:1,command_layout:SHARED_TERMINAL_LAYOUT,target:'ubuntu-debian',stage,command_set:stage==='ready'?experimentScriptsFixture():null,reason:null,generated_at:stage==='ready'?'2026-11-16T12:00:00Z':null,prior_pending};}
