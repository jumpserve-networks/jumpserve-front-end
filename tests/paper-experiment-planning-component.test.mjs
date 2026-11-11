import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {breakdownFixture,planFixture} from './support/experiment-plan-fixture.mjs';
globalThis.__planComponent={};
const hook=registerHooks({resolve(specifier,context,next){if(specifier==='@/lib/browser-auth')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export const requireAccessToken=(...args)=>globalThis.__planComponent.token(...args);')};if(specifier==='@/lib/research-workflow-api')return{shortCircuit:true,url:'data:text/javascript,export const RESEARCH_SIGN_IN_REQUIRED="Sign in";'};return next(specifier,context);}});
const {PaperExperimentPlanning}=await import('../app/components/research-workflow/paper-experiment-planning.tsx');hook.deregister();
const id='11111111-1111-4111-8111-111111111111';
let calls,view,post,originalFetch;
beforeEach(()=>{
 calls=[];originalFetch=globalThis.fetch;globalThis.__planComponent.token=async(_message,owner)=>{assert.equal(owner,'owner');return 'verified-owner';};
 view={version:'paper-experiment-plan-v1',study_id:id,stage:'awaiting_confirmation',intake_revision:4,confirmed_at:null,confirmed_breakdown:null,plan:null,reason:null};
 post=async body=>{const b=breakdownFixture();for(const section of Object.keys(b.sections))b.sections[section]=body.sections[section].map(item=>({...b.sections[section].find(s=>s.id===item.id),description:item.description}));return view={...view,stage:'processing',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:b};};
 globalThis.fetch=async(url,options)=>{assert.match(url,/api\/experiment-plan\?id=/);assert.equal(options.headers.Authorization,'Bearer verified-owner');calls.push({url,options});return Response.json(options.method==='POST'?await post(JSON.parse(options.body)):view);};
});
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;});
async function show(){await act(async()=>{render(React.createElement(PaperExperimentPlanning,{assessmentId:id,ownerId:'owner',breakdown:breakdownFixture()}));});}
async function click(name){await act(async()=>{fireEvent.click(screen.getByRole('button',{name}));});}
async function check(name){await act(async()=>{fireEvent.click(screen.getByRole('checkbox',{name}));});}
const confirmLabel='I have reviewed all four sections and confirm this information for experiment planning.';
test('opening phase one does not start planning; edits and exclusions require fresh explicit confirmation',async()=>{
 await show();assert.equal(calls.length,1);assert.equal(calls[0].options.method,undefined);assert.equal(screen.getByRole('button',{name:'Confirm phase one and create experiment steps'}).disabled,true);
 await check(confirmLabel);assert.equal(screen.getByRole('button',{name:'Confirm phase one and create experiment steps'}).disabled,false);
 fireEvent.change(screen.getByRole('textbox',{name:'Experiment detail 1 description'}),{target:{value:'Owner-corrected experiment procedure'}});assert.equal(screen.getByRole('button',{name:'Confirm phase one and create experiment steps'}).disabled,true);
 await check('Include Access detail 1');assert.equal(screen.getByRole('textbox',{name:'Access detail 1 description'}).disabled,true);
 await check(confirmLabel);await click('Confirm phase one and create experiment steps');
 const sent=calls.filter(c=>c.options.method==='POST');assert.equal(sent.length,1);const body=JSON.parse(sent[0].options.body);assert.equal(body.action,'confirm');assert.equal(body.intake_revision,4);assert.equal(body.sections.access.length,0);assert.equal(body.sections.experiment[0].description,'Owner-corrected experiment procedure');assert.equal(body.sections.experiment[0].quote,undefined);
 assert.ok(screen.getByText('Preparing experiment implementation steps…'));assert.equal(screen.queryByRole('textbox'),null);assert.ok(screen.getByText('Owner-corrected experiment procedure'));
});
test('saved plans display ordered steps proposed choices missing information and retained source quotes',async()=>{
 view={...view,stage:'ready',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdownFixture(),plan:planFixture()};await show();assert.equal(calls.length,1);assert.ok(screen.getByText('Experiment steps ready'));assert.ok(screen.getByText('Proposed implementation scaffold · Proposed implementation'));assert.ok(screen.getByText('Which experiment platform should be used?'));assert.ok(screen.getAllByText('Original data quote').length>0);assert.equal(screen.queryByRole('checkbox'),null);assert.equal(screen.queryByRole('button',{name:/Confirm phase one/}),null);
});
test('lost confirmation response preserves edits and status reload discovers the original call',async()=>{
 await show();fireEvent.change(screen.getByRole('textbox',{name:'Data detail 1 description'}),{target:{value:'Keep this reviewed measurement'}});await check(confirmLabel);const actual=post;post=async body=>{await actual(body);throw new Error('Lost confirmation response');};await click('Confirm phase one and create experiment steps');assert.ok(screen.getByText('Lost confirmation response'));assert.equal(screen.getByRole('textbox',{name:'Data detail 1 description'}).value,'Keep this reviewed measurement');await click('Check planning status');assert.ok(screen.getByText('Keep this reviewed measurement'));assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});
test('processing polls only the original plan, then stops polling when ready',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});view={...view,stage:'processing',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdownFixture()};await show();assert.equal(calls.length,1);view={...view,stage:'ready',plan:planFixture()};await act(async()=>{t.mock.timers.tick(5000);});assert.equal(calls.length,2);await act(async()=>{t.mock.timers.tick(15000);});assert.equal(calls.length,2);
});
test('failed status reads leave confirmation disabled and can be checked again',async()=>{
 globalThis.fetch=async()=>Response.json({error:'Database update required'},{status:424});await show();assert.ok(screen.getByText('Database update required'));assert.equal(screen.queryByRole('button',{name:/Confirm phase one/}),null);
});
