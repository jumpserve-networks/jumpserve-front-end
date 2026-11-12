import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {breakdownFixture,planFixture} from './support/experiment-plan-fixture.mjs';
globalThis.__planComponent={};
globalThis.__planReact=React;
const navigation=`const subscribe=callback=>{globalThis.__planComponent.listeners.add(callback);return()=>globalThis.__planComponent.listeners.delete(callback);};export const usePathname=()=>'/research-verification/new-assessment/11111111-1111-4111-8111-111111111111';export const useRouter=()=>({push:(...args)=>globalThis.__planComponent.push(...args)});export function useSearchParams(){const query=globalThis.__planReact.useSyncExternalStore(subscribe,()=>globalThis.__planComponent.search);return new URLSearchParams(query);}`;
const hook=registerHooks({resolve(specifier,context,next){if(specifier==='next/link')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export default function Link({prefetch,...props}){return globalThis.__planReact.createElement("a",props);}')};if(specifier==='next/navigation')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(navigation)};if(specifier==='@/lib/browser-auth')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export const requireAccessToken=(...args)=>globalThis.__planComponent.token(...args);')};if(specifier==='@/lib/research-workflow-api')return{shortCircuit:true,url:'data:text/javascript,export const RESEARCH_SIGN_IN_REQUIRED="Sign in";'};return next(specifier,context);}});
const {PaperExperimentPlanning}=await import('../app/components/research-workflow/paper-experiment-planning.tsx');hook.deregister();
const id='11111111-1111-4111-8111-111111111111';
let calls,view,post,originalFetch;
beforeEach(()=>{
 calls=[];originalFetch=globalThis.fetch;globalThis.__planComponent.token=async(_message,owner)=>{assert.equal(owner,'owner');return 'verified-owner';};
 globalThis.__planComponent.search='';globalThis.__planComponent.listeners=new Set();globalThis.__planComponent.pushes=[];
 globalThis.__planComponent.push=(url,options)=>{globalThis.__planComponent.pushes.push({url,options});globalThis.__planComponent.search=new URL(url,'https://example.test').search.slice(1);for(const callback of globalThis.__planComponent.listeners)callback();};
 view={version:'paper-experiment-plan-v1',study_id:id,stage:'awaiting_confirmation',intake_revision:4,confirmed_at:null,confirmed_breakdown:null,plan:null,reason:null};
 post=async body=>{const b=breakdownFixture();for(const section of Object.keys(b.sections))b.sections[section]=body.sections[section].map(item=>({...b.sections[section].find(s=>s.id===item.id),description:item.description}));return view={...view,stage:'processing',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:b};};
 globalThis.fetch=async(url,options)=>{assert.match(url,/api\/experiment-plan\?id=/);assert.equal(options.headers.Authorization,'Bearer verified-owner');calls.push({url,options});return Response.json(options.method==='POST'?await post(JSON.parse(options.body)):view);};
});
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;});
async function show(options={}){await act(async()=>{render(React.createElement(PaperExperimentPlanning,{assessmentId:id,ownerId:'owner',breakdown:breakdownFixture(),...options}));});}
async function click(name){await act(async()=>{fireEvent.click(screen.getByRole('button',{name}));});}
async function check(name){await act(async()=>{fireEvent.click(screen.getByRole('checkbox',{name}));});}
test('opening phase one does not start planning; the button confirms valid edits and exclusions without a review checkbox',async()=>{
 await show();assert.equal(calls.length,1);assert.equal(calls[0].options.method,undefined);assert.equal(screen.getByRole('button',{name:'Confirm phase one and create experiment steps'}).disabled,false);assert.equal(screen.queryByLabelText(/I have reviewed all four sections/),null);
 const description=screen.getByRole('textbox',{name:'Experiment detail 1 description'});
 fireEvent.change(description,{target:{value:'  '}});assert.equal(screen.getByRole('button',{name:'Confirm phase one and create experiment steps'}).disabled,true);await click('Confirm phase one and create experiment steps');assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
 fireEvent.change(description,{target:{value:'Owner-corrected experiment procedure'}});assert.equal(screen.getByRole('button',{name:'Confirm phase one and create experiment steps'}).disabled,false);
 await check('Include Access detail 1');assert.equal(screen.getByRole('textbox',{name:'Access detail 1 description'}).disabled,true);
 await click('Confirm phase one and create experiment steps');
 const sent=calls.filter(c=>c.options.method==='POST');assert.equal(sent.length,1);const body=JSON.parse(sent[0].options.body);assert.equal(body.action,'confirm');assert.equal(body.intake_revision,4);assert.equal(body.sections.access.length,0);assert.equal(body.sections.experiment[0].description,'Owner-corrected experiment procedure');assert.equal(body.sections.experiment[0].quote,undefined);
 assert.ok(screen.getByText('Preparing experiment implementation steps…'));assert.equal(screen.queryByRole('textbox'),null);assert.ok(screen.getByText('Owner-corrected experiment procedure'));
});
test('saved plans display ordered steps proposed choices missing information and retained source quotes',async()=>{
 view={...view,stage:'ready',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdownFixture(),plan:planFixture()};await show();assert.equal(calls.length,1);assert.ok(screen.getByText('Experiment steps ready'));assert.ok(screen.getByText('Proposed implementation scaffold · Proposed implementation'));assert.ok(screen.getByRole('heading',{name:'Decisions to resolve before execution'}));assert.ok(screen.getByText('Which experiment platform should be used?'));assert.ok(screen.getAllByText('Original data quote').length>0);assert.equal(screen.queryByRole('checkbox'),null);assert.equal(screen.queryByRole('button',{name:/Confirm phase one/}),null);
});
test('lost confirmation response preserves edits and status reload discovers the original call',async()=>{
 await show();fireEvent.change(screen.getByRole('textbox',{name:'Data detail 1 description'}),{target:{value:'Keep this reviewed measurement'}});const actual=post;post=async body=>{await actual(body);throw new Error('Lost confirmation response');};await click('Confirm phase one and create experiment steps');assert.ok(screen.getByText('Lost confirmation response'));assert.equal(screen.getByRole('textbox',{name:'Data detail 1 description'}).value,'Keep this reviewed measurement');await click('Check planning status');assert.ok(screen.getByText('Keep this reviewed measurement'));assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});
test('processing polls only the original plan, then stops polling when ready',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});view={...view,stage:'processing',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdownFixture()};await show();assert.equal(calls.length,1);view={...view,stage:'ready',plan:planFixture()};await act(async()=>{t.mock.timers.tick(5000);});assert.equal(calls.length,2);await act(async()=>{t.mock.timers.tick(15000);});assert.equal(calls.length,2);
});
test('failed status reads leave confirmation disabled and can be checked again',async()=>{
 globalThis.fetch=async()=>Response.json({error:'Database update required'},{status:424});await show();assert.ok(screen.getByText('Database update required'));assert.equal(screen.queryByRole('button',{name:/Confirm phase one/}),null);
});
const wizard=()=>show({wizard:true});
test('wizard shows only the breakdown before confirmation and guards direct future-step URLs',async()=>{
 globalThis.__planComponent.search='step=execution&from=retained';await wizard();
 assert.ok(screen.getByRole('heading',{name:'Paper breakdown'}));assert.equal(screen.queryByRole('heading',{name:'Experiment Steps'}),null);assert.equal(screen.queryByText('Experiment execution is coming soon.'),null);
 assert.equal(screen.getByRole('button',{name:'Step 2: Initial Assessment'}).getAttribute('aria-current'),'step');assert.equal(screen.getByRole('button',{name:'Step 3: Experiment Steps'}).disabled,true);assert.equal(screen.getByRole('button',{name:'Step 4: Run Experiments'}).disabled,true);assert.equal(screen.getByRole('button',{name:'Confirm and continue'}).disabled,false);
 fireEvent.change(screen.getByRole('textbox',{name:'Data detail 1 description'}),{target:{value:'Reviewed measurement'}});
 await act(async()=>{globalThis.__planComponent.push('?step=implementation');});assert.equal(screen.getByRole('textbox',{name:'Data detail 1 description'}).value,'Reviewed measurement');assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('confirmation advances to implementation; back navigation retains the confirmed snapshot without another submission',async()=>{
 globalThis.__planComponent.search='from=retained';await wizard();fireEvent.change(screen.getByRole('textbox',{name:'Data detail 1 description'}),{target:{value:'Confirmed edited measurement'}});await click('Confirm and continue');
 assert.ok(screen.getByRole('heading',{name:'Experiment Steps'}));assert.equal(screen.queryByRole('heading',{name:'Paper breakdown'}),null);assert.equal(screen.queryByText('Experiment execution is coming soon.'),null);assert.equal(screen.getByRole('button',{name:'Next: Run Experiments'}).disabled,true);
 assert.match(globalThis.__planComponent.pushes.at(-1).url,/from=retained&step=implementation/);assert.deepEqual(globalThis.__planComponent.pushes.at(-1).options,{scroll:false});assert.equal(document.activeElement,screen.getByRole('region',{name:'Experiment Steps step'}));
 await click('Back to Initial Assessment');assert.ok(screen.getByText('Confirmed edited measurement'));assert.equal(screen.queryByRole('textbox'),null);assert.equal(screen.queryByRole('button',{name:'Confirm and continue'}),null);await click('Next: Experiment Steps');assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});
test('ready wizard resumes implementation and visits the execution placeholder without any launch or queue request',async()=>{
 view={...view,stage:'ready',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdownFixture(),plan:planFixture()};await wizard();assert.ok(screen.getByRole('heading',{name:'Experiment Steps'}));assert.equal(screen.queryByRole('heading',{name:'Paper breakdown'}),null);await click('Next: Run Experiments');assert.ok(screen.getByText('Experiment execution is coming soon.'));assert.equal(screen.queryByRole('heading',{name:'Experiment Steps'}),null);assert.equal(screen.queryByRole('heading',{name:'Paper breakdown'}),null);assert.equal(screen.getByRole('button',{name:'Step 4: Run Experiments'}).getAttribute('aria-current'),'step');assert.equal(screen.getByRole('button',{name:'Run experiments',exact:true}).disabled,true);await click('Back to Experiment Steps');await click('Step 2: Initial Assessment');assert.ok(screen.getByRole('heading',{name:'Paper breakdown'}));assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('retired queue URLs open the placeholder and survive reload and browser back selects a prior step without new writes',async()=>{
 view={...view,stage:'ready',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdownFixture(),plan:planFixture()};globalThis.__planComponent.search='step=queue';await wizard();assert.ok(screen.getByText('Experiment execution is coming soon.'));await act(async()=>{globalThis.__planComponent.search='step=breakdown';for(const callback of globalThis.__planComponent.listeners)callback();});assert.ok(screen.getByRole('heading',{name:'Paper breakdown'}));assert.equal(screen.queryByText('Experiment execution is coming soon.'),null);assert.equal(calls.length,1);
});
test('failed and uncertain planning stay on implementation and cannot advance to the execution placeholder',async()=>{
 for(const stage of ['failed','uncertain','cancelled']){view={...view,stage,confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdownFixture()};globalThis.__planComponent.search='step=queue';await wizard();assert.ok(screen.getByRole('heading',{name:'Experiment Steps'}));assert.equal(screen.getByRole('button',{name:'Next: Run Experiments'}).disabled,true);assert.equal(screen.getByRole('button',{name:'Step 4: Run Experiments'}).disabled,true);cleanup();}
 assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
