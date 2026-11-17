import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {stepView,stepSummary,stepPlan,stepBreakdown} from './support/step-command-fixture.mjs';
const hook=registerHooks({resolve(name,context,next){if(name==='@/lib/browser-auth')return{shortCircuit:true,url:'data:text/javascript,export const requireAccessToken=async(message,owner)=>{if(owner!=="owner")throw new Error("Wrong owner");return "verified-owner";};'};return next(name,context);}});
const {PaperExperimentPlanOutline}=await import('../app/components/research-workflow/paper-experiment-plan-outline.tsx');
const {PaperStepCommands,PaperStepCommand}=await import('../app/components/research-workflow/paper-step-commands.tsx');hook.deregister();
const id='11111111-1111-4111-8111-111111111111';let originalFetch,clipboardDescriptor,calls,copied,views,read,write,list;
beforeEach(()=>{
 calls=[];copied=[];views=new Map();originalFetch=globalThis.fetch;clipboardDescriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copied.push(text)}});
 list=async()=>stepSummary(id,views);read=async ref=>views.get(ref)??stepView(id,ref,'not_generated');
 write=async body=>{const result=stepView(id,body.action_ref,body.action==='cancel'?'cancelled':'ready');views.set(body.action_ref,result);return result;};
 globalThis.fetch=async(url,options={})=>{assert.match(url,/api\/step-commands/);assert.equal(options.headers.Authorization,'Bearer verified-owner');calls.push({url,options});const ref=new URL(url,'https://example.test').searchParams.get('step');return Response.json(options.method==='POST'?await write(JSON.parse(options.body)):ref?await read(ref):await list());};
});
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;if(clipboardDescriptor)Object.defineProperty(navigator,'clipboard',clipboardDescriptor);else delete navigator.clipboard;});
const show=async(strict=false,owner=true)=>{await act(async()=>{const plan=stepPlan(),breakdown=stepBreakdown();const body=React.createElement(PaperExperimentPlanOutline,{plan,breakdown,renderCommands:number=>React.createElement(PaperStepCommand,{number},({button,result})=>React.createElement(React.Fragment,null,button,result))});const outline=owner?React.createElement(PaperStepCommands,{assessmentId:id,ownerId:'owner',index:1,plan,breakdown},body):body;render(strict?React.createElement(React.StrictMode,null,outline):outline);});};
const click=async name=>{await act(async()=>{fireEvent.click(screen.getByRole('button',{name}));});};
test('historical individual-command components retain their saved-call controls',async()=>{
 await show();assert.equal(calls.length,1);assert.equal(calls[0].options.method,undefined);assert.ok(screen.getByRole('list',{name:'Experiments'}));assert.equal(screen.getAllByRole('button',{name:/^Generate Terminal Commands for step/}).length,6);assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
 await click('Generate Terminal Commands for step 1.1.1');assert.equal(calls.filter(c=>c.options.method==='POST').length,1);const body=JSON.parse(calls.at(-1).options.body);assert.deepEqual(body,{action:'generate',study_id:id,experiment_index:1,action_ref:'1.1.1',target:'ubuntu-debian'});
 assert.ok(screen.getByRole('button',{name:'Generate Terminal Commands for step 1.2.1'}));assert.equal(screen.queryByRole('button',{name:'Copy commands for step 1.2.1'}),null);
 await click('Copy commands for step 1.1.1');assert.match(copied[0],/experiment-1\/action-v1/);assert.ok(copied[0].startsWith("bash <<'JUMPSERVE_COMMAND_BLOCK'"));
});
test('saved commands are loaded only when viewed and never regenerated on refresh',async()=>{
 views.set('1.1.1',stepView(id));await show();assert.equal(calls.length,1);assert.ok(screen.getByRole('button',{name:'View Terminal Commands for step 1.1.1'}));assert.equal(screen.queryByRole('button',{name:'Copy commands for step 1.1.1'}),null);
 await click('View Terminal Commands for step 1.1.1');assert.ok(screen.getByRole('button',{name:'Copy commands for step 1.1.1'}));assert.equal(new URL(calls.at(-1).url,'https://example.test').searchParams.get('step'),'1.1.1');
 await click('Hide Terminal Commands for step 1.1.1');await click('View Terminal Commands for step 1.1.1');assert.equal(calls.length,2);cleanup();await show();assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('async generation polls only the selected saved call and leaves other steps available',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});write=async body=>{const result=stepView(id,body.action_ref,'processing');views.set(body.action_ref,result);return result;};await show();await click('Generate Terminal Commands for step 1.1.1');
 assert.ok(screen.getByText('Generating terminal commands for step 1.1.1…'));assert.equal(screen.getByRole('button',{name:'Generate Terminal Commands for step 1.2.1'}).disabled,false);
 views.set('1.1.1',stepView(id));await act(async()=>t.mock.timers.tick(5000));assert.ok(screen.getByRole('button',{name:'Copy commands for step 1.1.1'}));assert.equal(calls.length,3);await act(async()=>t.mock.timers.tick(15000));assert.equal(calls.length,3);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});
test('distinct step requests progress and cancel independently',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});write=async body=>{const result=stepView(id,body.action_ref,body.action==='cancel'?'cancelled':'processing');views.set(body.action_ref,result);return result;};await show();await click('Generate Terminal Commands for step 1.1.1');await click('Generate Terminal Commands for step 1.2.1');
 await click('Cancel terminal commands for step 1.1.1');assert.equal(views.get('1.1.1').stage,'cancelled');assert.equal(views.get('1.2.1').stage,'processing');assert.ok(screen.getByText('Generating terminal commands for step 1.2.1…'));
 assert.deepEqual(calls.filter(c=>c.options.method==='POST').map(c=>[JSON.parse(c.options.body).action,JSON.parse(c.options.body).action_ref]),[['generate','1.1.1'],['generate','1.2.1'],['cancel','1.1.1']]);
});
test('restored pending and uncertain calls do not create replacements, and undefined criteria stay blocked',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});views.set('1.1.1',stepView(id,'1.1.1','processing'));views.set('1.2.1',stepView(id,'1.2.1','uncertain'));await show();await act(async()=>t.mock.timers.tick(5000));assert.equal(calls.filter(c=>c.options.method==='POST').length,0);assert.ok(screen.getByRole('button',{name:'Check Saved Commands for step 1.2.1'}));
 await click('Generate Terminal Commands for step 1.4.1');assert.ok(screen.getByText('Commands blocked · step 1.4.1'));assert.equal(screen.queryByRole('button',{name:'Copy commands for step 1.4.1'}),null);
});
test('a lost submission acknowledgement checks the saved call before allowing another generation attempt',async()=>{
 write=async body=>{views.set(body.action_ref,stepView(id,body.action_ref,'processing'));throw new Error('Lost submission acknowledgement');};await show();await click('Generate Terminal Commands for step 1.1.1');assert.ok(screen.getByText('Lost submission acknowledgement'));assert.ok(screen.getByRole('button',{name:'Check Saved Commands for step 1.1.1'}));
 await click('Check Saved Commands for step 1.1.1');assert.ok(screen.getByText('Generating terminal commands for step 1.1.1…'));assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});
test('unmount fences late results and Strict Mode never starts generation automatically',async()=>{
 await show(true);assert.equal(calls.filter(c=>c.options.method==='POST').length,0);let resolve;write=()=>new Promise(r=>{resolve=r;});await click('Generate Terminal Commands for step 1.1.1');const pending=calls.at(-1);cleanup();assert.equal(pending.options.signal.aborted,true);await act(async()=>resolve(stepView(id)));assert.equal(screen.queryByText('Copy commands'),null);
});
test('a failed saved-status read disables Generate until a successful read and public outlines never request commands',async()=>{
 list=async()=>{throw new Error('Database update required');};await show();assert.ok(screen.getByText('Database update required'));assert.equal(screen.getByRole('button',{name:'Generate Terminal Commands for step 1.1.1'}).disabled,true);list=async()=>stepSummary(id);await click('Check saved commands');assert.equal(screen.getByRole('button',{name:'Generate Terminal Commands for step 1.1.1'}).disabled,false);assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
 cleanup();calls=[];await show(false,false);assert.equal(calls.length,0);assert.equal(screen.queryByRole('button',{name:/Generate Terminal Commands/}),null);
});
