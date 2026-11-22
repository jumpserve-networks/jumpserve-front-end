import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
globalThis.__assessmentStepsReact=React;
const hook=registerHooks({resolve(specifier,context,next){
 if(specifier==='next/link')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export default function Link({prefetch,scroll,...props}){return globalThis.__assessmentStepsReact.createElement("a",props);}')} ;
 if(specifier==='next/navigation')return{shortCircuit:true,url:'data:text/javascript,export const usePathname=()=>"/research-verification/new-assessment";export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({push(){}});'};
 return next(specifier,context);
}});
const {PaperAssessmentSteps}=await import('../app/components/research-workflow/paper-assessment-steps.tsx');
const {SkillAssessment}=await import('../app/components/research-workflow/skill-assessment.tsx');hook.deregister();
afterEach(cleanup);
test('upload starts at step one with all four stages visible and later stages disabled',()=>{
 const selected=[];render(React.createElement(PaperAssessmentSteps,{onStep:step=>selected.push(step)}));
 const upload=screen.getByRole('button',{name:'Step 1: Paper Upload'});assert.equal(upload.getAttribute('href'),'/research-verification/new-assessment');assert.equal(upload.getAttribute('aria-current'),'step');
 for(const name of ['Step 2: Paper Breakdown','Step 3: Experiment Steps','Step 4: Setup & Run Commands']){const button=screen.getByRole('button',{name});assert.equal(button.disabled,true);fireEvent.click(button);}
 assert.deepEqual(selected,[]);
});
test('a ready plan enables step four navigation while upload remains a separate route',()=>{
 const selected=[];render(React.createElement(PaperAssessmentSteps,{current:'implementation',assessment:true,implementation:true,execution:true,onStep:step=>selected.push(step)}));
 assert.equal(screen.getByRole('button',{name:'Step 3: Experiment Steps'}).getAttribute('aria-current'),'step');fireEvent.click(screen.getByRole('button',{name:'Step 4: Setup & Run Commands'}));assert.deepEqual(selected,['execution']);
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
 assert.ok(screen.getByText('Execution was outside scope.'));
 assert.ok(screen.getByText('No measurements were included in this assessment.'));
});
