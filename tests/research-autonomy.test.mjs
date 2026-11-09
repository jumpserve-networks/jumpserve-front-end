import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTurnHistory, isAssessmentDefaultBudget, validRepairProgress } from '../lib/research-autonomy.ts';
const id='10000000-0000-4000-8000-000000000001',taskId='10000000-0000-4000-8000-000000000002';

test('shared budget authority distinguishes an explicit unlimited grant from absent or finite limits',()=>{
 const policy={version:'autonomy-category-budgets-v1',category:'research_assessment',revision:1,max_spend_cents:-1,max_model_calls:-1};
 assert.equal(isAssessmentDefaultBudget(null,'research-autonomy-v3',policy),true);
 assert.equal(isAssessmentDefaultBudget(undefined,'research-autonomy-v3',policy),false);
 assert.equal(isAssessmentDefaultBudget(0,'research-autonomy-v3',{...policy,max_spend_cents:0}),true);
 assert.equal(isAssessmentDefaultBudget(null,'research-autonomy-v2',policy),false);
});
test('missing or malformed operational progress cannot imply a completed repair',()=>{
 for(const value of [null,[],42,'resolved'])assert.equal(validRepairProgress(value),false);
});
test('prompt history is scoped to owner study and task with declared pagination',()=>{
 const turn={id,study_id:id,task_id:taskId,number:1,stage:'planning',prompt_version_id:id,model_id:'fixed-model',request:{system:[{text:'Exact prompt'}]},request_sha256:'b'.repeat(64),status:'failed',reserved_cents:50,estimated_cents:null,raw_response:null,response_sha256:null,output:null,usage:{measured_charges_usd:null},reason:'Provider completion unconfirmed',created_at:'2026-10-18T00:00:00Z',ended_at:'2026-10-18T00:00:01Z'};
 const value={version:'research-autonomy-v1',access:'owner-private',study_id:id,task_id:taskId,turns:[turn],next_before:null,coverage:{returned:1,total:1}};
 assert.equal(validateTurnHistory(value,id,taskId).turns[0].estimated_cents,null);
 assert.throws(()=>validateTurnHistory(value,taskId,id),/another claim/);
 value.turns[0].status='complete';assert.throws(()=>validateTurnHistory(value,id,taskId),/Invalid retained prompt/);
 value.turns[0].raw_response='Original complete response';assert.throws(()=>validateTurnHistory(value,id,taskId),/Invalid retained prompt/);
 value.turns[0].output={retained:true};value.turns[0].estimated_cents=1;assert.equal(validateTurnHistory(value,id,taskId).turns[0].estimated_cents,1);
 value.turns[0].estimated_cents=-1;assert.throws(()=>validateTurnHistory(value,id,taskId),/Invalid retained prompt/);
});
test('history counts and page cursors support hundreds of turns without relaxing identity checks',()=>{
 const turn={id,study_id:id,task_id:taskId,number:990,stage:'planning',prompt_version_id:id,model_id:'fixed-model',request:{},request_sha256:'b'.repeat(64),status:'failed',reserved_cents:1,estimated_cents:null,raw_response:null,output:null,created_at:'2026-10-18T00:00:00Z'};
 const value={version:'research-autonomy-v3',access:'owner-private',study_id:id,task_id:taskId,turns:[turn],next_before:990,coverage:{returned:1,total:1000}};
 assert.equal(validateTurnHistory(value,id,taskId).next_before,990);
 for(const number of [-1,0,1001,1.5,Infinity]){turn.number=number;assert.throws(()=>validateTurnHistory(value,id,taskId));}
 turn.number=990;value.next_before=1001;assert.throws(()=>validateTurnHistory(value,id,taskId));
});
