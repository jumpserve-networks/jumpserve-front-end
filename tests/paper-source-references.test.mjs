import assert from 'node:assert/strict';
import {test} from 'node:test';
import {paperSources,sourceLabeledPages,PAPER_SOURCE_FORMAT} from '../lib/paper-source-references.ts';
import {paperModelRequest,validatePaperExtraction,extractionBreakdown,sha256} from '../lib/paper-intake-model.ts';
import {readPaperExtraction,refreshPaperIntake} from '../lib/paper-intake-runner.ts';
import {quoteDiagnostics,gradePaperCase,referenceResponse,PAPER_CASES} from '../scripts/lib/paper-intake-cases.mjs';

const paper={totalPages:3,pages:[{page:1,text:'A Literal\nTitle\nAmina Rao\nThe hosts measure a 20-ms round-trip delay.'},{page:2,text:'The baseline uses three trials.\nRecord latency in ms.'},{page:3,text:''}]};
const output=()=>({title:{source_ref:'p1s1',text:'A Literal Title'},domain:{source_ref:'p1s1',text:'Networking'},authors:[{source_ref:'p1s1',name:'Amina Rao'}],sections:{access:[{source_ref:'p1s1',description:'Use the reported hosts.'}],experiment:[{source_ref:'p2s1',description:'Repeat three trials.'}],data:[{source_ref:'p2s1',description:'Record latency in ms.'}],validate:[]}});
const response=value=>({id:'resp_saved',status:'completed',text:{format:{type:'json_schema',name:PAPER_SOURCE_FORMAT}},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});

test('source IDs copy original text and derive PDF pages without model-generated quotes',()=>{
 const value=readPaperExtraction(response(output()),paper);
 assert.equal(value.title.quote,'A Literal\nTitle');assert.equal(value.authors[0].quote,'Amina Rao');
 assert.equal(value.sections.data[0].quote,paper.pages[1].text);assert.equal(value.sections.data[0].page,2);
 assert.deepEqual(quoteDiagnostics(response(output()),paper),[]);
 validatePaperExtraction(value,paper);
 const schema=paperModelRequest(paper).text.format.schema;
 assert.deepEqual(schema.$defs.source_reference.enum,['p1s1','p2s1']);
 assert.equal(JSON.stringify(schema).includes('Amina Rao'),false);assert.equal(JSON.stringify(schema).includes('round-trip delay'),false);
});

test('unknown references, generated quote/page overrides, malformed metadata and extra fields fail closed',()=>{
 for(const change of [v=>v.sections.access[0].source_ref='p9s1',v=>v.sections.access[0].quote='Fabricated quote',v=>v.sections.data[0].page=1,v=>v.title.text='A literal Title',v=>v.authors[0].name='Invented Author',v=>v.authors[0].name='person@example.test',v=>v.extra=true,v=>v.sections.extra=[],v=>v.sections.access=Array(9).fill(v.sections.access[0])]){
  const value=output();change(value);assert.throws(()=>readPaperExtraction(response(value),paper));
 }
 const unknown=output();unknown.domain.source_ref='p3s1';assert.match(quoteDiagnostics(response(unknown),paper)[0].error,/not in this retained paper/);
});

test('bounded source slices retain Unicode, original whitespace and complete page order',()=>{
 const text='A'.repeat(599)+'😀'+' '.repeat(1300)+'the literal follow-up.\n'.repeat(65);
 const input={totalPages:2,pages:[{page:1,text},{page:2,text:'   \n'}]},sources=paperSources(input);
 assert.ok(sources.every(s=>s.quote===text.slice(s.start,s.end)&&[...s.quote].length<=600));
 assert.ok(sources.every(s=>!/[\uD800-\uDBFF]$/u.test(s.quote)&&!(/^[\uDC00-\uDFFF]/u.test(s.quote))));
 const labeled=sourceLabeledPages(input,sources);assert.equal(labeled[1].text,input.pages[1].text);
 // Removing labels must recover every original character, including long
 // whitespace-only gaps that are not selectable as evidence.
 assert.equal(labeled[0].text.replace(/\n?\[p1s\d+\]\n/g,''),text);
 assert.deepEqual(labeled.map(p=>p.page),[1,2]);
});

test('legacy paraphrases and wrong pages remain failures rather than being fuzzy-corrected',()=>{
 const reference=structuredClone(PAPER_CASES[0].reference);
 for(const quote of ['we used two Linux hosts','We use two Linux hosts','We used three Linux hosts']){reference.sections.access[0].quote=quote;assert.throws(()=>readPaperExtraction(referenceResponse(reference),PAPER_CASES[0].paper),/source quote for Access detail 1.*PDF page 1/);}
 reference.sections.access[0]={...PAPER_CASES[0].reference.sections.access[0],page:2};assert.throws(()=>readPaperExtraction(referenceResponse(reference),PAPER_CASES[0].paper),/PDF page 2/);
});

test('saved original prompt hashes survive code/prompt changes and refresh never resubmits inference',async()=>{
 const calls=[],request={instructions:'The exact original saved instructions.'},raw=response(output());
 const row={study_id:'study',status:'processing',provider_response_id:'resp_saved',paper_text:paper,request,source_id:'source',text_artifact_id:'text',deadline_at:new Date(Date.now()+60000).toISOString()};
 const result=await refreshPaperIntake(row,{retrieve:async()=>{calls.push('retrieve');return raw;},cancel:async()=>{throw new Error('Unexpected cancellation');},save:async(op,current,payload)=>{calls.push(op);return {...current,...payload,status:'ready'};}});
 assert.deepEqual(calls,['retrieve','finish']);assert.equal(result.response,raw);assert.equal(result.breakdown.policy_sha256,sha256(request.instructions));
 assert.equal(gradePaperCase({paper,expected:null},raw,request.instructions).breakdown.policy_sha256,sha256(request.instructions));
 assert.equal(extractionBreakdown(readPaperExtraction(raw,paper),paper,'s','t',request.instructions).policy_sha256,sha256(request.instructions));
});
