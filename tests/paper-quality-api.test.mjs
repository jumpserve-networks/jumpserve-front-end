import assert from'node:assert/strict';
import{beforeEach,test}from'node:test';
import{registerHooks}from'node:module';
globalThis.__qualityAPI={};
const hook=registerHooks({resolve(name,context,next){const replacements={'next/server':'export const NextResponse={json:(value,options)=>Response.json(value,options)};','@/lib/paper-intake-server':'export const intakeActor=async()=>globalThis.__qualityAPI.actor;','@/lib/paper-quality-server':'export class PaperQualityError extends Error{};export const advanceOwnerPaperQuality=(...args)=>globalThis.__qualityAPI.drive(...args);'};return replacements[name]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[name])}:next(name,context);}});
const route=await import('../app/(modules)/research-verification/api/paper-reviews/route.ts');hook.deregister();
let calls;
beforeEach(()=>{calls=[];globalThis.__qualityAPI.actor='verified-owner';globalThis.__qualityAPI.drive=async(...args)=>{calls.push(args);return{version:'paper-quality-v1',advanced:1,next_cursor:2};};});
const request=(body={cursor:0},options={})=>new Request('https://example.test/research-verification/api/paper-reviews',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),...options});
test('only a verified owner may continue saved reviews; there is no GET admission or caller-supplied scope',async()=>{
 globalThis.__qualityAPI.actor=null;assert.equal((await route.POST(request())).status,401);assert.equal(calls.length,0);assert.equal(route.GET,undefined);
 globalThis.__qualityAPI.actor='verified-owner';const response=await route.POST(request({cursor:2}));assert.equal(response.status,200);assert.deepEqual(calls,[['verified-owner',2]]);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('vary'),/Authorization/);
});
test('review requests cannot inject prompts, owners, decisions or sources',async()=>{
 for(const body of [{cursor:0,owner:'other'},{cursor:0,request:{model:'unselected'}},{cursor:0,decision:'pass'},{cursor:0,study_id:'private'},{cursor:-1},{cursor:9001},{}])assert.equal((await route.POST(request(body))).status,400);
 assert.equal(calls.length,0);
});
test('unexpected diagnostics never expose credentials or private drafts',async()=>{
 globalThis.__qualityAPI.drive=async()=>{throw Error('sk-synthetic-private-test-key');};const response=await route.POST(request());assert.equal(response.status,503);assert.ok(!(await response.text()).includes('sk-synthetic'));
});
