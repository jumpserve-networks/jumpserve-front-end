import assert from 'node:assert/strict';
import {test} from 'node:test';
import {qualitySource,qualityRow,qualityOperations,qualityResponse,passReview,reviseReview} from './support/paper-quality-fixture.mjs';
import {qualityAttachment,qualityCanonical,qualityHash,qualityReviewRequest,qualityRepairRequest,readQualityReview,sandboxQualityChecks,retrieveQualitySandboxArtifact} from '../lib/paper-quality-model.ts';
import {validateQualityReview,validateQualityProgress} from '../lib/paper-quality.ts';
import {deterministicQualityChecks} from '../lib/paper-quality-checks.ts';
import {advancePaperQuality,cancelPaperQuality,PaperQualityLimitError} from '../lib/paper-quality-runner.ts';
import {isQualitySandboxProgram,qualitySandboxProgram} from '../lib/paper-quality-sandbox.ts';

test('review profiles are high, generation/repair remain medium, and Step 4 uses a private network-disabled sandbox',()=>{
 for(const step of [2,3,4]){const source=qualitySource(step),r=qualityReviewRequest(source,step===4?'file-fixture':undefined);assert.equal(r.reasoning.effort,'high');assert.equal(r.model,'gpt-5.4-2026-03-05');assert.equal(r.background,true);assert.equal(r.text.format.strict,true);assert.equal(r.text.format.name,'paper_quality_review_v1');if(step===4){assert.deepEqual(r.tools[0].container.network_policy,{type:'disabled'});assert.deepEqual(r.tools[0].container.file_ids,['file-fixture']);assert.equal(r.max_tool_calls,12);}else assert.equal(r.tools,undefined);
 const repair=qualityRepairRequest(source,qualityRow(step).original_request,reviseReview(),deterministicQualityChecks(source));assert.equal(repair.reasoning.effort,'medium');assert.equal(repair.tools,undefined);assert.deepEqual(repair.text,qualityRow(step).original_request.text);assert.match(repair.instructions,/never change frozen confirmed inputs/i);
 }
 assert.throws(()=>qualityReviewRequest(qualitySource(4)),/attachment/);
});
test('source hashes are canonical and change with any draft or frozen input change',()=>{
 const source=qualitySource(),a=qualityAttachment(source);assert.equal(a.hash,qualityAttachment(Object.fromEntries(Object.entries(source).reverse())).hash);assert.equal(JSON.parse(a.text).source_json,qualityCanonical(source));
 for(const key of ['candidate','paper','confirmed_breakdown']){const changed=structuredClone(source);changed[key]={changed:true};assert.notEqual(qualityAttachment(changed).hash,a.hash);}
});
test('review verdicts require concrete bounded findings and deterministic checks retain grounding and frozen coverage',()=>{
 assert.deepEqual(validateQualityReview(passReview()),passReview());assert.deepEqual(readQualityReview(qualityResponse()),passReview());
 for(const bad of [{...passReview(),decision:'revise'},{...reviseReview(),decision:'pass'},{...passReview(),extra:true},{...reviseReview(),findings:[...reviseReview().findings,...reviseReview().findings]}])assert.throws(()=>validateQualityReview(bad));
 for(const step of [2,3,4])assert.equal(deterministicQualityChecks(qualitySource(step)).passed,true);
 const bad=qualitySource(2);bad.candidate.breakdown.sections.access[0].citations[0].quote='Unsupported fabricated quote';assert.equal(deterministicQualityChecks(bad).passed,false);
 for(const key of ['provenance','implementation_choices']){const bad=qualitySource(2);const evidence=key==='provenance'?bad.candidate.breakdown.provenance:bad.candidate.breakdown.implementation_choices[0];evidence.citations[0].quote='Unsupported evidence';assert.equal(deterministicQualityChecks(bad).passed,false);}
 const unspecified=qualitySource(2);unspecified.candidate.breakdown.provenance={classification:'unspecified',statement:null,citations:[]};assert.equal(deterministicQualityChecks(unspecified).passed,true);
 const plan=qualitySource(3);plan.candidate.experiments[0].steps[0].source_refs=['validate-999'];assert.equal(deterministicQualityChecks(plan).passed,false);
 assert.throws(()=>validateQualityProgress({version:'paper-quality-v1',phase:'approved',round:2,findings:[]}));
});
test('sandbox approval requires the exact executed checker, original source hash and provider tool logs',()=>{
 const source=qualitySource(4),response=qualityResponse(passReview(),source);assert.equal(sandboxQualityChecks(response,source).passed,true);
 for(const alter of [r=>r.output.shift(),r=>r.output[0].code='print("fake pass")',r=>r.output[0].status='failed',r=>r.output[0].outputs=[],r=>r.output[0].outputs[0].logs=r.output[0].outputs[0].logs.replace('"passed":true','"passed":false'),r=>r.output[0].outputs[0].logs=r.output[0].outputs[0].logs.replace('"test_count":7','"test_count":0')]){const r=structuredClone(response);alter(r);if(r.output[0]?.type==='code_interpreter_call'&&r.output[0].outputs?.[0]?.logs.includes('"passed":false'))assert.equal(sandboxQualityChecks(r,source).passed,false);else assert.throws(()=>sandboxQualityChecks(r,source));}
 const changed=structuredClone(source);changed.candidate.setup.notes='A different candidate';assert.throws(()=>sandboxQualityChecks(response,changed));
});
test('read-only polling cannot admit reviews and a pass exposes only the approved unchanged candidate',async()=>{
 const f=qualityOperations();assert.equal((await advancePaperQuality(f.row(),f.ops)).status,'review_pending');assert.equal(f.requests.length,0);
 const original=structuredClone(f.row().source_json);await advancePaperQuality(f.row(),f.ops,true);assert.equal(f.requests.length,1);assert.equal(f.requests[0].request.reasoning.effort,'high');assert.ok(f.events.findIndex(e=>e.operation==='request')<f.events.findIndex(e=>e.operation==='submitted'));
 const done=await advancePaperQuality(f.row(),f.ops);assert.equal(done.status,'approved');assert.deepEqual(done.source_json,original);assert.equal((await advancePaperQuality(done,f.ops,true)).status,'approved');assert.equal(f.requests.length,1);
});
test('a blocking review allows one medium repair, always requires high re-review, then stops after unresolved findings',async()=>{
 const f=qualityOperations(),original=structuredClone(f.row().source_json);
 await advancePaperQuality(f.row(),f.ops,true);f.response(qualityResponse(reviseReview()));await advancePaperQuality(f.row(),f.ops);assert.equal(f.row().status,'repair_pending');
 await advancePaperQuality(f.row(),f.ops,true);assert.equal(f.requests[1].request.reasoning.effort,'medium');await advancePaperQuality(f.row(),f.ops);assert.equal(f.row().round,1);assert.equal(f.row().status,'review_pending');
 await advancePaperQuality(f.row(),f.ops,true);assert.equal(f.requests[2].request.reasoning.effort,'high');await advancePaperQuality(f.row(),f.ops);assert.equal(f.row().status,'needs_attention');await advancePaperQuality(f.row(),f.ops,true);assert.equal(f.requests.length,3);assert.deepEqual(f.row().source_json,original);
});
test('an approved repair is versioned separately and can pass its second review without changing frozen scope',async()=>{
 const f=qualityOperations(),before=structuredClone(f.row().source_json);await advancePaperQuality(f.row(),f.ops,true);f.response(qualityResponse(reviseReview()));await advancePaperQuality(f.row(),f.ops);await advancePaperQuality(f.row(),f.ops,true);await advancePaperQuality(f.row(),f.ops);f.response(qualityResponse(passReview()));await advancePaperQuality(f.row(),f.ops,true);await advancePaperQuality(f.row(),f.ops);assert.equal(f.row().status,'approved');assert.equal(f.requests.length,3);assert.deepEqual(f.row().source_json,before);
});
test('uncertain uploads or provider submissions are retained without replay, and duplicate admission is coalesced',async()=>{
 for(const name of ['upload','create']){const f=qualityOperations(qualityRow(name==='upload'?4:3));f.ops[name]=async()=>{throw Error('Lost acknowledgement');};await advancePaperQuality(f.row(),f.ops,true);assert.equal(f.row().status,'uncertain');const count=f.events.length;await advancePaperQuality(f.row(),f.ops,true);assert.equal(f.events.length,count);}
 const f=qualityOperations();const ops={...f.ops,save:async(op,payload)=>op==='admit'?{...f.row(),admitted:false}:f.ops.save(op,payload)};await advancePaperQuality(f.row(),ops,true);assert.equal(f.requests.length,0);
});
test('missing sandbox evidence fails closed instead of showing untested scripts',async()=>{
 const f=qualityOperations(qualityRow(4));await advancePaperQuality(f.row(),f.ops,true);await advancePaperQuality(f.row(),f.ops);assert.equal(f.row().status,'needs_attention');assert.match(f.row().reason,/checker was not executed/);assert.equal(f.requests.length,1);
});
test('provider sandbox artifacts recover omitted logs without trusting model prose or another container',async()=>{
 const source=qualitySource(4),response=qualityResponse(passReview(),source),content=response.output[0].outputs[0].logs.split('JUMPSERVE_QUALITY_CHECKS_V1 ')[1],hash=qualityAttachment(source).hash,path='/mnt/data/jumpserve-quality-'+hash+'-result.json';response.output[0].outputs=[];
 const calls=[],client={containers:{files:{async list(id,query){calls.push({id,query});return{data:[{id:'cfile_fixture',container_id:id,path,source:'assistant',bytes:null}],hasNextPage:()=>false};},content:{async retrieve(id,params){calls.push({id,params});return new Response(content);}}}}};
 const artifact=await retrieveQualitySandboxArtifact(client,response,source);assert.equal(artifact.content_sha256,qualityHash(content));assert.equal(sandboxQualityChecks(response,source,artifact).passed,true);assert.equal(calls[0].id,'cntr_fixture');assert.equal(calls[1].params.container_id,'cntr_fixture');
 for(const change of [{path:'/mnt/data/wrong.json'},{content:'{}'},{content_sha256:'0'.repeat(64)}])assert.throws(()=>sandboxQualityChecks(response,source,{...artifact,...change}));
 client.containers.files.list=async()=>({data:[],hasNextPage:()=>false});assert.equal(await retrieveQualitySandboxArtifact(client,response,source),null);
});
test('only inert literal exec wrappers of the entire unchanged checker are accepted',()=>{
 const hash=qualityAttachment(qualitySource(4)).hash,program=qualitySandboxProgram(hash),wrapper="checker = r'''\n"+program+"\n'''\nns = {}\nexec(checker, ns, ns)";assert.equal(isQualitySandboxProgram(wrapper,hash),true);
 for(const code of [wrapper+'\nprint("forged proof")',wrapper.replace('result["passed"] = True','result["passed"] = False'),"checker = 'not the checker'\nexec(checker)"])assert.equal(isQualitySandboxProgram(code,hash),false);
});
test('a failed result save retries the original completed response without failing the review or admitting another call',async()=>{
 const f=qualityOperations();await advancePaperQuality(f.row(),f.ops,true);const save=f.ops.save;let failOnce=true;f.ops.save=async(op,payload)=>{if(op==='reviewed'&&failOnce){failOnce=false;throw Error('Temporary database failure');}return save(op,payload);};
 await assert.rejects(()=>advancePaperQuality(f.row(),f.ops),/Temporary database failure/);assert.equal(f.row().status,'running');assert.equal(f.events.filter(e=>e.operation==='failed').length,0);await advancePaperQuality(f.row(),f.ops);assert.equal(f.row().status,'approved');assert.equal(f.requests.length,1);
});
test('budgets and original deadlines stop new calls, cancellation requires the original identity',async()=>{
 const f=qualityOperations();f.ops.save=async(op,payload)=>{if(op==='admit')throw new PaperQualityLimitError('Original assessment budget exhausted');return qualityOperations().ops.save(op,payload);};const rejected=await advancePaperQuality(f.row(),f.ops,true);assert.equal(rejected.status,'needs_attention');assert.equal(f.requests.length,0);
 const expired=qualityOperations({...qualityRow(),deadline_at:'2000-01-01T00:00:00Z'});assert.equal((await advancePaperQuality(expired.row(),expired.ops,true)).status,'needs_attention');assert.equal(expired.requests.length,0);
 const running=qualityOperations();await advancePaperQuality(running.row(),running.ops,true);running.ops.cancel=async()=>({id:'resp_wrong',status:'cancelled',output:[]});await assert.rejects(()=>cancelPaperQuality(running.row(),running.ops),/not been confirmed/);running.ops.cancel=async id=>({id,status:'cancelled',output:[]});assert.equal((await cancelPaperQuality(running.row(),running.ops)).status,'cancelled');
});
