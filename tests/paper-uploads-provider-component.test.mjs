import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
globalThis.__uploadReact=React;
class Manager{
 constructor(ownerId,request,upload){this.ownerId=ownerId;this.request=request;this.upload=upload;this.state={uploads:[],activity:[],notices:[],error:'',persistenceError:''};this.listeners=new Set();this.storageKey='synthetic-owner-key';this.calls=[];globalThis.__uploadManager=this;}
 subscribe=listener=>{this.listeners.add(listener);return()=>this.listeners.delete(listener);};getSnapshot=()=>this.state;getServerSnapshot=()=>this.state;
 start=storage=>this.calls.push(['start',storage]);stop=()=>this.calls.push(['stop']);refresh=()=>this.calls.push(['refresh']);syncPreferences=()=>this.calls.push(['sync']);hasTransfers=()=>this.transfers;
 enqueue=()=>{};retry=id=>this.calls.push(['retry',id]);trackAssessment=()=>{};dismiss=(...args)=>this.calls.push(['dismiss',...args]);dismissActivity=(...args)=>this.calls.push(['dismissActivity',...args]);
 emit(patch){this.state={...this.state,...patch};for(const listener of this.listeners)listener();}
}
globalThis.__uploadManagerClass=Manager;
const replacements={
 'next/link':"export default function Link({prefetch,...props}){return globalThis.__uploadReact.createElement('a',props);}",
 '@/app/components/user-preferences':'export const useUserPreferences=()=>globalThis.__uploadPreferences;',
 '@/lib/paper-upload-manager':'export const PaperUploadManager=globalThis.__uploadManagerClass;',
 '@/lib/paper-intake-client':'export const paperIntakeRequest=(...args)=>globalThis.__uploadRequest(...args);',
 '@/lib/supabase/client':'export const createClient=()=>globalThis.__uploadClient;',
};
const hooks=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {PaperUploadsProvider,usePaperUploads}=await import('../app/components/research-workflow/paper-uploads-provider.tsx');hooks.deregister();
let uploads,requests;
beforeEach(()=>{uploads=[];requests=[];globalThis.__uploadPreferences={userId:'synthetic-owner'};globalThis.__uploadRequest=(...args)=>requests.push(args);globalThis.__uploadClient={storage:{from:bucket=>({uploadToSignedUrl:async(...args)=>{uploads.push([bucket,...args]);return{error:null};}})}};});afterEach(cleanup);
const manager=()=>globalThis.__uploadManager;
const show=()=>render(React.createElement(PaperUploadsProvider,{},React.createElement(Consumer)));
function Consumer(){const context=usePaperUploads();return React.createElement('p',{},context.signedIn?'Owner context':'Logged out context');}
const emit=async state=>act(async()=>manager().emit(state));
const click=async name=>act(async()=>fireEvent.click(screen.getByRole('button',{name,exact:true})));
function activity(changes={}){return{id:'assessment-id',title:'Retained assessment',phase:'assessing',status:'running',counts:{finished:0,total:2,reproduced:0,discrepant:0,blocked:1,running:1,queued:0,waiting:1},...changes};}

test('upload provider forwards owner scope and exact signed upload contract then tears down listeners',async()=>{
 const view=show();assert.ok(screen.getByText('Owner context'));assert.equal(manager().ownerId,'synthetic-owner');await manager().request('/owner-records',{method:'GET'});assert.equal(requests[0][2],'synthetic-owner');const file={name:'original.pdf'};await manager().upload({bucket:'private-papers',path:'original.pdf',token:'synthetic-signed'},file);assert.deepEqual(uploads[0],['private-papers','original.pdf','synthetic-signed',file,{contentType:'application/pdf',upsert:false}]);
 window.dispatchEvent(new window.Event('online'));window.dispatchEvent(new window.StorageEvent('storage',{key:'unrelated'}));window.dispatchEvent(new window.StorageEvent('storage',{key:manager().storageKey}));assert.ok(manager().calls.some(c=>c[0]==='refresh'));assert.equal(manager().calls.filter(c=>c[0]==='sync').length,1);
 manager().transfers=true;const leaving=new window.Event('beforeunload',{cancelable:true});window.dispatchEvent(leaving);assert.equal(leaving.defaultPrevented,true);view.unmount();assert.ok(manager().calls.some(c=>c[0]==='stop'));
});
test('unconfirmed signed uploads fail and unavailable preference context stays logged out',async()=>{
 globalThis.__uploadPreferences=null;globalThis.__uploadClient.storage.from=()=>({uploadToSignedUrl:async()=>({error:{message:'private diagnostic'}})});show();assert.ok(screen.getByText('Logged out context'));await assert.rejects(manager().upload({bucket:'private',path:'original',token:'synthetic'},{}),/could not be confirmed/);
});
test('paper notifications retain retryable failures original statuses and dismiss identities',async()=>{
 show();await emit({uploads:[{id:'retry',retryable:true,message:'Original interrupted upload'}],notices:[{id:'retry',kind:'failed',title:'Retry paper'},{id:'ready',kind:'ready',title:'Ready paper'},{id:'failed',kind:'failed',title:'Failed paper'}]});assert.ok(screen.getByText('Original interrupted upload'));await click('Retry upload');assert.ok(manager().calls.some(c=>c[0]==='retry'&&c[1]==='retry'));await click('Dismiss notification for Failed paper');assert.ok(manager().calls.some(c=>c[0]==='dismiss'&&c[1]==='failed'));const review=screen.getByRole('link',{name:'Review paper'});review.addEventListener('click',event=>event.preventDefault());await act(async()=>fireEvent.click(review));assert.ok(manager().calls.some(c=>c[0]==='dismiss'&&c[1]==='ready'));assert.ok(screen.getByRole('link',{name:'View paper details'}));
});
test('assessment activity preserves measured zero counts status errors and foreground progress semantics',async()=>{
 show();await emit({activity:[activity()]});assert.ok(screen.getByRole('progressbar'));assert.ok(screen.getByText('0 of 2 recorded claim checks finished.'));assert.ok(screen.getByText(/1 waiting/));await click('Dismiss assessment notification for Retained assessment');assert.deepEqual(manager().calls.at(-1),['dismissActivity','assessment-id','assessing']);
 await emit({activity:[activity({statusError:'Original status unavailable'})],error:'Synthetic polling failure',persistenceError:'Original preference save failed'});assert.equal(screen.queryByRole('progressbar'),null);assert.ok(screen.getByText('Original status unavailable'));assert.ok(screen.getByText('Original preference save failed'));await click('Retry status');assert.equal(manager().calls.at(-1)[0],'refresh');
});
test('finished preparing unavailable and unrecorded assessment states remain distinct',async()=>{
 show();for(const value of [activity({phase:'preparing',counts:null}),activity({status:'unavailable',counts:null}),activity({phase:'finished',status:'completed',counts:null}),activity({counts:null})]){await emit({activity:[value]});if(value.status==='unavailable')assert.ok(screen.getByText('Current assessment progress is unknown.'));else if(value.phase==='preparing')assert.ok(screen.getByText('Extracting the paper information for your review.'));else assert.ok(screen.getByText('Waiting for recorded claim status.'));}
});
test('finished claim counts remain visible after the live running and waiting counters end',async()=>{
 show();await emit({activity:[activity({phase:'finished',status:'completed'})]});assert.ok(screen.getByText('0 of 2 recorded claim checks finished.'));assert.equal(screen.queryByText(/1 running/),null);
});
test('upload consumer requires the shared provider',()=>{assert.throws(()=>render(React.createElement(Consumer)),/shared upload provider/);});
test('empty activity counts remain recorded zero and unknown progress keeps its automatic retry text',async()=>{
 show();await emit({activity:[activity({counts:{finished:0,total:0,reproduced:0,discrepant:0,blocked:0,running:0,queued:0,waiting:0}})]});assert.ok(screen.getByText('0 of 0 recorded claim checks finished.'));assert.ok(screen.getByRole('progressbar'));assert.equal(screen.getByRole('progressbar').getAttribute('aria-valuenow'),null);assert.equal(screen.queryByText(/need attention/),null);await emit({activity:[activity({status:'unavailable',counts:null})],error:'Original status retrieval unavailable'});assert.ok(screen.getByText(/JumpServe will retry automatically/));assert.equal(screen.queryByText(/last recorded progress is shown/),null);
});
test('unavailable local storage still starts the owner-bound provider and anonymous requests omit an owner identity',async t=>{
 const original=Object.getOwnPropertyDescriptor(window,'localStorage');Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new Error('Browser storage disabled');}});t.after(()=>Object.defineProperty(window,'localStorage',original));globalThis.__uploadPreferences=null;show();assert.deepEqual(manager().calls.find(call=>call[0]==='start'),['start',undefined]);await manager().request('/public-projection');assert.equal(requests.at(-1)[2],undefined);
});
