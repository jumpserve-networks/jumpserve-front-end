import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
const hooks = registerHooks({resolve(s,c,next){return next(s.startsWith('@/lib/')?new URL('../lib/'+s.slice(6)+'.ts',import.meta.url).href:s,c);}});
const {parseProfileInput,parseProfile}=await import('../lib/profile.ts');
const {readOwnProfile,writeOwnProfile,initializeGoogleProfile}=await import('../lib/profile-store.ts');
hooks.deregister();
const user={id:'11111111-1111-4111-8111-111111111111',app_metadata:{provider:'google'},user_metadata:{given_name:'Ada',family_name:'Lovelace'}};
const input={first_name:'  Zoë ',last_name:"O’Brien",timezone:'America/New_York'};

test('profile edits validate names and IANA time zones without accepting caller identity or arbitrary fields',()=>{
 assert.deepEqual(parseProfileInput(input),{...input,first_name:'Zoë'});
 for(const bad of [{...input,id:'someone-else'},{...input,role:'admin'},{...input,timezone:'not/a-zone'},{...input,timezone:'+05:00'},{...input,first_name:'x'.repeat(101)},{...input,last_name:'line\nbreak'},null])assert.throws(()=>parseProfileInput(bad));
 assert.equal(parseProfileInput({...input,first_name:'',last_name:'',timezone:'UTC'}).timezone,'UTC');
 assert.throws(()=>parseProfile({...input,id:'someone-else'},user.id),/signed-in user/);
});

function client({row=null,error=null}={}){
 const calls=[];
 const builder={select(value){calls.push(['select',value]);return builder;},eq(key,value){calls.push(['eq',key,value]);return builder;},maybeSingle:async()=>({data:row,error}),single:async()=>({data:row,error}),upsert(value,options){calls.push(['upsert',value,options]);return builder;},then(resolve,reject){return Promise.resolve({data:row,error}).then(resolve,reject);}};
 return {calls,from(table){calls.push(['from',table]);return builder;}};
}
test('a missing profile uses explicit Google name fields and does not write on a read',async()=>{
 const c=client();assert.deepEqual(await readOwnProfile(c,user),{id:user.id,first_name:'Ada',last_name:'Lovelace',timezone:null});
 assert.ok(c.calls.some(x=>x[0]==='eq'&&x[1]==='id'&&x[2]===user.id));assert.ok(!c.calls.some(x=>x[0]==='upsert'));
});

test('first Google sign-in persists explicit names without setting a timezone or allowing a concurrent profile overwrite',async()=>{
 const c=client();await initializeGoogleProfile(c,user);
 assert.ok(c.calls.some(x=>x[0]==='eq'&&x[1]==='id'&&x[2]===user.id));
 assert.deepEqual(c.calls.find(x=>x[0]==='upsert'),['upsert',{id:user.id,first_name:'Ada',last_name:'Lovelace',timezone:null},{onConflict:'id',ignoreDuplicates:true}]);
});

test('later Google logins preserve saved edits, deliberately blank names and timezone',async()=>{
 for(const row of [{id:user.id,first_name:'Grace',last_name:'Hopper',timezone:'Asia/Tokyo'},{id:user.id,first_name:'',last_name:'',timezone:null}]){
  const c=client({row});await initializeGoogleProfile(c,user,'unused-token');
  assert.ok(!c.calls.some(x=>x[0]==='upsert'));assert.deepEqual(await readOwnProfile(c,user),row);
 }
});

test('non-Google identities, unavailable names and profile storage failures do not create empty profiles',async()=>{
 const c=client();await initializeGoogleProfile(c,{...user,app_metadata:{provider:'email'}});assert.deepEqual(c.calls,[]);
 await initializeGoogleProfile(c,{...user,user_metadata:{full_name:'An ambiguous display name'}});assert.ok(!c.calls.some(x=>x[0]==='upsert'));
 await assert.rejects(()=>initializeGoogleProfile(client({error:{message:'Private database detail'}}),user),{message:'Google profile initialization could not read the profile.'});
});
test('profile upsert derives identity from the verified user and checks the returned identity',async()=>{
 const row={...input,first_name:'Zoë',id:user.id};const c=client({row});assert.deepEqual(await writeOwnProfile(c,user,input),row);
 assert.deepEqual(c.calls.find(x=>x[0]==='upsert'),['upsert',row,{onConflict:'id'}]);
 assert.ok(c.calls.some(x=>x[0]==='select'&&x[1]==='id,first_name,last_name,timezone'));
 await assert.rejects(()=>writeOwnProfile(client({row:{...row,id:'someone-else'}}),user,input),/signed-in user/);
 await assert.rejects(()=>writeOwnProfile(client({error:{message:'Storage unavailable'}}),user,input),/Storage unavailable/);
 await assert.rejects(()=>readOwnProfile(client({error:{message:'Storage unavailable'}}),user),/Storage unavailable/);
});
