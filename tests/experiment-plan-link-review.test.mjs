import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {reviewExperimentPlanLinks,applyExperimentPlanLinkReview} from '../lib/paper-experiment-plan-review.ts';
import {validateExperimentPlan,validateExperimentPlanView} from '../lib/paper-experiment-plan.ts';
import {experimentPlanRequest} from '../lib/paper-experiment-plan-model.ts';
import {implementationBreakdown} from './support/implementation-plan-fixture.mjs';
import {duplicatedClaimFixture} from './support/experiment-plan-link-review-fixture.mjs';
test('review removes only the explicitly selected duplicate annotations and keeps every original action and source',()=>{
 const {row,keep,plan}=duplicatedClaimFixture(),original=structuredClone(row);
 assert.throws(()=>validateExperimentPlan(plan,row.confirmed_breakdown),/More than one step is assigned to validate-3/);
 const reviewed=reviewExperimentPlanLinks(row,keep);
 const expected=structuredClone(plan);expected.experiments[0].stages[0].steps.at(-1).validation_ref=null;
 assert.deepEqual(reviewed.plan,expected);assert.equal(reviewed.changes.length,1);assert.equal(reviewed.changes[0].from,'validate-3');assert.deepEqual(row,original);
 const review={id:randomUUID(),study_id:row.study_id,owner_id:row.owner_id,base_revision:row.revision,provider_response_id:row.provider_response_id,keep_validation_steps:keep,created_at:'2026-11-15T18:00:00Z',reviewer_type:'AI',...reviewed};
 const effective=applyExperimentPlanLinkReview(row,review);assert.equal(effective.status,'ready');assert.deepEqual(effective.response,row.response);assert.deepEqual(effective.confirmed_breakdown,row.confirmed_breakdown);assert.deepEqual(effective.request,row.request);assert.deepEqual(row,original);
 const view={version:'paper-experiment-plan-v1',study_id:row.study_id,stage:'ready',intake_revision:1,confirmed_at:'2026-11-15T17:00:00Z',confirmed_breakdown:row.confirmed_breakdown,plan:effective.plan,reason:null,link_review:effective.link_review};assert.equal(validateExperimentPlanView(view,row.study_id),view);assert.throws(()=>validateExperimentPlanView({...view,link_review:{...view.link_review,reviewed_at:'invalid'}},row.study_id),/review/);
 for(const change of [r=>r.owner_id=randomUUID(),r=>r.base_revision++,r=>r.provider_response_id='resp_other',r=>r.plan.experiments[0].stages[0].steps[0].instructions='Changed scientific instructions',r=>r.changes=[]]){const bad=structuredClone(review);change(bad);assert.throws(()=>applyExperimentPlanLinkReview(row,bad));}
});
test('review rejects missing unknown repeated stale cancelled incomplete and still-invalid responses without choosing a step',()=>{
 const {row,keep}=duplicatedClaimFixture();
 for(const choice of [[],null,[...keep,...keep],[{...keep[0],step:1}],[{...keep[0],stage:9}],[{...keep[0],claim_ref:'validate-99'}],[{...keep[0],extra:true}]])assert.throws(()=>reviewExperimentPlanLinks(row,choice));
 for(const change of [r=>r.status='ready',r=>r.status='cancelled',r=>r.reason='Credit limit reached',r=>r.response.id='resp_other',r=>r.response.status='incomplete',r=>r.request.text.format.name='paper_experiment_steps_v2',r=>r.plan={},r=>r.revision=0]){const bad=structuredClone(row);change(bad);assert.throws(()=>reviewExperimentPlanLinks(bad,keep));}
 const bad=structuredClone(row),output=JSON.parse(bad.response.output[0].content[0].text);output.experiments[0].stages[1].steps[0].source_refs=['access-999'];bad.response.output[0].content[0].text=JSON.stringify(output);assert.throws(()=>reviewExperimentPlanLinks(bad,keep));
});
test('planning prompt and schema distinguish measuring a claim from its one final evaluation',()=>{
 const request=experimentPlanRequest(implementationBreakdown());
 assert.match(request.instructions,/"Measure idle RTT" cites validate-3 with validation_ref=null/);assert.match(request.instructions,/across ALL experiments and stages/);
 assert.match(request.text.format.schema.properties.experiments.items.properties.stages.items.properties.steps.items.properties.validation_ref.description,/Use null for measurement, calibration/);
});
