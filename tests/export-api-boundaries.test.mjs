import assert from 'node:assert/strict';
import {beforeEach,afterEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {RECORD_KINDS} from '../lib/research-workflow.ts';
const replacements={
 'server-only':'export {};',
 'next/navigation':"export function permanentRedirect(url){throw Object.assign(new Error('Synthetic redirect'),{code:'NEXT_REDIRECT',url});}",
 '@/lib/supabase/server':'export const createClient=async()=>globalThis.__exportState.client;',
 '@/lib/profile-store':'export const readOwnProfile=async(client,user)=>globalThis.__exportState.profile(user);',
 '@/lib/research-workflow-server':'export const getResearchSnapshot=async id=>{globalThis.__exportState.reads.push(id);return globalThis.__exportState.snapshot;};',
 '@/lib/http2-study-server':'export const getHttp2Data=async()=>globalThis.__exportState.data;export const getHttp2Frames=async()=>globalThis.__exportState.frames;export const getHttp2Measurements=async id=>{globalThis.__exportState.reads.push(id);return globalThis.__exportState.rows;};',
 '@/lib/reliable-study-server':'export const getReliableData=async()=>globalThis.__exportState.data;export const getReliableRuns=async()=>globalThis.__exportState.rows;',
 '@/lib/ipv6-study-server':'export const getIPv6Data=async()=>{if(globalThis.__exportState.error)throw globalThis.__exportState.error;return globalThis.__exportState.data;};',
 '@/lib/leo-study-server':'export const getLeoData=async()=>globalThis.__exportState.data;',
};
const hooks=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const routes={};
for(const [name,path] of Object.entries({artifact:'app/api/platform-updates/artifacts/[id]/route.ts',profile:'app/api/profile/route.ts',version:'app/api/platform-version/route.ts',http2:'app/(modules)/http2-compliance-study/api/results/route.ts',measurements:'app/(modules)/http2-compliance-study/api/measurements/route.ts',reliable:'app/(modules)/reliable-sketch-study/api/results/route.ts',reliableRelease:'app/(modules)/reliable-sketch-study/api/release/route.ts',ipv6:'app/(modules)/ipv6-dns-study/api/data/route.ts',ipv6Release:'app/(modules)/ipv6-dns-study/api/release/route.ts',leo:'app/(modules)/leo-emergency-failover/api/results/route.ts',paper:'app/(modules)/research-verification/api/assessments/[assessmentId]/export/route.ts',idea:'app/(modules)/research-ideas/api/studies/[studyId]/export/route.ts',legacy:'app/(modules)/research-verification/api/studies/[studyId]/export/route.ts'}))routes[name]=await import('../'+path);
hooks.deregister();
const ID='11111111-1111-4111-8111-111111111111';let state,revision;
beforeEach(()=>{
 revision=process.env.JUMPSERVE_BUILD_REVISION;
 state={data:null,rows:[],frames:[],reads:[],user:{id:ID,app_metadata:{provider:'google'}},location:{data:null,error:null},download:{data:null,error:null},profile:async user=>({user_id:user.id}),snapshot:{status:'not-found',reason:'Original missing study'}};
 state.client={auth:{getUser:async()=>({data:{user:state.user}})},rpc:async(name,args)=>{state.reads.push({name,args});return state.location;},storage:{from(bucket){state.reads.push({bucket});return{download:async path=>{state.reads.push({path});return state.download;}};}}};globalThis.__exportState=state;
});
afterEach(()=>{if(revision===undefined)delete process.env.JUMPSERVE_BUILD_REVISION;else process.env.JUMPSERVE_BUILD_REVISION=revision;});
const request=query=>new Request('https://example.test/export'+(query?'?'+query:''));
const params=(field='studyId',value=ID)=>({params:Promise.resolve({[field]:value})});
const run=(name,query)=>routes[name].GET(request(query),params(name==='paper'?'assessmentId':'studyId'));
const data=()=>({meta:{analysis_version:'original-v1',counts:{runs:1},provenance:{},validation:{zero:0}}});

test('private artifact downloads require a verified account and bounded authorized metadata',async()=>{
 assert.equal((await routes.artifact.GET(request(),params('id','invalid'))).status,400);assert.equal(state.reads.length,0);
 state.user=null;assert.equal((await routes.artifact.GET(request(),params('id'))).status,401);assert.equal(state.reads.length,0);state.user={id:ID,app_metadata:{},identities:[{provider:'google'}]};
 for(const [record,error,status] of [[null,null,404],[null,{code:'42501'},403],[{path:4,byte_count:0},null,404],[{path:'original',byte_count:-1},null,404],[{path:'original',byte_count:5000001},null,404],[{path:'original',byte_count:1.5},null,404]]){state.location={data:record,error};assert.equal((await routes.artifact.GET(request(),params('id'))).status,status);}
 assert.equal(state.reads.filter(row=>row.bucket).length,0);
});

test('artifact responses verify original size and hash before returning sanitized attachment bytes',async()=>{
 const bytes=new Blob(['Original retained bytes']);const sha256=createHash('sha256').update(await bytes.text()).digest('hex');state.location={data:{path:'private/original',byte_count:bytes.size,sha256,name:'original/"\nfile.txt'},error:null};
 for(const download of [{data:null,error:null},{data:bytes,error:{message:'Private diagnostic'}},{data:new Blob(['wrong size']),error:null}]){state.download=download;assert.equal((await routes.artifact.GET(request(),params('id'))).status,503);}
 state.download={data:bytes,error:null};state.location.data.sha256='f'.repeat(64);assert.equal((await routes.artifact.GET(request(),params('id'))).status,503);state.location.data.sha256=sha256;
 const response=await routes.artifact.GET(request(),params('id'));assert.equal(response.status,200);assert.equal(await response.text(),'Original retained bytes');assert.equal(response.headers.get('x-artifact-sha256'),sha256);assert.equal(response.headers.get('content-disposition'),'attachment; filename="original___file.txt"');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('vary'),'Cookie');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.ok(state.reads.some(row=>row.bucket==='platform-supervisor-private'));
});

test('profile and public release identities expose only their authorized projection and retain failures',async()=>{
 state.user=null;assert.equal((await routes.profile.GET()).status,401);state.user={id:ID,app_metadata:{provider:'google'}};let response=await routes.profile.GET();assert.deepEqual(await response.json(),{profile:{user_id:ID}});assert.equal(response.headers.get('vary'),'Cookie');
 for(const failure of [new Error('Original profile unavailable'),null]){state.profile=async()=>{throw failure;};response=await routes.profile.GET();assert.equal(response.status,503);assert.equal((await response.json()).error,failure?.message??'Profile is unavailable.');}
 delete process.env.JUMPSERVE_BUILD_REVISION;assert.deepEqual(await routes.version.GET().json(),{revision:'local'});process.env.JUMPSERVE_BUILD_REVISION='a'.repeat(40);response=routes.version.GET();assert.deepEqual(await response.json(),{revision:'a'.repeat(40)});assert.equal(response.headers.get('cache-control'),'no-store');
});

test('HTTP/2 exports preserve zero missing values CSV quoting and explicit run identities',async()=>{
 assert.equal((await run('http2','format=xml')).status,400);assert.equal((await run('http2')).status,404);
 state.data=data();state.rows=[{run_id:'archive-001',test_id:'test,"quoted"',description:'original\nline',outcome:0,expected:null}];state.frames=[{original:true}];
 const json=await run('http2');assert.deepEqual((await json.json()).frames,state.frames);assert.equal(json.headers.get('cache-control'),'no-store');const csv=await run('http2','format=csv');const text=await csv.text();assert.match(text,/"test,""quoted"""/);assert.match(text,/"original\nline"/);assert.match(text,/,"0",/);assert.match(csv.headers.get('content-type'),/text\/csv/);
 for(const query of [undefined,'runId=invalid','runId=archive-01'])assert.equal((await run('measurements',query)).status,400);const response=await run('measurements','runId=archive-001');assert.deepEqual(await response.json(),{measurements:state.rows});assert.equal(state.reads.at(-1),'archive-001');
});

test('public study exports refuse incomplete data and preserve scientific release limitations',async()=>{
 for(const [name,status] of [['reliable',503],['reliableRelease',503],['ipv6',503],['ipv6Release',503],['leo',404]])assert.equal((await run(name)).status,status);
 state.error=new Error('Private storage diagnostic');assert.equal((await run('ipv6')).status,503);state.error=null;state.data=data();assert.equal((await run('reliable')).status,503);
 state.rows=[{id:'run',seed:0,measurements:{updates:0,aae:null}}];for(const name of ['reliable','ipv6','leo']){const response=await run(name);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-disposition'),/attachment/);}
 const csv=await run('reliable','format=csv');assert.match(await csv.text(),/"run",,,,,,"0"/);
 for(const name of ['reliableRelease','ipv6Release']){let response=await run(name);let result=await response.json();assert.match(result.scientific_status,/incomplete/);assert.match(result.software_release.status,/pending/);state.data.meta.provenance.software_release={status:'Original recorded release'};response=await run(name);assert.deepEqual((await response.json()).software_release,{status:'Original recorded release'});delete state.data.meta.provenance.software_release;}
});

test('published research exports preserve pathway identity formats and unavailable outcomes',async()=>{
 for(const name of ['paper','idea']){assert.equal((await run(name)).status,404);state.snapshot={status:'unavailable',reason:'Original unavailable'};assert.equal((await run(name)).status,503);state.snapshot={status:'not-found',reason:'Original missing study'};}
 const snapshot={study:{id:ID,title:'Original paper',study_kind:'paper'},records:Object.fromEntries(RECORD_KINDS.map(kind=>[kind,[]])),coverage:{},access:'published-snapshot'};state.snapshot={status:'available',data:snapshot};
 assert.equal((await run('paper','format=xml')).status,400);let response=await run('paper');assert.deepEqual(await response.json(),snapshot);assert.match(response.headers.get('content-disposition'),/\.json$/);response=await run('paper','format=csv');assert.match(response.headers.get('content-type'),/text\/csv/);assert.equal(await response.text(),'run_id,observation_id,configuration_identity,metric,units,status,value,reason\n\n');
 response=await run('idea','format=csv');assert.equal(response.status,308);assert.equal(response.headers.get('location'),'/research-verification/api/assessments/'+ID+'/export?format=csv');snapshot.study.study_kind='idea';response=await run('paper','format=json');assert.equal(response.status,308);assert.equal(response.headers.get('location'),'/research-ideas/api/studies/'+ID+'/export?format=json');assert.equal((await run('idea')).status,200);
 await assert.rejects(run('legacy','format=csv'),{code:'NEXT_REDIRECT',url:'/research-verification/api/assessments/'+ID+'/export?format=csv'});
});
