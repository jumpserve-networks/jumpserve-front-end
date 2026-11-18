import assert from 'node:assert/strict';
import {test} from 'node:test';
import {qualityReferenceMap,validateQualityContext} from '../lib/paper-quality-context.ts';
import {planningSources} from '../lib/paper-experiment-plan.ts';
import {qualityReviewRequest,qualityRepairRequest,QUALITY_REVIEW_INSTRUCTIONS} from '../lib/paper-quality-model.ts';
import {validateQualityReview} from '../lib/paper-quality.ts';
import {advancePaperQuality} from '../lib/paper-quality-runner.ts';
import {deterministicQualityChecks} from '../lib/paper-quality-checks.ts';
import {qualitySource,qualityRow,qualityOperations,qualityResponse,passReview,reviseReview} from './support/paper-quality-fixture.mjs';

const finding=(id)=>({...reviseReview().findings[0],id,location:id,explanation:'Retain '+id,evidence:'The prior candidate lacked '+id});
const entry=(id,position=1)=>({key:`review-${position}:${id}`,finding:finding(id)});
const context=(ledger=[])=>({version:'paper-quality-context-v1',generation_instructions:qualityRow().original_request.instructions,generation_input:qualityRow().original_request.input,reference_map:qualityReferenceMap(qualitySource().confirmed_breakdown),finding_ledger:ledger,prior_resolutions:[],previous_candidate:null});
const resolved=(c,status='resolved')=>({...passReview(),resolutions:c.finding_ledger.map(e=>({key:e.key,status,evidence:'Current action preserves the required cleanup and invalid-data decision branch.'}))});

test('canonical aliases include the final detail and do not derive from zero-based raw IDs',()=>{
 const b=qualitySource().confirmed_breakdown;
 for(const [section,count] of [['access',4],['experiment',1],['data',4],['validate',7]])b.sections[section]=Array.from({length:count},(_,index)=>({...b.sections[section][0],id:`source:${section}:${index}`}));
 const refs=qualityReferenceMap(b),sources=planningSources(b);
 assert.deepEqual(Object.keys(refs).sort(),Object.values(sources).flat().map(s=>s.ref).sort());
 for(const ref of ['experiment-1','access-4','data-4','validate-7'])assert.ok(refs[ref]);
 assert.equal(refs['validate-3'],'source:validate:2');assert.equal(refs['experiment-0'],undefined);
});

test('all stages receive the original contract and cumulative history without changing the sandbox attachment',()=>{
 for(const step of [2,3,4]){
  const source=qualitySource(step),c=context([entry('cleanup'),entry('invalid-to-inconclusive',3)]);
  const request=qualityReviewRequest(source,step===4?'file-fixture':undefined,c),input=JSON.parse(request.input);
  assert.equal(request.text.format.name,'paper_quality_review_v2');assert.deepEqual(input.review_context,c);
  assert.ok(request.text.format.schema.required.includes('resolutions'));
  const repair=qualityRepairRequest(source,qualityRow(step).original_request,reviseReview(),deterministicQualityChecks(source),c);
  assert.deepEqual(JSON.parse(repair.input).review_context,c);assert.match(repair.instructions,/all earlier valid fixes/);assert.doesNotMatch(repair.instructions,/Preserve all action identities/);
 }
 assert.match(QUALITY_REVIEW_INSTRUCTIONS,/ONE-BASED/);assert.match(QUALITY_REVIEW_INSTRUCTIONS,/action-wide/);assert.match(QUALITY_REVIEW_INSTRUCTIONS,/required PLATFORM requirement/);assert.match(QUALITY_REVIEW_INSTRUCTIONS,/valid planning output/);assert.match(QUALITY_REVIEW_INSTRUCTIONS,/block.*execution\/scoring/);
});

test('every earlier finding must be revisited, with evidence, even when it was previously resolved',()=>{
 const c=context([entry('cleanup'),entry('invalid-to-inconclusive',3)]);
 assert.equal(validateQualityReview(resolved(c),c).decision,'pass');
 const dismissed=resolved(c,'dismissed');dismissed.resolutions[0].evidence='experiment-1 exists in the canonical reference map; the raw ID ends with experiment:0.';
 assert.equal(validateQualityReview(dismissed,c).decision,'pass');
 for(const bad of [passReview(),{...resolved(c),resolutions:[]},{...resolved(c),resolutions:resolved(c).resolutions.slice(1)},{...resolved(c),resolutions:[resolved(c).resolutions[0],resolved(c).resolutions[0]]},resolved(c,'open'),{...resolved(c),resolutions:resolved(c).resolutions.map(r=>({...r,evidence:''}))}])assert.throws(()=>validateQualityReview(bad,c));
 const regression={...reviseReview(),findings:[finding('cleanup-regressed')],resolutions:resolved(c).resolutions.map((r,i)=>({...r,status:i===0?'open':'resolved'}))};
 assert.equal(validateQualityReview(regression,c).decision,'revise');
 // Legacy, already-frozen responses still have their original three-field schema.
 assert.equal(validateQualityReview(passReview()).decision,'pass');
});

test('repairs retain fixes from earlier rounds and re-review compares the prior candidate',async()=>{
 const f=qualityOperations();
 for(const [round,id] of [[0,'cleanup'],[1,'invalid-to-inconclusive']]){
  await advancePaperQuality(f.row(),f.ops,true);f.response(qualityResponse({...reviseReview(),findings:[finding(id)]}));await advancePaperQuality(f.row(),f.ops);
  await advancePaperQuality(f.row(),f.ops,true);
  const input=JSON.parse(f.requests.at(-1).request.input);assert.equal(input.review_context.finding_ledger.length,round+1);assert.equal(input.review_context.finding_ledger[0].finding.id,'cleanup');
  await advancePaperQuality(f.row(),f.ops);
 }
 await advancePaperQuality(f.row(),f.ops,true);
 const input=JSON.parse(f.requests.at(-1).request.input);assert.ok(input.review_context.previous_candidate);assert.deepEqual(input.review_context.finding_ledger.map(e=>e.finding.id),['cleanup','invalid-to-inconclusive']);
 assert.equal(f.requests.length,5);assert.equal(f.row().round,2);
});

test('missing migration/context stops before any admission; v2 responses cannot omit resolutions',async()=>{
 const f=qualityOperations(),save=f.ops.save;f.ops.save=async(op,p)=>op==='context'?{...f.row()}:save(op,p);
 await assert.rejects(()=>advancePaperQuality(f.row(),f.ops,true),/context/);assert.equal(f.requests.length,0);assert.equal(f.events.filter(e=>e.operation==='admit').length,0);
 const g=qualityOperations();await advancePaperQuality(g.row(),g.ops,true);g.ops.retrieve=async id=>({...qualityResponse(),id});await advancePaperQuality(g.row(),g.ops);
 assert.equal(g.row().status,'needs_attention');assert.match(g.row().reason,/Every earlier finding/);assert.equal(g.requests.length,1);
 for(const bad of [null,{}, {...context(),finding_ledger:Array(129).fill(entry('x'))}])assert.throws(()=>validateQualityContext(bad));
});
