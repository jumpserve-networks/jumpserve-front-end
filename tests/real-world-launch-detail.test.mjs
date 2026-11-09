import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {defaultRealWorldConfig} from '../lib/real-world.ts';
globalThis.__launchReact=React;
const child=name=>`export function ${name}(props){globalThis.__launchChildren.set(${JSON.stringify(name)},props);return globalThis.__launchReact.createElement('section',{'data-child':${JSON.stringify(name)}});}`;
const replacements={
 'next/link':"export default function Link(props){return globalThis.__launchReact.createElement('a',props);}",
 'next/navigation':'export const useRouter=()=>({push:path=>globalThis.__launchNavigations.push(path)});',
 '@/app/components/user-preferences':"export const LocalDateTime=({value})=>globalThis.__launchReact.createElement('time',{},value);",
 '@/lib/real-world-api':'export const realWorldRequest=(...args)=>globalThis.__launchRequest(...args);',
 '@/app/components/real-world-placement':"export function RealWorldPlacement(props){globalThis.__launchPlacements.set(props.label,props);return globalThis.__launchReact.createElement('section',{'aria-label':props.label});}export function Choice({label,value,items,onChange}){return globalThis.__launchReact.createElement('select',{'aria-label':label,value,onChange:e=>onChange(e.target.value)},items.map(o=>globalThis.__launchReact.createElement('option',{key:o.value,value:o.value},o.label)));}",
 '@/app/components/real-world-traffic-map':child('RealWorldTrafficMap'),
 '@/app/components/real-world-status-timeline':child('RealWorldStatusTimeline'),
};
const hook=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {RealWorldTests}=await import('../app/components/real-world-tests.tsx');const {RealWorldTestDetail}=await import('../app/components/real-world-test-detail.tsx');hook.deregister();
const JOB='11111111-1111-4111-8111-111111111111';
let requests,handler;
beforeEach(()=>{
 requests=[];globalThis.__launchNavigations=[];globalThis.__launchChildren=new Map();globalThis.__launchPlacements=new Map();
 handler=async(path,options)=>path==='/regions'?{regions:[{region:'us-east-1',name:'Synthetic region'}]}:path==='/tests'&&!options?.method?{tests:[],cursor:null}:job();
 globalThis.__launchRequest=(...args)=>{requests.push(args);return handler(...args);};
});afterEach(cleanup);
const click=async name=>act(async()=>fireEvent.click(screen.getByRole('button',{name,exact:true})));
const mount=async(Component,props)=>{let view;await act(async()=>{view=render(React.createElement(Component,props));});return view;};
function job(status='running'){return{job_id:JOB,status,can_manage:true,cancel_requested:false,created_at:1,config:{...defaultRealWorldConfig(),notes:'Original hypothesis'},nodes:[{name:'server',region:'us-east-1',zone_id:'use1-az1',instance_type:'t3.medium',instance_id:'i-original',state:'running'},{name:'receiver-1',region:'us-east-1',zone_id:'use1-az1',instance_type:'t3.medium'}],runtime_revision:'original-runtime',results:[],artifacts:[]};}
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
async function placements(){await act(async()=>{for(const label of ['Server','Bottleneck','Receiver 1','Receiver 2'])globalThis.__launchPlacements.get(label).onChange({region:'us-east-1',zone_id:'use1-az1',instance_type:'t3.large'});});}
const submit=async()=>act(async()=>fireEvent.submit(document.querySelector('form')));

test('real-world launch validates every machine and preserves exact configuration with one stable retry identity',async()=>{
 await mount(RealWorldTests);assert.ok(screen.getByText('No real-world tests yet.'));await submit();assert.ok(screen.getByText(/Choose a Region for every machine/));assert.equal(requests.filter(([,o])=>o?.method==='POST').length,0);
 await placements();await act(async()=>fireEvent.change(screen.getByLabelText('Hypothesis / notes'),{target:{value:'Retained original hypothesis'}}));
 handler=async(path,options)=>{if(options?.method)throw new Error('Synthetic launch unconfirmed');return {regions:[]};};await submit();assert.ok(screen.getByText('Synthetic launch unconfirmed'));await submit();
 let writes=requests.filter(([,o])=>o?.method==='POST').map(([,o])=>JSON.parse(o.body));assert.equal(writes[0].request_id,writes[1].request_id);assert.equal(writes[0].config.notes,'Retained original hypothesis');assert.ok(writes[0].config.receivers.every(r=>r.instance_type==='t3.large'));
 await act(async()=>fireEvent.change(screen.getByLabelText('Duration (seconds)'),{target:{value:'70'}}));handler=async()=>job();await submit();writes=requests.filter(([,o])=>o?.method==='POST').map(([,o])=>JSON.parse(o.body));assert.notEqual(writes.at(-1).request_id,writes[0].request_id);assert.deepEqual(globalThis.__launchNavigations,['/congestion-control-real-world/run-a-test/'+JOB]);
});

test('receiver count and copied placement retain each selected machine type',async()=>{
 await mount(RealWorldTests);await placements();await click('Use server placement and instance type for all machines');assert.equal(globalThis.__launchPlacements.get('Bottleneck').value.instance_type,'t3.large');
 await click('Add receiver');assert.equal(globalThis.__launchPlacements.get('Receiver 3').value.instance_type,'t3.medium');await click('Remove last receiver');await click('Remove last receiver');assert.equal(screen.getByRole('button',{name:'Remove last receiver'}).disabled,true);
 await act(async()=>fireEvent.change(screen.getByRole('combobox',{name:'Server congestion control'}),{target:{value:'bbr'}}));
 await act(async()=>fireEvent.change(screen.getByLabelText('Shared rate (Mbit/s)'),{target:{value:''}}));assert.equal(screen.getByLabelText('Shared rate (Mbit/s)').value,'');
});

test('location and history failures remain independent and retry restores both bounded read results',async()=>{
 handler=async(path)=>{throw new Error(path==='/regions'?'Synthetic location failure':'Synthetic history failure');};await mount(RealWorldTests);assert.ok(screen.getByText('Synthetic location failure'));assert.ok(screen.getByText('Synthetic history failure'));
 handler=async path=>path==='/regions'?{regions:[{region:'us-east-1'}]}:{tests:[job('provisioning')],cursor:'original cursor'};await click('Retry');assert.equal(screen.queryByRole('alert'),null);assert.ok(screen.getByRole('link',{name:'Open test'}));
 handler=async()=>({tests:[job('provisioning'),{...job('legacy-status'),job_id:'other'}],cursor:null});await click('Load older tests');assert.equal(screen.getAllByRole('link',{name:'Open test'}).length,2);assert.ok(screen.getByText('legacy-status'));assert.ok(requests.at(-1)[0].includes('cursor=original+cursor'));
 const count=requests.length;handler=async path=>path==='/regions'?{regions:[]}:{tests:[job('completed')],cursor:null};await click('Refresh');assert.equal(requests.length,count+2);assert.equal(screen.getAllByRole('link',{name:'Open test'}).length,1);
});

test('history paging and launch unstructured failures use bounded fallback text',async()=>{
 handler=async path=>path==='/regions'?{regions:[{region:'us-east-1'}]}:{tests:[],cursor:'next'};await mount(RealWorldTests);handler=async()=>{throw null;};await click('Load older tests');assert.ok(screen.getByText('Could not load tests.'));await placements();await submit();assert.ok(screen.getByText('Launch failed.'));
});

test('a second form submission during an outstanding launch preserves the sole request identity',async()=>{
 await mount(RealWorldTests);await placements();const pending=defer();handler=()=>pending.promise;await submit();await submit();assert.equal(requests.filter(([,options])=>options?.method==='POST').length,1);await act(async()=>pending.resolve(job()));assert.equal(globalThis.__launchNavigations.length,1);
});

test('typed history errors and untyped detail failures retain diagnostics without inventing results',async t=>{
 handler=async path=>path==='/regions'?{regions:[]}:{tests:[],cursor:'next'};await mount(RealWorldTests);handler=async()=>{throw new Error('Original older-history failure');};await click('Load older tests');assert.ok(screen.getByText('Original older-history failure'));cleanup();
 t.mock.timers.enable({apis:['setTimeout']});handler=async()=>{throw null;};await mount(RealWorldTestDetail,{jobId:JOB});assert.ok(screen.getByText('Could not load test.'));cleanup();
 const unknown=job('future-controller-status');delete unknown.results;handler=async()=>unknown;await mount(RealWorldTestDetail,{jobId:JOB});assert.ok(screen.getAllByText('future-controller-status').length>0);assert.equal(screen.queryByRole('button',{name:'Get raw report links'}),null);handler=async()=>{throw null;};await click('Cancel test and terminate instances');assert.ok(screen.getByText('Could not cancel test.'));cleanup();
 handler=async()=>job('completed');await mount(RealWorldTestDetail,{jobId:JOB});handler=async()=>{throw null;};await click('Get raw report links');assert.ok(screen.getByText('Could not load artifacts.'));
});
test('typed detail retrieval and cancellation failures retain the service diagnostics',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});handler=async()=>{throw new Error('Original detail retrieval failed');};await mount(RealWorldTestDetail,{jobId:JOB});assert.ok(screen.getByText('Original detail retrieval failed'));cleanup();handler=async()=>job();await mount(RealWorldTestDetail,{jobId:JOB});handler=async()=>{throw new Error('Original cancellation unconfirmed');};await click('Cancel test and terminate instances');assert.ok(screen.getByText('Original cancellation unconfirmed'));
});

test('detail polling retains cancellation across delayed responses and stops after a recorded terminal status',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const view=await mount(RealWorldTestDetail,{jobId:JOB});assert.equal(globalThis.__launchChildren.get('RealWorldTrafficMap').job.status,'running');
 handler=async(path,options)=>options?.method?{...job(),cancel_requested:true}:job();await click('Cancel test and terminate instances');assert.ok(screen.getByText('Cancellation requested. Waiting for resource cleanup.'));
 await act(async()=>t.mock.timers.tick(5000));assert.equal(globalThis.__launchChildren.get('RealWorldTrafficMap').job.cancel_requested,true);
 handler=async()=>job('completed');await act(async()=>t.mock.timers.tick(5000));const count=requests.length;await act(async()=>t.mock.timers.tick(10000));assert.equal(requests.length,count);assert.equal(screen.queryByRole('button',{name:'Cancel test and terminate instances'}),null);view.unmount();assert.equal(requests[0][1].signal.aborted,true);
});

test('detail failure and artifact errors remain visible without erasing the recorded test',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});handler=async()=>({...job('completed'),error:'Original experiment error',cleanup_error:'Original cleanup error',results:[{receiver:'receiver-1',received_mbit_per_second:0,received_bytes:0,seconds:1}]});await mount(RealWorldTestDetail,{jobId:JOB});assert.ok(screen.getByText('Original experiment error'));assert.ok(screen.getByText('Cleanup is retrying: Original cleanup error'));assert.ok(screen.getAllByText('0.000').length>0);
 handler=async()=>{throw new Error('Synthetic artifact failure');};await click('Get raw report links');assert.ok(screen.getByText('Synthetic artifact failure'));handler=async()=>({artifacts:[{name:'Original raw report',url:'https://example.test/synthetic-signed-original'}]});await click('Get raw report links');assert.equal(screen.getByRole('link',{name:'Original raw report'}).getAttribute('rel'),'noreferrer');
});

test('unmounted detail reads and failures cannot change the replacement page',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});for(const failed of [false,true]){const pending=defer();handler=()=>pending.promise;const view=await mount(RealWorldTestDetail,{jobId:JOB});assert.ok(screen.getByText('Loading test…'));view.unmount();await act(async()=>{if(failed)pending.reject(new Error('Late stale failure'));else pending.resolve(job());});assert.equal(screen.queryByText('Original hypothesis'),null);assert.equal(screen.queryByRole('alert'),null);}
});
