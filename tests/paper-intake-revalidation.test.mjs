import assert from 'node:assert/strict';
import {test} from 'node:test';
import {retainedPaperRevalidation} from '../lib/paper-intake-revalidation.ts';
import {readPaperExtraction,refreshPaperIntake,UnsupportedPaperSourceFormat} from '../lib/paper-intake-runner.ts';
import {validatePaperExtraction,paperModelRequest} from '../lib/paper-intake-model.ts';
import {dependencyPaperCase} from '../scripts/lib/paper-dependency-case.mjs';
import {referenceResponse} from '../scripts/lib/paper-intake-cases.mjs';
import {paperIntakeRevalidationSQL} from '../scripts/lib/paper-intake-revalidation-sql.mjs';
const fixture=()=>({study_id:'11111111-1111-4111-8111-111111111111',owner_id:'22222222-2222-4222-8222-222222222222',status:'failed',reason:'Document provenance or implementation choices are invalid.',revision:4,source_id:'source',text_artifact_id:'text',provider_response_id:'retained-response',response:{...referenceResponse(dependencyPaperCase.reference,dependencyPaperCase.reference_format),id:'retained-response'},request:paperModelRequest(dependencyPaperCase.paper),paper_text:dependencyPaperCase.paper,deadline_at:new Date(Date.now()+60000).toISOString(),model_calls:1,reserved_cents:100});
test('the old legacy fallback reproduces the reported error while the current source reader accepts the unchanged response',()=>{
 assert.throws(()=>validatePaperExtraction(dependencyPaperCase.reference,dependencyPaperCase.paper),/Document provenance or implementation choices are invalid/);
 const row=fixture(),original=structuredClone(row),payload=retainedPaperRevalidation(row);
 assert.equal(payload.response,row.response);assert.equal(payload.breakdown.status,'ready');assert.equal(payload.breakdown.policy_sha256.length,64);assert.deepEqual(row,original);
 assert.ok(payload.breakdown.sections.access[1].depends_on.length);assert.equal(payload.breakdown.provenance.classification,'synthetic');
 const sql=paperIntakeRevalidationSQL(row,payload);assert.ok(sql.includes("'revalidate-paper-intake'"));assert.ok(sql.includes('to_jsonb(i)='));assert.ok(sql.includes("research_paper_intake('finish'"));
});
test('revalidation rejects invalid evidence, different response identity, cancellation, unrelated failures and altered ready records',()=>{
 for(const change of [r=>r.response.id='other',r=>r.response.status='incomplete',r=>r.status='cancelled',r=>r.reason='The original deadline expired.',r=>r.paper_text=null,r=>r.request.instructions='',r=>r.request.text.format.name='paper_breakdown_sources_v999']){
  const row=fixture();change(row);assert.throws(()=>retainedPaperRevalidation(row));
 }
 const row=fixture(),payload=retainedPaperRevalidation(row);assert.deepEqual(retainedPaperRevalidation({...row,status:'ready',breakdown:payload.breakdown}),payload);
 assert.throws(()=>retainedPaperRevalidation({...row,status:'ready',breakdown:{...payload.breakdown,reason:'Changed'}}),/different retained evidence/);
 const malformed=fixture();const raw=structuredClone(dependencyPaperCase.reference);raw.provenance.statement=null;malformed.response=referenceResponse(raw,dependencyPaperCase.reference_format);malformed.response.id=malformed.provider_response_id;assert.throws(()=>retainedPaperRevalidation(malformed),/Document provenance/);
});
test('a reader leaves newer request formats to a compatible version without retrieving, failing or resubmitting inference',async()=>{
 const row=fixture();row.status='processing';row.request.text.format.name='paper_breakdown_sources_v999';const calls=[];
 const ops={retrieve:async()=>{calls.push('retrieve');return row.response;},cancel:async()=>{calls.push('cancel');return row.response;},save:async()=>{calls.push('save');return row;}};
 assert.equal(await refreshPaperIntake(row,ops),row);assert.deepEqual(calls,[]);
 await refreshPaperIntake({...row,deadline_at:'2000-01-01T00:00:00Z'},ops);assert.deepEqual(calls,['cancel','save']);calls.length=0;
 const response=structuredClone(row.response);response.text.format.name='paper_breakdown_sources_v999';assert.throws(()=>readPaperExtraction(response,row.paper_text),UnsupportedPaperSourceFormat);
 const known=fixture();known.status='processing';ops.retrieve=async()=>{calls.push('retrieve');return response;};assert.equal(await refreshPaperIntake(known,ops),known);assert.deepEqual(calls,['retrieve']);
});
