import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {createHmac} from 'node:crypto';
import {paperBackgroundSignature,verifyPaperBackgroundSignature,PAPER_BACKGROUND_PATH} from '../lib/paper-background-auth.ts';
globalThis.__paperBackgroundAPI={};
const hook=registerHooks({resolve(name,context,next){
 const replacements={
  'next/server':'export const NextResponse={json:(value,options)=>Response.json(value,options)};export const after=fn=>globalThis.__paperBackgroundAPI.after.push(fn);',
  '@/lib/paper-intake-credentials':'export const paperIntakeCredentials=async()=>globalThis.__paperBackgroundAPI.credentials;',
  '@/lib/paper-background-server':'export const continuePaperBackground=(...args)=>globalThis.__paperBackgroundAPI.drive(...args);export const enqueuePaperProvider=(...args)=>globalThis.__paperBackgroundAPI.enqueue(...args);',
  '@/lib/paper-background-auth':new URL('../lib/paper-background-auth.ts',import.meta.url).href,
 };
 if(replacements[name])return{shortCircuit:true,url:replacements[name].startsWith('file:')?replacements[name]:'data:text/javascript,'+encodeURIComponent(replacements[name])};return next(name,context);
}});
const background=await import('../app/(modules)/research-verification/api/paper-background/route.ts');
const webhooks=await import('../app/(modules)/research-verification/api/paper-webhooks/route.ts');hook.deregister();
const key='offline-api-key',secretBytes=Buffer.from('offline-webhook-secret-with-32-bytes'),secret='whsec_'+secretBytes.toString('base64');
let calls;
beforeEach(()=>{calls=[];Object.assign(globalThis.__paperBackgroundAPI,{credentials:{openaiApiKey:key,supabaseSecret:'offline-private-db',openaiWebhookSecret:secret},after:[],drive:async(...args)=>{calls.push(['drive',...args]);return{version:'paper-background-v1',advanced:1,unavailable:0};},enqueue:async(...args)=>{calls.push(['enqueue',...args]);}});});
function signed(body='{"limit":2}',timestamp=String(Math.floor(Date.now()/1000))){return new Request('https://example.test'+PAPER_BACKGROUND_PATH,{method:'POST',headers:{'content-type':'application/json','x-jumpserve-paper-timestamp':timestamp,'x-jumpserve-paper-signature':paperBackgroundSignature(key,timestamp,body)},body});}
function webhook(event={type:'agent.session.action_required',data:{id:'sess_fixture'}}){
 const body=JSON.stringify(event),id='evt_offline',timestamp=String(Math.floor(Date.now()/1000));
 const signature=createHmac('sha256',secretBytes).update(id+'.'+timestamp+'.'+body).digest('base64');
 return new Request('https://example.test/research-verification/api/paper-webhooks',{method:'POST',headers:{'content-type':'application/json','webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':'v1,'+signature},body});
}
test('scheduled continuation verifies the exact body, timestamp and server signature before admitting saved work',async()=>{
 let response=await background.POST(signed());assert.equal(response.status,200);assert.deepEqual(calls,[['drive',2]]);assert.match(response.headers.get('cache-control'),/no-store/);
 calls.length=0;response=await background.POST(new Request('https://example.test'+PAPER_BACKGROUND_PATH,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer browser-token'},body:'{"limit":2}'}));assert.equal(response.status,401);assert.equal(calls.length,0);
 assert.equal((await background.POST(signed('{"limit":2}',String(Math.floor(Date.now()/1000)-121)))).status,401);
 const modified=signed();const raw=await modified.text();assert.equal(verifyPaperBackgroundSignature(modified.headers,key,raw+' '),false);
});
test('signed background callers cannot inject an owner, paper, model, prompt or unbounded batch',async()=>{
 for(const value of [{limit:3},{limit:0},{limit:2,owner:'other'},{limit:1,model:'unselected'},{limit:1,prompt:'override'},{limit:1,study_id:'unknown'}])assert.equal((await background.POST(signed(JSON.stringify(value)))).status,400);
 assert.equal(calls.length,0);assert.equal(background.GET,undefined);
});
test('the real SDK verifies raw webhook signatures before events become durable work',async()=>{
 const response=await webhooks.POST(webhook());assert.equal(response.status,202);assert.deepEqual(calls,[['enqueue','sess_fixture']]);assert.equal(globalThis.__paperBackgroundAPI.after.length,1);
 await globalThis.__paperBackgroundAPI.after[0]();assert.deepEqual(calls,[['enqueue','sess_fixture'],['drive',2]]);
});
test('forged, unsupported and malformed webhooks cannot bypass identity binding or signature checks',async()=>{
 const request=webhook();request.headers.set('webhook-signature','v1,forged');assert.equal((await webhooks.POST(request)).status,401);assert.equal(calls.length,0);
 assert.equal((await webhooks.POST(webhook({type:'agent.session.action_required',data:{id:'caller-controlled'}}))).status,400);assert.equal(calls.length,0);
 assert.equal((await webhooks.POST(webhook({type:'unrelated.event',data:{id:'sess_fixture'}}))).status,200);assert.equal(calls.length,0);
 globalThis.__paperBackgroundAPI.credentials.openaiWebhookSecret=undefined;assert.equal((await webhooks.POST(webhook())).status,503);
});
test('webhook retention failures remain retryable and internal errors do not reveal secrets',async()=>{
 globalThis.__paperBackgroundAPI.enqueue=async()=>{throw Error('offline-private-db secret');};const response=await webhooks.POST(webhook());assert.equal(response.status,503);assert.equal(globalThis.__paperBackgroundAPI.after.length,0);assert.ok(!(await response.text()).includes('offline-private-db'));
 globalThis.__paperBackgroundAPI.drive=async()=>{throw Error('offline-api-key');};const failed=await background.POST(signed());assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('offline-api-key'));
});
