import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {experimentScriptsView,hierarchicalImplementationPlan,implementationBreakdown} from './support/experiment-scripts-fixture.mjs';
globalThis.__workReact=React;
const hook=registerHooks({resolve(name,context,next){
 const replacements={
  'next/link':'export default function Link({prefetch,...props}){return globalThis.__workReact.createElement("a",props);}',
  '@/app/components/user-preferences':'export const useUserPreferences=()=>({userId:"owner"});',
  '@/lib/browser-auth':'export const requireAccessToken=async(_message,owner)=>{if(owner!=="owner")throw Error("Wrong owner");return "verified-owner";};',
  './browser-auth':'export const requireAccessToken=async(_message,owner)=>{if(owner!=="owner")throw Error("Wrong owner");return "verified-owner";};',
  '@/lib/paper-intake-client':'export const paperIntakeRequest=async()=>({access:"owner-drafts",studies:[]});',
  '@/lib/supabase/client':'export const createClient=()=>{throw Error("No storage writes in this test");};',
 };return replacements[name]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[name])}:next(name,context);
}});
const {PaperUploadsProvider}=await import('../app/components/research-workflow/paper-uploads-provider.tsx');
const {PaperExperimentScripts}=await import('../app/components/research-workflow/paper-experiment-scripts.tsx');
const {usePaperWork}=await import('../app/components/research-workflow/paper-work-provider.tsx');hook.deregister();
const id='11111111-1111-4111-8111-111111111111';let originalFetch,reads,calls,finishRead,manager,stage;
beforeEach(()=>{
 window.localStorage.clear();reads=0;calls=[];stage=null;originalFetch=globalThis.fetch;
 globalThis.fetch=async(path,options)=>{
  assert.equal(options.headers.Authorization,'Bearer verified-owner');calls.push({path,options});
  if(path.includes('/api/paper-workflow'))return Response.json({version:'paper-work-status-v1',study_ids:[id],units:stage?[{id,title:'Background paper',step:4,index:1,total:1,stage,reason:null,updated_at:'2026-11-17T12:00:00Z'}]:[],next_cursor:0});
  assert.match(path,/api\/experiment-scripts/);
  if(options.method==='POST'){stage='processing';return Response.json(experimentScriptsView(id,'processing'));}
  reads++;return new Promise(resolve=>{finishRead=()=>resolve(Response.json(experimentScriptsView(id,'not_generated')));});
 };
});
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;});
function Page(){const work=usePaperWork();manager=work;const[show,setShow]=React.useState(true);return React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>setShow(false)},'Go to another module'),show?React.createElement(PaperExperimentScripts,{assessmentId:id,ownerId:'owner',title:'Background paper',index:1,plan:hierarchicalImplementationPlan(),breakdown:implementationBreakdown()}):React.createElement('h1',null,'Another module'));}
test('Step 4 submission and its completion popup survive navigation away from the assessment',async()=>{
 await act(async()=>render(React.createElement(PaperUploadsProvider,null,React.createElement(Page))));assert.equal(reads,1);const initial=calls.find(c=>c.path.includes('/api/experiment-scripts'));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Go to another module'})));assert.ok(screen.getByRole('heading',{name:'Another module'}));assert.equal(initial.options.signal.aborted,false);
 await act(async()=>finishRead());assert.equal(calls.filter(c=>c.options.method==='POST').length,1);assert.ok(screen.getByRole('heading',{name:'Generating shared setup and run commands…'}));
 stage='ready';await act(async()=>manager.refresh());assert.ok(screen.getByRole('heading',{name:'Shared setup and run commands ready'}));assert.ok(screen.getByText('1 of 1 experiment command packages ready.'));assert.equal(screen.getByRole('link',{name:'View Step 4'}).getAttribute('href'),'/research-verification/assessment/'+id+'?step=execution');
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Dismiss Step 4 notification for Background paper'})));assert.equal(screen.queryByRole('heading',{name:'Shared setup and run commands ready'}),null);assert.equal(calls.filter(c=>c.options.method==='POST').length,1);
 const saved=window.localStorage.getItem(manager.storageKey);assert.ok(saved.includes(id));assert.ok(!saved.includes('Background paper'));assert.ok(!saved.includes('experiment_helper'));
});
test('Strict Mode shares the initial admission and sign-out cleanup aborts the active owner transport',async()=>{
 await act(async()=>render(React.createElement(React.StrictMode,null,React.createElement(PaperUploadsProvider,null,React.createElement(Page)))));
 assert.equal(reads,1);const active=calls.find(c=>c.path.includes('/api/experiment-scripts'));assert.equal(active.options.signal.aborted,false);cleanup();assert.equal(active.options.signal.aborted,true);await act(async()=>finishRead());assert.equal(calls.filter(c=>c.options.method==='POST').length,0);
});
