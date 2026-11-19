import assert from 'node:assert/strict';
import {test} from 'node:test';
import {paperAgentRequest,paperAgentTool,PAPER_NORMALIZATION_CONTRACT} from '../lib/paper-agent.ts';
import {advancePaperAgent,requestPaperAgentCancellation,PaperAgentActionLimitError} from '../lib/paper-agent-runner.ts';
import {advancePaperQuality} from '../lib/paper-quality-runner.ts';
import {qualityReviewRequest} from '../lib/paper-quality-model.ts';
import {qualityOperations} from './support/paper-quality-fixture.mjs';
import {agentRow,agentSession,agentOperations} from './support/paper-agent-fixture.mjs';

for(const step of [2,3,4])test(`managed Step ${step} tools edit only the current valid draft and retain frozen inputs`,()=>{
 const row=agentRow(step),original=structuredClone(row);
 const path=step===2?'/breakdown/sections/access/0/description':step===3?'/experiments/0/title':'/setup/notes';
 const value=step===2?row.candidate.breakdown.sections.access[0].description+' Reviewed.':step===3?row.candidate.experiments[0].title+' Reviewed.':row.candidate.setup.notes+' Reviewed.';
 const result=paperAgentTool(row,{name:'apply_patch',arguments:{edits_json:JSON.stringify([{op:'replace',path,value}])}});
 assert.equal(JSON.parse(result.result.output).applied,true);assert.equal(result.checks.passed,true);assert.notDeepEqual(result.candidate,row.agent.candidate);assert.deepEqual(row,original);
 row.agent.candidate=result.candidate;const checked=paperAgentTool(row,{name:'run_validator',arguments:{}});assert.equal(checked.checks.passed,true);
 const request=paperAgentRequest(row);assert.equal(request.agent.model,'gpt-5.4');assert.equal(request.agent.reasoning.effort,'medium');assert.deepEqual(request.environment,{type:'none'});assert.ok(!request.spend_control);assert.ok(!request.agent.tools.some(tool=>['mcp','web_search','computer_use'].includes(tool.type)));
});
test('draft patches reject unsafe paths, immutable evidence identity, arbitrary execution and partial invalid batches',()=>{
 const row=agentRow(),before=structuredClone(row);
 for(const path of ['/breakdown/source_id','/confirmed_breakdown','/breakdown/sections/access/0/__proto__/polluted','/breakdown/sections/access/0/constructor/prototype/x','/breakdown/sections/access/0/~3bad']){
  const result=paperAgentTool(row,{name:'apply_patch',arguments:{edits_json:JSON.stringify([{op:'replace',path,value:'bad'}])}});assert.equal(result.result.success,false);
 }
 assert.equal(paperAgentTool(row,{name:'execute_sql',arguments:{sql:'example'}}).result.success,false);
 const result=paperAgentTool(row,{name:'apply_patch',arguments:{edits_json:JSON.stringify([{op:'replace',path:'/breakdown/sections/access/0/description',value:'Updated description.'},{op:'replace',path:'/breakdown/sections/validate/0/criterion/tolerance',value:'x'.repeat(201)}])}});
 const rejected=JSON.parse(result.result.output);assert.equal(rejected.applied,false);assert.ok(rejected.checks.findings.some(f=>f.explanation.includes('200 characters')));assert.deepEqual(row,before);assert.equal({}.polluted,undefined);
});
test('reviews and managed evidence distinguish normalized storage from raw output contracts',()=>{
 const row=agentRow(),request=qualityReviewRequest(row.source_json);
 assert.ok(request.instructions.includes(PAPER_NORMALIZATION_CONTRACT));assert.equal(request.reasoning.effort,'high');
 assert.equal(paperAgentTool(row,{name:'read_evidence',arguments:{record:'normalization_contract'}}).result.success,true);
 const result=paperAgentTool(row,{name:'record_platform_issue',arguments:{location:'Storage transform',explanation:'The two representations differ.',evidence:'Raw positions become opaque stored IDs.'}});
 assert.equal(JSON.parse(result.result.output).code_changed,false);assert.ok(result.issue);
});
test('GET reconciliation never creates sessions, executes actions or returns provider function results',async()=>{
 const f=agentOperations();await advancePaperAgent(f.state(),f.ops,false);assert.equal(f.events.length,0);
 await advancePaperAgent(f.state(),f.ops,true);assert.equal(f.creations(),1);
 const session=agentSession(f.state());session.status='requires_action';session.required_actions=[{type:'function_call',turn_id:'turn_fixture',call_id:'call_read',name:'read_evidence',arguments:{record:'draft'}}];f.session(session);
 await advancePaperAgent(f.state(),f.ops,false);assert.ok(!f.events.some(e=>e.operation==='result'));assert.equal(f.events.filter(e=>e.operation==='create').length,1);
});
test('uncertain creation reconciles exact saved metadata and never repeats inference',async()=>{
 const f=agentOperations();f.ops.create=async()=>{f.events.push({operation:'lost_create'});throw Error('Lost acknowledgement');};
 let row=await advancePaperAgent(f.state(),f.ops,true);assert.equal(row.status,'uncertain');
 f.found([agentSession(row)]);row=await advancePaperAgent(row,f.ops,true);assert.equal(row.agent.provider_session_id,'sess_fixture');assert.equal(f.events.filter(e=>e.operation==='lost_create').length,1);
 f.found([agentSession(row),agentSession(row,'sess_other')]);const unknown=f.state();unknown.agent.provider_session_id=null;unknown.agent.status='uncertain';await assert.rejects(()=>advancePaperAgent(unknown,f.ops,true),/More than one/);
});
test('a stored patch result survives lost provider acknowledgment without applying the patch twice',async()=>{
 const f=agentOperations();await advancePaperAgent(f.state(),f.ops,true);
 const session=agentSession(f.state());session.status='requires_action';session.required_actions=[{type:'function_call',turn_id:'turn_fixture',call_id:'call_patch',name:'apply_patch',arguments:{edits_json:JSON.stringify([{op:'replace',path:'/breakdown/sections/access/0/description',value:'Use two Linux hosts with a single TCP stream.'}])}}];f.session(session);
 f.resultError(Error('Lost result acknowledgement'));await assert.rejects(()=>advancePaperAgent(f.state(),f.ops,true),/Lost result/);assert.equal(f.state().agent.candidate_version,1);
 f.resultError(null);await advancePaperAgent(f.state(),f.ops,true);assert.equal(f.state().agent.candidate_version,1);assert.equal(f.events.filter(e=>e.operation==='action_result').length,1);assert.equal(f.events.filter(e=>e.operation==='result').length,2);
});
test('finite policies stop before creation and cancellation acceptance is not a terminal outcome',async()=>{
 const f=agentOperations();f.limit(false);await assert.rejects(()=>advancePaperAgent(f.state(),f.ops,true),/finite/);assert.equal(f.creations(),0);
 f.limit(true);await advancePaperAgent(f.state(),f.ops,true);const row=await requestPaperAgentCancellation(f.state(),f.ops);assert.notEqual(row.status,'cancelled');assert.ok(row.agent.cancel_requested_at);
 const session=agentSession(row);session.status='idle';f.session(session);f.turn({id:'turn_fixture',session_id:session.id,subagent_id:null,status:'cancelled'});
 const cancelled=await advancePaperAgent(f.state(),f.ops,true);assert.equal(cancelled.status,'cancelled');assert.ok(!f.events.some(e=>e.operation==='completed'));
});
test('the action guard requests cancellation without marking active work as failed or approved',async()=>{
 const f=agentOperations();await advancePaperAgent(f.state(),f.ops,true);const session=agentSession(f.state());session.status='requires_action';session.required_actions=[{type:'function_call',turn_id:'turn_fixture',call_id:'call_limit',name:'run_validator',arguments:{}}];f.session(session);f.claimError(new PaperAgentActionLimitError());
 const row=await advancePaperAgent(f.state(),f.ops,true);assert.ok(row.agent.cancel_requested_at);assert.equal(row.status,'running');assert.ok(f.events.some(e=>e.operation==='provider_cancel'));
});
test('native completion validates the saved candidate and queues an independent review',async()=>{
 const f=agentOperations();await advancePaperAgent(f.state(),f.ops,true);const session=agentSession(f.state());session.status='idle';f.session(session);f.turn({id:'turn_fixture',session_id:session.id,subagent_id:null,status:'completed'});
 const row=await advancePaperAgent(f.state(),f.ops,false);assert.equal(row.status,'review_pending');assert.equal(row.round,1);assert.ok(f.events.findIndex(e=>e.operation==='controller_checks')<f.events.findIndex(e=>e.operation==='completed'));
 const legacy=qualityOperations(row);legacy.ops.advanceAgent=()=>{throw Error('Completed native work must not restart.');};await advancePaperQuality(row,legacy.ops,true);assert.equal(legacy.requests.length,1);assert.equal(legacy.requests[0].request.reasoning.effort,'high');
});
test('a mismatched provider identity cannot produce an accepted patch or completion',async()=>{
 const f=agentOperations();await advancePaperAgent(f.state(),f.ops,true);const session=agentSession(f.state());session.metadata.submit_token='different';f.session(session);await assert.rejects(()=>advancePaperAgent(f.state(),f.ops,true),/does not match/);assert.ok(!f.events.some(e=>e.operation==='completed'));
});
