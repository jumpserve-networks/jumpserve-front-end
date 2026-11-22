import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
globalThis.__assessmentStepsReact=React;
const hook=registerHooks({resolve(specifier,context,next){
 if(specifier==='next/link')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export default function Link({prefetch,scroll,...props}){return globalThis.__assessmentStepsReact.createElement("a",props);}')} ;
 if(specifier==='next/navigation')return{shortCircuit:true,url:'data:text/javascript,export const usePathname=()=>"/research-verification/new-assessment";export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({push(){}});'};
 return next(specifier,context);
}});
const {PaperAssessmentSteps}=await import('../app/components/research-workflow/paper-assessment-steps.tsx');
const {SkillAssessment}=await import('../app/components/research-workflow/skill-assessment.tsx');
const {SharedLocalPaperAssessment}=await import('../app/components/research-workflow/shared-local-paper-assessment.tsx');hook.deregister();
afterEach(cleanup);
test('upload starts at step one with all five stages visible and later stages disabled',()=>{
 const selected=[];render(React.createElement(PaperAssessmentSteps,{onStep:step=>selected.push(step)}));
 const upload=screen.getByRole('button',{name:'Step 1: Paper Upload'});assert.equal(upload.getAttribute('href'),'/research-verification/new-assessment');assert.equal(upload.getAttribute('aria-current'),'step');
 for(const name of ['Step 2: Paper Breakdown','Step 3: Experiment Steps','Step 4: Experiment Setup','Step 5: Experiment Results']){const button=screen.getByRole('button',{name});assert.equal(button.disabled,true);fireEvent.click(button);}
 assert.deepEqual(selected,[]);
});
test('a ready plan enables step four navigation while upload remains a separate route',()=>{
 const selected=[];render(React.createElement(PaperAssessmentSteps,{current:'implementation',assessment:true,implementation:true,execution:true,onStep:step=>selected.push(step)}));
 assert.equal(screen.getByRole('button',{name:'Step 3: Experiment Steps'}).getAttribute('aria-current'),'step');fireEvent.click(screen.getByRole('button',{name:'Step 4: Experiment Setup'}));assert.deepEqual(selected,['execution']);
 assert.equal(screen.getByRole('button',{name:'Step 1: Paper Upload'}).getAttribute('href'),'/research-verification/new-assessment');
});

test('legacy JumpServe bundles show their saved claims, methods and excerpts in the wizard',()=>{
 const path='/research-verification/assessment/fixture';
 const bundle={
   paper:{title:'Legacy assessment',authors:[],domain:'Networking',sha256:'a'.repeat(64),byte_count:20},
   summary:'A retained assessment.',
   claims:[{id:'C1',page:2,claim:'One recorded claim.',criterion:'Compare matched conditions.',outcome:'untested',finding:'Execution was outside scope.'}],
   methods:[{title:'Legacy method',procedure:'Use a quiet local environment.',commands:'printf 0'}],
   runs:[],limitations:['Fixture limitation.'],
 };
 const view=render(React.createElement(SkillAssessment,{bundle,path,query:{}}));
 assert.ok(screen.getByText('One recorded claim.'));
 const stepThree=screen.getByRole('button',{name:'Step 3: Experiment Steps'});
 assert.equal(stepThree.getAttribute('href'),`${path}?step=implementation`);
 view.rerender(React.createElement(SkillAssessment,{bundle,path,query:{step:'implementation'}}));
 assert.ok(screen.getByText('Use a quiet local environment.'));
 assert.equal(screen.getByRole('button',{name:'Step 3: Experiment Steps'}).getAttribute('aria-current'),'step');
 view.rerender(React.createElement(SkillAssessment,{bundle,path,query:{step:'execution'}}));
 assert.ok(screen.getByText('printf 0'));
 assert.equal(screen.queryByText('Execution was outside scope.'),null);
 assert.equal(screen.queryByText(bundle.summary),null);
 assert.equal(screen.getByRole('button',{name:'Step 5: Experiment Results'}).getAttribute('href'),`${path}?step=results`);
 view.rerender(React.createElement(SkillAssessment,{bundle,path,query:{step:'results'}}));
 assert.equal(screen.getByRole('button',{name:'Step 5: Experiment Results'}).getAttribute('aria-current'),'step');
 assert.equal(screen.queryByText('printf 0'),null);
 assert.ok(screen.getByText(bundle.summary));
 assert.ok(screen.getByText('Execution was outside scope.'));
 assert.ok(screen.getByText('No measurements were included in this assessment.'));
 assert.ok(screen.getByText('Fixture limitation.'));
});

test('older shared imports render the hierarchy from their saved detail dependencies',()=>{
 const value={
  study_id:'11111111-1111-4111-8111-111111111111',
  projection:{note:'Public copy.',redacted:0},
  sections:{access:[
   {id:'host',label:'Prepare the host',description:'Use an isolated host.',pages:[1]},
   {id:'interfaces',label:'Set up interfaces',description:'Use two interfaces.',pages:[2],depends_on:['host']},
  ],experiment:[],data:[],validate:[]},
  implementation_choices:[],limitation:'Limited to the saved source pages.',
 };
 render(React.createElement(SharedLocalPaperAssessment,{value}));
 const access=within(screen.getByRole('region',{name:'1. Access'}));
 const parent=access.getByRole('heading',{name:'Prepare the host'}).closest('li');
 const child=access.getByRole('heading',{name:'Set up interfaces'}).closest('li');
 assert.equal(child.parentElement.closest('li'),parent);
 assert.ok(within(parent).getByText('1.1',{exact:true}));
 assert.ok(within(child).getByText('1.1.1',{exact:true}));
 assert.ok(within(child).getByText(/^Source PDF page 2\./));
});
