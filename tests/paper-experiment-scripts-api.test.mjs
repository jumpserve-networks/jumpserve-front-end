import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {experimentScriptsRecord} from './support/experiment-scripts-fixture.mjs';
import OpenAI from 'openai';
globalThis.__scriptsApi={};
const hook=registerHooks({resolve(name,context,next){
 if(name==='next/server')return next('next/server.js',context);
 if(name==='@/lib/paper-intake-server')return{shortCircuit:true,url:'data:text/javascript,export const intakeActor=r=>globalThis.__scriptsApi.actor(r);export const loadIntake=(...a)=>globalThis.__scriptsApi.intake(...a);'};
 if(name==='@/lib/paper-experiment-plan-server')return{shortCircuit:true,url:'data:text/javascript,export class ExperimentPlanError extends Error{constructor(m,s){super(m);this.status=s;}}export const loadExperimentPlan=(...a)=>globalThis.__scriptsApi.plan(...a);'};
 if(name==='@/lib/paper-experiment-scripts-server')return{shortCircuit:true,url:'data:text/javascript,'+['loadExperimentScripts','prepareExperimentScripts','refreshExperimentScripts','cancelExperimentScripts','reconcileEarlierCommands'].map(n=>`export const ${n}=(...a)=>globalThis.__scriptsApi.${n}(...a);`).join('')+'export const experimentScriptsView=(row,study,index,prior)=>({row,study,index,prior});'};
 return next(name,context);
}});
const {GET,POST}=await import('../app/(modules)/research-verification/api/experiment-scripts/route.ts');hook.deregister();
const id=experimentScriptsRecord().study_id,body={action:'generate',study_id:id,experiment_index:1,target:'ubuntu-debian'};
const get=(query='id='+id+'&experiment=1',token='verified')=>new Request('https://example.test/api/experiment-scripts?'+query,{headers:token?{authorization:'Bearer '+token}:{}});
const post=(value=body,token='verified')=>new Request('https://example.test/api/experiment-scripts',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(value)});
let s,calls,row;
beforeEach(()=>{
 s=globalThis.__scriptsApi;calls=[];row=null;s.actor=async r=>r.headers.get('authorization')==='Bearer verified'?'owner':null;
 const fixture=experimentScriptsRecord();s.intake=async(study,owner)=>{calls.push(['owned',study,owner]);return{status:'ready'};};s.plan=async()=>({status:'ready',study_id:id,owner_id:'owner',plan:fixture.source_plan,confirmed_breakdown:fixture.confirmed_breakdown});
 s.loadExperimentScripts=async(...a)=>{calls.push(['load',...a]);return row;};s.reconcileEarlierCommands=async(...a)=>{calls.push(['prior',...a]);return 0;};
 s.prepareExperimentScripts=async(...a)=>{calls.push(['generate',...a]);return fixture;};s.refreshExperimentScripts=async current=>{calls.push(['refresh']);return current;};s.cancelExperimentScripts=async current=>{calls.push(['cancel']);return current;};
});
test('anonymous/forged/cross-owner calls cannot read or generate; authentication precedes body parsing',async()=>{
 for(const token of [null,'forged']){assert.equal((await GET(get(undefined,token))).status,401);assert.equal((await POST(post(body,token))).status,401);assert.equal((await POST(post({...body,action:'cancel'},token))).status,401);}
 assert.deepEqual(calls,[]);s.intake=async()=>null;assert.equal((await POST(post())).status,404);assert.equal(calls.some(c=>c[0]==='generate'),false);
 const unread={headers:new Headers(),text(){throw Error('Anonymous body must not be read');}};assert.equal((await POST(unread)).status,401);
});
test('GET never admits generation and the explicit Step 4 POST admits only a missing package',async()=>{
 const result=await GET(get());assert.equal(result.status,200);assert.match(result.headers.get('cache-control'),/private, no-store/);assert.equal(result.headers.get('vary'),'Authorization');assert.equal(calls.some(c=>c[0]==='generate'),false);
 assert.equal((await POST(post())).status,200);assert.equal(calls.filter(c=>c[0]==='generate').length,1);
 row=experimentScriptsRecord();assert.equal((await POST(post())).status,200);assert.equal(calls.filter(c=>c[0]==='generate').length,1);assert.ok(calls.some(c=>c[0]==='refresh'));
 assert.equal((await POST(post({...body,action:'cancel'}))).status,200);assert.ok(calls.some(c=>c[0]==='cancel'));
});
test('legacy pending requests block new admissions and cancellation targets their original identities',async()=>{
 s.reconcileEarlierCommands=async(...a)=>{calls.push(['prior',...a]);return 2;};const result=await POST(post());assert.equal(result.status,200);assert.equal((await result.json()).prior,2);assert.equal(calls.some(c=>c[0]==='generate'),false);
 await POST(post({...body,action:'cancel_previous'}));assert.equal(calls.at(-1).at(-1),true);
});
test('invalid requests, unready plans, and changed source plans cannot generate scripts',async()=>{
 for(const value of [{...body,owner_id:'other'},{...body,request:{}},{...body,action:'execute'},{...body,experiment_index:'1'},{...body,experiment_index:2},{...body,target:'macos'}])assert.ok([400,409].includes((await POST(post(value))).status));
 for(const query of ['id='+id+'&experiment=1&experiment=2','id='+id+'&experiment=01','id='+id+'&experiment=1&owner=forged'])assert.equal((await GET(get(query))).status,400);
 row=experimentScriptsRecord();row.source_plan=structuredClone(row.source_plan);row.source_plan.experiments[0].title='Different source';assert.equal((await GET(get())).status,409);assert.equal((await POST(post())).status,409);
 s.plan=async()=>({status:'processing'});assert.equal((await POST(post())).status,409);assert.equal(calls.some(c=>c[0]==='generate'),false);
});
test('provider errors do not expose credentials or discard the saved request',async()=>{
 row=experimentScriptsRecord();s.refreshExperimentScripts=async()=>{throw new OpenAI.APIError(401,{},'Incorrect API key: sk-synthetic-secret',new Headers());};const result=await GET(get());assert.equal(result.status,503);const text=await result.text();assert.match(text,/HTTP 401/);assert.doesNotMatch(text,/sk-synthetic/);
});
