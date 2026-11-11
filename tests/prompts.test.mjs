import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
const hook=registerHooks({resolve(s,c,next){return next(s.startsWith('@/lib/')?new URL('../lib/'+s.slice(6)+'.ts',import.meta.url).href:s,c);}});
const {readPrompts,promptStatus,promptArea,formatPrompt}=await import('../lib/prompts.ts');hook.deregister();
const id='11111111-1111-4111-8111-111111111111';
const prompt=()=>({id,module_id:'research-autonomy',version:'example-v1',content_sha256:'a'.repeat(64),created_at:'2026-11-01T00:00:00Z',updated_at:'2026-11-01T00:00:00Z',published_at:null,active:false});

test('prompt reads require authentication, omit cookies and disable caching',async()=>{
 const old=process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL='https://api.example.org';
 try{
  const fetcher=async(url,options)=>{assert.equal(url,'https://api.example.org/research/prompts');assert.equal(options.headers.Authorization,'Bearer synthetic-token');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');return Response.json({version:'prompt-catalog-v1',prompts:[prompt()]});};
  assert.equal((await readPrompts('synthetic-token',undefined,fetcher)).prompts.length,1);
  await assert.rejects(()=>readPrompts('',undefined,()=>assert.fail('No read')),/Sign in/);
  await assert.rejects(()=>readPrompts('token','bad-id',()=>assert.fail('No read')),/invalid response/);
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL=old;}
});
test('version content is complete and must match the requested identity',async()=>{
 const old=process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL='https://api.example.org';
 try{
  const body={version:'prompt-catalog-v1',prompt:{...prompt(),system_prompt:'Exact <script>template</script>',research_context:'Exact context'}};
  assert.equal((await readPrompts('token',id,async()=>Response.json(body))).prompt.system_prompt,body.prompt.system_prompt);
  await assert.rejects(()=>readPrompts('token',id,async()=>Response.json({...body,prompt:{...body.prompt,id:'22222222-2222-4222-8222-222222222222'}})),/invalid response/);
  await assert.rejects(()=>readPrompts('token',undefined,async()=>Response.json({version:'prompt-catalog-v1',prompts:[prompt(),prompt()]})),/invalid response/);
  for(const status of [401,403,404,503])await assert.rejects(()=>readPrompts('token',undefined,async()=>new Response('{}',{status})),/Sign in again|not been released|temporarily unavailable/);
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL=old;}
});
test('active status comes from the pointer and publication, and structured text preserves every field',()=>{
 assert.equal(promptStatus(prompt()),'Draft');assert.equal(promptStatus({...prompt(),published_at:'2026-11-01T00:00:00Z'}),'Published');assert.equal(promptStatus({...prompt(),published_at:'2026-11-01T00:00:00Z',active:true}),'Active');
 assert.equal(promptArea('research-autonomy'),'Assessment autonomy');assert.equal(promptArea('future-module'),'future-module');
 const value={schema:'idea-task-prompts-v2',prompts:{extract:'Full exact prompt',review:'Full exact review'}};
 assert.deepEqual(JSON.parse(formatPrompt(JSON.stringify(value))),value);assert.equal(formatPrompt('Exact plain text\nnext line'),'Exact plain text\nnext line');
});

test('recorded paper assessment prompts are distinct from evaluated agent publications',async t=>{
 const prior=process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL='https://example.test';t.after(()=>{if(prior===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL=prior;});
 const value={...prompt(),module_id:'research-paper-intake',recorded:true};
 assert.equal(promptArea(value.module_id),'Paper assessment');assert.equal(promptStatus(value),'Recorded');
 assert.equal((await readPrompts('token',undefined,async()=>Response.json({version:'prompt-catalog-v1',prompts:[value]}))).prompts[0].recorded,true);
 for(const change of [{recorded:'yes'},{active:true},{published_at:'2026-11-01T00:00:00Z'},{module_id:'research-autonomy'}])await assert.rejects(readPrompts('token',undefined,async()=>Response.json({version:'prompt-catalog-v1',prompts:[{...value,...change}]})),/invalid response/);
});

test('prompt catalog validation rejects malformed versions hashes timestamps and incomplete stored content',async t=>{
 const environment={...process.env};t.after(()=>{for(const key of Object.keys(process.env))if(!(key in environment))delete process.env[key];Object.assign(process.env,environment);});process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL='https://example.test';
 const changes=[{id:0},{module_id:0},{module_id:'unsafe/module'},{version:0},{version:''},{version:'x'.repeat(121)},{content_sha256:0},{content_sha256:'invalid'},{created_at:0},{created_at:'invalid'},{updated_at:0},{updated_at:'invalid'},{published_at:0},{published_at:'invalid'},{active:0},{active:true}];
 for(const change of changes)await assert.rejects(readPrompts('token',undefined,async()=>Response.json({version:'prompt-catalog-v1',prompts:[{...prompt(),...change}]})),/invalid response/);
 for(const value of [null,[],{},'original',false])await assert.rejects(readPrompts('token',undefined,async()=>Response.json({version:'prompt-catalog-v1',prompts:[value]})),/invalid response/);
 for(const body of [null,{}, {version:'foreign',prompts:[]},{version:'prompt-catalog-v1',prompts:{}},{version:'prompt-catalog-v1',prompts:Array.from({length:1001},prompt)}])await assert.rejects(readPrompts('token',undefined,async()=>Response.json(body)),/invalid response/);
 for(const change of [{system_prompt:0},{research_context:0}])await assert.rejects(readPrompts('token',id,async()=>Response.json({version:'prompt-catalog-v1',prompt:{...prompt(),system_prompt:'Original system',research_context:'Original context',...change}})),/invalid response/);
 await assert.rejects(readPrompts('token',id,async()=>new Response('{}',{status:404})),/Prompt version not found/);await assert.rejects(readPrompts('token',undefined,async()=>new Response('invalid JSON')),/invalid response/);await assert.rejects(readPrompts('token',undefined,async()=>new Response('x'.repeat(1000001))),/invalid response/);
 const fetcher=async url=>{assert.equal(url,'https://fallback.example.test/research/prompts');return Response.json({version:'prompt-catalog-v1',prompts:[]});};delete process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL='https://fallback.example.test';await readPrompts('token',undefined,fetcher);delete process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL;process.env.NEXT_PUBLIC_BENCHMARK_API_URL='https://fallback.example.test';await readPrompts('token',undefined,fetcher);delete process.env.NEXT_PUBLIC_BENCHMARK_API_URL;await assert.rejects(readPrompts('token'),/not configured/);assert.equal(promptArea('congestion-control-emulated'),'Congestion Control Emulated Tests');assert.equal(formatPrompt('"Original primitive"'),'"Original primitive"');assert.equal(formatPrompt('null'),'null');
});
