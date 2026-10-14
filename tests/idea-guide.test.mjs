import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {emptyIdea} from '../lib/research-ideas.ts';
const hook=registerHooks({resolve(specifier,context,nextResolve){return nextResolve(specifier==='./research-ideas'?new URL('../lib/research-ideas.ts',import.meta.url).href:specifier,context);}});
const {answerQuestion,answered,GUIDE_QUESTIONS,guideProgress,protocolDraft}=await import('../lib/idea-guide.ts');
hook.deregister();
const question=id=>GUIDE_QUESTIONS.find(q=>q.id===id);
const state=plan=>({packets:[{id:'p',document:plan}],current_packet_id:'p',runs:[],campaigns:[],missing:['Candidate protocol'],ready:false});
test('resume chooses missing information and keeps unknowns genuinely empty',()=>{
 const plan={...emptyIdea(),question:'Which condition changes throughput?',hypothesis:'A bounded prediction'};
 const progress=guideProgress(state(plan));assert.equal(progress.unanswered[0].id,'problem');assert.equal(progress.answeredCount,2);assert.equal(progress.canReview,false);
 assert.deepEqual(protocolDraft(plan).questions,[plan.question]);assert.equal(protocolDraft(plan).dates_or_epochs,undefined);assert.equal(protocolDraft(plan).seeds,undefined);
});
test('user answers change only their declared fields and preserve previous protocols',()=>{
 const plan={...emptyIdea(),protocol:{questions:['Old question'],private:{artifact_id:'original'},seeds:{applicable:false,rationale:'No randomization'}}};
 const next=answerQuestion(plan,question('question'),'New question');assert.equal(next.question,'New question');assert.deepEqual(next.protocol.questions,['New question']);assert.deepEqual(next.protocol.private,plan.protocol.private);assert.deepEqual(plan.protocol.questions,['Old question']);
 const dates=answerQuestion(next,question('dates_or_epochs'),'Three future UTC days');assert.equal(dates.protocol.dates_or_epochs,'Three future UTC days');assert.equal(dates.conditions,'');
});
test('inapplicable methods require an explicit flag and a rationale',()=>{
 const plan=emptyIdea();assert.throws(()=>answerQuestion(plan,question('seeds'),'No randomization'),/Choose whether/);assert.throws(()=>answerQuestion(plan,question('seeds'),' ',false),/question open/);
 const next=answerQuestion(plan,question('seeds'),'Deterministic software check; no assignment randomization',false);assert.equal(next.protocol.seeds.applicable,false);assert.equal(answered(next,question('seeds')),true);
});
test('observation budgets cannot become missing zero or fractional limits',()=>{
 for(const n of ['0','1.5','10001','1e2',''])assert.throws(()=>answerQuestion(emptyIdea(),question('max_observations'),n));
 const next=answerQuestion(emptyIdea(),question('max_observations'),'3');assert.equal(next.protocol.resource_limits.max_observations,3);
});
test('data origins and algorithm declarations need explicit user input',()=>{
 assert.throws(()=>answerQuestion(emptyIdea(),question('data_origin'),'unclassified'));
 const next=answerQuestion(emptyIdea(),question('algorithms'),'tool-v1\nanalysis-v2');assert.deepEqual(next.protocol.algorithms,['tool-v1','analysis-v2']);assert.equal(next.protocol.data_origin,undefined);
});
test('a planning recommendation cannot substitute for complete methods or fresh reviews',()=>{
 const s=state(emptyIdea());s.runs=[{id:'coach',task:'planning',packet_id:'p',status:'complete',output:{verdict:'ready',questions:[],findings:[]}}];
 assert.equal(guideProgress(s).canAccept,false);assert.equal(guideProgress(s).canReview,false);
});
test('latest critical review continues to block an otherwise answered experiment',()=>{
 let plan=emptyIdea();for(const q of GUIDE_QUESTIONS)plan=answerQuestion(plan,q,q.format==='integer'?'3':q.format==='origin'?'software-fixture':'Explicit software development fixture declaration',q.format==='applicability'?false:undefined);
 plan.protocol.execution={version:'network-execution-v1',runner:'custom-package-v1'};
 const pass=task=>({id:task,task,packet_id:'p',status:'complete',output:{verdict:'ready',questions:[],findings:[]}});
 const s={...state(plan),missing:[],runs:[pass('comprehension'),pass('critic')]};assert.equal(guideProgress(s).canAccept,true);
 s.runs.push({...pass('critic'),id:'later',output:{verdict:'needs-clarification',questions:['Which dependence structure?'],findings:[{severity:'blocking',field:'dependence',message:'Related observations were treated as independent'}]}});
 assert.equal(guideProgress(s).stage,'resolve');assert.equal(guideProgress(s).canAccept,false);assert.equal(guideProgress(s).blockers.length,1);
});
