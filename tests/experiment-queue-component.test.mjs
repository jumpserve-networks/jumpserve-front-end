import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {experimentQueuePath} from '../lib/research-experiment-queue.ts';

globalThis.__queueReact=React;
const queueButton=new URL('../app/components/ui/button.tsx',import.meta.url).href;
const boundary=name=>`export function ${name}(props){globalThis.__queueCaptures.push({name:${JSON.stringify(name)},props});return globalThis.__queueReact.createElement('section',{'data-child':${JSON.stringify(name)}});}`;
const replacements={
  '@/app/components/ui/button':`import {Button as Original} from ${JSON.stringify(queueButton)};export function Button(props){globalThis.__queueActions.set(props.children,props);return globalThis.__queueReact.createElement(Original,props);}`,
  'next/link':"export default function Link({prefetch,...props}){return globalThis.__queueReact.createElement('a',props);}",
  'next/navigation':'export const useRouter=()=>({push:path=>globalThis.__queueNavigation.push(path)});',
  '@/lib/research-workflow-api':'export const researchRequest=(...args)=>globalThis.__queueRequest(...args);',
  '@/lib/research-queue-api':'export const requireGapQueueApi=(...args)=>globalThis.__queueCapability(...args);',
  './select':"export function ResearchSelect({label,value,options,onChange,disabled}){return globalThis.__queueReact.createElement('label',{},label,globalThis.__queueReact.createElement('select',{'aria-label':label,value,disabled,onChange:event=>onChange(event.target.value)},options.map(option=>globalThis.__queueReact.createElement('option',{key:option.value,value:option.value},option.label))));}",
  './run-gap-experiment':boundary('RunGapExperiment'),
};
const hooks=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {AssessmentGapExperiments}=await import('../app/components/research-workflow/experiment-queue.tsx');hooks.deregister();
const ID='11111111-1111-4111-8111-111111111111',GAP='22222222-2222-4222-8222-222222222222',FOLLOW='33333333-3333-4333-8333-333333333333',JOB='44444444-4444-4444-8444-444444444444';
let preview,requests,requestHandler;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const last=name=>globalThis.__queueCaptures.filter(c=>c.name===name).at(-1)?.props;
beforeEach(()=>{
  globalThis.__queueActions=new Map();
  globalThis.__queueCaptures=[];globalThis.__queueNavigation=[];requests=[];
  preview={version:'research-gap-queue-v1',study_id:ID,gap_id:GAP,gap_sha256:'a'.repeat(64),plan_sha256:'b'.repeat(64),limitation:'Retained scope only',unavailable_reason:null,choices:[{key:'auto',title:'Retained automatic check',execution_mode:'automatic',experiment_type:'independent-check',coverage_limits:'Original archived scope',dependencies:[{key:'input',requirement:'Original input'}]},{key:'manual',title:'Retained manual check',execution_mode:'manual',experiment_type:'source-review',coverage_limits:'Original source scope',dependencies:[]}]};
  requestHandler=async(path,options)=>{
    if(!options?.method)return preview;
    const action=JSON.parse(options.body).action;
    if(action==='create-followup')return {version:'research-gap-queue-v1',study_id:FOLLOW};
    if(action==='prepare')return {prepared:true};
    return {version:'research-gap-queue-v1',study_id:FOLLOW,job_id:JOB,queued_job_ids:[JOB],complete:true,workers_enabled:false,limitation:'Recorded, not scientifically reviewed'};
  };
  globalThis.__queueCapability=async()=>{};
  globalThis.__queueRequest=(...args)=>{requests.push(args);return requestHandler(...args);};
});
afterEach(cleanup);
const showGap=async props=>{let view;await act(async()=>{view=render(React.createElement(AssessmentGapExperiments,{studyId:ID,gapId:GAP,...props}));});return view;};
const click=async name=>act(async()=>{fireEvent.click(screen.getByRole('button',{name,exact:true}));});
const choose=async(label,value)=>act(async()=>{fireEvent.change(screen.getByRole('combobox',{name:label}),{target:{value}});});

test('gap preview checks capability and validates original hashes before allowing a queued follow-up',async()=>{
  await showGap();assert.ok(screen.getByText('Retained scope only'));assert.ok(screen.getByText(/1 direct prerequisites/));
  await click('Queue experiment');
  const writes=requests.filter(([,options])=>options?.method==='POST');
  assert.deepEqual(writes.map(([,options])=>JSON.parse(options.body).action),['create-followup','prepare','enqueue']);
  const bodies=writes.map(([,options])=>JSON.parse(options.body));assert.equal(new Set(bodies.map(b=>b.request_id)).size,1);
  assert.equal(bodies[0].gap_sha256,preview.gap_sha256);assert.equal(bodies[0].plan_sha256,preview.plan_sha256);
  assert.equal(writes[1][0],`/studies/${FOLLOW}/prepare`);assert.equal(screen.getByRole('button',{name:'Job recorded'}).disabled,true);
  assert.match(screen.getByText(/Experiment job recorded/).textContent,/Scheduled workers are disabled/);
  assert.deepEqual(globalThis.__queueNavigation,[experimentQueuePath(FOLLOW,JOB)]);
});

test('manual selection resets a completed attempt and retains operator-only execution semantics',async()=>{
  await showGap();await click('Queue experiment');const first=JSON.parse(requests[1][1].body).request_id;
  await choose('Retained check to queue','manual');assert.ok(screen.getByText(/Requires a domain operator/));
  assert.equal(screen.queryByText(/direct prerequisites/),null);await click('Queue operator task');
  const body=JSON.parse(requests.filter(([,o])=>o?.method==='POST')[3][1].body);
  assert.notEqual(body.request_id,first);assert.equal(body.key,'manual');assert.ok(screen.getByText(/Operator task recorded/));
});

test('unconfirmed writes retain one request identity and resume saved work without duplicate follow-ups',async()=>{
  let attempts=0;const original=requestHandler;requestHandler=async(path,options)=>{
    if(options?.method&&JSON.parse(options.body).action==='prepare'&&attempts++===0)throw new Error('Synthetic preparation failed');return original(path,options);
  };
  await showGap();await click('Queue experiment');assert.match(screen.getByRole('alert').textContent,/same follow-up without creating duplicate/);
  assert.equal(screen.getByRole('link',{name:'View this follow-up in Experiment Queue'}).getAttribute('href'),experimentQueuePath(FOLLOW));
  await click('Resume queueing');const creates=requests.filter(([,o])=>o?.method&&JSON.parse(o.body).action==='create-followup');
  assert.equal(JSON.parse(creates[0][1].body).request_id,JSON.parse(creates[1][1].body).request_id);
});

test('partial enqueue results stay resumable and an invalid follow-up identity prevents preparation',async()=>{
  const original=requestHandler;requestHandler=async(path,options)=>{
    const value=await original(path,options);return options?.method&&JSON.parse(options.body).action==='enqueue'?{...value,complete:false,queued_job_ids:[]}:value;
  };
  await showGap();await click('Queue experiment');assert.ok(screen.getByText(/not yet confirmed as queued/));assert.deepEqual(globalThis.__queueNavigation,[]);cleanup();requests=[];
  requestHandler=async(path,options)=>options?.method?{version:'wrong',study_id:FOLLOW}:preview;
  await showGap();await click('Queue experiment');assert.match(screen.getByRole('alert').textContent,/identity was not confirmed/);
  assert.equal(requests.filter(([,o])=>o?.method).length,1);
});

test('preview failures can be retried and unavailable inputs link to paper preparation',async()=>{
  globalThis.__queueCapability=async()=>{throw 'unstructured failure';};await showGap();assert.equal(screen.getByRole('alert').textContent,'Queue status is unavailable.');
  globalThis.__queueCapability=async()=>{};preview.choices=[];preview.unavailable_reason='Original inputs are unavailable';
  await click('Retry preview');assert.ok(screen.getByText('Original inputs are unavailable'));assert.ok(screen.getByRole('button',{name:'Prepare a paper assessment'}));
});

test('unmounted previews and queued responses cannot navigate or overwrite a replacement page',async()=>{
  const pending=deferred();requestHandler=()=>pending.promise;let view=await showGap();assert.ok(screen.getByText(/Checking retained protocols/));view.unmount();
  await act(async()=>{pending.resolve(preview);});assert.equal(screen.queryByText('Retained scope only'),null);
  const original=requestHandler;requestHandler=async()=>preview;view=await showGap();const write=deferred();requestHandler=()=>write.promise;
  await click('Queue experiment');assert.equal(screen.getByRole('button',{name:'Preserving and queueing…'}).disabled,true);view.unmount();
  assert.equal(requests.at(-1)[1].signal.aborted,true);await act(async()=>write.reject(new Error('Late failure')));
  assert.deepEqual(globalThis.__queueNavigation,[]);requestHandler=original;
});

test('requested launch delegates only the selected identities and navigates after the child confirms queueing',async()=>{
  await showGap({launchId:JOB});assert.equal(requests.length,0);const props=last('RunGapExperiment');
  assert.equal(props.studyId,ID);assert.equal(props.gapId,GAP);assert.equal(props.launchId,JOB);props.onQueued(FOLLOW,JOB);
  assert.deepEqual(globalThis.__queueNavigation,[experimentQueuePath(FOLLOW,JOB)]);
});
test('cleared selections and duplicate pending queue callbacks cannot create another follow-up',async()=>{
 await showGap();await choose('Retained check to queue','');assert.equal(screen.getByRole('button',{name:'Queue experiment'}).disabled,true);await act(async()=>globalThis.__queueActions.get('Queue experiment').onClick());assert.equal(requests.filter(([,o])=>o?.method).length,0);await choose('Retained check to queue','auto');const pending=deferred(),original=requestHandler;requestHandler=(...args)=>args[1]?.method?pending.promise:original(...args);await click('Queue experiment');await act(async()=>globalThis.__queueActions.get('Preserving and queueing…').onClick());assert.equal(requests.filter(([,o])=>o?.method).length,1);await act(async()=>pending.reject(new Error('Original uncertain follow-up')));
});
test('a completed enqueue response after unmount cannot navigate and enabled workers retain their recorded status',async()=>{
 const original=requestHandler,pending=deferred();requestHandler=(...args)=>args[1]?.method&&JSON.parse(args[1].body).action==='enqueue'?pending.promise:original(...args);const view=await showGap();await click('Queue experiment');view.unmount();await act(async()=>pending.resolve({version:'research-gap-queue-v1',study_id:FOLLOW,job_id:JOB,queued_job_ids:[JOB],complete:true,workers_enabled:true,limitation:'Original'}));assert.deepEqual(globalThis.__queueNavigation,[]);requestHandler=async(...args)=>({...await original(...args),workers_enabled:true});await showGap();await click('Queue experiment');assert.equal(screen.queryByText(/Scheduled workers are disabled/),null);
});
