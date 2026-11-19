import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {registerHooks} from 'node:module';
import {sha256,serializePaperText} from '../lib/paper-intake-model.ts';
import {evidencePaper} from './support/paper-evidence-fixture.mjs';
import {implementationBreakdown,hierarchicalImplementationPlan,experimentScriptsFixture} from './support/experiment-scripts-fixture.mjs';
import {validateLocalPaperAssessment,localIntake,localPlan,localScripts} from '../lib/local-paper-assessment.ts';
import {shareLocalPaperAssessment} from '../lib/shared-local-paper-assessment.ts';
const study='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222';
function bundle(){
 const b=implementationBreakdown(),instructions='Explicit local authoring without any provider call.';
 b.source_id='33333333-3333-4333-8333-333333333333';b.text_artifact_id='44444444-4444-4444-8444-444444444444';
 b.text_sha256=sha256(serializePaperText(evidencePaper));b.policy_sha256=sha256(instructions);
 return{version:'local-codex-assessment-v1',study_id:study,source_id:b.source_id,original_artifact_id:'55555555-5555-4555-8555-555555555555',text_artifact_id:b.text_artifact_id,
 title:'Synthetic local assessment fixture',authors:[],domain:'Networking',filename:'fixture.pdf',sha256:'a'.repeat(64),byte_count:1000,created_at:'2026-11-18T00:00:00Z',completed_at:'2026-11-18T00:01:00Z',instructions,paper_text:evidencePaper,
 execution:{type:'local_codex',identity:'Local Codex fixture',agents_api_calls:0,responses_api_calls:0,provider_response_id:null,independent_review:false,measurements_collected:false},breakdown:b,plan:hierarchicalImplementationPlan(),scripts:[experimentScriptsFixture()]};
}
test('local imports retain complete source-bound steps and explicitly absent provider identities',()=>{
 const v=validateLocalPaperAssessment(bundle(),study),i=localIntake(v,owner),p=localPlan(v,owner),s=localScripts(v,owner,1);
 assert.equal(i.status,'ready');assert.equal(i.provider_response_id,null);assert.equal(i.request,null);
 assert.equal(p.status,'ready');assert.equal(p.provider_response_id,null);assert.equal(s.provider_response_id,null);
 assert.ok(Object.values(s.command_set.actions).some(block=>block.kind==='blocked'));
 assert.equal(localScripts(v,owner,2),null);
});
test('changed source text, unsupported provenance, missing commands and cross-paper identities fail closed',()=>{
 for(const change of [v=>v.paper_text.pages[0].text+=' changed',v=>v.execution.agents_api_calls=1,v=>v.execution.provider_response_id='resp_fake',v=>v.execution.independent_review=true,v=>v.scripts=[],v=>v.breakdown.source_id='different',v=>v.breakdown.sections.access[0].citations[0].quote='invented quote']){
  const v=structuredClone(bundle());change(v);assert.throws(()=>validateLocalPaperAssessment(v,study));
 }
 assert.throws(()=>validateLocalPaperAssessment(bundle(),owner));
});
globalThis.__localImportTest={};
const hook=registerHooks({resolve(name,context,next){if(name==='server-only')return{shortCircuit:true,url:'data:text/javascript,export {};'};if(name==='./paper-intake-server')return{shortCircuit:true,url:'data:text/javascript,export const intakeDatabase=async()=>globalThis.__localImportTest.db;export const intakeConfigured=async()=>true;'};return next(name,context);}});
const {loadLocalPaperAssessment,loadSharedLocalPaperAssessment}=await import('../lib/local-paper-assessment-server.ts');after(()=>hook.deregister());
function database({deleted=false,fail=false,metadataOwner=owner,status='confirmed'}={}){
 const calls=[];
 globalThis.__localImportTest.db={from(table){calls.push(table);return{select(){return this;},eq(){return this;},is(){return this;},async maybeSingle(){return{error:fail?{code:'unavailable'}:null,data:table==='research_study_owners'?{owner_id:owner}:table==='research_studies'?deleted?null:{id:study}:{metadata:{local_codex_assessment:bundle(),local_codex_assessment_owner:metadataOwner},revision:1,status}};}};}};
 return calls;
}
test('read-only imports check owner and deletion before fetching private metadata',async()=>{
 let calls=database();assert.equal(await loadLocalPaperAssessment(study,'66666666-6666-4666-8666-666666666666'),null);assert.deepEqual(calls,['research_study_owners']);
 calls=database({deleted:true});assert.equal(await loadLocalPaperAssessment(study,owner),null);assert.deepEqual(calls,['research_study_owners','research_studies']);
 database();assert.equal((await loadLocalPaperAssessment(study,owner)).bundle.study_id,study);
 database({metadataOwner:study});await assert.rejects(()=>loadLocalPaperAssessment(study,owner),/owner does not match/);
 database({fail:true});await assert.rejects(()=>loadLocalPaperAssessment(study,owner),/ownership could not be checked/);
});
test('public copies omit original text, quotes and private identities and do not alter the import',()=>{
 const v=bundle(),before=structuredClone(v),shared=shareLocalPaperAssessment(v),raw=JSON.stringify(shared);
 for(const field of ['paper_text','quote','original_artifact_id','text_artifact_id','source_id','filename','instructions','provider_response_id'])assert.equal(Object.hasOwn(shared,field),false);
 assert.equal(raw.includes('"quote"'),false);assert.equal(raw.includes('"citations"'),false);assert.equal(shared.projection.originals_unchanged,true);
 assert.equal(shared.scripts.length,1);assert.deepEqual(v,before);
});
test('shared text redacts credentials and local paths and disables affected copyable scripts',()=>{
 const v=bundle();v.plan.experiments[0].title='Contact person@example.test at /Users/example/private.txt';
 v.scripts[0].setup.commands='export API_KEY=sk-testkey12345678901234567890';
 const shared=shareLocalPaperAssessment(v),raw=JSON.stringify(shared);
 for(const secret of ['person@example.test','/Users/example','sk-testkey'])assert.equal(raw.includes(secret),false);
 assert.ok(shared.projection.redacted>=3);assert.equal(shared.scripts[0].setup.kind,'blocked');
 assert.ok(Object.values(shared.scripts[0].actions).every(b=>b.kind!=='terminal'));assert.notEqual(shared.scripts[0].cleanup.kind,'terminal');
});
test('only confirmed local imports are shared; optional read failures preserve an unavailable state',async()=>{
 database({status:'ready'});assert.equal(await loadLocalPaperAssessment(study),null);
 database();assert.equal((await loadSharedLocalPaperAssessment(study)).status,'available');
 database({fail:true});assert.deepEqual(await loadSharedLocalPaperAssessment(study),{status:'unavailable'});
});
test('source quotations embedded in setup protocol JSON are removed from read-only previews',()=>{
 const v=bundle(),quote='PRIVATE EXACT ORIGINAL PASSAGE';v.scripts[0].setup.commands='cat <<\'CONFIG\'\n'+JSON.stringify({citations:[{page:1,quote}]})+'\nCONFIG';
 const shared=shareLocalPaperAssessment(v),raw=JSON.stringify(shared);
 assert.equal(raw.includes(quote),false);assert.equal(shared.scripts[0].setup.kind,'blocked');
 assert.match(shared.scripts[0].setup.redacted_preview,/source quotation omitted/);assert.ok(shared.scripts[0].cleanup.redacted_preview);
 assert.ok(v.scripts[0].setup.commands.includes(quote));
});
