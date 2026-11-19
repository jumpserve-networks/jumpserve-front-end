import assert from 'node:assert/strict';
import {test} from 'node:test';
import {projectPaperAgentHistory,readPaperAgentHistory} from '../lib/paper-agent-history.ts';
import {validateQualityProgress} from '../lib/paper-quality.ts';
const started='2026-11-18T12:00:00Z',completed='2026-11-18T12:01:00Z';
const row=(extra={})=>({repair_round:1,position:1,name:'read_evidence',record:'paper',status:'completed',result_success:true,reason:null,explanation:null,checks_passed:null,created_at:started,completed_at:completed,...extra});
test('owner-facing agent history contains factual recorded actions and no draft or provider identities',()=>{
 const history=projectPaperAgentHistory([row({provider_call_id:'call_private',arguments:{private:'draft'}}),row({position:2,name:'apply_patch',checks_passed:true}),row({position:3,name:'record_platform_issue',explanation:'The stored representation differs from raw output.'})]);
 assert.equal(history[0].label,'Read retained paper');assert.equal(history[1].label,'Save targeted draft edits');assert.match(history[2].detail,/stored representation/);assert.ok(!JSON.stringify(history).includes('call_private'));assert.ok(!JSON.stringify(history).includes('arguments'));
 validateQualityProgress({version:'paper-quality-v1',phase:'repairing',round:0,findings:[],agent_history:history});
});
test('failed or pending actions never invent a completion, edit, or independent approval',()=>{
 const history=projectPaperAgentHistory([row({status:'claimed',completed_at:null}),row({position:2,name:'apply_patch',checks_passed:null}),row({position:3,name:'apply_patch',result_success:false,reason:'Invalid source reference.'})]);
 assert.equal(history[0].status,'running');assert.equal(history[0].completed_at,null);assert.equal(history[1].detail,'The proposed edit was not applied.');assert.equal(history[2].status,'failed');assert.ok(!JSON.stringify(history).includes('approved'));
 assert.throws(()=>projectPaperAgentHistory([row(),row()]));
});
test('history queries are bounded and scoped by workflow, assessment and owner',async()=>{
 const calls=[];const query={select(value){calls.push(['select',value]);return this;},eq(...args){calls.push(['eq',...args]);return this;},order(...args){calls.push(['order',...args]);return this;},limit(n){calls.push(['limit',n]);return Promise.resolve({data:[row()],error:null});}};
 const history=await readPaperAgentHistory({from:table=>{calls.push(['from',table]);return query;}},{id:'workflow',study_id:'study',owner_id:'owner'});
 assert.equal(history.length,1);for(const pair of [['workflow_id','workflow'],['study_id','study'],['owner_id','owner']])assert.ok(calls.some(c=>JSON.stringify(c)===JSON.stringify(['eq',...pair])));assert.ok(calls.some(c=>c[0]==='limit'&&c[1]===73));assert.ok(!calls.find(c=>c[0]==='select')[1].includes('*'));
});
