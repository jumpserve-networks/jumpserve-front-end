import assert from 'node:assert/strict';
import {test} from 'node:test';
import {dependencyBreakdown,dependencyCases} from './support/paper-dependency-fixture.mjs';
import {validPaperDependencies,paperDependencyClosure,paperDetailTree,flattenPaperDetailTree} from '../lib/paper-detail-dependencies.ts';
import {validatePaperBreakdown} from '../lib/research-paper-breakdown.ts';
import {confirmPaperSections,planningSources,reviewedSections} from '../lib/paper-experiment-plan.ts';
import {paperModelRequest,extractionBreakdown} from '../lib/paper-intake-model.ts';
import {PAPER_SOURCE_FORMAT_V6} from '../lib/paper-source-references.ts';
import {readPaperExtraction} from '../lib/paper-intake-runner.ts';
import {reviewQualityCase} from '../scripts/lib/paper-intake-quality-case.mjs';
import {referenceResponse,gradePaperCase,quoteDiagnostics} from '../scripts/lib/paper-intake-cases.mjs';
import {dependencyPaperCase} from '../scripts/lib/paper-dependency-case.mjs';

test('section-local prerequisite graphs reject malformed, missing, cross-section and cyclic relationships',()=>{
 for(const example of dependencyCases()){
  assert.equal(validPaperDependencies(example.breakdown.sections.access),example.valid,example.name);
  if(example.valid)validatePaperBreakdown(example.breakdown);else assert.throws(()=>validatePaperBreakdown(example.breakdown),undefined,example.name);
 }
});
test('nesting follows the primary prerequisite, records secondary dependencies and visits each identity exactly once',()=>{
 const items=dependencyBreakdown().sections.access,original=structuredClone(items);
 const nodes=flattenPaperDetailTree(paperDetailTree([...items].reverse(),'1'));
 assert.deepEqual(nodes.map(n=>[n.item.id,n.number]),[['access-other','1.1'],['access-root','1.2'],['access-child','1.2.1'],['access-leaf','1.2.1.1']]);
 assert.deepEqual(items,original);assert.equal(new Set(nodes.map(n=>n.item.id)).size,items.length);
 assert.deepEqual(paperDependencyClosure(items,'access-leaf','prerequisites'),new Set(['access-leaf','access-child','access-other','access-root']));
 assert.deepEqual(paperDependencyClosure(items,'access-other','dependents'),new Set(['access-other','access-leaf']));
 assert.throws(()=>paperDetailTree(dependencyCases().find(c=>c.name==='cycle through secondary prerequisite').breakdown.sections.access,'1'));
});
test('confirmation preserves prerequisite identities, rejects orphaned details and remaps retained refs for planning',()=>{
 const breakdown=dependencyBreakdown(),original=structuredClone(breakdown),review=reviewedSections(breakdown);
 review.access=review.access.filter(item=>item.id!=='access-other');assert.throws(()=>confirmPaperSections(breakdown,review),/Include prerequisites/);
 review.access=review.access.filter(item=>item.id!=='access-leaf');review.access.reverse();review.access[0].description='Owner-corrected dependent description';
 const confirmed=confirmPaperSections(breakdown,review);assert.deepEqual(confirmed.sections.access[0].depends_on,['access-root']);
 assert.deepEqual(planningSources(confirmed).access[0].depends_on,['access-2']);assert.deepEqual(breakdown,original);
 const restored=validatePaperBreakdown(JSON.parse(JSON.stringify(confirmed)));assert.deepEqual(restored,confirmed);
});
test('v6 requests require dependency positions and convert them to stable retained identities without changing evidence',()=>{
 const raw=structuredClone(reviewQualityCase.reference);
 for(const items of Object.values(raw.sections))for(const item of items)item.depends_on=[];
 raw.sections.access.push({...structuredClone(raw.sections.access[0]),description:'Use a single TCP stream on those hosts.',depends_on:[1]});
 raw.sections.data[2].depends_on=[2];
 const request=paperModelRequest(reviewQualityCase.paper);assert.equal(request.text.format.name,PAPER_SOURCE_FORMAT_V6);assert.match(request.instructions,/not infer dependencies merely/);
 const schema=request.text.format.schema.properties.sections.properties.access.items.anyOf[0];assert.ok(schema.required.includes('depends_on'));assert.deepEqual(schema.properties.depends_on.items,{type:'integer',minimum:1,maximum:8});
 const extraction=readPaperExtraction(referenceResponse(raw,PAPER_SOURCE_FORMAT_V6),reviewQualityCase.paper);
 assert.deepEqual(extraction.sections.access[1].depends_on,['access-1']);
 const breakdown=validatePaperBreakdown(extractionBreakdown(extraction,reviewQualityCase.paper,'source','text'));
 assert.deepEqual(breakdown.sections.access[1].depends_on,['source:access:0']);assert.deepEqual(breakdown.sections.access[1].citations,breakdown.sections.access[0].citations);
 for(const refs of [[2],[9],[1,1],['access-1'],[1.5],null]){
  const changed=structuredClone(raw);changed.sections.access[1].depends_on=refs;assert.throws(()=>readPaperExtraction(referenceResponse(changed,PAPER_SOURCE_FORMAT_V6),reviewQualityCase.paper));
 }
 const cycle=structuredClone(raw);cycle.sections.access[0].depends_on=[2];assert.throws(()=>readPaperExtraction(referenceResponse(cycle,PAPER_SOURCE_FORMAT_V6),reviewQualityCase.paper),/cycles/);
 const missing=structuredClone(raw);delete missing.sections.access[0].depends_on;assert.throws(()=>readPaperExtraction(referenceResponse(missing,PAPER_SOURCE_FORMAT_V6),reviewQualityCase.paper));
});
test('the browser-free dependency case checks semantic relationships rather than accepting an entirely flat extraction',()=>{
 const response=referenceResponse(dependencyPaperCase.reference,PAPER_SOURCE_FORMAT_V6);
 assert.equal(gradePaperCase(dependencyPaperCase,response,'Dependency software fixture.').passed,true);assert.deepEqual(quoteDiagnostics(response,dependencyPaperCase.paper),[]);
 const flat=structuredClone(dependencyPaperCase.reference);for(const items of Object.values(flat.sections))for(const item of items)item.depends_on=[];
 const graded=gradePaperCase(dependencyPaperCase,referenceResponse(flat,PAPER_SOURCE_FORMAT_V6),'Dependency software fixture.');
 assert.equal(graded.passed,false);assert.equal(graded.checks.filter(check=>!check.passed).length,4);
});
