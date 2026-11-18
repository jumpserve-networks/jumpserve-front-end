import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {breakdownFixture,planFixture} from './support/experiment-plan-fixture.mjs';
import {implementationBreakdown,hierarchicalImplementationPlan,granularImplementationPlan} from './support/implementation-plan-fixture.mjs';
import {experimentScriptsView} from './support/experiment-scripts-fixture.mjs';
import {PaperWorkManager} from '../lib/paper-work-manager.ts';
import {confirmPaperSections} from '../lib/paper-experiment-plan.ts';
globalThis.__planComponent={};
globalThis.__planReact=React;
const navigation=`const subscribe=callback=>{globalThis.__planComponent.listeners.add(callback);return()=>globalThis.__planComponent.listeners.delete(callback);};export const usePathname=()=>'/research-verification/assessment/11111111-1111-4111-8111-111111111111';export const useRouter=()=>({push:(...args)=>globalThis.__planComponent.push(...args)});export function useSearchParams(){const query=globalThis.__planReact.useSyncExternalStore(subscribe,()=>globalThis.__planComponent.search);return new URLSearchParams(query);}`;
const hook=registerHooks({resolve(specifier,context,next){if(specifier==='next/link')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export default function Link({prefetch,...props}){return globalThis.__planReact.createElement("a",props);}')};if(specifier==='next/navigation')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(navigation)};if(specifier==='@/lib/browser-auth')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export const requireAccessToken=(...args)=>globalThis.__planComponent.token(...args);')};if(specifier==='@/lib/research-workflow-api')return{shortCircuit:true,url:'data:text/javascript,export const RESEARCH_SIGN_IN_REQUIRED="Sign in";'};return next(specifier,context);}});
const {PaperExperimentPlanning}=await import('../app/components/research-workflow/paper-experiment-planning.tsx');const {PaperWorkScope}=await import('../app/components/research-workflow/paper-work-provider.tsx');hook.deregister();
const id='11111111-1111-4111-8111-111111111111';
let calls,terminalCalls,view,post,originalFetch,work;
beforeEach(()=>{
 work=new PaperWorkManager('owner',async()=>({version:'paper-work-status-v1',study_ids:[id],units:[],next_cursor:0}));work.start();
 calls=[];terminalCalls=[];originalFetch=globalThis.fetch;globalThis.__planComponent.token=async(_message,owner)=>{assert.equal(owner,'owner');return 'verified-owner';};
 globalThis.__planComponent.search='';globalThis.__planComponent.listeners=new Set();globalThis.__planComponent.pushes=[];
 globalThis.__planComponent.push=(url,options)=>{globalThis.__planComponent.pushes.push({url,options});globalThis.__planComponent.search=new URL(url,'https://example.test').search.slice(1);for(const callback of globalThis.__planComponent.listeners)callback();};
 view={version:'paper-experiment-plan-v1',study_id:id,stage:'awaiting_confirmation',intake_revision:4,confirmed_at:null,confirmed_breakdown:null,plan:null,reason:null};
 post=async body=>{const b=breakdownFixture();for(const section of Object.keys(b.sections))b.sections[section]=body.sections[section].map(item=>({...b.sections[section].find(s=>s.id===item.id),description:item.description}));return view={...view,stage:'processing',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:b};};
 globalThis.fetch=async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer verified-owner');
  if(url.includes('/api/experiment-scripts?')){
   terminalCalls.push({url,options});const index=Number(new URL(url,'https://example.test').searchParams.get('experiment'));
   const saved=experimentScriptsView(id,'processing');saved.experiment_index=index;return Response.json(saved);
  }
  assert.match(url,/api\/experiment-plan\?id=/);calls.push({url,options});return Response.json(options.method==='POST'?await post(JSON.parse(options.body)):view);
 };
});
afterEach(()=>{cleanup();work.stop();globalThis.fetch=originalFetch;});
async function show(options={}){await act(async()=>{render(React.createElement(PaperWorkScope,{manager:work},React.createElement(PaperExperimentPlanning,{assessmentId:id,ownerId:'owner',breakdown:breakdownFixture(),...options})));});}
async function click(name){await act(async()=>{fireEvent.click(screen.getByRole('button',{name}));});}
async function check(name){await act(async()=>{fireEvent.click(screen.getByRole('checkbox',{name}));});}
async function editDetail(label,text){await click('Edit '+label);fireEvent.change(screen.getByRole('textbox',{name:label+' description'}),{target:{value:text}});await click('Save '+label);}
test('opening phase one does not start planning; the button confirms valid edits and exclusions without a review checkbox',async()=>{
 await show();assert.equal(calls.length,1);assert.equal(terminalCalls.length,0);assert.equal(calls[0].options.method,undefined);assert.equal(screen.getByRole('button',{name:'Confirm phase one and create experiment steps'}).disabled,false);assert.equal(screen.queryByLabelText(/I have reviewed all four sections/),null);
 assert.equal(screen.queryByRole('textbox'),null);await click('Edit Experiment detail 1');const description=screen.getByRole('textbox',{name:'Experiment detail 1 description'});
 fireEvent.change(description,{target:{value:'  '}});assert.equal(screen.getByRole('button',{name:'Confirm phase one and create experiment steps'}).disabled,true);await click('Confirm phase one and create experiment steps');assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
 assert.equal(screen.getByRole('button',{name:'Save Experiment detail 1'}).disabled,true);
 fireEvent.change(description,{target:{value:'Owner-corrected experiment procedure'}});assert.equal(screen.getByRole('button',{name:'Confirm phase one and create experiment steps'}).disabled,true);await click('Save Experiment detail 1');assert.equal(screen.getByRole('button',{name:'Confirm phase one and create experiment steps'}).disabled,false);
 await check('Include Access detail 1');assert.equal(screen.getByRole('button',{name:'Edit Access detail 1'}).disabled,true);
 await click('Confirm phase one and create experiment steps');
 const sent=calls.filter(c=>c.options.method==='POST');assert.equal(sent.length,1);const body=JSON.parse(sent[0].options.body);assert.equal(body.action,'confirm');assert.equal(body.intake_revision,4);assert.equal(body.sections.access.length,0);assert.equal(body.sections.experiment[0].description,'Owner-corrected experiment procedure');assert.equal(body.sections.experiment[0].quote,undefined);
 assert.ok(screen.getByText('Preparing experiment implementation steps…'));assert.equal(screen.queryByRole('textbox'),null);assert.ok(screen.getByText('Owner-corrected experiment procedure'));
});
test('saved plans display ordered steps proposed choices missing information and retained source quotes',async()=>{
 view={...view,stage:'ready',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdownFixture(),plan:planFixture()};await show();assert.equal(calls.length,1);assert.equal(screen.queryByText('Experiment steps ready'),null);assert.equal(screen.queryByText(/^Phase one confirmed/),null);assert.ok(screen.getByText('Proposed implementation scaffold · Proposed implementation'));assert.ok(screen.getByRole('heading',{name:'Decisions to resolve before execution'}));assert.ok(screen.getByText('Which experiment platform should be used?'));assert.ok(screen.getAllByText('Original data quote').length>0);assert.equal(screen.queryByRole('checkbox'),null);assert.equal(screen.queryByRole('button',{name:/Confirm phase one/}),null);
});
test('hierarchical stages show numbered actionable children and retain each claim criterion and its evidence',async()=>{
 view={...view,stage:'ready',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:implementationBreakdown(),plan:hierarchicalImplementationPlan()};await wizard();
 const experiments=screen.getByRole('list',{name:'Experiments'}),stages=within(experiments).getByRole('list',{name:'Stages for experiment 1'});
 assert.equal(stages.children.length,4);assert.ok(screen.getByRole('heading',{name:/1\.1 Prepare and configure the experiment/}));
 const actions=screen.getByRole('list',{name:/Actions for 1\.4 Validate the three claims/});assert.equal(actions.children.length,3);
 assert.ok(within(actions).getByRole('heading',{name:/1\.4\.1 Evaluate H1/}));assert.ok(within(actions).getByRole('heading',{name:/1\.4\.2 Evaluate H2/}));assert.ok(within(actions).getByRole('heading',{name:/1\.4\.3 Evaluate H3/}));
 assert.equal(screen.getAllByText(/^Validation check:/).length,3);assert.ok(within(actions).getAllByText(/PDF page/).length>0);
 assert.ok(screen.getByRole('heading',{name:'Decisions to resolve before execution'}));assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('confirmation retains experiment specifications as planning inputs without repeating them on step three',async()=>{
 const breakdown=implementationBreakdown(),original=structuredClone(breakdown);
 const excluded={...structuredClone(breakdown.sections.experiment[0]),id:'excluded-experiment',description:'Exclude this experiment',specification:{setup:'Excluded setup.',procedure:'Excluded procedure.',conditions:'Excluded conditions.',comparisons:'Excluded comparisons.'}};
 breakdown.sections.experiment.push(excluded);
 post=async body=>view={...view,stage:'processing',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:confirmPaperSections(breakdown,body.sections)};
 await show({wizard:true,breakdown});
 for(const [field,detail] of Object.entries(original.sections.experiment[0].specification)){
  assert.equal(screen.queryByText(new RegExp(`^${field}$`,'i')),null);assert.equal(screen.queryByText(detail),null);
 }
 await check('Include Experiment detail 2');await click('Continue to Step 3');
 assert.ok(screen.getByRole('heading',{name:'Experiment Steps'}));assert.ok(screen.getByText('Preparing experiment implementation steps…'));
 for(const [field,detail] of Object.entries(original.sections.experiment[0].specification)){
  assert.equal(screen.queryByText(new RegExp(`^${field}$`,'i')),null);assert.equal(screen.queryByText(detail),null);
 }
 for(const detail of Object.values(excluded.specification))assert.equal(screen.queryByText(detail),null);
 assert.deepEqual(view.confirmed_breakdown.sections.experiment[0],original.sections.experiment[0]);
 await click('Back to Initial Assessment');assert.equal(screen.queryByText(original.sections.experiment[0].specification.setup),null);
 await click('Next: Experiment Steps');assert.equal(screen.queryByText(original.sections.experiment[0].specification.setup),null);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});
test('ready plans show generated stages and actions without repeating source experiment specifications',async()=>{
 const breakdown=implementationBreakdown(),first=breakdown.sections.experiment[0];
 const extra=(id,description,setup)=>({...structuredClone(first),id,description,specification:{...first.specification,setup}});
 breakdown.sections.experiment.push(extra('second-experiment','Second confirmed experiment','Second experiment setup.'),extra('third-experiment','Third confirmed experiment','Third experiment setup.'));
 const plan=hierarchicalImplementationPlan();plan.experiments[0].experiment_refs=['experiment-2','experiment-3'];
 plan.experiments.push({title:'Separate first experiment',experiment_refs:['experiment-1'],stages:[{title:'Prepare independently',steps:[{title:'Configure first experiment',instructions:'Record and calibrate its configuration before execution.',basis:'proposed',validation_ref:null,source_refs:['experiment-1']}]}],open_questions:[]});
 view={...view,stage:'ready',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdown,plan};await wizard();
 const experiments=screen.getByRole('list',{name:'Experiments'}),firstPlan=experiments.children[0],secondPlan=experiments.children[1];
 assert.ok(within(firstPlan).getByRole('heading',{name:/1\.1 Prepare and configure the experiment/}));assert.ok(within(secondPlan).getByRole('heading',{name:/2\.1\.1 Configure first experiment/}));
 for(const item of breakdown.sections.experiment)for(const detail of Object.values(item.specification))assert.equal(screen.queryByText(detail),null);
 for(const label of ['Setup','Procedure','Conditions','Comparisons'])assert.equal(screen.queryByText(label,{exact:true}),null);
 assert.ok(screen.getAllByText('Confirmed supporting details').length>0);assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
 assert.deepEqual(terminalCalls,[]);assert.equal(terminalCalls.filter(c=>c.options.method==='POST').length,0);
});
test('stages collapse and expand locally without new planning requests or changing the saved hierarchy',async()=>{
 const plan=hierarchicalImplementationPlan();view={...view,stage:'ready',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:implementationBreakdown(),plan};await wizard();
 const title=screen.getByRole('heading',{name:/1\.1 Prepare and configure the experiment/}),details=title.closest('details'),summary=title.closest('summary');
 assert.equal(details.open,true);fireEvent.click(summary);assert.equal(details.open,false);fireEvent.click(summary);assert.equal(details.open,true);
 assert.deepEqual(view.plan,plan);assert.equal(calls.length,1);assert.equal(screen.queryByRole('button',{name:'Run experiments',exact:true}),null);
});
test('lost confirmation response preserves edits and status reload discovers the original call',async()=>{
 await show();await editDetail('Data detail 1','Keep this reviewed measurement');const actual=post;post=async body=>{await actual(body);throw new Error('Lost confirmation response');};await click('Confirm phase one and create experiment steps');assert.ok(screen.getByText('Lost confirmation response'));assert.ok(screen.getByText('Keep this reviewed measurement'));await click('Check planning status');assert.ok(screen.getByText('Keep this reviewed measurement'));assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});
test('leaving before confirmation is acknowledged preserves Step 3 submission without redirecting back',async()=>{
 const actual=post;let finish;
 post=body=>new Promise(resolve=>{finish=async()=>resolve(await actual(body));});
 await show({wizard:true,title:'Background plan'});await click('Continue to Step 3');
 const admission=calls.find(c=>c.options.method==='POST');assert.ok(admission);assert.equal(work.hasSubmissions(),true);
 cleanup();assert.equal(admission.options.signal.aborted,false);
 await act(async()=>finish());
 assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.equal(globalThis.__planComponent.pushes.length,0);
 assert.equal(work.getSnapshot().activity[0].step,3);assert.equal(work.getSnapshot().activity[0].stage,'processing');assert.equal(work.hasSubmissions(),false);
});
test('processing polls only the original plan, then stops polling when ready',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});view={...view,stage:'processing',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdownFixture()};await show();assert.equal(calls.length,1);assert.equal(terminalCalls.length,0);view={...view,stage:'ready',plan:planFixture()};await act(async()=>{t.mock.timers.tick(5000);});assert.equal(calls.length,2);assert.equal(terminalCalls.filter(c=>c.options.method==='POST').length,0);await act(async()=>{t.mock.timers.tick(15000);});assert.equal(calls.length,2);assert.equal(terminalCalls.filter(c=>c.options.method==='POST').length,0);
});
test('failed status reads leave confirmation disabled and can be checked again',async()=>{
 globalThis.fetch=async()=>Response.json({error:'Database update required'},{status:424});await show();assert.ok(screen.getByText('Database update required'));assert.equal(screen.queryByRole('button',{name:/Confirm phase one/}),null);
});
const wizard=()=>show({wizard:true});
test('Step 3 never requests scripts; Step 4 reads its saved packages',async()=>{
 view={...view,stage:'ready',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdownFixture(),plan:planFixture()};globalThis.__planComponent.search='step=breakdown';await wizard();assert.equal(terminalCalls.length,0);
 await click('Next: Experiment Steps');assert.deepEqual(terminalCalls,[]);assert.equal(screen.queryByRole('button',{name:'Generate terminal commands'}),null);
 await click('Continue to Step 4');assert.deepEqual(terminalCalls.map(c=>c.options.method),['GET']);await click('Back to Experiment Steps');assert.equal(terminalCalls.length,1);
 await click('Step 2: Initial Assessment');assert.equal(terminalCalls.filter(c=>c.options.method==='POST').length,0);
});
test('wizard shows only the breakdown before confirmation and guards direct future-step URLs',async()=>{
 globalThis.__planComponent.search='step=execution&from=retained';await wizard();
 assert.ok(screen.getByRole('heading',{name:'Paper breakdown'}));assert.equal(screen.queryByRole('heading',{name:'Experiment Steps'}),null);assert.equal(screen.queryByText('Experiment execution is coming soon.'),null);
 assert.equal(screen.getByRole('button',{name:'Step 2: Initial Assessment'}).getAttribute('aria-current'),'step');assert.equal(screen.getByRole('button',{name:'Step 3: Experiment Steps'}).disabled,true);assert.equal(screen.getByRole('button',{name:'Step 4: Setup & Run Commands'}).disabled,true);assert.equal(screen.getByRole('button',{name:'Continue to Step 3'}).disabled,false);
 await click('Edit Data detail 1');assert.equal(screen.getByRole('button',{name:'Continue to Step 3'}).disabled,true);assert.equal(screen.getByRole('button',{name:'Step 1: Paper Upload'}).getAttribute('aria-disabled'),'true');fireEvent.change(screen.getByRole('textbox',{name:'Data detail 1 description'}),{target:{value:'Reviewed measurement'}});await click('Save Data detail 1');
 await act(async()=>{globalThis.__planComponent.push('?step=implementation');});assert.ok(screen.getByText('Reviewed measurement'));assert.equal(screen.queryByRole('textbox'),null);assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('confirmation advances to implementation; back navigation retains the confirmed snapshot without another submission',async()=>{
 globalThis.__planComponent.search='from=retained';await wizard();await editDetail('Data detail 1','Confirmed edited measurement');await click('Continue to Step 3');
 assert.ok(screen.getByRole('heading',{name:'Experiment Steps'}));assert.equal(screen.queryByRole('heading',{name:'Paper breakdown'}),null);assert.equal(screen.queryByText('Experiment execution is coming soon.'),null);assert.equal(screen.getByRole('button',{name:'Continue to Step 4'}).disabled,true);
 assert.match(globalThis.__planComponent.pushes.at(-1).url,/from=retained&step=implementation/);assert.deepEqual(globalThis.__planComponent.pushes.at(-1).options,{scroll:false});assert.equal(document.activeElement,screen.getByRole('region',{name:'Experiment Steps step'}));
 await click('Back to Initial Assessment');assert.ok(screen.getByText('Confirmed edited measurement'));assert.equal(screen.queryByText(/^Phase one confirmed/),null);assert.equal(screen.queryByRole('textbox'),null);assert.equal(screen.queryByRole('button',{name:'Continue to Step 3'}),null);await click('Next: Experiment Steps');assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
});
test('ready wizard resumes implementation and opens shared setup without a launch request',async()=>{
 view={...view,stage:'ready',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdownFixture(),plan:planFixture()};await wizard();assert.ok(screen.getByRole('heading',{name:'Experiment Steps'}));assert.equal(screen.queryByRole('heading',{name:'Paper breakdown'}),null);await click('Continue to Step 4');assert.ok(screen.getByRole('heading',{name:'Setup & Run Commands'}));assert.equal(screen.queryByRole('heading',{name:'Experiment Steps'}),null);assert.equal(screen.queryByRole('heading',{name:'Paper breakdown'}),null);assert.equal(screen.getByRole('button',{name:'Step 4: Setup & Run Commands'}).getAttribute('aria-current'),'step');assert.equal(screen.queryByRole('button',{name:'Run experiments',exact:true}),null);await click('Back to Experiment Steps');await click('Step 2: Initial Assessment');assert.ok(screen.getByRole('heading',{name:'Paper breakdown'}));assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('retired queue URLs open shared setup and survive reload and browser back selects a prior step without new writes',async()=>{
 view={...view,stage:'ready',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdownFixture(),plan:planFixture()};globalThis.__planComponent.search='step=queue';await wizard();assert.ok(screen.getByRole('heading',{name:'Setup & Run Commands'}));await act(async()=>{globalThis.__planComponent.search='step=breakdown';for(const callback of globalThis.__planComponent.listeners)callback();});assert.ok(screen.getByRole('heading',{name:'Paper breakdown'}));assert.equal(screen.queryByText('Experiment execution is coming soon.'),null);assert.equal(calls.length,1);
});
test('failed and uncertain planning stay on implementation and cannot advance to the execution placeholder',async()=>{
 for(const stage of ['failed','uncertain','cancelled']){view={...view,stage,confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdownFixture()};globalThis.__planComponent.search='step=queue';await wizard();assert.ok(screen.getByRole('heading',{name:'Experiment Steps'}));assert.equal(screen.getByRole('button',{name:'Continue to Step 4'}).disabled,true);assert.equal(screen.getByRole('button',{name:'Step 4: Setup & Run Commands'}).disabled,true);cleanup();}
 assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('the wizard stays above the paper header across steps without remounting metadata or repeating planning requests',async()=>{
 let mounts=0;
 function PaperHeader(){React.useEffect(()=>{mounts++;},[]);return React.createElement('header',null,React.createElement('h1',null,'Retained paper heading'));}
 view={...view,stage:'ready',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdownFixture(),plan:planFixture()};await show({wizard:true,header:React.createElement(PaperHeader)});
 const checkOrder=()=>{const nav=screen.getByRole('navigation',{name:'Assessment steps'}),header=screen.getByRole('heading',{name:'Retained paper heading'});assert.ok(nav.compareDocumentPosition(header)&Node.DOCUMENT_POSITION_FOLLOWING);assert.equal(screen.getAllByRole('navigation',{name:'Assessment steps'}).length,1);assert.equal(screen.getAllByRole('heading',{level:1}).length,1);};
 checkOrder();await click('Continue to Step 4');checkOrder();await click('Step 2: Initial Assessment');checkOrder();assert.ok(screen.getByRole('heading',{name:'Paper breakdown'}));assert.equal(mounts,1);assert.equal(calls.length,1);assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
test('granular actions keep experiment, stage and action numbering with independent instructions and original evidence',async()=>{
 const breakdown=implementationBreakdown(),plan=granularImplementationPlan();
 view={...view,stage:'ready',confirmed_at:'2026-11-11T12:00:00Z',confirmed_breakdown:breakdown,plan};await wizard();
 const experiments=screen.getByRole('list',{name:'Experiments'}),stages=screen.getByRole('list',{name:'Stages for experiment 1'}),actions=screen.getByRole('list',{name:'Actions for 1.4 Collect and persist measurements'});
 assert.equal(experiments.tagName,'OL');assert.equal(stages.tagName,'OL');assert.equal(actions.tagName,'OL');assert.equal(stages.children.length,6);assert.equal(actions.children.length,6);
 assert.ok(screen.getByRole('heading',{name:/1\.4\.1 Freeze the trial schedule/}));assert.ok(screen.getByRole('heading',{name:/1\.4\.6 Persist normalized measurements/}));
 assert.ok(screen.getByRole('heading',{name:/1\.6\.1 Evaluate H1/}));assert.ok(screen.getByRole('heading',{name:/1\.6\.3 Evaluate H3/}));
 assert.ok(within(actions.children[0]).getByText(plan.experiments[0].stages[3].steps[0].instructions));assert.equal(screen.getAllByText(/^Validation check:/).length,3);
 assert.ok(screen.getAllByText('PDF page 2').length>0);assert.deepEqual(view.plan,plan);assert.equal(calls.length,1);
});
