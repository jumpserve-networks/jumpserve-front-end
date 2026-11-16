import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {terminalCommandFixture,hierarchicalImplementationPlan,implementationBreakdown} from './support/terminal-command-fixture.mjs';
const hook=registerHooks({resolve(name,context,next){if(name==='@/lib/browser-auth')return{shortCircuit:true,url:'data:text/javascript,export const requireAccessToken=async(message,owner)=>{if(owner!=="owner")throw new Error("Wrong owner");return "verified-owner";};'};return next(name,context);}});
const {PaperExperimentPlanOutline}=await import('../app/components/research-workflow/paper-experiment-plan-outline.tsx');hook.deregister();
const id='11111111-1111-4111-8111-111111111111';let originalFetch,clipboardDescriptor,calls,copied,view,read,write;
beforeEach(()=>{
 calls=[];copied=[];originalFetch=globalThis.fetch;clipboardDescriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copied.push(text)}});
 view={version:'paper-terminal-commands-v1',study_id:id,experiment_index:1,target:'ubuntu-debian',command_layout:'per-step-v1',stage:'not_generated',command_set:null,reason:null,generated_at:null};read=async()=>view;
 write=async body=>{assert.equal(body.action,'generate');return view={...view,stage:'ready',command_set:terminalCommandFixture(),generated_at:'2026-11-15T00:00:00Z'};};
 globalThis.fetch=async(url,options)=>{assert.match(url,/api\/terminal-commands/);assert.equal(options.headers.Authorization,'Bearer verified-owner');calls.push({url,options});return Response.json(options.method==='POST'?await write(JSON.parse(options.body)):await read());};
});
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;if(clipboardDescriptor)Object.defineProperty(navigator,'clipboard',clipboardDescriptor);else delete navigator.clipboard;});
const show=async(strict=false)=>{await act(async()=>{const outline=React.createElement(PaperExperimentPlanOutline,{plan:hierarchicalImplementationPlan(),breakdown:implementationBreakdown(),assessmentId:id,ownerId:'owner'});render(strict?React.createElement(React.StrictMode,null,outline):outline);});};
const click=async name=>{await act(async()=>{fireEvent.click(screen.getByRole('button',{name}));});};
test('Step 3 automatically generates missing commands, displays them under their actions, and reuses saved output on return',async()=>{
 await show();assert.deepEqual(calls.map(c=>c.options.method),['GET','POST']);assert.equal(screen.queryByRole('button',{name:'Generate terminal commands'}),null);assert.equal(screen.queryByRole('button',{name:'Terminal commands',exact:true}),null);
 assert.equal(screen.queryByRole('button',{name:/Copy commands for (?:shared|saved) setup/}),null);
 await click('Copy commands for step 1.1.1');assert.ok(copied[0].startsWith("bash <<'JUMPSERVE_COMMAND_BLOCK'"));assert.ok(copied[0].includes(id));assert.ok(screen.getByText('Commands copied.'));assert.ok(screen.getByText('Manual action · step 1.2.1'));assert.ok(screen.getByText('Commands blocked · step 1.3.1'));
 assert.equal(screen.queryByRole('button',{name:'Copy commands for step 1.2.1'}),null);await click('Copy input commands');assert.match(copied[1],/read -r -p 'JUMPSERVE_EXAMPLE_INPUT: '/);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
 cleanup();await show();assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.equal(calls.filter(c=>c.options.method==='GET').length,2);assert.ok(screen.getByRole('button',{name:'Copy commands for step 1.1.1'}));
});
test('leaving Step 3 prevents a late missing-status response from starting generation or replacing saved commands',async()=>{
 let resolve;read=()=>new Promise(r=>{resolve=r;});await show();const stale={...view};cleanup();assert.equal(calls[0].options.signal.aborted,true);
 view={...view,stage:'ready',command_set:terminalCommandFixture(),generated_at:'2026-11-15T00:00:00Z'};read=async()=>view;await show();await act(async()=>resolve(stale));assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
 navigator.clipboard.writeText=async()=>{throw new Error('Denied');};await click('Copy commands for step 1.1.1');assert.ok(screen.getByText('Copy failed. Select and copy the command text below.'));assert.ok(screen.getByRole('generic',{name:'Commands for step 1.1.1'}));
});
test('automatic submission is not duplicated by Strict Mode effect cleanup',async()=>{
 await show(true);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.ok(screen.getByRole('button',{name:'Copy commands for step 1.1.1'}));
});
test('automatic generation polls the saved request and stops once command blocks are ready',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});write=async body=>{assert.equal(body.action,'generate');return view={...view,stage:'processing'};};
 await show();assert.deepEqual(calls.map(c=>c.options.method),['GET','POST']);assert.ok(screen.getByText('Generating commands for each numbered step…'));
 assert.ok(screen.getByRole('button',{name:'Cancel command generation'}));view={...view,stage:'ready',command_set:terminalCommandFixture(),generated_at:'2026-11-15T00:00:00Z'};
 await act(async()=>t.mock.timers.tick(5000));assert.deepEqual(calls.map(c=>c.options.method),['GET','POST','GET']);assert.ok(screen.getByRole('button',{name:'Copy commands for step 1.1.1'}));
 await act(async()=>t.mock.timers.tick(15000));assert.equal(calls.length,3);
});
test('existing pending or terminal requests are read without another generation submission',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const stage of ['submitting','processing','uncertain','failed','cancelled']){
  view={...view,stage,reason:'Saved request: '+stage};await show();assert.ok(screen.getByText('Saved request: '+stage));cleanup();
 }
 assert.equal(calls.length,5);assert.equal(calls.filter(c=>c.options.method==='POST').length,0);await act(async()=>t.mock.timers.tick(15000));assert.equal(calls.length,5);
});
test('a failed saved-status check does not submit blindly and a successful recheck prepares missing commands',async()=>{
 read=async()=>{throw new Error('Saved status unavailable');};await show();assert.ok(screen.getByText('Saved status unavailable'));assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
 read=async()=>view;await click('Check saved command status');assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.ok(screen.getByRole('button',{name:'Copy commands for step 1.1.1'}));
});
test('returning after a lost generation response resumes the saved call without another submission',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let resolve;write=async()=>{view={...view,stage:'processing'};return new Promise(r=>{resolve=r;});};
 await show();assert.equal(calls.filter(c=>c.options.method==='POST').length,1);cleanup();await show();assert.ok(screen.getByText('Generating commands for each numbered step…'));
 await act(async()=>resolve({...view,stage:'failed',reason:'Stale submission result'}));assert.equal(screen.queryByText('Stale submission result'),null);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});
