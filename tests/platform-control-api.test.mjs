import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
const replacements={
 '@/lib/supabase/server':'export const createClient=async()=>globalThis.__platformApiClient;',
 '@/lib/platform-updates-store':'export const readPlatform=(...args)=>globalThis.__platformApiRead(...args);export const controlPlatform=(...args)=>globalThis.__platformApiControl(...args);',
};
const hook=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {GET,POST}=await import('../app/api/platform-updates/route.ts');hook.deregister();
const ID='11111111-1111-4111-8111-111111111111',ORIGIN='https://example.test';let user,reads,writes,environment;
beforeEach(()=>{environment=process.env.NEXT_PUBLIC_SITE_URL;delete process.env.NEXT_PUBLIC_SITE_URL;user={id:ID,app_metadata:{provider:'google'},identities:[{provider:'google'}]};reads=[];writes=[];globalThis.__platformApiClient={auth:{getUser:async()=>({data:{user}})}};globalThis.__platformApiRead=(...args)=>{reads.push(args);return{status:'available',tasks:[]};};globalThis.__platformApiControl=(...args)=>{writes.push(args);return{preserved:true};};});afterEach(()=>{if(environment===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=environment;});
const body=()=>({action:'pause',request_id:ID,task_id:null,payload:{}});
const request=(value=JSON.stringify(body()),headers={})=>new Request(ORIGIN+'/api/platform-updates',{method:'POST',headers:{origin:ORIGIN,...headers},body:value});
test('platform history authenticates Google users and validates cursors before reading private state',async()=>{
 user=null;assert.equal((await GET(new Request(ORIGIN+'/api/platform-updates'))).status,401);assert.equal((await POST(request())).status,401);assert.equal(reads.length,0);user={id:ID,app_metadata:{provider:'google'}};
 for(const query of ['task=invalid','before_task=invalid','before_event=-1','before_event='+'1'.repeat(20)])assert.equal((await GET(new Request(ORIGIN+'/api/platform-updates?'+query))).status,400);
 const response=await GET(new Request(ORIGIN+'/api/platform-updates?task='+ID+'&before_task='+ID+'&before_event=0'));assert.equal(response.status,200);assert.deepEqual(reads.at(-1).slice(1),[ID,'0',ID]);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('vary'),'Cookie');
});
test('platform history preserves forbidden and unavailable statuses instead of claiming an empty successful history',async()=>{
 for(const [status,code]of [['forbidden',403],['unavailable',503]]){globalThis.__platformApiRead=async()=>({status});const response=await GET(new Request(ORIGIN+'/api/platform-updates'));assert.equal(response.status,code);assert.equal((await response.json()).status,status);}
});
test('platform control requires exact same-origin writes and bounded declared and streamed bytes',async()=>{
 assert.equal((await POST(request(undefined,{origin:'https://foreign.test'}))).status,403);assert.equal((await POST(request(undefined,{'content-length':'20001'}))).status,413);
 assert.equal((await POST(new Request(ORIGIN+'/api/platform-updates',{method:'POST',headers:{origin:ORIGIN}}))).status,400);assert.equal((await POST(request('x'.repeat(20001)))).status,400);assert.equal((await POST(request(new Uint8Array([255])))).status,400);assert.equal(writes.length,0);
});
test('an untyped body stream failure rejects the control before any write',async()=>{
 const stream=new ReadableStream({pull(controller){controller.error(null);}});const response=await POST(new Request(ORIGIN+'/api/platform-updates',{method:'POST',headers:{origin:ORIGIN},body:stream,duplex:'half'}));assert.equal(response.status,400);assert.equal((await response.json()).error,'Invalid platform control.');assert.equal(writes.length,0);
});
test('platform control submits only parsed authorized data and retains conflict or unconfirmed outcomes',async()=>{
 const response=await POST(request());assert.equal(response.status,200);assert.deepEqual(writes[0][1],body());assert.deepEqual(await response.json(),{result:{preserved:true}});
 for(const failure of [new Error('Original control conflict'),null]){globalThis.__platformApiControl=async()=>{throw failure;};const response=await POST(request());assert.equal(response.status,409);assert.equal((await response.json()).error,failure?.message??'Control request unconfirmed.');}
 assert.equal((await POST(request('{}'))).status,400);
});
