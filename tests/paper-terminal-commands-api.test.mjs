import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {hierarchicalImplementationPlan} from './support/implementation-plan-fixture.mjs';
import OpenAI from 'openai';
globalThis.__terminalApi={};
const hook=registerHooks({resolve(name,context,next){
 if(name==='next/server')return next('next/server.js',context);
 if(name==='@/lib/paper-intake-server')return{shortCircuit:true,url:'data:text/javascript,export const intakeActor=(r)=>globalThis.__terminalApi.actor(r);export const loadIntake=(...a)=>globalThis.__terminalApi.intake(...a);'};
 if(name==='@/lib/paper-experiment-plan-server')return{shortCircuit:true,url:'data:text/javascript,export class ExperimentPlanError extends Error{constructor(m,s){super(m);this.status=s;}}export const loadExperimentPlan=(...a)=>globalThis.__terminalApi.plan(...a);'};
 if(name==='@/lib/paper-terminal-commands-server')return{shortCircuit:true,url:'data:text/javascript,'+['loadTerminalCommands','prepareTerminalCommands','refreshSavedTerminalCommands','cancelSavedTerminalCommands'].map(n=>`export const ${n}=(...a)=>globalThis.__terminalApi.${n}(...a);`).join('')+'export const terminalCommandsView=(row,study,index)=>({row,study,index});'};
 return next(name,context);
}});
const {GET,POST}=await import('../app/(modules)/research-verification/api/terminal-commands/route.ts');hook.deregister();
const id='11111111-1111-4111-8111-111111111111';let s,calls;
const get=(query='id='+id+'&experiment=1',token='verified')=>new Request('https://example.test/api/terminal-commands?'+query,{headers:token?{authorization:'Bearer '+token}:{}});
const body={action:'generate',study_id:id,experiment_index:1,target:'ubuntu-debian'};
const post=(value=body,token='verified')=>new Request('https://example.test/api/terminal-commands',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(value)});
beforeEach(()=>{
 s=globalThis.__terminalApi;calls=[];s.actor=async r=>r.headers.get('authorization')==='Bearer verified'?'owner':null;
 s.intake=async(study,actor)=>{calls.push(['owned',study,actor]);return{status:'ready'};};s.plan=async()=>({status:'ready',study_id:id,owner_id:'owner',plan:hierarchicalImplementationPlan()});
 s.loadTerminalCommands=async(...a)=>{calls.push(['load',...a]);return{status:'processing'};};s.prepareTerminalCommands=async(...a)=>{calls.push(['generate',...a]);return{status:'processing'};};s.refreshSavedTerminalCommands=async row=>{calls.push(['refresh']);return row;};s.cancelSavedTerminalCommands=async row=>{calls.push(['cancel']);return row;};
});
test('anonymous and forged callers cannot read generate or cancel command sets',async()=>{
 for(const token of [null,'forged']){assert.equal((await GET(get(undefined,token))).status,401);assert.equal((await POST(post(body,token))).status,401);}assert.deepEqual(calls,[]);
});
test('reads only reconcile an existing owner response and POST generates from server-owned plan data',async()=>{
 const response=await GET(get());assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal(calls.some(c=>c[0]==='generate'),false);assert.deepEqual(calls.find(c=>c[0]==='load').slice(1),[id,'owner',1]);
 assert.equal((await POST(post())).status,200);assert.equal(calls.filter(c=>c[0]==='generate').length,1);assert.equal(calls.find(c=>c[0]==='generate')[2],1);
 assert.equal((await POST(post({...body,action:'cancel'}))).status,200);assert.equal(calls.filter(c=>c[0]==='cancel').length,1);
});
test('nonowners unready plans invalid indices ambiguous query values and client-supplied scripts are rejected',async()=>{
 s.intake=async()=>null;assert.equal((await POST(post())).status,404);s.intake=async()=>({status:'ready'});s.plan=async()=>({status:'processing'});assert.equal((await POST(post())).status,409);
 for(const value of [{...body,owner_id:'other'},{...body,commands:'run this'},{...body,request:{}},{...body,action:'execute'},{...body,experiment_index:0},{...body,experiment_index:1.5},{...body,target:'macos'}])assert.equal((await POST(post(value))).status,400);
 for(const query of ['id='+id+'&experiment=1&experiment=2','id='+id+'&experiment=01','id='+id+'&experiment=1&owner=other'])assert.equal((await GET(get(query))).status,400);
 assert.equal(calls.some(c=>c[0]==='generate'),false);
});
test('provider status failures do not expose credential fragments in HTTP responses',async()=>{
 s.refreshSavedTerminalCommands=async()=>{throw new OpenAI.APIError(401,{},'Incorrect API key: sk-synthetic-private-fragment',new Headers());};
 const response=await GET(get());assert.equal(response.status,503);const text=await response.text();assert.ok(text.includes('HTTP 401'));assert.ok(!text.includes('sk-synthetic'));
});
