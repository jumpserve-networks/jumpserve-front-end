import assert from 'node:assert/strict';
import test from 'node:test';
import {browserTimeZone,calendarDay,formatDateTime} from '../lib/date-time.ts';
import {isGoogleAuthenticatedUser} from '../lib/auth-provider.ts';
import {assessmentName,treatmentName} from '../lib/delay-study.ts';
import {workerHeartbeat} from '../lib/platform-worker-heartbeat.ts';
import {normalizeReliable} from '../lib/reliable-study.ts';
import {defaultRealWorldConfig,realWorldTrafficPhase,validateRealWorldConfig} from '../lib/real-world.ts';
import {realWorldProgress} from '../lib/real-world-progress.ts';
import {benchmarkStatusMessage} from '../lib/benchmark-progress.ts';
import {answerQuestion,GUIDE_QUESTIONS} from '../lib/idea-guide.ts';
import {emptyIdea,normalizedJson} from '../lib/research-ideas.ts';
import {reviewSources} from '../lib/idea-review-sources.ts';
import {parseProfile} from '../lib/profile.ts';
import {consumeGapRunIntent,runGapExperiments} from '../lib/research-gap-run.ts';
import {saveClaimDesignIntent} from '../lib/research-claim-design.ts';
import {assessmentTaskStage} from '../lib/research-assessment-progress.ts';
import {StudyQueryError} from '../lib/delay-study-read.ts';
import {csvCell} from '../lib/http2-study.ts';
import {isModuleSectionActive} from '../lib/test-modules.ts';

test('display fallbacks preserve missing dates and unknown recorded labels',()=>{
 assert.equal(calendarDay(null,'UTC'),null);
 assert.equal(calendarDay(0,'invalid'),'1970-01-01');
 assert.equal(formatDateTime(0,'invalid'),formatDateTime(0,'UTC'));
 assert.equal(treatmentName('new_treatment'),'new treatment');
 assert.equal(assessmentName('new-assessment'),'new-assessment');
 assert.equal(assessmentTaskStage({stage:'unknown'}),'Stage not recorded');
 assert.equal(new StudyQueryError('Permission denied').retryable,false);
 assert.match(benchmarkStatusMessage({status:'terminated'}),/terminated before/);
 assert.match(benchmarkStatusMessage({status:'unrecognized'}),/recognized benchmark status/);
 assert.equal(csvCell({recorded:0}),'"{""recorded"":0}"');
 assert.equal(isModuleSectionActive({href:'/paper',paths:[]},'/unrelated'),false);
 assert.equal(isModuleSectionActive({href:'/paper',paths:[],descendantPaths:['/child']},'/child/detail'),true);
 assert.equal(isModuleSectionActive({href:'/paper',paths:[],descendantPaths:['/child']},'/unrelated'),false);
 assert.equal(normalizedJson({items:[{z:0,a:null}]}),'{"items":[{"a":null,"z":0}]}');
 assert.equal(realWorldTrafficPhase({status:'future-stage'},100,100).label,'future-stage');
 for(const status of ['pending','launching','installing','cloning','running','failed'])assert.ok(benchmarkStatusMessage({status}).length>10);
});

test('an unavailable browser zone falls back to UTC',t=>{
 const original=Intl.DateTimeFormat;
 t.mock.method(Intl,'DateTimeFormat',function(...args){return args.length?new original(...args):{resolvedOptions:()=>({timeZone:'unknown-zone'})};});
 assert.equal(browserTimeZone(),'UTC');
});

test('Google identities include verified provider arrays and malformed profiles fail explicitly',()=>{
 assert.equal(isGoogleAuthenticatedUser({app_metadata:{providers:['email','google']}}),true);
 for(const value of [null,undefined,'profile',0])assert.throws(()=>parseProfile(value,'user'),/response is invalid/);
 const config=defaultRealWorldConfig();
 for(const node of [config.server,config.bottleneck,...config.receivers])Object.assign(node,{region:'us-east-1',zone_id:'use1-az1'});
 config.notes='x'.repeat(4001);assert.match(validateRealWorldConfig(config),/4,000/);
 assert.deepEqual(normalizeReliable({requested_resources:{budget_bytes:'retain original'},actual_resources:{n:'also original'}}),{requested_resources:{budget_bytes:'retain original'},actual_resources:{n:'also original'}});
});

test('recorded completion time takes priority over an earlier current stage',()=>{
 const progress=realWorldProgress({status:'provisioning',status_history:[{id:1,status:'configuring',started_at:'2026-01-01T00:00:00Z',completed_at:'2026-01-01T00:00:02Z',outcome:null}]});
 assert.equal(progress.find(row=>row.status==='configuring').state,'completed');
 assert.equal(progress.find(row=>row.status==='configuring').durationSeconds,2);
});

test('answers revise the corresponding frozen protocol fields without overwriting other declarations',()=>{
 const plan={...emptyIdea(),protocol:{questions:['Original'],hypotheses:'Old',controls:['Old'],coverage_limits:'Old',source:'retained'}};
 for(const [id,field,value] of [['hypothesis','hypotheses','New prediction'],['controls','controls',['New control']],['limitations','coverage_limits','New limitation']]){
  const answer=Array.isArray(value)?value[0]:value;
  const next=answerQuestion(plan,GUIDE_QUESTIONS.find(q=>q.id===id),answer);
  assert.deepEqual(next.protocol[field],value);assert.equal(next.protocol.source,'retained');
 }
 assert.throws(()=>answerQuestion(plan,GUIDE_QUESTIONS[0],'x'.repeat(5001)),/5,000/);
});

test('source review supports an explicit missing non-pointer path and unrelated retained events',()=>{
 const packet={id:'packet',version:1,sha256:'a'.repeat(64),document:{}};
 assert.equal(reviewSources({provenance:{tool_events:[null,{name:'other'}]}},packet),null);
 const result=reviewSources({packet_id:'packet',provenance:{tool_events:[{name:'submit_idea_issues',executed:false,source_evidence:{version:'idea-review-sources-v2',packet_sha256:packet.sha256,fields:[{path:'not-a-pointer',present:false,state:'missing',value_sha256:null}]}}]}},packet);
 assert.equal(result.fields[0].state,'missing');
});

test('unreadable local intents do not create work or prevent explicit saved-workspace use',async()=>{
 const removed=[];assert.equal(consumeGapRunIntent({getItem:()=>'{',removeItem:key=>removed.push(key)},'request','study','gap'),null);assert.equal(removed.length,1);
 await assert.rejects(()=>runGapExperiments({choices:[]},'bad',()=>assert.fail('No request permitted'),()=>{}),/no retained runnable plan/);
 const original=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{setItem(){throw new Error('Storage disabled');}}});
 try{assert.doesNotThrow(()=>saveClaimDesignIntent('study'));}
 finally{if(original)Object.defineProperty(globalThis,'sessionStorage',original);else delete globalThis.sessionStorage;}
});

test('a syntactically valid heartbeat whose parsed instant is unavailable stays unknown',t=>{
 t.mock.method(Date,'parse',()=>NaN);
 assert.equal(workerHeartbeat('2026-01-01T00:00:00Z',0).state,'unknown');
});
