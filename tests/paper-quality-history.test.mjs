import assert from 'node:assert/strict';
import {test} from 'node:test';
import {projectQualityHistory,readQualityHistory} from '../lib/paper-quality-history.ts';
import {validateQualityHistory,validateQualityProgress} from '../lib/paper-quality.ts';
import {historyCall,historyEvent,historyFixture,reviseHistoryReview,passHistoryReview} from './support/paper-quality-history-fixture.mjs';

test('recorded reviews and repair targets survive later rounds; a saved repair is not a resolution',()=>{
 const f=historyFixture(),history=projectQualityHistory([...f.calls].reverse(),f.events);
 assert.deepEqual(history.map(e=>[e.position,e.kind,e.round]),[[1,'review',0],[2,'repair',1],[3,'review',1]]);
 assert.equal(history[0].decision,'revise');assert.deepEqual(history[1].findings,history[0].findings);assert.equal(history[1].decision,null);assert.deepEqual(history[1].resolutions,[]);
 assert.equal(history[1].completed_at,f.calls[1].updated_at);assert.equal(history[2].completed_at,null);assert.equal(history[2].decision,null);assert.deepEqual(history[2].findings,[]);
 const approved=projectQualityHistory(historyFixture('completed').calls,f.events);
 assert.deepEqual(approved.slice(0,2),history.slice(0,2));assert.equal(approved[2].resolutions[0].location,'Owned-resource cleanup');assert.equal(approved[2].resolutions[0].status,'resolved');
});

test('all seven call positions and every earlier disposition are retained in chronological order',()=>{
 const calls=Array.from({length:7},(_,i)=>historyCall(i+1)),events=[];
 for(const position of [1,3,5,7]){
  const review=position===7?{decision:'pass',summary:'All earlier findings checked.',findings:[]}:reviseHistoryReview();
  review.resolutions=Array.from({length:(position-1)/2},(_,i)=>({key:`review-${2*i+1}:cleanup`,status:position===7?'resolved':'open',evidence:position===7?'Current cleanup action preserves owned-resource removal.':'The cleanup requirement remains open.'}));
  events.unshift(historyEvent(position,review));
 }
 const result=projectQualityHistory(calls,events);assert.equal(result.length,7);assert.equal(result.at(-1).resolutions.length,3);assert.equal(result[1].findings.length,1);assert.equal(result[5].round,3);assert.equal(result[0].decision,'revise');
});

test('source/sandbox check findings stay separate and are carried into the repair and later review',()=>{
 const check={id:'sandbox-checks',severity:'blocking',location:'Isolated behavioral checks',explanation:'The zero-delay fixture failed.',evidence:'The recorded parser rejected omitted zero delay.'};
 const first=historyEvent(1,{decision:'pass',summary:'Document review passed.',findings:[]},{status:'repair_pending',checks_passed:false,check_findings:[check]});
 const final=historyEvent(3,{decision:'pass',summary:'Document and behavioral checks passed.',findings:[],resolutions:[{key:'check-1:sandbox-checks',status:'resolved',evidence:'The current source-bound fixture accepts the verified representation.'}]});
 const history=projectQualityHistory(historyFixture('completed').calls,[final,first]);assert.equal(history[0].checks_passed,false);assert.deepEqual(history[1].check_findings,[check]);assert.equal(history[2].resolutions[0].location,check.location);
});

test('a failed review never reuses a previous report and uncertain submissions have no invented completion time',()=>{
 for(const state of ['preparing','submitting','processing','uncertain','failed','cancelled']){
  const f=historyFixture(state);f.events[0]={...f.events[0],status:state==='failed'?'needs_attention':state,reason:'Original call retained.'};
  const current=projectQualityHistory(f.calls,f.events).at(-1);assert.equal(current.decision,null);assert.equal(current.summary,null);assert.equal(current.completed_at,['failed','cancelled'].includes(state)?f.calls.at(-1).updated_at:null);
 }
});

test('only the bounded display projection reaches the client, with backwards-compatible legacy progress',()=>{
 const f=historyFixture();f.calls[0].request={input:'private input'};f.calls[0].provider_response_id='resp_private_identity';f.events[0].candidate={commands:'private script'};
 const history=projectQualityHistory(f.calls,f.events),serialized=JSON.stringify(history);for(const secret of ['private input','resp_private_identity','private script','private-call-'])assert.ok(!serialized.includes(secret));
 assert.equal(validateQualityProgress({version:'paper-quality-v1',phase:'reviewing',round:1,findings:[],history}).history.length,3);
 assert.equal(validateQualityProgress({version:'paper-quality-v1',phase:'reviewing',round:0,findings:[]}).history,undefined);
 for(const mutate of [h=>h[0].provider_response_id='resp_private',h=>h.push(h[0]),h=>h[0].round=3,h=>h[1].kind='review',h=>h[2].completed_at='2026-11-18T12:03:30Z',h=>h[0].completed_at=null,h=>h[0].requested_at='not recorded',h=>h[2].position=7]){const bad=structuredClone(history);mutate(bad);assert.throws(()=>validateQualityHistory(bad));}
 const missing=historyFixture('completed');missing.events[0].review=passHistoryReview();missing.events=missing.events.slice(0,1);assert.throws(()=>projectQualityHistory(missing.calls,missing.events),/prior quality finding/);
});

function database(fixture,error=false){
 const reads=[];
 return{reads,from(table){const request={table,filters:[]};reads.push(request);return{select(columns){request.columns=columns;return this;},eq(...args){request.filters.push(args);return this;},in(...args){request.filters.push(args);return this;},order(...args){request.order=args;return this;},limit(limit){request.limit=limit;return Promise.resolve({data:error?null:table==='research_paper_quality_calls'?fixture.calls:fixture.events,error:error?{code:'temporary'}:null});}};}};
}
test('read-only history reads are owner/workflow scoped and bounded; newer calls cannot leak into an older view',async()=>{
 const f=historyFixture();f.calls.push(historyCall(4,'processing'));const db=database(f),row={id:'workflow',study_id:'study',owner_id:'owner',call:{...f.calls[2]}};
 const history=await readQualityHistory(db,row);assert.equal(history.length,3);assert.equal(db.reads.length,2);
 for(const read of db.reads){assert.ok(read.filters.some(([k,v])=>k==='workflow_id'&&v==='workflow'));assert.ok(read.filters.some(([k,v])=>k==='study_id'&&v==='study'));assert.ok(!read.columns.includes('*'));assert.doesNotMatch(read.columns,/candidate|request|response|provider|submit_token|sandbox/);}
 assert.ok(db.reads[0].filters.some(([k,v])=>k==='owner_id'&&v==='owner'));assert.equal(db.reads[0].limit,8);assert.equal(db.reads[1].limit,17);
 await assert.rejects(()=>readQualityHistory(database(f,true),row),/temporarily unavailable/);
 const unused=database(f);assert.deepEqual(await readQualityHistory(unused,{...row,call:null}),[]);assert.equal(unused.reads.length,0);
});
