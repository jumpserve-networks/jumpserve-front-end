import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
globalThis.__assessmentStepsReact=React;
const hook=registerHooks({resolve(specifier,context,next){
 if(specifier==='next/link')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export default function Link({prefetch,...props}){return globalThis.__assessmentStepsReact.createElement("a",props);}')} ;
 if(specifier==='next/navigation')return{shortCircuit:true,url:'data:text/javascript,export const usePathname=()=>"/research-verification/new-assessment";export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({push(){}});'};
 return next(specifier,context);
}});
const {PaperAssessmentSteps}=await import('../app/components/research-workflow/paper-assessment-steps.tsx');hook.deregister();
afterEach(cleanup);
test('upload starts at step one with all four stages visible and later stages disabled',()=>{
 const selected=[];render(React.createElement(PaperAssessmentSteps,{onStep:step=>selected.push(step)}));
 const upload=screen.getByRole('button',{name:'Step 1: Paper Upload'});assert.equal(upload.getAttribute('href'),'/research-verification/new-assessment');assert.equal(upload.getAttribute('aria-current'),'step');
 for(const name of ['Step 2: Initial Assessment','Step 3: Experiment Steps','Step 4: Run Experiments']){const button=screen.getByRole('button',{name});assert.equal(button.disabled,true);fireEvent.click(button);}
 assert.deepEqual(selected,[]);
});
test('a ready plan enables step four navigation while upload remains a separate route',()=>{
 const selected=[];render(React.createElement(PaperAssessmentSteps,{current:'implementation',assessment:true,implementation:true,execution:true,onStep:step=>selected.push(step)}));
 assert.equal(screen.getByRole('button',{name:'Step 3: Experiment Steps'}).getAttribute('aria-current'),'step');fireEvent.click(screen.getByRole('button',{name:'Step 4: Run Experiments'}));assert.deepEqual(selected,['execution']);
 assert.equal(screen.getByRole('button',{name:'Step 1: Paper Upload'}).getAttribute('href'),'/research-verification/new-assessment');
});
