import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {terminalCommandFixture,hierarchicalImplementationPlan,implementationBreakdown} from './support/terminal-command-fixture.mjs';
const hook=registerHooks({resolve(name,context,next){if(name==='@/lib/browser-auth')return{shortCircuit:true,url:'data:text/javascript,export const requireAccessToken=async(message,owner)=>{if(owner!=="owner")throw new Error("Wrong owner");return "verified-owner";};'};return next(name,context);}});
const {PaperExperimentPlanOutline}=await import('../app/components/research-workflow/paper-experiment-plan-outline.tsx');hook.deregister();
const id='11111111-1111-4111-8111-111111111111';let originalFetch,clipboardDescriptor,calls,copied,view,read;
beforeEach(()=>{
 calls=[];copied=[];originalFetch=globalThis.fetch;clipboardDescriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copied.push(text)}});
 view={version:'paper-terminal-commands-v1',study_id:id,experiment_index:1,target:'ubuntu-debian',stage:'not_generated',command_set:null,reason:null,generated_at:null};read=async()=>view;
 globalThis.fetch=async(url,options)=>{assert.match(url,/api\/terminal-commands/);assert.equal(options.headers.Authorization,'Bearer verified-owner');calls.push({url,options});if(options.method==='POST'){const body=JSON.parse(options.body);assert.equal(body.action,'generate');view={...view,stage:'ready',command_set:terminalCommandFixture(),generated_at:'2026-11-15T00:00:00Z'};return Response.json(view);}return Response.json(await read());};
});
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;if(clipboardDescriptor)Object.defineProperty(navigator,'clipboard',clipboardDescriptor);else delete navigator.clipboard;});
const show=async()=>{await act(async()=>{render(React.createElement(PaperExperimentPlanOutline,{plan:hierarchicalImplementationPlan(),breakdown:implementationBreakdown(),assessmentId:id,ownerId:'owner'}));});};
const click=async name=>{await act(async()=>{fireEvent.click(screen.getByRole('button',{name}));});};
test('commands are opt-in, generated once, copy under the correct action, and reuse saved output on reopen',async()=>{
 await show();assert.equal(calls.length,0);await click('Terminal commands');assert.equal(calls.length,1);assert.equal(calls[0].options.method,'GET');await click('Generate terminal commands');assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
 await click('Copy commands for step 1.1.1');assert.ok(copied[0].startsWith("bash <<'JUMPSERVE_COMMAND_BLOCK'"));assert.ok(copied[0].includes(id));assert.ok(screen.getByText('Commands copied.'));assert.ok(screen.getByText('Manual action · step 1.2.1'));assert.ok(screen.getByText('Commands blocked · step 1.3.1'));
 assert.equal(screen.queryByRole('button',{name:'Copy commands for step 1.2.1'}),null);await click('Copy input commands');assert.match(copied[1],/read -r -p 'JUMPSERVE_EXAMPLE_INPUT: '/);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
 await click('Terminal commands');await click('Terminal commands');assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.equal(calls.filter(c=>c.options.method==='GET').length,2);
});
test('closing the panel ignores a stale status response and copy failure retains selectable command text',async()=>{
 let resolve;read=()=>new Promise(r=>{resolve=r;});await show();await click('Terminal commands');await click('Terminal commands');await act(async()=>resolve({...view,stage:'failed',reason:'Stale failure'}));assert.equal(screen.queryByText('Stale failure'),null);
 read=async()=>({...view,stage:'ready',command_set:terminalCommandFixture(),generated_at:'2026-11-15T00:00:00Z'});await click('Terminal commands');navigator.clipboard.writeText=async()=>{throw new Error('Denied');};await click('Copy commands for step 1.1.1');assert.ok(screen.getByText('Copy failed. Select and copy the command text below.'));assert.ok(screen.getByRole('generic',{name:'Commands for step 1.1.1'}));
});
