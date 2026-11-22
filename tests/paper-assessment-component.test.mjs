import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {breakdownFixture} from './support/experiment-plan-fixture.mjs';
globalThis.__paperWizardReact=React;
const hook=registerHooks({resolve(specifier,context,next){
 const replacements={
  'next/link':'export default function Link({prefetch,...props}){return globalThis.__paperWizardReact.createElement("a",props);}',
  'next/navigation':'export const usePathname=()=>"/research-verification/assessment/saved";export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({push(){}});',
  '@/app/components/user-preferences':'export const useUserPreferences=()=>({userId:globalThis.__paperWizard.userId});export const LocalDateTime=({value})=>globalThis.__paperWizardReact.createElement("time",{dateTime:value},value);',
  '@/lib/paper-intake-client':'export const paperIntakeFetch=async()=>{globalThis.__paperWizard.reads++;return structuredClone(globalThis.__paperWizard.view);};',
  './paper-experiment-planning':'export function PaperExperimentPlanning(props){globalThis.__paperWizard.planning=props;const [checked,setChecked]=globalThis.__paperWizardReact.useState(false);return globalThis.__paperWizardReact.createElement("div",null,props.header,globalThis.__paperWizardReact.createElement("p",null,props.wizard?"Wizard planning screen":"Combined planning view"),globalThis.__paperWizardReact.createElement("input",{type:"checkbox","aria-label":"Draft consent",checked,onChange:e=>setChecked(e.target.checked)}));}',
 };
 return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);
}});
const {PaperAssessment}=await import('../app/components/research-workflow/paper-assessment.tsx');hook.deregister();
const id='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{globalThis.__paperWizard={userId:'owner',reads:0,view:{version:'paper-intake-next-v1',id,status:'ready',review_version:'research-paper-review-v1',stage:'ready',title:'Saved paper',authors:[],domain:null,created_at:'2026-11-11T12:00:00Z',updated_at:'2026-11-11T12:00:00Z',reason:null,breakdown:breakdownFixture(),owner:true,experiment_jobs:0},planning:null};});
afterEach(cleanup);
const show=(wizard=true,props={})=>act(async()=>{render(React.createElement(PaperAssessment,{assessmentId:id,wizard,...props},'Legacy detail'));});
test('the shared assessment skips private intake for signed-out readers',async()=>{
 globalThis.__paperWizard.userId=null;await show(true,{embedded:true,ownerOnly:true});
 assert.equal(globalThis.__paperWizard.reads,0);assert.equal(globalThis.__paperWizard.planning,null);assert.equal(document.body.textContent,'');
});
test('another signed-in reader cannot see the owner wizard',async()=>{
 Object.assign(globalThis.__paperWizard.view,{owner:false,breakdown:null});await show(true,{embedded:true,ownerOnly:true});
 assert.equal(globalThis.__paperWizard.reads,1);assert.equal(globalThis.__paperWizard.planning,null);assert.equal(document.body.textContent,'');
});
test('the owner wizard embeds without a second main or paper heading',async()=>{
 await show(true,{embedded:true,ownerOnly:true});assert.ok(screen.getByText('Wizard planning screen'));
 assert.equal(document.querySelector('main'),null);assert.equal(screen.queryByRole('heading',{level:1}),null);
});
test('a preparing paper remains on wizard step two with later screens unavailable',async()=>{
 Object.assign(globalThis.__paperWizard.view,{status:'preparing',stage:'processing',breakdown:null});await show();assert.ok(screen.getByRole('navigation',{name:'Assessment steps'}));assert.equal(screen.getByRole('button',{name:'Step 2: Paper Breakdown'}).getAttribute('aria-current'),'step');assert.ok(screen.getByRole('region',{name:'Paper preparation status'}));assert.equal(screen.getByRole('button',{name:'Step 3: Experiment Steps'}).disabled,true);assert.equal(screen.getByRole('button',{name:'Step 4: Setup'}).disabled,true);assert.equal(screen.queryByRole('heading',{name:'Experiment Queue'}),null);assert.equal(globalThis.__paperWizard.planning,null);
});
test('a reserved paper waits for preparation without displaying running model progress',async()=>{
 Object.assign(globalThis.__paperWizard.view,{status:'preparing',stage:'uploaded',breakdown:null});await show();
 assert.ok(screen.getByText('Paper uploaded. Preparation has not started.'));assert.ok(screen.getByRole('button',{name:'Prepare breakdown'}));assert.equal(screen.queryByText('Preparing paper breakdown…'),null);
});
test('a ready wizard omits the preparation summary and recorded queue',async()=>{
 await show();assert.ok(screen.getByText('Wizard planning screen'));assert.equal(globalThis.__paperWizard.planning.wizard,true);assert.equal(globalThis.__paperWizard.planning.preparation,undefined);assert.equal(globalThis.__paperWizard.planning.queue,undefined);assert.equal(screen.queryByRole('region',{name:'Paper preparation status'}),null);assert.equal(screen.queryByRole('heading',{name:'Experiment Queue'}),null);
});
test('the non-wizard preparation view retains its combined planning and queue summary',async()=>{
 await show(false);assert.ok(screen.getByText('Combined planning view'));assert.equal(globalThis.__paperWizard.planning.wizard,undefined);assert.ok(screen.getByRole('heading',{name:'Experiment Queue'}));assert.equal(screen.queryByRole('navigation',{name:'Assessment steps'}),null);
});
test('reopening a new reviewed version clears the old review form consent',async()=>{
 await show(false);fireEvent.click(screen.getByRole('checkbox',{name:'Draft consent'}));assert.equal(screen.getByRole('checkbox',{name:'Draft consent'}).checked,true);
 globalThis.__paperWizard.view.breakdown.review={id:'corrected-version',revision:5,reviewed_at:'2026-11-11T13:00:00Z',reason:'Correct source evidence.',reviewer_type:'AI'};
 cleanup();await show(false);
 assert.equal(screen.getByRole('checkbox',{name:'Draft consent'}).checked,false);assert.equal(globalThis.__paperWizard.planning.breakdown.review.id,'corrected-version');
});
test('public paper metadata remains visible without private wizard access',async()=>{
 globalThis.__paperWizard.userId=null;await show(true,{embedded:true,ownerOnly:true,header:React.createElement('h1',null,'Public paper title')});
 assert.ok(screen.getByRole('heading',{name:'Public paper title'}));assert.equal(globalThis.__paperWizard.reads,0);assert.ok(screen.queryByRole('navigation',{name:'Assessment steps'})===null);
 cleanup();globalThis.__paperWizard.userId='viewer';Object.assign(globalThis.__paperWizard.view,{owner:false,breakdown:null});
 await show(true,{embedded:true,ownerOnly:true,header:React.createElement('h1',null,'Public paper title')});assert.ok(screen.getByRole('heading',{name:'Public paper title'}));assert.equal(globalThis.__paperWizard.planning,null);assert.ok(screen.queryByRole('navigation',{name:'Assessment steps'})===null);
});
test('preparation renders a single wizard before the paper heading and forwards the header to ready planning',async()=>{
 Object.assign(globalThis.__paperWizard.view,{status:'preparing',stage:'processing',breakdown:null});
 const header=React.createElement('h1',null,'Paper heading');await show(true,{embedded:true,ownerOnly:true,header});
 const nav=screen.getByRole('navigation',{name:'Assessment steps'});assert.ok(nav.compareDocumentPosition(screen.getByRole('heading',{name:'Paper heading'}))&Node.DOCUMENT_POSITION_FOLLOWING);assert.equal(screen.getAllByRole('navigation',{name:'Assessment steps'}).length,1);
 cleanup();Object.assign(globalThis.__paperWizard.view,{status:'ready',stage:'ready',breakdown:breakdownFixture()});await show(true,{embedded:true,ownerOnly:true,header});assert.ok(screen.getByRole('heading',{name:'Paper heading'}));
});
test('an approved breakdown stays usable while unavailable review history retries automatically',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});globalThis.__paperWizard.view.quality={version:'paper-quality-v1',phase:'approved',round:0,findings:[],history_unavailable:true};await show();assert.ok(screen.getByText('Wizard planning screen'));assert.equal(globalThis.__paperWizard.reads,1);
 globalThis.__paperWizard.view.quality={version:'paper-quality-v1',phase:'approved',round:0,findings:[],history:[]};await act(async()=>t.mock.timers.tick(5000));assert.equal(globalThis.__paperWizard.reads,2);assert.ok(screen.getByRole('button',{name:'Paper actions'}));await act(async()=>t.mock.timers.tick(15000));assert.equal(globalThis.__paperWizard.reads,2);
});
