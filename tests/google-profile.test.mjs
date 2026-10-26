import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const hook=registerHooks({resolve(s,c,next){return next(s.startsWith('@/lib/')?new URL('../lib/'+s.slice(6)+'.ts',import.meta.url).href:s,c);}});
const {googleAccountNames,readGoogleAccountNames}=await import('../lib/google-profile.ts');
hook.deregister();
const user={id:'11111111-1111-4111-8111-111111111111',app_metadata:{provider:'google'},user_metadata:{sub:'google-fixture-subject',full_name:'A display name'},identities:[{provider:'google',identity_data:{sub:'google-fixture-subject'}}]};
const empty={first_name:'',last_name:''};

test('Google name components preserve multiword and Unicode names without splitting display names',()=>{
 assert.deepEqual(googleAccountNames(user),empty);
 assert.deepEqual(googleAccountNames({...user,user_metadata:{given_name:'  María José ',family_name:'de la Cruz'}}),{first_name:'María José',last_name:'de la Cruz'});
 assert.deepEqual(googleAccountNames({...user,identities:[{provider:'google',identity_data:{given_name:'李',family_name:'王'}}],user_metadata:{given_name:'Other',family_name:'Name'}}),{first_name:'李',last_name:'王'});
 assert.deepEqual(googleAccountNames({...user,user_metadata:{given_name:42,family_name:'line\nbreak'}}),empty);
 assert.deepEqual(googleAccountNames({...user,user_metadata:{given_name:'x'.repeat(101),family_name:null}}),empty);
});

test('Google UserInfo fills missing components only when its account matches the signed-in Google identity',async t=>{
 const requests=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{requests.push({url,options});return Response.json({sub:'google-fixture-subject',given_name:'María José',family_name:'de la Cruz',email:'not-stored@example.invalid'});});
 assert.deepEqual(await readGoogleAccountNames(user,'explicit-fixture-token'),{first_name:'María José',last_name:'de la Cruz'});
 assert.equal(requests[0].url,'https://openidconnect.googleapis.com/v1/userinfo');
 assert.equal(requests[0].options.headers.Authorization,'Bearer explicit-fixture-token');
 assert.equal(requests[0].options.cache,'no-store');assert.equal(requests[0].options.redirect,'error');assert.ok(requests[0].options.signal instanceof AbortSignal);
});

test('complete metadata, absent credentials, unknown subject and non-Google users never make a provider request',async t=>{
 t.mock.method(globalThis,'fetch',()=>{throw Error('No provider request expected');});
 assert.deepEqual(await readGoogleAccountNames({...user,user_metadata:{given_name:'Ada',family_name:'Lovelace'}},'unused'),{first_name:'Ada',last_name:'Lovelace'});
 assert.deepEqual(await readGoogleAccountNames(user),empty);
 assert.deepEqual(await readGoogleAccountNames({...user,identities:[],user_metadata:{}},'unused'),empty);
 assert.deepEqual(await readGoogleAccountNames({...user,identities:[],app_metadata:{provider:'email'}},'unused'),empty);
 assert.equal(fetch.mock.callCount(),0);
});

test('missing last names stay missing; provider errors and mismatched identities do not fabricate names or break sign-in',async t=>{
 const responses=[
  ()=>Response.json({sub:'different-account',given_name:'Wrong',family_name:'Account'}),
  ()=>Response.json({error:'expired'},{status:401}),
  ()=>new Response('invalid JSON'),
  ()=>Response.json(null),
  ()=>Response.json([]),
  ()=>{throw new DOMException('Timed out','TimeoutError');},
  ()=>Response.json({sub:'google-fixture-subject',name:'Full name only'}),
  ()=>Response.json({sub:'google-fixture-subject',given_name:'x'.repeat(101),family_name:'line\nbreak'}),
 ];
 const metadata={...user,user_metadata:{...user.user_metadata,given_name:'Prince'}};
 t.mock.method(globalThis,'fetch',async()=>responses.shift()());
 for(let i=0;i<8;i++)assert.deepEqual(await readGoogleAccountNames(metadata,'explicit-fixture-token'),{first_name:'Prince',last_name:''});
 fetch.mock.mockImplementation(async()=>Response.json({sub:'google-fixture-subject',given_name:'Prince'}));
 assert.deepEqual(await readGoogleAccountNames(user,'explicit-fixture-token'),{first_name:'Prince',last_name:''});
});
