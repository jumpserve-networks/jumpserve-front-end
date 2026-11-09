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
 const writes=[],updates=[];let updating=null;
 const builder={select(){return builder;},eq(key,value){if(updating)updating.filters.push([key,value]);return builder;},async maybeSingle(){return{data:profile,error:profileError};},async upsert(value,options){writes.push({value,options});return{error:null};},update(value){updating={value,filters:[]};updates.push(updating);return builder;},then(resolve,reject){return Promise.resolve({error:null}).then(resolve,reject);}};
 return{writes,updates,auth:{async exchangeCodeForSession(code){assert.equal(code,'explicit-fixture-code');return{data:{user,session:{provider_token:'explicit-fixture-provider-token'}},error:exchangeError};}},from(table){assert.equal(table,'profiles');return builder;}};
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

test('Google callback backfills existing blank names with verified UserInfo and preserves the timezone',async t=>{
 const c=client({profile:{id:user.id,first_name:'',last_name:'',timezone:'Asia/Tokyo'}});globalThis[key]=c;
 t.mock.method(globalThis,'fetch',async()=>Response.json({sub:'google-fixture-subject',given_name:'María José',family_name:'de la Cruz'}));
 const response=await GET(request());assert.equal(new URL(response.headers.get('location')).pathname,'/research-verification/new-assessment');
 assert.deepEqual(c.writes,[]);assert.deepEqual(c.updates,[
  {value:{first_name:'María José'},filters:[['id',user.id],['first_name','']]},
  {value:{last_name:'de la Cruz'},filters:[['id',user.id],['last_name','']]},
 ]);
});

test('a failed code exchange never initializes a profile',async()=>{
 const c=client({exchangeError:{message:'Expired sign-in code'}});globalThis[key]=c;
 const response=await GET(request());const redirect=new URL(response.headers.get('location'));
 assert.equal(redirect.pathname,'/login');assert.equal(redirect.searchParams.get('error'),'Expired sign-in code');assert.deepEqual(c.writes,[]);
});

test('callback origins use explicit configuration and retain the production fallback behind internal hosts',async t=>{
 const environment={...process.env};t.after(()=>{for(const key of Object.keys(process.env))if(!(key in environment))delete process.env[key];Object.assign(process.env,environment);});
 const c=client();c.auth.exchangeCodeForSession=async()=>({data:{user:null,session:null},error:null});globalThis[key]=c;
 for(const [site,mode,origin,expected]of [[' https://configured.example.test/path ','production','http://localhost:3000','https://configured.example.test'],[undefined,'production','http://localhost:3000','https://jumpserve.quaint-lab.org'],['invalid URL','production','http://127.0.0.1:3000','https://jumpserve.quaint-lab.org'],['','production','http://[::1]:3000','https://jumpserve.quaint-lab.org'],['','production','https://public.example.test','https://public.example.test'],['','development','http://localhost:6001','http://localhost:6001']]){
  if(site===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=site;process.env.NODE_ENV=mode;
  let response=await GET(new Request(origin+'/auth/callback?code=synthetic&next='+encodeURIComponent('/congestion-control-emulated/benchmarks')));assert.equal(response.headers.get('location'),expected+'/congestion-control-emulated/benchmarks');
  for(const error of [undefined,'Original provider rejection']){response=await GET(new Request(origin+'/auth/callback?next=%2Fprofile'+(error?'&error_description='+encodeURIComponent(error):'')));const redirect=new URL(response.headers.get('location'));assert.equal(redirect.origin,expected);assert.equal(redirect.pathname,'/login');assert.equal(redirect.searchParams.get('next'),'/profile');assert.equal(redirect.searchParams.get('error'),error??'Google sign-in did not return an authorization code.');}
 }
 assert.deepEqual(c.writes,[]);
});
