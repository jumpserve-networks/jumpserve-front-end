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
