import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import * as publicProjection from '../lib/research-public-queue.ts';

globalThis.__statusReact=React;globalThis.__statusProjection=publicProjection;
const statusButton=new URL('../app/components/ui/button.tsx',import.meta.url).href;
const replacements={
 'next/link':"export default function Link(props){return globalThis.__statusReact.createElement('a',props);}",
 '@/app/components/user-preferences':"export const LocalDateTime=({value})=>globalThis.__statusReact.createElement('time',{dateTime:value},value);",
 '@/lib/research-workflow-api':'export const researchRequest=(...args)=>globalThis.__statusRead(...args);',
 '@/app/components/ui/button':`import {Button as Original} from ${JSON.stringify(statusButton)};export function Button(props){globalThis.__statusActions.set(props.children,props);return globalThis.__statusReact.createElement(Original,props);}`,
 // Transport schemas have their own unit suites; these units exercise rendering,
 // pagination and lifetime behavior after the adapter returns validated records.
 '@/lib/research-autonomy':'export const validateTurnHistory=value=>value;export const validateBuilderEvidence=value=>value;',
 '@/lib/research-public-queue':'export const assessmentStatusReason=(...args)=>globalThis.__statusProjection.assessmentStatusReason(...args);export const publicStatusReason=(...args)=>globalThis.__statusProjection.publicStatusReason(...args);export const loadSharedTurnHistory=(...args)=>globalThis.__statusShared(...args);export const loadSharedBuilderEvidence=(...args)=>globalThis.__statusEvidence(...args);',
 './select':"export function ResearchSelect({label,value,options,onChange}){return globalThis.__statusReact.createElement('select',{'aria-label':label,value,onChange:e=>onChange(e.target.value)},options.map(o=>globalThis.__statusReact.createElement('option',{key:o.value,value:o.value},o.label)));}",
};
const hooks=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {AutonomousAssessments,AutonomousAssessmentStatus}=await import('../app/components/research-workflow/autonomous-assessments.tsx');
const {PublicExperimentQueue}=await import('../app/components/research-workflow/public-experiment-queue.tsx');
hooks.deregister();
const ID='11111111-1111-4111-8111-111111111111',TASK='22222222-2222-4222-8222-222222222222',CALL='33333333-3333-4333-8333-333333333333',STAMP='2026-11-08T00:00:00Z';
let history,historyReader,evidenceReader,requests,sharedRequests;
const projection={note:'Shared bounded copy',redacted:1,truncated:0};
beforeEach(t=>{
 globalThis.__statusActions=new Map();
 requests=[];sharedRequests=[];history={turns:[],builder_calls:[],next_before:null,projection};historyReader=async()=>history;evidenceReader=async()=>({fragment:'Original native fragment',next_cursor:null,reason:'Bounded shared evidence'});
 globalThis.__statusRead=(path,options)=>{requests.push([path,options]);return historyReader(path,options);};
 globalThis.__statusShared=(...args)=>{sharedRequests.push(args);return historyReader(...args);};
 globalThis.__statusEvidence=(...args)=>evidenceReader(...args);
 const previous=Object.getOwnPropertyDescriptor(window.HTMLElement.prototype,'scrollIntoView');
 Object.defineProperty(window.HTMLElement.prototype,'scrollIntoView',{configurable:true,value(){}});
 t.after(()=>{if(previous)Object.defineProperty(window.HTMLElement.prototype,'scrollIntoView',previous);else delete window.HTMLElement.prototype.scrollIntoView;});
 window.history.replaceState(null,'','/research-verification/assessment/'+ID);
});afterEach(cleanup);
const click=async name=>act(async()=>{fireEvent.click(screen.getByRole('button',{name,exact:true}));});
const show=async(data=autonomy(),props={})=>{let view;await act(async()=>{view=render(React.createElement(AutonomousAssessments,{data,studyId:ID,titles:new Map([[ID,'Original assessment title']]),...props}));});return view;};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function autonomy(){return {enabled:true,workflows:[{study_id:ID,status:'running',committed_cents:0,max_spend_cents:null,max_attempts:null,deadline_at:STAMP,reason:'Original workflow state',initial_prompt:'Original private paper request',initial_sha256:'a'.repeat(64)}],tasks:[{id:TASK,study_id:ID,claim_id:CALL,claim_title:'Original claim',stage:'building',status:'blocked',attempts:1,label:'inconclusive',reason:'Original retained blocker',required_inputs:['Retained required input'],updated_at:STAMP,evidence_progress:{required_checks:2,completed_checks:0,scope:'Original evidence scope'},repair_progress:{state:'diagnosing',category:'runtime',updated_at:STAMP}}]};}
function turn(number=2){return{id:'turn-'+number,number,study_id:ID,task_id:TASK,stage:'building',status:'complete',created_at:STAMP,model_id:'synthetic-model',reason:number===2?'Original recorded reason':null,reserved_cents:0,estimated_cents:number===2?null:1,request:{retained_zero:0},request_sha256:'a'.repeat(64),prompt_version_id:'original-prompt',raw_response:'Original model response',response_sha256:'b'.repeat(64),output:{original:true},usage:{original:true}};}
function builder(number=1){return{id:CALL+number,task_id:TASK,study_id:ID,number,status:'complete',created_at:STAMP,model_id:'synthetic-model',reserved_cents:number===1?0:1,reason:number===1?'Original call note':null,request_sha256:'c'.repeat(64)};}

test('claim status retains reservations original evidence repair progress and private resume requirements',async()=>{
 await show();assert.ok(screen.getByText('Original assessment title'));assert.ok(screen.getByText('Original private paper request'));assert.ok(screen.getByText('Retained required input'));assert.ok(screen.getByText('Diagnosing'));assert.ok(screen.getByText(/0 \/ 2 retained checks examined/));assert.ok(screen.getByText(/Unlimited budget/));assert.ok(screen.getByText(/Claim inventory coverage is still incomplete/));
 await click('View prompts and responses');assert.ok(screen.getByText(/No turn records were returned/));await click('Hide prompts and responses');assert.equal(screen.queryByText(/No turn records were returned/),null);
});

test('shared claim progress cannot expose private prompts or inputs and preserves preparation coverage',async()=>{
 const data=autonomy();data.access='public-read-only';data.workflows[0].max_attempts=3;data.workflows[0].max_spend_cents=100;
 data.tasks[0]={...data.tasks[0],claim_id:null,claim_title:null,status:'finished',attempts:0,label:null};
 await show(data,{embedded:true});assert.ok(screen.getByText('Claim progress'));assert.equal(screen.queryByText('Original private paper request'),null);assert.equal(screen.queryByText('Retained required input'),null);assert.ok(screen.getByText(/Inventory scope and omissions/));
 await click('View prompts and responses');assert.ok(screen.getByText('No model turn has started. The initial paper request remains recorded.'));assert.equal(requests.length,0);assert.equal(sharedRequests.length,1);
});

test('empty filtered workflows and disabled stale controllers keep status unknown',async()=>{
 let data=autonomy();data.enabled=false;await show(data,{stale:true,studyId:'absent'});assert.ok(screen.getByText('No autonomous assessments in this view.'));assert.ok(screen.getByText(/current progress is unknown/));assert.ok(screen.getByText(/not enabled/));cleanup();
 await show(data,{embedded:true,studyId:'absent'});assert.ok(screen.getByText('Autonomous claim progress is not recorded for this assessment.'));cleanup();render(React.createElement(AutonomousAssessmentStatus,{data:{enabled:true}}));assert.equal(document.body.textContent,'');
});

test('turn history deduplicates older pages and renders exact retained requests and missing charge estimates',async()=>{
 history.turns=[turn()];history.builder_calls=[builder()];history.next_before=2;
 await show();await click('View prompts and responses');assert.ok(screen.getByText('Turn 2 · building · complete'));assert.ok(screen.getByText('Original recorded reason'));assert.ok(screen.getByText(/usage-based estimate unknown/));assert.ok(screen.getByText(/1 values redacted/));
 historyReader=async()=>({turns:[turn(),turn(1)],builder_calls:[builder(),builder(2)],next_before:null});await click('Show older turns');
 assert.equal(screen.getAllByText('Turn 2 · building · complete').length,1);assert.ok(screen.getByText('Turn 1 · building · complete'));assert.ok(screen.getByText(/usage-based estimate \$0.01/));assert.equal(screen.getAllByText('AI call 1 · complete').length,1);assert.ok(screen.getByText('AI call 2 · complete'));assert.equal(screen.queryByRole('button',{name:'Show older turns'}),null);
 assert.ok(requests[1][0].includes('before=2'));
});

test('shared native evidence appends bounded fragments preserves missing fragments and retries failures',async()=>{
 const data=autonomy();data.access='public-read-only';history.builder_calls=[builder()];let count=0;
 evidenceReader=async()=>{count++;if(count===1)throw new Error('Synthetic evidence retrieval failed');return count===2?{fragment:'Retained first fragment',next_cursor:5,reason:'Original bound'}:{fragment:null,next_cursor:null,reason:'Original unavailable remainder'};};
 await show(data);await click('View prompts and responses');await click('Native prompt and tool results');assert.equal(screen.getByRole('alert').textContent,'Synthetic evidence retrieval failed');await click('Retry evidence retrieval');assert.ok(screen.getByText('Retained first fragment'));await click('Read next fragment');assert.ok(screen.getByText('Original unavailable remainder'));assert.equal(screen.getByText('Retained first fragment').textContent,'Retained first fragment');assert.equal(screen.queryByRole('button',{name:'Read next fragment'}),null);
 await click('Native prompt and tool results');assert.equal(screen.queryByText('Retained first fragment'),null);
});

test('private native response reads retain exact task call kind and cursor boundaries',async()=>{
 history.builder_calls=[builder()];await show();await click('View prompts and responses');historyReader=async()=>({fragment:'Private original native response',next_cursor:null,reason:''});await click('Native response and tool calls');
 const url=new URL(requests.at(-1)[0],'https://example.test');assert.equal(url.searchParams.get('task'),TASK);assert.equal(url.searchParams.get('builder_call'),CALL+'1');assert.equal(url.searchParams.get('kind'),'response');assert.equal(url.searchParams.get('cursor'),'0');assert.ok(screen.getByText('Private original native response'));
});

test('unstructured history and older-page failures remain visible without losing prior turns',async()=>{
 historyReader=async()=>{throw 'failure';};await show();await click('View prompts and responses');assert.equal(screen.getByRole('alert').textContent,'Prompt history unavailable.');cleanup();
 historyReader=async()=>({turns:[turn()],builder_calls:[],next_before:2});await show();await click('View prompts and responses');historyReader=async()=>{throw 'older failure';};await click('Show older turns');assert.equal(screen.getByRole('alert').textContent,'Older turns unavailable.');assert.ok(screen.getByText('Turn 2 · building · complete'));
});

test('shared older history retains projection notes and supports legacy pages without native call arrays',async()=>{
 const data=autonomy();data.access='public-read-only';history={turns:[turn()],next_before:2};
 await show(data);await click('View prompts and responses');assert.ok(screen.getByText('Prompt and configuration (shared copy)'));
 historyReader=async()=>({turns:[turn(1)],next_before:1,projection:{...projection,note:'Original older page projection'}});
 await click('Show older turns');assert.ok(screen.getByText(/Original older page projection/));assert.equal(sharedRequests.at(-1)[2],2);
 historyReader=async()=>{throw new Error('Original older page failure');};await click('Show older turns');assert.equal(screen.getByRole('alert').textContent,'Original older page failure');
});
test('duplicate older-history callbacks cannot admit another read while its original page is outstanding',async()=>{
 history.turns=[turn()];history.next_before=2;await show();await click('View prompts and responses');const pending=deferred();let reads=0;historyReader=()=>{reads++;return pending.promise;};await click('Show older turns');await act(async()=>globalThis.__statusActions.get('Show older turns').onClick());assert.equal(reads,1);await act(async()=>pending.resolve({turns:[turn(1)],next_before:null}));assert.ok(screen.getByText('Turn 1 · building · complete'));
});

test('history and native failures retain typed diagnostics and missing optional progress stays missing',async()=>{
 const data=autonomy();data.workflows[0].reason='';data.tasks[0].repair_progress=null;data.tasks[0].evidence_progress=null;
 historyReader=async()=>{throw new Error('Original history failure');};await show(data,{titles:new Map()});assert.ok(screen.getByText('Paper assessment'));await click('View prompts and responses');assert.equal(screen.getByRole('alert').textContent,'Original history failure');cleanup();
 historyReader=async()=>({turns:[],next_before:null,builder_calls:[builder()]});const shared=autonomy();shared.access='public-read-only';await show(shared);await click('View prompts and responses');evidenceReader=async()=>{throw null;};await click('Native prompt and tool results');assert.equal(screen.getByRole('alert').textContent,'Native evidence unavailable.');
});

test('reopening native evidence during an outstanding request does not start a duplicate retrieval',async()=>{
 const data=autonomy();data.access='public-read-only';history.builder_calls=[builder()];const pending=deferred();let reads=0;evidenceReader=()=>{reads++;return pending.promise;};
 await show(data);await click('View prompts and responses');await click('Native prompt and tool results');await click('Native prompt and tool results');await click('Native prompt and tool results');assert.equal(reads,1);
 await act(async()=>pending.resolve({fragment:'Original sole response',next_cursor:null,reason:''}));assert.ok(screen.getByText('Original sole response'));
});

test('unmounted history reads cannot replace the current claim and request signals are aborted',async()=>{
 for(const failed of [false,true]){const pending=deferred();historyReader=()=>pending.promise;const view=await show();await click('View prompts and responses');assert.ok(screen.getByText('Loading recorded turns…'));view.unmount();assert.equal(requests.at(-1)[1].signal.aborted,true);await act(async()=>{if(failed)pending.reject(new Error('Late failure'));else pending.resolve(history);});assert.equal(screen.queryByRole('alert'),null);}
});

function jobs(){return Array.from({length:24},(_,index)=>({id:'job-'+String(index).padStart(2,'0'),study_id:ID,campaign_title:'Original campaign '+index,status:['queued','running','manual','awaiting-review','reviewed','failed','expired','cancelled'][index%8],readiness:index===0?'blocked':'ready',execution_mode:index%8===2?'manual':'automatic',reason:index===0?'Original dependency blocker':null,run_reason:index===1?'Original incomplete run':null,run_status:index===0?null:index===1?'partial':'complete',run_id:index===0?null:'run-'+index,blockers:index===0?['Original prerequisite']:[],priority:1,created_at:STAMP,updated_at:STAMP}));}

test('public queue keeps failure reasons manual tasks pagination exact links and status filters',async()=>{
 const data={study:{id:ID,title:'Original public paper'},jobs:jobs(),autonomy:{enabled:true,workflows:[],tasks:[]},workers_enabled:false,coverage:{jobs:24}};
 render(React.createElement(PublicExperimentQueue,{studyId:ID,jobId:'job-23',data,error:'Synthetic stale retrieval'}));assert.ok(screen.getByText(/Previously retrieved status may be stale/));assert.ok(screen.getByText(/Showing 20 of 24/));assert.equal(document.querySelector('article[id^="job-"]').id,'job-job-23');await click('Show more jobs');assert.ok(screen.getByText(/Showing 24 of 24/));assert.ok(screen.getAllByText('No failure details were returned by the service.').length>0);assert.ok(screen.getByText('Original incomplete run'));
 await act(async()=>fireEvent.change(screen.getByRole('combobox',{name:'Filter queue by status'}),{target:{value:'manual'}}));assert.ok(screen.getByText('Showing 3 of 3 matching jobs.'));assert.ok(screen.getAllByText(/Requires an operator/).length===3);assert.ok(screen.getAllByRole('link',{name:'Link to this job'}).every(link=>link.getAttribute('href').includes('/assessment/'+ID+'?job=')));
});

test('public queue missing data empty filters and unknown requested jobs stay explicit',async()=>{
 const data={study:{id:ID,title:'Paper'},jobs:[],autonomy:{enabled:true,workflows:[],tasks:[]},workers_enabled:true,coverage:{jobs:0}};
 const view=render(React.createElement(PublicExperimentQueue,{studyId:ID,jobId:'absent',data,error:''}));assert.ok(screen.getByText('No experiment jobs recorded yet.'));assert.ok(screen.getByText(/requested job was not returned/));view.rerender(React.createElement(PublicExperimentQueue,{studyId:ID,data:null,error:''}));assert.ok(screen.getByText('Loading shared experiment status…'));view.rerender(React.createElement(PublicExperimentQueue,{studyId:ID,data:null,error:'Synthetic failure'}));assert.match(screen.getByRole('alert').textContent,/Queue counts and current status are unknown/);
});

test('public queue scrolls to an explicitly requested fragment only once after its recorded job exists',t=>{
 const previous=window.location.href;t.after(()=>window.history.replaceState({},'',previous));window.history.replaceState({},'','#job-job-23');const scroll=t.mock.method(HTMLElement.prototype,'scrollIntoView',()=>{});const data={study:{id:ID,title:'Original public paper'},jobs:jobs(),autonomy:{enabled:true,workflows:[],tasks:[]},workers_enabled:true,coverage:{jobs:24}};const view=render(React.createElement(PublicExperimentQueue,{studyId:ID,jobId:'job-23',data,error:''}));assert.equal(scroll.mock.callCount(),1);assert.equal(scroll.mock.calls[0].this.id,'job-job-23');assert.deepEqual(scroll.mock.calls[0].arguments,[{block:'start'}]);view.rerender(React.createElement(PublicExperimentQueue,{studyId:ID,jobId:'job-23',data:{...data},error:''}));assert.equal(scroll.mock.callCount(),1);
});
test('queue filters distinguish no matching jobs from empty history and missing run status stays unavailable',async()=>{
 const rows=[{...jobs()[0],status:'failed',reason:null,run_id:'retained-run',run_status:null}];const data={study:{id:ID,title:'Original'},jobs:rows,coverage:{jobs:rows.length},workers_enabled:true,autonomy:{enabled:true,workflows:[],tasks:[]}};render(React.createElement(PublicExperimentQueue,{studyId:ID,data,error:''}));assert.ok(screen.getByText('No failure details were returned by the service.'));await act(async()=>fireEvent.change(screen.getByRole('combobox',{name:'Filter queue by status'}),{target:{value:'manual'}}));assert.ok(screen.getByText('No jobs match this filter.'));cleanup();
});

test('a running public job with missing run status does not invent a failure',()=>{
 const row={...jobs()[0],status:'running',reason:null,run_reason:null,run_status:null};
 render(React.createElement(PublicExperimentQueue,{studyId:ID,data:{study:{id:ID,title:'Original'},jobs:[row],coverage:{jobs:1},autonomy:{enabled:true,workflows:[],tasks:[]},workers_enabled:true},error:''}));
 assert.equal(screen.queryByText('No failure details were returned by the service.'),null);
});
