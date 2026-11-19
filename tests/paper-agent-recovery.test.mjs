import assert from 'node:assert/strict';
import {test} from 'node:test';
import {agentRow,agentSession,agentOperations} from './support/paper-agent-fixture.mjs';
import {qualityOperations} from './support/paper-quality-fixture.mjs';
import {paperAgentTool,paperAgentRequest} from '../lib/paper-agent.ts';
import {advancePaperAgent,requestPaperAgentCancellation} from '../lib/paper-agent-runner.ts';
import {advancePaperQuality} from '../lib/paper-quality-runner.ts';
import {deterministicQualityChecks} from '../lib/paper-quality-checks.ts';

const patch=(row,edits)=>paperAgentTool(row,{name:'apply_patch',arguments:{edits_json:JSON.stringify(edits)}});
const replace=(path,value)=>({op:'replace',path,value});
test('regression: 405-character description and 879-character source quote report exact paths and limits; rejection is atomic',()=>{
 const row=agentRow(),original=structuredClone(row);
 const path='/breakdown/sections/data/0';
 const result=patch(row,[replace('/breakdown/sections/access/0/description','A valid improvement.'),replace(path+'/description','x'.repeat(405)),replace(path+'/quote','x'.repeat(879))]);
 const out=JSON.parse(result.result.output);
 assert.equal(out.applied,false);assert.equal(result.candidate,undefined);assert.deepEqual(row,original);
 for(const [field,actual,limit]of [['description',405,400],['quote',879,800]])assert.ok(out.diagnostics.some(d=>d.path===path+'/'+field&&d.actual===actual&&d.limit===limit));
 assert.ok(out.checks.findings.some(f=>f.location===path+'/description'&&f.explanation.includes('405')));
 assert.match(out.failure_signature,/^[a-f0-9]{64}$/);
 const fixed=patch(row,[replace(path+'/description','x'.repeat(393))]);assert.equal(JSON.parse(fixed.result.output).applied,true);
});
test('diagnostics count Unicode code points using the same bound as storage',()=>{
 const row=agentRow(),path='/breakdown/sections/access/0/description';
 assert.equal(JSON.parse(patch(row,[replace(path,'🧪'.repeat(400))]).result.output).applied,true);
 assert.equal(JSON.parse(patch(row,[replace(path,'🧪'.repeat(401))]).result.output).diagnostics.find(d=>d.path===path).actual,401);
});
for(const step of [2,3,4])test(`Step ${step} exposes stored field limits and precise rejected-field diagnostics`,()=>{
 const row=agentRow(step),path=step===2?'/breakdown/sections/access/0/description':step===3?'/experiments/0/title':'/setup/notes',limit=step===2?400:step===3?200:1200;
 const output=JSON.parse(patch(row,[replace(path,'x'.repeat(limit+5))]).result.output);
 assert.equal(output.applied,false);assert.ok(output.diagnostics.some(d=>d.path===path&&d.limit===limit&&d.actual===limit+5));
 const contract=paperAgentTool(row,{name:'read_evidence',arguments:{record:'field_limits'}});assert.equal(JSON.parse(contract.result.output).detail.description,400);
 const request=paperAgentRequest(row);assert.equal(JSON.parse(request.input).max_actions,24);assert.equal(JSON.parse(request.input).edit_actions,22);assert.match(request.agent.instructions,/Three identical failures/);
});
test('targeted evidence reads return only a requested item, field or PDF page, preserving missing values and zero',()=>{
 const row=agentRow();
 for(const [record,path,expected]of [['draft','/breakdown/sections/data/0',row.agent.candidate.breakdown.sections.data[0]],['draft','/title',null],['paper','/totalPages',row.source_json.paper.totalPages]]){
  const result=paperAgentTool(row,{name:'read_evidence',arguments:{record,path}});assert.equal(result.result.success,true);assert.deepEqual(JSON.parse(result.result.output),expected);
 }
 const page=row.source_json.paper.pages[0],result=paperAgentTool(row,{name:'read_evidence',arguments:{record:'paper',page:page.page}});assert.deepEqual(JSON.parse(result.result.output),page);
 for(const args of [{record:'draft',path:'/__proto__'},{record:'draft',path:'/constructor'},{record:'draft',path:'/breakdown/sections/data/999'},{record:'paper',page:999},{record:'paper',page:1,path:'/pages'},{record:'draft',path:'/~2'}])assert.equal(paperAgentTool(row,{name:'read_evidence',arguments:args}).result.success,false);
});
test('source diagnostics identify quote and citation disagreement without auto-changing retained evidence',()=>{
 const row=agentRow(),path='/breakdown/sections/data/0';
 const result=patch(row,[replace(path+'/citations/0/quote','This sentence is not in the retained paper.')]);
 const out=JSON.parse(result.result.output);assert.ok(out.diagnostics.some(d=>d.path===path+'/citations/0/quote'&&d.code==='quote_mismatch'));assert.ok(out.diagnostics.some(d=>d.code==='primary_citation'));
});
test('Step 3 identifies the offending source reference and Step 4 the incomplete command body',()=>{
 const plan=agentRow(3);const e=plan.agent.candidate.experiments[0],path=e.stages?'/experiments/0/stages/0/steps/0/source_refs':'/experiments/0/steps/0/source_refs';
 assert.ok(JSON.parse(patch(plan,[replace(path,['unknown-9'])]).result.output).diagnostics.some(d=>d.code==='unknown_reference'&&d.path===path+'/0'));
 const scripts=agentRow(4);assert.ok(JSON.parse(patch(scripts,[replace('/setup/commands',"cat <<'CODE'\nunfinished\n")]).result.output).diagnostics.some(d=>d.path==='/setup/commands'&&d.code==='unfinished_heredoc'));
});
for(const step of [2,3,4])test(`Step ${step} repeated failures stop safely and hand an improved checkpoint to a new high-reasoning review`,async()=>{
 const row=agentRow(step),f=agentOperations(row);await advancePaperAgent(f.state(),f.ops,true);
 const path=step===2?'/breakdown/sections/access/0/description':step===3?'/experiments/0/title':'/setup/notes',limit=step===2?400:step===3?200:1200;
 const run=async(id,value)=>{const session=agentSession(f.state());session.status='requires_action';session.required_actions=[{type:'function_call',turn_id:'turn_fixture',call_id:id,name:'apply_patch',arguments:{edits_json:JSON.stringify([replace(path,value)])}}];f.session(session);return advancePaperAgent(f.state(),f.ops,true);};
 await run('save-first','A source-compatible draft improvement.');
 for(let i=1;i<=3;i++)await run('bad-'+i,'x'.repeat(limit+5));
 assert.equal(f.state().agent.repeated_failures,3);assert.equal(f.state().agent.stop_code,'no_progress');assert.equal(f.state().agent.candidate_version,1);
 const second=f.events.filter(e=>e.operation==='action_result')[2];assert.match(JSON.parse(second.payload.result.output).progress.strategy,/Change strategy/);
 assert.equal(f.events.filter(e=>e.operation==='result').length,3); // saved edit + first two rejects; final reject not ACKed
 assert.equal(f.state().status,'running');assert.ok(f.events.some(e=>e.operation==='provider_cancel'));
 const session=agentSession(f.state());session.status='idle';f.session(session);f.turn({id:'turn_fixture',session_id:session.id,subagent_id:null,status:'cancelled'});
 const done=await advancePaperAgent(f.state(),f.ops,false);assert.equal(done.status,'review_pending');assert.equal(done.round,1);assert.equal(done.agent.status,'cancelled');assert.equal(done.call.status,'completed');
 assert.ok(f.events.findIndex(e=>e.operation==='controller_checks')<f.events.findIndex(e=>e.operation==='checkpoint'));
 const review=qualityOperations(done);await advancePaperQuality(done,review.ops,true);assert.equal(review.requests[0].request.reasoning.effort,'high');
 if(step===4)assert.ok(review.requests[0].request.tools.some(t=>t.type==='code_interpreter'));
});
test('saved progress resets the failure streak; changed failures are not treated as an identical loop',()=>{
 const row=agentRow(),path='/breakdown/sections/access/0/description';
 const a=JSON.parse(patch(row,[replace(path,'x'.repeat(405))]).result.output);row.agent.failure_signature=a.failure_signature;row.agent.repeated_failures=2;
 const b=JSON.parse(patch(row,[replace(path,'x'.repeat(404))]).result.output);assert.notEqual(a.failure_signature,b.failure_signature);assert.equal(b.progress.repeated_failures,1);
});
for(const reason of ['owner','deadline','policy','unchanged','legacy'])test(`checkpoint recovery cannot bypass ${reason} stops or policy`,async()=>{
 const row=agentRow(),f=agentOperations(row);await advancePaperAgent(f.state(),f.ops,true);
 let pending=f.state();pending.agent.actions_used=22;pending.agent.candidate_version=1;pending.agent.candidate.title='An improved title';
 // Use a fresh fixture to persist the prepared local checkpoint state.
 if(reason==='legacy')pending.agent.recovery_version=null;
 if(reason==='unchanged')pending.agent.candidate=pending.agent.initial_candidate;
 if(reason==='deadline')pending.agent.deadline_at='2020-01-01T00:00:00Z';
 const g=agentOperations(pending);g.session(agentSession(pending));if(reason==='policy')g.limit(false);
 if(reason==='owner')await requestPaperAgentCancellation(g.state(),g.ops);
 else if(reason!=='legacy')await advancePaperAgent(g.state(),g.ops,true);
 const session=agentSession(g.state());session.status='idle';g.session(session);g.turn({id:'turn_fixture',session_id:session.id,subagent_id:null,status:'cancelled'});
 const stopped=await advancePaperAgent(g.state(),g.ops,false);
 assert.equal(g.events.some(e=>e.operation==='checkpoint'),false);assert.equal(stopped.status,reason==='owner'?'cancelled':'needs_attention');
});
test('no saved improvement means an automatic stop needs attention, not user cancellation',async()=>{
 const row=agentRow();row.agent.actions_used=22;const f=agentOperations(row);await advancePaperAgent(f.state(),f.ops,true);await advancePaperAgent(f.state(),f.ops,true);
 const session=agentSession(f.state());session.status='idle';f.session(session);f.turn({id:'turn_fixture',session_id:session.id,subagent_id:null,status:'cancelled'});
 const result=await advancePaperAgent(f.state(),f.ops,false);assert.equal(result.status,'needs_attention');assert.match(result.reason,/action limit/);assert.equal(deterministicQualityChecks(result.source_json).passed,true);
});
test('new managed admissions explicitly freeze recovery version 1 after the capability check',async()=>{
 const row=agentRow();row.status='repair_pending';row.call=null;row.agent=null;
 const payloads=[];let ready=false;
 const ops={repairRuntime:'managed-agents-v1',agentReady:async()=>{ready=true;},advanceAgent:async next=>next,save:async(operation,payload)=>{
  if(operation==='context')return row;
  assert.equal(operation,'admit');assert.equal(ready,true);payloads.push(payload);
  return {...row,admitted:true,status:'running',call:{kind:'repair',provider_type:'managed_agent'}};
 }};
 await advancePaperQuality(row,ops,true);
 assert.equal(payloads[0].repair_runtime,'managed-agents-v1');assert.equal(payloads[0].repair_recovery_version,1);
});
