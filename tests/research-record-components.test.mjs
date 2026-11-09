import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {SHARED_RECORD_KINDS} from '../lib/research-public-queue.ts';
globalThis.__recordReact=React;globalThis.__recordKinds=SHARED_RECORD_KINDS;
const replacements={
 '@/lib/research-public-queue':'export const SHARED_RECORD_KINDS=globalThis.__recordKinds;export const loadSharedRecords=(...args)=>globalThis.__recordRead(...args);',
 './select':"export function ResearchSelect({label,value,options,onChange}){return globalThis.__recordReact.createElement('select',{'aria-label':label,value,onChange:e=>onChange(e.target.value)},options.map(o=>globalThis.__recordReact.createElement('option',{key:o.value,value:o.value},o.label)));}",
 '@/app/components/research-workflow/select':"export function ResearchSelect({label,value,options,onChange}){return globalThis.__recordReact.createElement('select',{'aria-label':label,value,onChange:e=>onChange(e.target.value)},options.map(o=>globalThis.__recordReact.createElement('option',{key:o.value,value:o.value},o.label)));}",
 '@/app/components/research-workflow/observations':"export function ObservationPlots(props){globalThis.__recordPlot=props;return globalThis.__recordReact.createElement('section',{'aria-label':'Recorded observation plots'});}",
};
const hook=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {SharedAssessmentRecords}=await import('../app/components/research-workflow/shared-assessment-records.tsx');const {NumericalComparisons}=await import('../app/components/research-workflow/comparisons.tsx');const {IdeaConversation}=await import('../app/components/research-ideas/idea-conversation.tsx');hook.deregister();
let reads,reader,observers;
beforeEach(t=>{reads=[];observers=[];reader=async()=>page();globalThis.__recordRead=(...args)=>{reads.push(args);return reader(...args);};const descriptor=Object.getOwnPropertyDescriptor(globalThis,'ResizeObserver');Object.defineProperty(globalThis,'ResizeObserver',{configurable:true,value:class{constructor(callback){this.callback=callback;observers.push(this);}observe(value){this.element=value;}disconnect(){this.disconnected=true;}}});t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'ResizeObserver',descriptor);else delete globalThis.ResizeObserver;});});afterEach(cleanup);
const click=async name=>act(async()=>fireEvent.click(screen.getByRole('button',{name,exact:true})));
const choose=async(label,value)=>act(async()=>fireEvent.change(screen.getByRole('combobox',{name:label}),{target:{value}}));
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function page(){return{records:[{id:'original',zero:0,missing:null}],coverage:{returned:1},next_after:'original-cursor',projection:{note:'Bounded shared copy',redacted:1,truncated:0}};}

test('shared records retain zero missing and redaction counts and paginate with exact cursors',async()=>{
 await act(async()=>render(React.createElement(SharedAssessmentRecords,{studyId:'study'})));assert.ok(screen.getByText(/1 records on this page/));assert.ok(screen.getByText(/1 values redacted/));assert.match(document.querySelector('pre').textContent,/"zero": 0/);assert.match(document.querySelector('pre').textContent,/"missing": null/);assert.equal(screen.getByRole('button',{name:'Previous records'}).disabled,true);
 reader=async()=>({...page(),records:[],coverage:{returned:0},next_after:null});await click('Next records');assert.equal(reads.at(-1)[2],'original-cursor');assert.ok(screen.getByText('No records of this kind were returned on this page.'));await click('Previous records');assert.equal(reads.at(-1)[2],undefined);await choose('Recorded information','autonomy_tasks');assert.equal(reads.at(-1)[1],'autonomy_tasks');assert.equal(reads.at(-1)[2],undefined);
});
test('shared record failures remain explicit and retry without treating missing responses as empty collections',async()=>{
 reader=async()=>{throw 'unknown';};await act(async()=>render(React.createElement(SharedAssessmentRecords,{studyId:'study'})));assert.match(screen.getByRole('alert').textContent,/Record coverage is unknown/);reader=async()=>page();await click('Try again');assert.equal(screen.queryByRole('alert'),null);assert.ok(screen.getByText(/1 records on this page/));
});
test('typed shared record failures retain their exact diagnostic',async()=>{
 reader=async()=>{throw new Error('Original shared record failure');};await act(async()=>render(React.createElement(SharedAssessmentRecords,{studyId:'study'})));assert.match(screen.getByRole('alert').textContent,/Original shared record failure/);
});
test('unmounted record page success and failures cannot replace another selection',async()=>{
 for(const failed of [false,true]){const pending=defer();reader=()=>pending.promise;const view=render(React.createElement(SharedAssessmentRecords,{studyId:'study'}));assert.ok(screen.getByText('Loading assessment records…'));view.unmount();assert.equal(reads.at(-1)[3].aborted,true);await act(async()=>{if(failed)pending.reject(new Error('Late stale failure'));else pending.resolve(page());});assert.equal(screen.queryByRole('alert'),null);}
});

function comparisonRows(){return Array.from({length:51},(_,i)=>({id:'observation-'+i,run_id:'run-'+i%2,observation_id:'Original cell '+i,configuration_identity:i%2?'other':'fixed',metric:i%2?'bytes':'latency',units:i%2?'bytes':'ms',published_id:i===0?null:'published',value:i===0?0:2,status:i===2?'missing':'recorded',reason:i===2?'Original missing value':null,details:i===1?null:{published:5,difference:0,replication:0,label:'inconclusive',tolerance_absolute:0}}));}
test('numerical comparisons preserve declared input origins published values zeros and pagination',async()=>{
 const rows=comparisonRows();render(React.createElement(NumericalComparisons,{rows,runs:[{id:'run-0',analysis_version:'matched-numeric-v1',provenance:{data_origin:'archived-data'}},{id:'run-1',analysis_version:'matched-numeric-v1',provenance:null}]}));assert.equal(globalThis.__recordPlot.measurementLabel,'Reproduced');assert.ok(screen.getByText(/archived-data, unclassified/));await click('Next');assert.ok(screen.getByText('Original cell 50'));await click('Previous');await choose('Configuration','fixed');await choose('Metric','bytes');assert.ok(screen.getByText('No observations match these filters.'));
});
test('network observations do not fabricate a published comparison or numerical criterion',()=>{
 const rows=comparisonRows().slice(0,1);rows[0].details={replication:0};render(React.createElement(NumericalComparisons,{rows,runs:[{id:'run-0',analysis_version:'network-execution-v1',provenance:{data_origin:'new-empirical'}}]}));assert.equal(globalThis.__recordPlot.measurementLabel,'Recorded');assert.ok(screen.getAllByText('Not applicable').length===2);assert.ok(screen.getByText('No numerical comparison criterion; scientific assessment pending'));cleanup();render(React.createElement(NumericalComparisons,{rows:[],runs:[]}));assert.ok(screen.getByText(/No shared-workflow measurements recorded/));
});

function conversation(){return{current_packet_id:'new',packets:[{id:'new',version:2,created_at:'2026-11-07T00:00:00Z',reason:'Guided answer: Conditions and population',document:{conditions:'Original saved conditions',protocol:null}}],runs:[{id:'reply',task:'planning',packet_id:'new',status:'complete',created_at:'2026-11-07T01:00:00Z',model_id:'synthetic-model',prompt_version_id:'original-prompt',provenance:{interview:{version:'idea-interview-v1',owner_message:'Question for the guide: Original owner question'}},output:{summary:'Original recorded reply',questions:['Original follow-up question?']}}]};}
test('idea conversation preserves saved answers owner questions provenance and failed earlier replies',()=>{
 const state=conversation();state.runs.push({...state.runs[0],id:'failed',packet_id:'missing',status:'failed',output:null,reason:'Original failed reply',provenance:{},created_at:'2026-11-07T02:00:00Z'});render(React.createElement(IdeaConversation,{state,active:true}));assert.ok(screen.getByText('Original saved conditions'));assert.ok(screen.getByText('Original owner question'));assert.ok(screen.getByText('Original follow-up question?'));assert.ok(screen.getByText('Original failed reply'));assert.ok(screen.getByText(/unavailable · failed · earlier plan/));assert.ok(screen.getAllByText(/Suggestions are model outputs, not measurements/).length===2);
});
test('conversation follows new turns while respecting an intentional scroll away from the latest text',async()=>{
 const state=conversation();const view=render(React.createElement(IdeaConversation,{state,active:false}));assert.equal(observers.length,0);view.rerender(React.createElement(IdeaConversation,{state,active:true}));const log=screen.getByRole('log');Object.defineProperties(log,{scrollHeight:{configurable:true,value:100},clientHeight:{configurable:true,value:20}});log.scrollTop=0;fireEvent.scroll(log);observers.at(-1).callback();assert.equal(log.scrollTop,0);log.scrollTop=80;fireEvent.scroll(log);observers.at(-1).callback();assert.equal(log.scrollTop,100);view.unmount();assert.equal(observers.at(-1).disconnected,true);
});
test('no conversation entries create no transcript or observer',()=>{render(React.createElement(IdeaConversation,{state:{packets:[],runs:[],current_packet_id:null},active:false}));assert.equal(screen.queryByRole('log'),null);assert.equal(observers.length,0);});
test('a planning turn without a recorded answer stays pending in its transcript',()=>{
 const state=conversation();state.runs[0]={...state.runs[0],status:'running',output:null,reason:null};render(React.createElement(IdeaConversation,{state,active:true}));assert.ok(screen.getByText('Waiting for a recorded response.'));assert.equal(screen.queryByText('Original follow-up question?'),null);
});
