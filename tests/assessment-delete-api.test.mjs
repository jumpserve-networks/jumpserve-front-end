import assert from 'node:assert/strict';
import {beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
globalThis.__deleteBoundary={};
const hook=registerHooks({resolve(specifier,context,next){
 if(specifier==='next/server')return next('next/server.js',context);
 if(specifier==='@/lib/paper-intake-server')return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export const intakeActor=(...args)=>globalThis.__deleteBoundary.actor(...args);export const intakeDatabase=async()=>globalThis.__deleteBoundary.db;')};
 return next(specifier,context);
}});
const {DELETE,GET}=await import('../app/(modules)/research-verification/api/assessments/[assessmentId]/route.ts');hook.deregister();
const id='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222';
let calls,state;
beforeEach(()=>{
 calls=[];state=globalThis.__deleteBoundary;
 state.actor=async request=>request.headers.get('authorization')==='Bearer verified'?owner:null;
 const query={select(){return this;},eq(...args){calls.push(['filter',...args]);return this;},is(...args){calls.push(['null',...args]);return this;},async maybeSingle(){return{data:{study_id:id,id},error:null};}};
 state.db={from(table){calls.push(['table',table]);return query;},async rpc(name,args){calls.push(['rpc',name,args]);return{data:{id,deleted:true},error:null};}};
});
const context=value=>({params:Promise.resolve({assessmentId:value??id})});
const request=token=>new Request('https://example.test/research-verification/api/assessments/'+id,{method:'DELETE',headers:token?{authorization:'Bearer '+token}:{}});
test('anonymous or unverified requests cannot reach ownership lookup or deletion',async()=>{
 for(const token of [null,'unverified'])assert.equal((await DELETE(request(token),context())).status,401);assert.deepEqual(calls,[]);
});
test('verified owner deletion uses server identity and retries the same assessment id',async()=>{
 for(let i=0;i<2;i++){const response=await DELETE(request('verified'),context());assert.equal(response.status,200);assert.deepEqual(await response.json(),{id,deleted:true});assert.match(response.headers.get('cache-control'),/no-store/);}
 assert.ok(calls.some(c=>c[0]==='filter'&&c[1]==='owner_id'&&c[2]===owner));assert.deepEqual(calls.filter(c=>c[0]==='rpc'),Array(2).fill(['rpc','research_delete_assessment',{p_actor:owner,p_study:id}]));
});
test('non-owners, invalid identifiers and missing records do not delete',async()=>{
 assert.equal((await DELETE(request('verified'),context('bad'))).status,400);
 state.db.from=()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null})});
 assert.equal((await DELETE(request('verified'),context())).status,404);assert.equal(calls.some(c=>c[0]==='rpc'),false);
});
test('running work conflicts and unavailable persistence never report success',async()=>{
 for(const [code,status] of [['55000',409],['P0002',404],['PGRST202',424],['42501',503]]){state.db.rpc=async()=>({error:{code,message:'Private SQL details'}});const response=await DELETE(request('verified'),context());assert.equal(response.status,status);assert.equal(JSON.stringify(await response.json()).includes('Private SQL'),false);}
 state.db.rpc=async()=>({data:{id,deleted:false}});assert.equal((await DELETE(request('verified'),context())).status,503);
});
test('ownership discovery checks the active paper without returning owner identity',async()=>{
 const response=await GET(request('verified'),context());assert.deepEqual(await response.json(),{id,owner:true});assert.ok(calls.some(c=>c[0]==='null'&&c[1]==='deleted_at'&&c[2]===null));
});
test('ownership discovery remains available on the original database schema',async()=>{
 state.db.from=table=>{
  let filtered=false;
  const query={select(){return query;},eq(){return query;},is(){filtered=true;return query;},maybeSingle:async()=>table==='research_studies'&&filtered?{data:null,error:{code:'42703',message:'column research_studies.deleted_at does not exist'}}:{data:{study_id:id,id},error:null}};
  return query;
 };
 const response=await GET(request('verified'),context());assert.equal(response.status,200);assert.deepEqual(await response.json(),{id,owner:true});
});
