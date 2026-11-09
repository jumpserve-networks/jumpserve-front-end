import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
const auth='data:text/javascript,'+encodeURIComponent('export async function requireAccessToken(){if(globalThis.__ideaAuthFailure)throw globalThis.__ideaAuthFailure.value;return "explicit-software-fixture";}');
const hook=registerHooks({resolve(specifier,context,nextResolve){const replacements={'@/lib/browser-auth':auth,'@/lib/research-workflow':new URL('../lib/research-workflow.ts',import.meta.url).href,'@/lib/research-ideas':new URL('../lib/research-ideas.ts',import.meta.url).href};return nextResolve(replacements[specifier]??specifier,context);}});
const {ideaModelRequest,IdeaRequestError}=await import('../lib/research-idea-api.ts');hook.deregister();
const body={request_id:'request',study_id:'study',packet_id:'packet',task:'planning',session_id:'session',message:'Explicit software fixture'};
const capability=()=>Response.json({research_ideas:{version:'research-ideas-v1'}});
async function fixture(fetcher,run){const savedFetch=globalThis.fetch,savedOrigin=process.env.NEXT_PUBLIC_AGENT_URL;globalThis.fetch=fetcher;process.env.NEXT_PUBLIC_AGENT_URL='https://agent.example.invalid';try{return await run();}finally{globalThis.fetch=savedFetch;if(savedOrigin===undefined)delete process.env.NEXT_PUBLIC_AGENT_URL;else process.env.NEXT_PUBLIC_AGENT_URL=savedOrigin;}}
test('a failed capability check confirms no model invocation began',()=>fixture(async()=>{throw new Error('Fixed preflight transport failure');},async()=>{await assert.rejects(ideaModelRequest(body),error=>error instanceof IdeaRequestError&&error.uncertain===false);}));
test('missing configuration and unverified sign-in never admit an AI invocation',()=>fixture(()=>assert.fail('No model transport permitted'),async()=>{
 for(const origin of ['', 'invalid origin']){process.env.NEXT_PUBLIC_AGENT_URL=origin;await assert.rejects(ideaModelRequest(body),error=>error instanceof IdeaRequestError&&!error.uncertain);}
 process.env.NEXT_PUBLIC_AGENT_URL='https://agent.example.invalid';
 for(const value of [new Error('Original sign-in failure'),null]){globalThis.__ideaAuthFailure={value};try{await assert.rejects(ideaModelRequest(body),error=>!error.uncertain&&/Sign in|sign-in/.test(error.message));}finally{delete globalThis.__ideaAuthFailure;}}
}));
test('malformed capability and invocation replies retain exact uncertainty and status',async()=>{
 await fixture(async()=>Response.json({}),async()=>assert.rejects(ideaModelRequest(body),error=>!error.uncertain&&/No model call/.test(error.message)));
 for(const response of [()=>new Response('invalid',{status:502}),()=>Response.json({},{status:503}),()=>{throw null;}]){let calls=0;await fixture(async()=>++calls===1?capability():response(),async()=>assert.rejects(ideaModelRequest(body),error=>error.uncertain));}
});
test('AI timeouts and already aborted requests preserve cancellation without a replacement call',async t=>{
 let expire;t.mock.method(globalThis,'setTimeout',(callback,ms)=>{assert.equal(ms,90000);expire=callback;return 1;});t.mock.method(globalThis,'clearTimeout',()=>{});
 await fixture(async(_url,options)=>{expire();assert.equal(options.signal.aborted,true);throw options.signal.reason;},async()=>assert.rejects(ideaModelRequest(body),error=>!error.uncertain&&/timed out/.test(error.message)));
 const controller=new AbortController();controller.abort(new Error('Original cancellation'));
 await fixture(async(_url,options)=>{assert.equal(options.signal.aborted,true);throw options.signal.reason;},async()=>assert.rejects(ideaModelRequest(body,controller.signal),error=>!error.uncertain&&error.message==='Original cancellation'));
});
test('older agents cannot silently substitute generic planning for the conversational guide',()=>{let calls=0;return fixture(async()=>{calls++;return capability();},async()=>{await assert.rejects(ideaModelRequest({...body,interview_version:'idea-interview-v1'}),error=>error instanceof IdeaRequestError&&!error.uncertain&&/checklist/.test(error.message));assert.equal(calls,1);});});
test('older agents cannot substitute generic planning for paper experiment design',()=>{let calls=0;return fixture(async()=>{calls++;return capability();},async()=>{await assert.rejects(ideaModelRequest({...body,design_version:'claim-experiment-design-v1'}),error=>error instanceof IdeaRequestError&&!error.uncertain&&/designer/.test(error.message));assert.equal(calls,1);});});
test('unknown invocation responses preserve uncertainty rather than invite another call',()=>{let calls=0;return fixture(async()=>++calls===1?capability():Promise.reject(new Error('Fixed lost acknowledgement')),async()=>{await assert.rejects(ideaModelRequest(body),error=>error instanceof IdeaRequestError&&error.uncertain===true);assert.equal(calls,2);});});
test('an explicit unauthorized response does not masquerade as a running model',()=>{let calls=0;return fixture(async()=>++calls===1?capability():Response.json({error:'Synthetic expired session'},{status:401}),async()=>{await assert.rejects(ideaModelRequest(body),error=>error instanceof IdeaRequestError&&error.uncertain===false&&error.message==='Synthetic expired session');});});
test('a returned answer must belong to the exact user-requested attempt and saved packet',()=>{let calls=0;return fixture(async()=>++calls===1?capability():Response.json({run:{id:body.request_id,study_id:body.study_id,packet_id:'wrong-packet',task:body.task}}),async()=>{await assert.rejects(ideaModelRequest(body),error=>error instanceof IdeaRequestError&&error.uncertain===true);});});

test('confirmed idea answers retain exact attempt identity while cancellation never invites an automatic replacement',async()=>{
 const controller=new AbortController();let calls=0;await fixture(async(url,options)=>{if(++calls===1)return capability();controller.abort(new Error('Original owner cancellation'));assert.equal(options.signal.aborted,true);throw options.signal.reason;},async()=>{await assert.rejects(ideaModelRequest(body,controller.signal),error=>error instanceof IdeaRequestError&&error.uncertain&&error.message==='Original owner cancellation');});calls=0;await fixture(async()=>++calls===1?capability():Response.json({run:{id:body.request_id,study_id:body.study_id,packet_id:body.packet_id,task:body.task}}),async()=>{assert.equal((await ideaModelRequest(body)).run.id,body.request_id);});
});
