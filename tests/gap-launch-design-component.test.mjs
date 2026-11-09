import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import * as intents from '../lib/research-gap-run.ts';
import * as designPaths from '../lib/research-claim-design.ts';
globalThis.__gapReact=React;globalThis.__gapIntents=intents;globalThis.__gapDesignPaths=designPaths;
const button=new URL('../app/components/ui/button.tsx',import.meta.url).href;
class RequestError extends Error{constructor(status){super('Synthetic request failure');this.status=status;}}
globalThis.__gapError=RequestError;
const replacements={
 '@/app/components/ui/button':`import {Button as Original} from ${JSON.stringify(button)};export function Button(props){globalThis.__gapActions.set(props.children,props);return globalThis.__gapReact.createElement(Original,props);}`,
 'next/link':"export default function Link(props){return globalThis.__gapReact.createElement('a',props);}",
 'next/navigation':'export const useRouter=()=>({push:path=>globalThis.__gapNavigation.push(path)});',
 '@/lib/browser-auth':'export const requireAccessToken=(...args)=>globalThis.__gapAuth(...args);',
 '@/lib/research-workflow-api':'export const RESEARCH_SIGN_IN_REQUIRED="Synthetic Google sign-in required";export const ResearchRequestError=globalThis.__gapError;export const researchRequest=(...args)=>globalThis.__gapRequest(...args);',
 '@/lib/research-queue-api':'export const requireGapQueueApi=async()=>{};',
 '@/lib/research-gap-run':'export const saveGapRunIntent=(...args)=>globalThis.__gapIntents.saveGapRunIntent(...args);export const consumeGapRunIntent=(...args)=>globalThis.__gapConsume(...args);export const runGapExperiments=(...args)=>globalThis.__gapRun(...args);',
 '@/lib/research-claim-design':'export const CLAIM_DESIGN_VERSION=globalThis.__gapDesignPaths.CLAIM_DESIGN_VERSION;export const claimDesignPath=(...args)=>globalThis.__gapDesignPaths.claimDesignPath(...args);export const saveClaimDesignIntent=id=>globalThis.__gapDesignIntents.push(id);',
};
const hooks=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {RunGapExperiment}=await import('../app/components/research-workflow/run-gap-experiment.tsx');const {DesignClaim}=await import('../app/components/research-workflow/design-claim.tsx');hooks.deregister();
const ID='11111111-1111-4111-8111-111111111111',GAP='22222222-2222-4222-8222-222222222222',FOLLOW='33333333-3333-4333-8333-333333333333',JOB='44444444-4444-4444-8444-444444444444';
let preview,requests,handler,runner;
beforeEach(()=>{globalThis.__gapActions=new Map();});
beforeEach(()=>{requests=[];globalThis.__gapNavigation=[];globalThis.__gapDesignIntents=[];globalThis.__gapAuth=async()=> 'synthetic-session';globalThis.__gapConsume=(...args)=>intents.consumeGapRunIntent(...args);Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:window.sessionStorage});sessionStorage.clear();
 preview={version:'research-gap-queue-v1',study_id:ID,gap_id:GAP,gap_sha256:'a'.repeat(64),plan_sha256:'b'.repeat(64),choices:[{key:'original',title:'Original retained check',execution_mode:'automatic',coverage_limits:'Original scope',dependencies:[]}],limitation:'Retained context',unavailable_reason:null};
 handler=async(path,options)=>path==='/capabilities'?{preparation:{claim_design_version:designPaths.CLAIM_DESIGN_VERSION}}:options?.method?{version:designPaths.CLAIM_DESIGN_VERSION,study_id:FOLLOW}:path.includes('claim_id=')?{version:designPaths.CLAIM_DESIGN_VERSION,study_id:ID,claim_id:GAP,claim_sha256:'a'.repeat(64),claim:{description:'Original exact claim',location:'Original section'},source:{citation:'Original cited paper'}}:preview;
 runner=async(_preview,_id,_request,progress)=>{progress('Original preparation saved',FOLLOW);return{complete:true,studyId:FOLLOW,jobIds:[JOB]};};
 globalThis.__gapRequest=(...args)=>{requests.push(args);return handler(...args);};globalThis.__gapRun=(...args)=>runner(...args);
});afterEach(cleanup);
const click=async name=>act(async()=>fireEvent.click(screen.getByRole('button',{name,exact:true})));
const show=async(Component=RunGapExperiment,extra={})=>{let view;await act(async()=>{view=render(React.createElement(Component,{studyId:ID,gapId:GAP,claimId:GAP,...extra}));});return view;};

test('gap launch waits for authenticated explicit action and navigates only after confirmed queueing',async()=>{
 await show();assert.equal(requests.length,0);await click('Run experiment now');assert.ok(screen.getByText(/Jobs recorded/));assert.deepEqual(globalThis.__gapNavigation,[`/research-verification/assessment/${FOLLOW}?job=${JOB}#job-${JOB}`]);assert.ok(screen.getByRole('link',{name:'View saved work in Experiment Queue'}));
});
test('gap launch retains partial preparation and reuses one request identity after uncertain retries',async()=>{
 const ids=[];let attempts=0;runner=async(preview,id)=>{ids.push(id);if(attempts++===0)throw null;return{complete:false};};await show();await click('Run experiment now');assert.match(screen.getByRole('alert').textContent,/Experiment could not be queued/);await click('Run experiment now');assert.equal(ids[0],ids[1]);assert.ok(screen.getByText(/not fully queued yet/));assert.deepEqual(globalThis.__gapNavigation,[]);
});
test('authentication failures and API 401 preserve same-tab resume intent and the selected gap return path',async()=>{
 for(const failure of [new Error('Synthetic Google sign-in required'),new RequestError(401)]){const view=await show();if(failure instanceof RequestError)handler=async()=>{throw failure;};else globalThis.__gapAuth=async()=>{throw failure;};await click('Run experiment now');const login=new URL(globalThis.__gapNavigation.at(-1),'https://example.test');assert.equal(login.pathname,'/login');assert.ok(login.searchParams.get('next').startsWith(`/research-verification/assessment/${ID}?gap=${GAP}&run=`));view.unmount();globalThis.__gapAuth=async()=> 'synthetic-session';}
});
test('a gap without a retained check starts only a confirmed source-bound design and one-time intent',async()=>{
 preview.choices=[];preview.unavailable_reason='No retained check';await show();await click('Run experiment now');assert.deepEqual(globalThis.__gapDesignIntents,[FOLLOW]);assert.deepEqual(globalThis.__gapNavigation,[designPaths.claimDesignPath(FOLLOW)]);const body=JSON.parse(requests.at(-1)[1].body);assert.equal(body.action,'design');assert.equal(body.gap_sha256,preview.gap_sha256);
});
test('missing designer capability and unconfirmed design identities cannot enable a proposal',async()=>{
 preview.choices=[];preview.unavailable_reason='No retained check';for(const invalid of ['capability','identity']){const original=handler;handler=async(path,options)=>invalid==='capability'&&path==='/capabilities'?{}:invalid==='identity'&&options?.method?{version:'wrong',study_id:'wrong'}:original(path,options);await show();await click('Run experiment now');assert.match(screen.getByRole('alert').textContent,invalid==='capability'?/designer update/:/not confirmed/);assert.deepEqual(globalThis.__gapDesignIntents,[]);cleanup();handler=original;}
});
test('auto-resume requires a consumed same-tab intent and unmount aborts pending authentication',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});await show(RunGapExperiment,{launchId:JOB});await act(async()=>t.mock.timers.tick(0));assert.equal(requests.length,0);cleanup();
 globalThis.__gapConsume=()=>({requestId:JOB});let queued;await show(RunGapExperiment,{launchId:JOB,onQueued:(...args)=>{queued=args;}});await act(async()=>t.mock.timers.tick(0));assert.deepEqual(queued,[FOLLOW,JOB]);cleanup();
 globalThis.__gapConsume=()=>{throw new Error('Synthetic broken storage');};await show(RunGapExperiment,{launchId:JOB});await act(async()=>t.mock.timers.tick(0));assert.match(screen.getByRole('alert').textContent,/could not be resumed/);
});
test('claim designer checks immutable selection then reuses its request identity through unconfirmed saves',async()=>{
 await show(DesignClaim);assert.ok(screen.getByText('Original exact claim'));let writes=0;const original=handler;handler=async(path,options)=>{if(options?.method&&writes++===0)throw null;return original(path,options);};await click('Design experiment with AI');assert.equal(screen.getByRole('alert').textContent,'Design preparation was not confirmed.');await click('Design experiment with AI');const bodies=requests.filter(([,o])=>o?.method).map(([,o])=>JSON.parse(o.body));assert.equal(bodies[0].request_id,bodies[1].request_id);assert.equal(bodies[1].claim_sha256,'a'.repeat(64));assert.deepEqual(globalThis.__gapDesignIntents,[FOLLOW]);
});
test('claim designer rejects foreign or malformed selections and failed loading',async()=>{
 const original=handler;for(const kind of ['capability','selection','unstructured']){handler=async(path,options)=>{if(kind==='capability')return{};if(kind==='unstructured')throw null;const value=await original(path,options);return path==='/capabilities'?value:{...value,study_id:FOLLOW};};await show(DesignClaim);assert.ok(screen.getByRole('alert'));assert.equal(screen.queryByRole('button',{name:'Design experiment with AI'}),null);cleanup();}
});

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
test('gap launches reject duplicate callbacks while authentication is pending and preserve unexpected authentication failures',async()=>{
 const pending=deferred();globalThis.__gapAuth=()=>pending.promise;await show();await click('Run experiment now');await act(async()=>globalThis.__gapActions.get('Preparing and queueing…').onClick());assert.equal(requests.length,0);await act(async()=>pending.reject(new Error('Original authentication transport failure')));assert.match(screen.getByRole('alert').textContent,/Original authentication transport failure/);assert.deepEqual(globalThis.__gapNavigation,[]);
});
test('unmount cancels every awaited gap-launch stage without navigating or saving a resume intent',async()=>{
 for(const stage of ['auth-success','auth-failure','design','run-success','run-failure']){
  const pending=deferred();globalThis.__gapAuth=stage.startsWith('auth')?()=>pending.promise:async()=> 'synthetic-session';const original=handler;handler=async(...args)=>stage==='design'&&args[1]?.method?pending.promise:original(...args);runner=()=>pending.promise;if(stage==='design'){preview.choices=[];preview.unavailable_reason='No retained check';}
  const view=await show();await click('Run experiment now');view.unmount();await act(async()=>{if(stage.endsWith('failure'))pending.reject(new Error('Late original failure'));else pending.resolve(stage==='design'?{version:designPaths.CLAIM_DESIGN_VERSION,study_id:FOLLOW}:stage==='run-success'?{complete:true,studyId:FOLLOW,jobIds:[JOB]}:'synthetic-session');});assert.deepEqual(globalThis.__gapNavigation,[]);assert.deepEqual(globalThis.__gapDesignIntents,[]);handler=original;preview.choices=[{key:'original',title:'Original retained check',execution_mode:'automatic',coverage_limits:'Original scope',dependencies:[]}];preview.unavailable_reason=null;
 }
});
test('claim loading ignores a response after unmount and an unconfirmed design cannot navigate',async()=>{
 const pending=deferred(),original=handler;handler=(...args)=>args[0].includes('claim_id=')?pending.promise:original(...args);const view=await show(DesignClaim);view.unmount();await act(async()=>pending.resolve({}));assert.deepEqual(globalThis.__gapNavigation,[]);handler=original;await show(DesignClaim);handler=async()=>({version:'unsupported',study_id:FOLLOW});await click('Design experiment with AI');assert.equal(screen.getByRole('alert').textContent,'Saved design identity was not confirmed.');assert.deepEqual(globalThis.__gapDesignIntents,[]);
 const saving=deferred();handler=()=>saving.promise;await click('Design experiment with AI');await act(async()=>globalThis.__gapActions.get('Preparing design…').onClick());assert.equal(requests.filter(([,o])=>o?.method).length,2);await act(async()=>saving.reject(new Error('Original design save failure')));assert.equal(screen.getByRole('alert').textContent,'Original design save failure');
});
