import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readPaperExtraction,refreshPaperIntake} from '../lib/paper-intake-runner.ts';
import {PAPER_SOURCE_FORMAT_V3,PAPER_SOURCE_FORMAT_V4,PAPER_SOURCE_FORMAT_V5} from '../lib/paper-source-references.ts';
import {reviewQualityCase as fixture} from '../scripts/lib/paper-intake-quality-case.mjs';
import {gradePaperCase,referenceResponse} from '../scripts/lib/paper-intake-cases.mjs';
import {validatePaperExpectations} from '../scripts/lib/paper-intake-quality-checks.mjs';
import {paperModelRequest,PAPER_INTAKE_MODEL} from '../lib/paper-intake-model.ts';
import {experimentPlanRequest,PAPER_EXPERIMENT_PLAN_MODEL} from '../lib/paper-experiment-plan-model.ts';
import {evidenceBreakdown} from './support/paper-evidence-fixture.mjs';
const response=(value=fixture.reference,format=PAPER_SOURCE_FORMAT_V5)=>referenceResponse(value,format);
test('step-one model qualification does not change the phase-two planning model',()=>{
 assert.equal(paperModelRequest(fixture.paper).model,PAPER_INTAKE_MODEL);
 assert.equal(experimentPlanRequest(evidenceBreakdown()).model,PAPER_EXPERIMENT_PLAN_MODEL);
 assert.notEqual(PAPER_INTAKE_MODEL,PAPER_EXPERIMENT_PLAN_MODEL);
});

test('v5 retains three distinct hypotheses, collection requirements, fabricated results and setup/uncertainty checks',()=>{
 const graded=gradePaperCase(fixture,response());assert.equal(graded.passed,true);assert.ok(graded.checks.length>=15);
 const b=graded.breakdown;assert.equal(b.sections.validate.filter(i=>i.kind==='claim').length,3);assert.equal(b.sections.experiment.length,1);
 assert.deepEqual(b.sections.validate.filter(i=>i.kind==='claim').map(i=>i.criterion.acceptance),['needs_definition','paper_defined','needs_definition']);
});
test('each experiment field contributes its own retained sources, with unknown field sources rejected',()=>{
 const v=structuredClone(fixture.reference);v.sections.experiment[0].source_refs=['p1s1'];
 const extracted=readPaperExtraction(response(v),fixture.paper);
 assert.deepEqual(extracted.sections.experiment[0].citations.map(c=>c.page),[1,2]);
 assert.equal(typeof extracted.sections.experiment[0].specification.comparisons,'string');
 v.sections.experiment[0].specification.comparisons.source_refs=['p9s1'];assert.throws(()=>readPaperExtraction(response(v),fixture.paper),/retained source block/);
});
test('combined experiment citations retain more than six sources and fail explicitly above twelve',()=>{
 const paper=structuredClone(fixture.paper);for(let n=5;n<=13;n++)paper.pages.push({page:n,text:fixture.paper.pages[(n-5)%4].text});paper.totalPages=13;
 const v=structuredClone(fixture.reference);v.sections.experiment[0].source_refs=['p1s1'];
 v.sections.experiment[0].specification.setup.source_refs=[5,6,7,8,9,10].map(n=>`p${n}s1`);
 v.sections.experiment[0].specification.conditions.source_refs=[11,12,13].map(n=>`p${n}s1`);
 assert.equal(readPaperExtraction(response(v),paper).sections.experiment[0].citations.length,11);
 v.sections.experiment[0].specification.procedure.source_refs=['p2s1','p3s1','p4s1'];
 assert.throws(()=>readPaperExtraction(response(v),paper),/citation bound/);
});
test('keyword navigation preserves every source character and named settings need their actual context',()=>{
 const input=JSON.parse(paperModelRequest(fixture.paper).input);
 assert.match(input.pages[3].text,/MTU: p4s1/);
 for(const [n,page]of input.pages.entries())assert.equal(page.text.replace(/^Application keyword navigation[^\n]*\n\n/u,'').replace(/\n?\[p\d+s\d+\]\n/g,''),fixture.paper.pages[n].text);
 const v=structuredClone(fixture.reference);v.implementation_choices[1].source_refs=['p1s1'];
 assert.throws(()=>readPaperExtraction(response(v),fixture.paper),/citations omit the paper passage/);
});
test('the intermediate v4 format retains its original string specification reader',()=>{
 const v=structuredClone(fixture.reference);for(const e of v.sections.experiment)e.specification=Object.fromEntries(Object.entries(e.specification).map(([k,f])=>[k,f.text]));
 assert.doesNotThrow(()=>readPaperExtraction(response(v,PAPER_SOURCE_FORMAT_V4),fixture.paper));
});
test('v5 rejects duplicate labels and repeated metric/comparison pairs even with different targets',()=>{
 for(const mutate of [v=>v.sections.validate[1].label='Claim H1 · Restated result',v=>v.sections.validate[1].criterion={...v.sections.validate[0].criterion,target:'20.0% exactly'},v=>v.sections.validate[0].label=null,v=>v.sections.validate[0].criterion.tolerance='±5%',v=>v.sections.validate[0].criterion.acceptance='paper_defined']){
  const value=structuredClone(fixture.reference);mutate(value);assert.throws(()=>readPaperExtraction(response(value),fixture.paper),/claim|criterion|tolerance|agreement|Duplicate/i);
 }
});
test('synthetic results cannot be described as unqualified empirical collection, including misclassified requirements',()=>{
 for(const kind of ['reported_result','requirement']){
  const v=structuredClone(fixture.reference);Object.assign(v.sections.data[0],{kind,description:'Collected receiver-side goodput and observed a gain.'});assert.throws(()=>readPaperExtraction(response(v),fixture.paper),/Attribute|empirical/);
 }
});
test('a paper-defined approximate numerical claim needs an actual bound, not a restated target',()=>{
 const v=structuredClone(fixture.reference);Object.assign(v.sections.validate[0].criterion,{acceptance:'paper_defined',tolerance:'The calculation gives approximately 20%; no agreement band is specified.'});
 assert.throws(()=>readPaperExtraction(response(v),fixture.paper),/numerical agreement rule/);
 const paper=structuredClone(fixture.paper);paper.pages[2].text+=' For H1, agreement means within 2 percentage points of the 20% target.';
 v.sections.validate[0].criterion.tolerance='Within 2 percentage points of the 20% target.';
 assert.doesNotThrow(()=>readPaperExtraction(response(v),paper));
});
test('semantic regression expectations reject supported quotes attached to the wrong detail',()=>{
 for(const mutate of [
  v=>v.sections.validate.push({...structuredClone(v.sections.validate[0]),label:'Table effect',criterion:{...v.sections.validate[0].criterion,metric:'Reported table percentage',target:'20.0%',acceptance:'paper_defined'}}),
  v=>v.sections.validate=v.sections.validate.filter(i=>i.kind==='claim'),
  v=>{v.sections.experiment[0].source_refs=['p1s1'];for(const f of Object.values(v.sections.experiment[0].specification))f.source_refs=['p1s1'];},
  v=>v.implementation_choices.pop(),
  v=>v.sections.data=v.sections.data.filter(i=>i.kind!=='requirement'),
 ]){const v=structuredClone(fixture.reference);mutate(v);assert.equal(gradePaperCase(fixture,response(v)).passed,false);}
});
test('previous v3 responses keep their original meaning despite stricter v5 quality rules',()=>{
 const v=structuredClone(fixture.reference);v.sections.validate[0].label=null;v.sections.data[0].description='Collected receiver-side goodput in the manuscript.';
 const legacy=structuredClone(v);for(const e of legacy.sections.experiment)e.specification=Object.fromEntries(Object.entries(e.specification).map(([k,f])=>[k,f.text]));
 assert.doesNotThrow(()=>readPaperExtraction(response(legacy,PAPER_SOURCE_FORMAT_V3),fixture.paper));
 assert.throws(()=>readPaperExtraction(response(v),fixture.paper));
});
test('a failed quality check retains its original response and does not repeat inference',async()=>{
 const v=structuredClone(fixture.reference);v.sections.validate[1].label='H1';const raw=response(v),calls=[];
 const row={status:'processing',provider_response_id:raw.id,paper_text:fixture.paper,deadline_at:new Date(Date.now()+60000).toISOString()};
 const ops={retrieve:async()=>{calls.push('retrieve');return raw;},save:async(op,current,payload)=>{calls.push(op);assert.equal(payload.response,raw);return {...current,status:op,reason:payload.reason};}};
 const failed=await refreshPaperIntake(row,ops);assert.equal(failed.status,'failed');assert.match(failed.reason,/Duplicate/);await refreshPaperIntake(failed,ops);assert.deepEqual(calls,['retrieve','failed']);
});
test('paper-specific expectation files are bounded data and cannot inject executable graders',()=>{
 validatePaperExpectations(fixture.expected);
 for(const v of [null,{}, {...fixture.expected,run:'arbitrary command'}, {quality:{experiment_count:-1}}, {quality:{claims:[{label:'H1',acceptance:'anything'}]}}, {quality:{details:[{name:'oversized',section:'data',evidence:['x'.repeat(501)]}]}}, {quality:{details:[{name:'unknown',section:'credentials'}]}}])assert.throws(()=>validatePaperExpectations(v),/Invalid bounded/);
});
