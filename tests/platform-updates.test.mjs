import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
const hooks=registerHooks({resolve(s,c,next){return next(s.startsWith('@/lib/')?new URL('../lib/'+s.slice(6)+'.ts',import.meta.url).href:s,c);}});
const {parsePlatformControl,parsePlatformSnapshot,platformPullRequest,platformMoney,platformTime}=await import('../lib/platform-updates.ts');
const {readPlatform,controlPlatform}=await import('../lib/platform-updates-store.ts');hooks.deregister();
const id='11111111-1111-4111-8111-111111111111';
const enqueue={action:'enqueue',request_id:id,task_id:id,payload:{title:'Repair status',objective:'Preserve exact revision status.',repositories:['jumpserve-networks/jumpserve-front-end'],max_reserved_cents:100,elapsed_seconds:300}};
const snapshot={version:'platform-supervisor-v1',operator_id:id,operator_role:'owner',settings:{paused:true,automatic_releases:true,worker_status:'not-configured'},tasks:[],events:[],changes:[],releases:[],runs:[],artifacts:[],has_more_events:false,has_more_tasks:false};
test('controls admit bounded authorized repository scope and stable request identities',()=>{
 assert.deepEqual(parsePlatformControl(enqueue),enqueue);
 for(const value of [{...enqueue,actor:id},{...enqueue,request_id:'bad'},{...enqueue,payload:{...enqueue.payload,repositories:['other/repo']}},{...enqueue,payload:{...enqueue.payload,max_reserved_cents:Infinity}},{...enqueue,payload:{...enqueue.payload,elapsed_seconds:299}},{...enqueue,payload:{...enqueue.payload,title:' '}},{action:'resume',request_id:id,task_id:id,payload:{}}])assert.throws(()=>parsePlatformControl(value));
});
test('snapshot retains zero, missing amounts and exact bigint event cursors',()=>{
 const value={...snapshot,events:[{sequence:'9007199254740993',id,actor:'supervisor',kind:'test',message:'Recorded',details:{zero:0,unknown:null}}]};
 assert.equal(parsePlatformSnapshot(value).events[0].sequence,'9007199254740993');assert.equal(platformMoney(0),'$0.00');assert.equal(platformTime(null),'Not recorded');assert.equal(platformTime('bad'),'Unavailable');
 assert.throws(()=>parsePlatformSnapshot({...snapshot,operator_id:'bad'}));assert.throws(()=>parsePlatformSnapshot({...value,events:[{...value.events[0],sequence:'-1'}]}));
});
test('only exact JumpServe PR links can become external links',()=>{
 assert.equal(platformPullRequest('https://github.com/jumpserve-networks/jumpserve-front-end/pull/7'),'https://github.com/jumpserve-networks/jumpserve-front-end/pull/7');
 for(const value of ['javascript:alert(1)','https://github.com.evil.invalid/jumpserve-networks/jumpserve-front-end/pull/7','https://github.com/other/repo/pull/1','https://github.com/jumpserve-networks/jumpserve-front-end/pull/7?x=1'])assert.equal(platformPullRequest(value),undefined);
});
test('owner read denial and missing migrations disclose no SQL detail',async()=>{
 for(const [code,status] of [['42501','forbidden'],['PGRST202','unavailable']]){const result=await readPlatform({rpc:async()=>({data:null,error:{code,message:'private SQL and account details'}})});assert.equal(result.status,status);assert.ok(!result.reason.includes('private SQL'));}
});
test('control RPC retries preserve the caller request identity without accepting caller authorization',async()=>{
 const calls=[];const client={rpc:async(name,payload)=>{calls.push({name,payload});return {data:{recorded:true},error:null};}};
 await controlPlatform(client,enqueue);await controlPlatform(client,enqueue);assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].payload.p_request,id);
 await assert.rejects(()=>controlPlatform({rpc:async()=>({data:null,error:{message:'private DB error'}})},enqueue),/same request identity/);
});
