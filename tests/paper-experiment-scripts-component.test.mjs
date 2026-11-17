import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {experimentScriptsView,hierarchicalImplementationPlan,implementationBreakdown} from './support/experiment-scripts-fixture.mjs';
const hook=registerHooks({resolve(name,context,next){if(name==='@/lib/browser-auth')return{shortCircuit:true,url:'data:text/javascript,export const requireAccessToken=async(message,owner)=>{if(owner!=="owner")throw new Error("Wrong owner");return "verified-owner";};'};return next(name,context);}});
const {PaperExperimentScripts}=await import('../app/components/research-workflow/paper-experiment-scripts.tsx');
const {PaperExperimentPlanOutline}=await import('../app/components/research-workflow/paper-experiment-plan-outline.tsx');hook.deregister();
const id='11111111-1111-4111-8111-111111111111';let originalFetch,clipboardDescriptor,calls,copied,view,read,write;
beforeEach(()=>{
 calls=[];copied=[];view=experimentScriptsView(id,'not_generated');originalFetch=globalThis.fetch;clipboardDescriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copied.push(text)}});
 read=async()=>view;write=async body=>view=experimentScriptsView(id,body.action==='cancel'?'cancelled':'ready');
 globalThis.fetch=async(url,options)=>{assert.match(url,/api\/experiment-scripts/);assert.equal(options.headers.Authorization,'Bearer verified-owner');calls.push({url,options});return Response.json(options.method==='POST'?await write(JSON.parse(options.body)):await read());};
});
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;if(clipboardDescriptor)Object.defineProperty(navigator,'clipboard',clipboardDescriptor);else delete navigator.clipboard;});
const show=async(strict=false)=>{await act(async()=>{const element=React.createElement(PaperExperimentScripts,{assessmentId:id,ownerId:'owner',index:1,plan:hierarchicalImplementationPlan(),breakdown:implementationBreakdown()});render(strict?React.createElement(React.StrictMode,null,element):element);});};
const click=async name=>{await act(async()=>{fireEvent.click(screen.getByRole('button',{name}));});};
test('Step 3 renders numbered planning instructions with no command requests or generation controls',async()=>{
 await act(async()=>render(React.createElement(PaperExperimentPlanOutline,{plan:hierarchicalImplementationPlan(),breakdown:implementationBreakdown()})));
 assert.equal(calls.length,0);assert.ok(screen.getByRole('heading',{name:/1\.1\.1 Freeze scope/}));assert.equal(screen.queryByRole('button',{name:/Generate.*Commands/}),null);
});
test('opening Step 4 creates one shared package after reading saved status, then exposes setup and numbered invocations',async()=>{
 await show();assert.deepEqual(calls.map(c=>c.options.method),['GET','POST']);assert.deepEqual(JSON.parse(calls[1].options.body),{action:'generate',study_id:id,experiment_index:1,target:'ubuntu-debian'});
 assert.ok(screen.getByRole('heading',{name:'Shared setup script'}));assert.ok(screen.getByRole('heading',{name:/1\.1\.1 Freeze scope/}));
 await click('Copy commands for shared setup');await click('Copy commands for step 1.1.1');
 assert.match(copied[0],/experiment-1\/shared-setup-v2/);assert.match(copied[0],/cat > experiment_helper\.py/);assert.match(copied[1],/python3 experiment_helper\.py fixture/);assert.doesNotMatch(copied[1],/cat > experiment_helper/);
 assert.ok(screen.getByRole('button',{name:'Copy commands for experiment cleanup'}));
});
test('saved packages are reused across refresh and Strict Mode fences duplicate mount reads',async()=>{
 view=experimentScriptsView(id);await show(true);assert.equal(calls.filter(c=>c.options.method==='POST').length,0);cleanup();await show();assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('processing polls the exact saved package and stops once ready',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});write=async()=>view=experimentScriptsView(id,'processing');await show();assert.ok(screen.getByText('Generating shared setup and run commands…'));
 view=experimentScriptsView(id);await act(async()=>t.mock.timers.tick(5000));assert.ok(screen.getByRole('heading',{name:'Shared setup script'}));assert.equal(calls.length,3);await act(async()=>t.mock.timers.tick(15000));assert.equal(calls.length,3);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});
test('a pending package can be cancelled and failed/uncertain/cancelled packages never regenerate',async()=>{
 view=experimentScriptsView(id,'processing');await show();await click('Cancel script generation');assert.equal(JSON.parse(calls.at(-1).options.body).action,'cancel');
 for(const stage of ['failed','uncertain','cancelled']){cleanup();calls=[];view=experimentScriptsView(id,stage);await show();await click('Check saved scripts');assert.equal(calls.filter(c=>c.options.method==='POST').length,0);}
});
test('earlier pending calls block shared generation until reconciled or explicitly cancelled',async()=>{
 view=experimentScriptsView(id,'not_generated',2);await show();assert.equal(calls.filter(c=>c.options.method==='POST').length,0);assert.ok(screen.getByRole('button',{name:'Cancel earlier command generation'}));
 write=async()=>view=experimentScriptsView(id,'not_generated',0);await click('Cancel earlier command generation');assert.equal(JSON.parse(calls.at(-1).options.body).action,'cancel_previous');await click('Check saved scripts');assert.deepEqual(calls.filter(c=>c.options.method==='POST').map(c=>JSON.parse(c.options.body).action),['cancel_previous','generate']);
});
test('lost acknowledgements and failed reads check saved state before any possible new admission',async()=>{
 write=async()=>{view=experimentScriptsView(id,'processing');throw new Error('Lost acknowledgement');};await show();assert.ok(screen.getByText('Lost acknowledgement'));await click('Check saved scripts');assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
 cleanup();calls=[];read=async()=>{throw new Error('Database update required');};await show();assert.ok(screen.getByText('Database update required'));assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('unmount aborts a late status read before it can generate a package',async()=>{
 let resolve;read=()=>new Promise(r=>{resolve=r;});await show();const pending=calls[0];cleanup();assert.equal(pending.options.signal.aborted,true);await act(async()=>resolve(experimentScriptsView(id,'not_generated')));assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
