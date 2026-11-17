import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {privateDirectory,privateJSON} from '../scripts/lib/paper-evaluation-store.mjs';
import {sha256} from '../lib/paper-intake-model.ts';
import {terminalCommandsRequest} from '../lib/paper-terminal-commands-model.ts';
import {TERMINAL_COMMAND_LAYOUT} from '../lib/paper-terminal-commands.ts';
import {terminalBlock,terminalCommandFixture,terminalFixtureRecord} from './support/terminal-command-fixture.mjs';
import {terminalSyntaxChecks} from '../scripts/lib/terminal-command-checks.mjs';
import {experimentScriptsFixture} from './support/experiment-scripts-fixture.mjs';
import {experimentScriptsRequest} from '../lib/paper-experiment-scripts-model.ts';
import {SHARED_TERMINAL_LAYOUT} from '../lib/paper-terminal-commands.ts';
const args=['--import','./scripts/lib/register-typescript.mjs','scripts/evaluate-terminal-commands.mjs'];
test('Python heredocs are parsed as code without running their top-level statements',()=>{
 const block=terminalBlock();block.commands="cat > helper.py <<'PY'\nraise RuntimeError('This must never execute')\nPY\n";
 const valid=terminalSyntaxChecks([['setup',block]],'11111111-1111-4111-8111-111111111111',1);assert.equal(valid.passed,true);assert.equal(valid.python_syntax.length,1);
 block.commands="cat > helper.py <<'PY'\nif invalid syntax\nPY\n";const invalid=terminalSyntaxChecks([['setup',block]],'11111111-1111-4111-8111-111111111111',1);assert.equal(invalid.syntax[0].passed,true);assert.equal(invalid.python_syntax[0].passed,false);assert.equal(invalid.passed,false);
 block.commands="cat > \"$HELPER\" <<'PY'\n#!/usr/bin/env python3\nraise RuntimeError('Do not run helper')\nPY\npython3 - <<'PY'\nraise RuntimeError('Do not run inline Python')\nPY\n";
 const adjacent=terminalSyntaxChecks([['setup',block]],'11111111-1111-4111-8111-111111111111',1);assert.equal(adjacent.passed,true);assert.equal(adjacent.python_syntax.length,2);
 block.commands="python3 - <<'PY'\ncontent = '''#!/usr/bin/env python3\ndef sh(cmd, capture=True):\n    raise RuntimeError('Do not execute')\nsh([], capture_output=True)\n'''\nraise RuntimeError('Do not execute outer program')\nPY\n";
 const embedded=terminalSyntaxChecks([['setup',block]],'11111111-1111-4111-8111-111111111111',1);assert.equal(embedded.passed,false);assert.equal(embedded.python_syntax[0].programs,2);assert.match(embedded.python_syntax[0].error,/no parameter 'capture_output'/);
 block.commands="python3 - <<'PY'\nvalue = None\ntext = f\"{'' if value is None else value:.6f}\"\nPY\n";
 const missing=terminalSyntaxChecks([['setup',block]],'11111111-1111-4111-8111-111111111111',1);assert.equal(missing.passed,false);assert.match(missing.python_syntax[0].error,/conditional string branch/);
});
test('truncated heredocs fail even when Bash exits zero and staged Python files are parsed',()=>{
 const block=terminalBlock();
 for(const source of ["python3 - <<'PY'\nprint('unfinished')\n","cat > result.json <<'JSON'\n{}\n"]){
  block.commands=source;const result=terminalSyntaxChecks([['1.3.3',block]],'11111111-1111-4111-8111-111111111111',1);
  assert.equal(result.passed,false);assert.ok(result.syntax.some(c=>!c.passed&&/heredoc|here-document/i.test(c.error)));
 }
 block.commands="cat > helper.py.new <<'PY'\nif invalid syntax\nPY\n";
 const invalid=terminalSyntaxChecks([['1.4.1',block]],'11111111-1111-4111-8111-111111111111',1);
 assert.equal(invalid.passed,false);assert.equal(invalid.python_syntax.length,1);assert.equal(invalid.python_syntax[0].passed,false);
 block.commands="cat > helper.py.tmp <<'PY'\nraise RuntimeError('Never execute this')\nPY\n";
 const valid=terminalSyntaxChecks([['1.4.1',block]],'11111111-1111-4111-8111-111111111111',1);
 assert.equal(valid.passed,true);assert.equal(valid.python_syntax.length,1);
});
test('browser-free command evaluations replay frozen provider output and syntax-check without a model or execution',async()=>{
 const fixture=terminalFixtureRecord(),source={study_id:fixture.study_id,plan:fixture.source_plan,confirmed_breakdown:fixture.confirmed_breakdown},request=terminalCommandsRequest(source.study_id,1,source.plan,source.confirmed_breakdown);
 const saved={source,index:1,request,command_layout:TERMINAL_COMMAND_LAYOUT,response:{id:'resp_evaluation_fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(terminalCommandFixture())}]}]}};saved.identity=sha256(JSON.stringify({source,index:1,request,command_layout:TERMINAL_COMMAND_LAYOUT}));
 const name='unit-terminal-'+randomUUID(),directory=join('.test-artifacts/terminal-command-evaluations',name);await privateDirectory(directory);await privateJSON(join(directory,'run.json'),saved);
 const result=spawnSync(process.execPath,[...args,'--replay',name],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);const report=JSON.parse(result.stdout);assert.equal(report.model_calls,0);assert.equal(report.commands_executed,0);assert.equal(report.passed,true);
 saved.source.plan.experiments[0].title='Tampered';await privateJSON(join(directory,'run.json'),saved);
 const tampered=spawnSync(process.execPath,[...args,'--replay',name],{encoding:'utf8',timeout:10000});assert.equal(tampered.status,1);assert.match(tampered.stderr,/inputs changed/);
});
test('an uncertain command evaluation is retained and never resubmitted',async()=>{
 const fixture=terminalFixtureRecord(),source={study_id:fixture.study_id,plan:fixture.source_plan,confirmed_breakdown:fixture.confirmed_breakdown},request=terminalCommandsRequest(source.study_id,1,source.plan,source.confirmed_breakdown),name='unit-terminal-uncertain-'+randomUUID(),directory=join('.test-artifacts/terminal-command-evaluations',name);
 const saved={source,index:1,request,status:'uncertain',token:randomUUID(),identity:sha256(JSON.stringify({source,index:1,request}))};await privateDirectory(directory);await privateJSON(join(directory,'run.json'),saved);
 const result=spawnSync(process.execPath,[...args,'--live','--run',name],{encoding:'utf8',timeout:10000,env:{...process.env,OPENAI_API_KEY:'synthetic-unusable-key'}});assert.equal(result.status,1);assert.match(result.stderr,/will not be repeated/);
});
test('shared-package replay parses the complete setup and invocations while keeping original inputs frozen',async()=>{
 const fixture=terminalFixtureRecord(),source={study_id:fixture.study_id,plan:fixture.source_plan,confirmed_breakdown:fixture.confirmed_breakdown},request=experimentScriptsRequest(source.study_id,1,source.plan,source.confirmed_breakdown),name='unit-shared-'+randomUUID(),directory=join('.test-artifacts/terminal-command-evaluations',name);
 const saved={source,index:1,request,command_layout:SHARED_TERMINAL_LAYOUT,response:{id:'resp_shared_evaluation_fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(experimentScriptsFixture())}]}]}};
 saved.identity=sha256(JSON.stringify({source,index:1,request,command_layout:SHARED_TERMINAL_LAYOUT}));await privateDirectory(directory);await privateJSON(join(directory,'run.json'),saved);
 const replay=spawnSync(process.execPath,[...args,'--shared','--replay',name],{encoding:'utf8',timeout:10000});assert.equal(replay.status,0,replay.stderr);const report=JSON.parse(replay.stdout);assert.equal(report.command_layout,SHARED_TERMINAL_LAYOUT);assert.equal(report.model_calls,0);assert.equal(report.commands_executed,0);assert.equal(report.python_syntax[0].ref,'setup');
 saved.request.reasoning.effort='low';await privateJSON(join(directory,'run.json'),saved);const changed=spawnSync(process.execPath,[...args,'--shared','--replay',name],{encoding:'utf8',timeout:10000});assert.equal(changed.status,1);assert.match(changed.stderr,/inputs changed/);
 const mixed=spawnSync(process.execPath,[...args,'--shared','--step','1.1.1'],{encoding:'utf8',timeout:10000});assert.equal(mixed.status,1);assert.match(mixed.stderr,/not both/);
});
