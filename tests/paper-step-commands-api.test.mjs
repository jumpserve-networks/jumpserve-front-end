import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {stepPlan} from './support/step-command-fixture.mjs';
import OpenAI from 'openai';
globalThis.__stepApi={};
const hook=registerHooks({resolve(name,context,next){
 if(name==='next/server')return next('next/server.js',context);
 if(name==='@/lib/paper-intake-server')return{shortCircuit:true,url:'data:text/javascript,export const intakeActor=r=>globalThis.__stepApi.actor(r);export const loadIntake=(...a)=>globalThis.__stepApi.intake(...a);'};
 if(name==='@/lib/paper-experiment-plan-server')return{shortCircuit:true,url:'data:text/javascript,export class ExperimentPlanError extends Error{constructor(m,s){super(m);this.status=s;}}export const loadExperimentPlan=(...a)=>globalThis.__stepApi.plan(...a);'};
 if(name==='@/lib/paper-step-commands-server')return{shortCircuit:true,url:'data:text/javascript,'+['loadStepCommands','stepCommandsList','prepareStepCommands','refreshStepCommands','cancelStepCommands'].map(n=>`export const ${n}=(...a)=>globalThis.__stepApi.${n}(...a);`).join('')+'export const stepCommandsView=(row,study,index,ref)=>({row,study,index,ref});'};
 return next(name,context);
}});
const {GET,POST}=await import('../app/(modules)/research-verification/api/step-commands/route.ts');hook.deregister();
const id='11111111-1111-4111-8111-111111111111',body={action:'generate',study_id:id,experiment_index:1,action_ref:'1.2.1',target:'ubuntu-debian'};
const get=(query='id='+id+'&experiment=1',token='verified')=>new Request('https://example.test/api/step-commands?'+query,{headers:token?{authorization:'Bearer '+token}:{}});
const post=(value=body,token='verified')=>new Request('https://example.test/api/step-commands',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(value)});
let s,calls;
beforeEach(()=>{
 s=globalThis.__stepApi;calls=[];s.actor=async r=>r.headers.get('authorization')==='Bearer verified'?'owner':null;
 s.intake=async(study,owner)=>{calls.push(['owned',study,owner]);return{status:'ready'};};s.plan=async()=>({status:'ready',study_id:id,owner_id:'owner',plan:stepPlan()});
 s.stepCommandsList=async()=>{calls.push(['list']);return{actions:[]};};s.loadStepCommands=async(...a)=>{calls.push(['load',...a]);return{status:'processing',action_ref:a[2]};};
 s.prepareStepCommands=async(...a)=>{calls.push(['generate',...a]);return{status:'processing'};};s.refreshStepCommands=async row=>{calls.push(['refresh',row.action_ref]);return row;};s.cancelStepCommands=async row=>{calls.push(['cancel',row.action_ref]);return row;};
});
test('anonymous forged and cross-owner step reads/generation/cancellation cannot access records',async()=>{
 for(const token of [null,'forged']){assert.equal((await GET(get(undefined,token))).status,401);assert.equal((await POST(post(body,token))).status,401);assert.equal((await POST(post({...body,action:'cancel'},token))).status,401);}assert.deepEqual(calls,[]);
 s.intake=async()=>null;assert.equal((await POST(post())).status,404);assert.equal(calls.some(c=>c[0]==='generate'),false);
});
test('bulk GET reads metadata only, a step GET reconciles its existing call, and explicit POST selects one action',async()=>{
 const response=await GET(get());assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal(response.headers.get('vary'),'Authorization');assert.deepEqual(calls.map(c=>c[0]),['owned','list']);
 assert.equal((await GET(get('id='+id+'&experiment=1&step=1.2.1'))).status,200);assert.ok(calls.some(c=>c[0]==='refresh'&&c[1]==='1.2.1'));assert.equal(calls.some(c=>c[0]==='generate'),false);
 assert.equal((await POST(post())).status,200);const generate=calls.find(c=>c[0]==='generate');assert.equal(generate[2],1);assert.equal(generate[3],'1.2.1');assert.deepEqual(generate[1].plan,stepPlan());
 assert.equal((await POST(post({...body,action:'cancel'}))).status,200);assert.ok(calls.some(c=>c[0]==='cancel'&&c[1]==='1.2.1'));
});
test('unknown/future steps ambiguous values supplied prompts and unready plans cannot create calls',async()=>{
 for(const value of [{...body,action_ref:'2.1.1'},{...body,action_ref:'1.8.8'},{...body,action_ref:''},{...body,owner_id:'other'},{...body,request:{}},{...body,commands:'execute'},{...body,action:'execute'},{...body,experiment_index:0},{...body,target:'macos'}])assert.equal((await POST(post(value))).status,400);
 for(const query of ['id='+id+'&experiment=1&step=1.1.1&step=1.2.1','id='+id+'&experiment=01','id='+id+'&experiment=1&owner=forged'])assert.equal((await GET(get(query))).status,400);
 s.plan=async()=>({status:'processing'});assert.equal((await POST(post())).status,409);assert.equal(calls.some(c=>c[0]==='generate'),false);
});
test('model failures retain the saved request without exposing credential text',async()=>{
 s.refreshStepCommands=async()=>{throw new OpenAI.APIError(401,{},'Incorrect API key: sk-synthetic-secret',new Headers());};const response=await GET(get('id='+id+'&experiment=1&step=1.2.1'));assert.equal(response.status,503);const text=await response.text();assert.match(text,/HTTP 401/);assert.doesNotMatch(text,/sk-synthetic/);
});
