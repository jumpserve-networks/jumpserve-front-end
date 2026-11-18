import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
globalThis.__workApi={};
const hook=registerHooks({resolve(name,context,next){
 if(name==='next/server')return next('next/server.js',context);
 const values={
  '@/lib/paper-intake-server':'export const intakeActor=r=>globalThis.__workApi.actor(r);',
  '@/lib/paper-work-server':'export const ownerPaperWork=(...a)=>globalThis.__workApi.read(...a);',
  '@/lib/paper-experiment-plan-server':'export class ExperimentPlanError extends Error{constructor(message,status){super(message);this.status=status;}}',
 };return values[name]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(values[name])}:next(name,context);
}});
const route=await import('../app/(modules)/research-verification/api/paper-workflow/route.ts');hook.deregister();let calls;
beforeEach(()=>{calls=[];globalThis.__workApi.actor=async request=>request.headers.get('authorization')==='Bearer verified'?'verified-owner':null;globalThis.__workApi.read=async(...args)=>{calls.push(args);return{version:'paper-work-status-v1',study_ids:[],units:[],next_cursor:0};};});
const request=(query='',token='verified')=>new Request('https://example.test/api/paper-workflow'+query,{headers:token?{authorization:'Bearer '+token}:{}});
test('only the verified Google owner can read notifications; polling exposes no generation method',async()=>{
 for(const token of [null,'forged'])assert.equal((await route.GET(request('',token))).status,401);assert.deepEqual(calls,[]);assert.equal(route.POST,undefined);
 const result=await route.GET(request('?cursor=2'));assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/private, no-store/);assert.equal(result.headers.get('vary'),'Authorization');assert.deepEqual(calls,[['verified-owner',2]]);
});
test('caller-supplied owner identities, unknown parameters and ambiguous cursors are rejected',async()=>{
 for(const query of ['?owner=other','?id=another-assessment','?cursor=1&cursor=2','?cursor=-1','?cursor=00','?cursor=9001'])assert.equal((await route.GET(request(query))).status,400);assert.deepEqual(calls,[]);
});
test('unexpected failures return a retained-work error without private diagnostics',async()=>{
 globalThis.__workApi.read=async()=>{throw Error('sk-synthetic-secret');};const result=await route.GET(request());assert.equal(result.status,503);assert.ok(!(await result.text()).includes('sk-synthetic'));
});
