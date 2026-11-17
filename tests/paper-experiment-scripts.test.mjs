import assert from 'node:assert/strict';
import {test} from 'node:test';
import {experimentScriptsFixture,experimentScriptsRecord,hierarchicalImplementationPlan,implementationBreakdown} from './support/experiment-scripts-fixture.mjs';
import {assertCompleteCommandBody,validateExperimentScripts,experimentScriptsInput} from '../lib/paper-experiment-scripts.ts';
import {experimentScriptsRequest} from '../lib/paper-experiment-scripts-model.ts';
import {paperModelRequest} from '../lib/paper-intake-model.ts';
import {experimentPlanRequest} from '../lib/paper-experiment-plan-model.ts';
import {evidencePaper} from './support/paper-evidence-fixture.mjs';
import {readTerminalCommands} from '../lib/paper-terminal-commands-runner.ts';
import {parsePaperModelOutput} from '../lib/paper-model-output.ts';
import {terminalClipboard,SHARED_TERMINAL_LAYOUT} from '../lib/paper-terminal-commands.ts';
const plan=hierarchicalImplementationPlan(),breakdown=implementationBreakdown(),record=experimentScriptsRecord();
const response=set=>({id:'resp_shared_fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(set)}]}]});
test('all assessment stages use pinned GPT-5.4 with medium reasoning',()=>{
 for(const request of [paperModelRequest(evidencePaper),experimentPlanRequest(breakdown),experimentScriptsRequest(record.study_id,1,plan,breakdown)]){
  assert.equal(request.model,'gpt-5.4-2026-03-05');assert.deepEqual(request.reasoning,{effort:'medium'});assert.equal(request.background,true);assert.equal(request.store,true);
 }
 assert.equal(paperModelRequest(evidencePaper).max_output_tokens,32768);assert.equal(experimentPlanRequest(breakdown).max_output_tokens,32768);
});
test('Step 4 requests exactly one shared setup and all saved numbered commands',()=>{
 const request=experimentScriptsRequest(record.study_id,1,plan,breakdown),schema=request.text.format.schema;
 assert.deepEqual(JSON.parse(request.input),experimentScriptsInput(record.study_id,1,plan,breakdown));
 assert.equal(request.text.format.name,'paper_experiment_scripts_v1');assert.equal(request.text.format.strict,true);assert.equal(request.max_output_tokens,64000);
 assert.equal(schema.properties.setup.properties.commands.maxLength,200000);
 assert.equal(schema.properties.actions.properties['1.1.1'].properties.commands.maxLength,16000);
 assert.deepEqual(schema.properties.actions.required,Object.keys(experimentScriptsFixture().actions));
 assert.match(request.instructions,/experiment_helper\.py/);assert.match(request.instructions,/shared setup/i);
 assert.deepEqual(readTerminalCommands(response(experimentScriptsFixture()),record),experimentScriptsFixture());
});
test('shared setup can exceed the former per-step cap and helper invocations require setup',()=>{
 const set=experimentScriptsFixture();set.setup.commands='printf shared\n'+'#'.repeat(80000);assert.doesNotThrow(()=>validateExperimentScripts(set,plan,breakdown,1));
 set.setup.commands='#'.repeat(200001);assert.throws(()=>validateExperimentScripts(set,plan,breakdown,1));
 for(const mutate of [s=>s.setup.commands='#'.repeat(65000)+'\nsudo tc qdisc add dev eth0 root netem delay 1ms',s=>s.setup.commands='🙂'.repeat(70000),s=>s.actions['1.1.1'].prerequisites=[],s=>s.setup.prerequisites=['1.1.1'],s=>s.cleanup.prerequisites=[],s=>s.actions['1.1.1'].commands="cat > helper.py <<'PY'\nprint('unfinished')",s=>s.actions['1.1.1'].commands="os.readlink(f'/proc/{pid}/exe')",s=>s.actions['1.4.3']={...s.actions['1.1.1']},s=>s.actions['1.1.1'].prerequisites=['setup','1.4.3']]){
  const invalid=experimentScriptsFixture();mutate(invalid);assert.throws(()=>validateExperimentScripts(invalid,plan,breakdown,1));
 }
});
test('complete script detection accepts quoted, tab-indented and multiple successive heredocs',()=>{
 for(const body of ['cat <<\'PY\'\nprint(1)\nPY', 'cat <<-"PY"\n\tprint(1)\n\tPY', 'cat <<PY\na\nPY\ncat <<SH\nb\nSH', 'x=$((1 << 2))', 'cat <<< "value"'])assert.doesNotThrow(()=>assertCompleteCommandBody(body),body);
 for(const body of ["cat <<'PY'\nprint(1)",'cat <<PY\nPY ', 'cat <<PY\na\nPY\ncat <<SH\nb'])assert.throws(()=>assertCompleteCommandBody(body),/unfinished/);
});
test('a NUL model string is rejected before JSONB persistence without changing raw output',()=>{
 const raw=JSON.stringify({value:'a\u0000b'}),original=raw;assert.throws(()=>parsePaperModelOutput(raw),/NUL/);assert.equal(raw,original);assert.deepEqual(parsePaperModelOutput('{"safe":0}'),{safe:0});
});
test('Step 4 clipboard uses a separate shared workspace and retains exact command content',()=>{
 const set=experimentScriptsFixture(),copy=terminalClipboard(set.setup,record.study_id,1,SHARED_TERMINAL_LAYOUT);
 assert.match(copy,/experiment-1\/shared-setup-v2/);assert.ok(copy.includes(set.setup.commands));assert.match(copy,/JUMPSERVE_NAMESPACE_PREFIX="s/);
});
