import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const key=Symbol.for('jumpserve.auth-callback.test');
const stub='data:text/javascript,'+encodeURIComponent(`export async function createClient(){return globalThis[Symbol.for('jumpserve.auth-callback.test')];}`);
const hook=registerHooks({resolve(s,c,next){return next(s==='@/lib/supabase/server'?stub:s==='next/server'?'next/server.js':s.startsWith('@/lib/')?new URL('../lib/'+s.slice(6)+'.ts',import.meta.url).href:s,c);}});
const {GET}=await import('../app/auth/callback/route.ts');
hook.deregister();
const user={id:'11111111-1111-4111-8111-111111111111',app_metadata:{provider:'google'},user_metadata:{sub:'google-fixture-subject',full_name:'Fixture Person'}};
function client({profile=null,profileError=null,exchangeError=null}={}){
 const writes=[];
 const builder={select(){return builder;},eq(){return builder;},async maybeSingle(){return{data:profile,error:profileError};},async upsert(value,options){writes.push({value,options});return{error:null};}};
 return{writes,auth:{async exchangeCodeForSession(code){assert.equal(code,'explicit-fixture-code');return{data:{user,session:{provider_token:'explicit-fixture-provider-token'}},error:exchangeError};}},from(table){assert.equal(table,'profiles');return builder;}};
}
const request=()=>new Request('http://localhost:6001/auth/callback?code=explicit-fixture-code&next='+encodeURIComponent('/research-verification/new-assessment?resume=1'));

test('successful OAuth callback persists Google names and resumes the original action without onboarding',async t=>{
 const c=client();globalThis[key]=c;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(url,'https://openidconnect.googleapis.com/v1/userinfo');assert.equal(options.headers.Authorization,'Bearer explicit-fixture-provider-token');
  return Response.json({sub:'google-fixture-subject',given_name:'Fixture',family_name:'Person'});
 });
 const response=await GET(request());
 assert.equal(response.status,307);assert.equal(new URL(response.headers.get('location')).pathname,'/research-verification/new-assessment');assert.equal(new URL(response.headers.get('location')).search,'?resume=1');
 assert.deepEqual(c.writes,[{value:{id:user.id,first_name:'Fixture',last_name:'Person',timezone:null},options:{onConflict:'id',ignoreDuplicates:true}}]);
});

test('a profile outage preserves successful sign-in and logs no provider token or private error',async t=>{
 globalThis[key]=client({profileError:{message:'private profile detail'}});
 const warn=t.mock.method(console,'warn',()=>{});
 const response=await GET(request());
 assert.equal(new URL(response.headers.get('location')).pathname,'/research-verification/new-assessment');
 assert.deepEqual(warn.mock.calls.map(c=>c.arguments),[['Google profile initialization unavailable after sign-in.']]);
});

test('a failed code exchange never initializes a profile',async()=>{
 const c=client({exchangeError:{message:'Expired sign-in code'}});globalThis[key]=c;
 const response=await GET(request());const redirect=new URL(response.headers.get('location'));
 assert.equal(redirect.pathname,'/login');assert.equal(redirect.searchParams.get('error'),'Expired sign-in code');assert.deepEqual(c.writes,[]);
});
