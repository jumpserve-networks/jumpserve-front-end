import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readPaperExtraction} from '../lib/paper-intake-runner.ts';
import {validatePaperBreakdown} from '../lib/research-paper-breakdown.ts';
import {validateExperimentPlan,planningInput,confirmPaperSections,reviewedSections} from '../lib/paper-experiment-plan.ts';
import {experimentPlanRequest} from '../lib/paper-experiment-plan-model.ts';
import {validatePaperBreakdownCorrection,PAPER_REVIEW_INSTRUCTIONS} from '../lib/paper-breakdown-review.ts';
import {sha256} from '../lib/paper-intake-model.ts';
import {evidencePaper,evidenceOutput,evidenceResponse,evidenceBreakdown,evidencePlan} from './support/paper-evidence-fixture.mjs';

test('provenance, source-reported results and multiple PDF passages survive confirmation and planning',()=>{
 const b=evidenceBreakdown();validatePaperBreakdown(b);
 assert.equal(b.provenance.classification,'synthetic');assert.equal(b.reported_values_origin,'paper_reported');assert.equal(b.sections.experiment.length,1);
 assert.deepEqual(b.sections.experiment[0].citations.map(c=>c.page),[1,2]);
 const confirmed=confirmPaperSections(b,reviewedSections(b)),input=JSON.parse(experimentPlanRequest(confirmed).input);
 assert.deepEqual(input,planningInput(b));assert.deepEqual(input.implementation_choices,b.implementation_choices);assert.deepEqual(input.sections.validate.map(c=>c.criterion.acceptance),['needs_definition','paper_defined','needs_definition']);
 assert.deepEqual(input.sections.experiment[0].specification,b.sections.experiment[0].specification);
});
test('all source passages are checked and the model cannot override quotes or assign claims to Access',()=>{
 for(const change of [o=>o.sections.access[0].source_refs.push('p9s1'),o=>o.sections.access[0].source_refs.push('p1s1'),o=>o.sections.access[0].kind='claim',o=>o.sections.data[0].quote='Invented',o=>o.sections.experiment[0].specification.procedure='Truncated mid-word proc',o=>o.sections.validate[0].criterion=null]){
  const o=evidenceOutput();change(o);assert.throws(()=>readPaperExtraction(evidenceResponse(o),evidencePaper));
 }
 const b=evidenceBreakdown();b.sections.experiment[0].citations[1].page=9;assert.throws(()=>validatePaperBreakdown(b));
});
test('each captured claim requires its own source-linked validation step',()=>{
 const b=evidenceBreakdown();validateExperimentPlan(evidencePlan(),b);
 for(const change of [p=>p.experiments[0].steps.pop(),p=>p.experiments[0].steps[2].validation_ref='validate-1',p=>p.experiments[0].steps[0].source_refs=['experiment-1'],p=>p.experiments[0].steps[0].validation_ref='data-1']){const p=evidencePlan();change(p);assert.throws(()=>validateExperimentPlan(p,b));}
});
test('operator corrections preserve identity and exact quotes, with no implicit confirmation',()=>{
 const original=evidenceBreakdown(),b=structuredClone(original);b.policy_sha256=sha256(PAPER_REVIEW_INSTRUCTIONS);
 const payload={review_id:'10000000-0000-4000-8000-000000000001',base_revision:4,reason:'Requested source-grounded corrections.',reviewer_type:'AI',instructions:PAPER_REVIEW_INSTRUCTIONS,breakdown:b};
 validatePaperBreakdownCorrection(original,evidencePaper,payload);assert.equal(payload.breakdown.review,undefined);
 for(const change of [v=>v.breakdown.source_id='different',v=>v.breakdown.policy_sha256='a'.repeat(64),v=>v.breakdown.sections.validate[0].citations[1].quote='Not in retained text.',v=>v.breakdown.provenance.citations[1].page=2,v=>v.base_revision=0]){const v=structuredClone(payload);change(v);assert.throws(()=>validatePaperBreakdownCorrection(original,evidencePaper,v));}
});
