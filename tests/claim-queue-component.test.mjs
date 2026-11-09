import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach,beforeEach,test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
globalThis.__claimQueueReact=React;
const replacements={
 '@/app/components/user-preferences':"export const LocalDateTime=({value})=>globalThis.__claimQueueReact.createElement('time',{},value);",
 '@/lib/research-workflow-api':'export const researchRequest=(...args)=>globalThis.__claimQueueRequest(...args);',
 '@/lib/research-queue':'export const validateQueue=value=>value;export const claimQueueRows=()=>globalThis.__claimQueueRows;',
 '@/app/components/research-workflow/select':"export function ResearchSelect({label,value,options,onChange}){return globalThis.__claimQueueReact.createElement('select',{'aria-label':label,value,onChange:e=>onChange(e.target.value)},options.map(o=>globalThis.__claimQueueReact.createElement('option',{key:o.value,value:o.value},o.label)));}",
 './network-job-cancel':"export function NetworkJobCancel({onSaved}){return globalThis.__claimQueueReact.createElement('button',{onClick:onSaved},'Scoped network cancellation');}",
};
const hooks=registerHooks({resolve(specifier,context,next){return replacements[specifier]?{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(replacements[specifier])}:next(specifier,context);}});
const {ClaimQueue,ClaimQueueView}=await import('../app/components/research-workflow/claim-queue.tsx');hooks.deregister();
const ID='11111111-1111-4111-8111-111111111111',CAMPAIGN='22222222-2222-4222-8222-222222222222',STAMP='2026-11-08T00:00:00Z';
let queue,snapshot,requests,handler,changed;
beforeEach(()=>{
 requests=[];changed=0;globalThis.__claimQueueRows=[];
 queue={study_id:ID,workers_enabled:false,jobs:[],events:[],coverage:{jobs:0,events:0},limits:{study_jobs:1,global_jobs:2},limitations:'Original queue scope'};
 snapshot={study:{id:ID},records:{claims:[],campaigns:[{id:CAMPAIGN,title:'Original linked campaign',adapter:'network-execution-v1'}],claim_checks:[{campaign_id:CAMPAIGN,applicability:'applicable'}],assessments:[],runs:[]}};
 handler=async()=>queue;globalThis.__claimQueueRequest=(...args)=>{requests.push(args);return handler(...args);};
});afterEach(cleanup);
const click=async name=>act(async()=>fireEvent.click(screen.getByRole('button',{name,exact:true})));
const choose=async(label,value)=>act(async()=>fireEvent.change(screen.getByRole('combobox',{name:label}),{target:{value}}));
const change=async(label,value)=>act(async()=>fireEvent.change(screen.getByLabelText(label),{target:{value}}));
const submit=async name=>act(async()=>fireEvent.submit(screen.getByRole('button',{name,exact:true}).closest('form')));
const show=async()=>{let view;await act(async()=>{view=render(React.createElement(ClaimQueue,{snapshot,onEvidenceChanged:async()=>{changed++;}}));});return view;};
const open=async text=>act(async()=>fireEvent.click(screen.getByText(text)));
function job(id='original',status='queued'){return{id,campaign_id:CAMPAIGN,status,readiness:'ready',priority:1,created_at:STAMP,updated_at:STAMP,reason:'Original job reason',blockers:[],exclusive_resources:[],dependencies:[],followup_of:null,run_id:null,run_status:null,execution_mode:status==='manual'?'manual':'automatic'};}

test('claim queue polling retains stale records and aborts requests after unmount',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const view=await show();assert.ok(screen.getByText(/No claims recorded/));assert.ok(screen.getByText(/No jobs queued/));handler=async()=>{throw new Error('Synthetic queue retrieval failed');};await act(async()=>t.mock.timers.tick(10000));assert.match(screen.getByRole('alert').textContent,/Previously retrieved queue shown/);view.unmount();assert.equal(requests.at(-1)[1].signal.aborted,true);
});

test('queue refresh reloads recorded evidence and a standalone cancellation view supports its optional save callback',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});await show();const before=requests.length;await click('Refresh queue and evidence');assert.equal(changed,1);assert.ok(requests.length>before);cleanup();queue.jobs=[job('running','running')];render(React.createElement(ClaimQueueView,{snapshot,queue}));await click('Scoped network cancellation');
});
test('queue editor preserves exact input text dependencies resources and stable identity on failed writes',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});queue.jobs=[job('predecessor')];await show();await open('Queue a campaign with prerequisites');await choose('Campaign to queue',CAMPAIGN);await change('Original queue input text','{"original":1e-400}');await choose('Queue priority','1');await choose('Follow-up of an earlier job','predecessor');await change(/^Exclusive resources/,' dataset:original \n\n machine:fixed ');await change('Job rationale and follow-up reason','Original acquisition rationale');await choose('Predecessor job','predecessor');await choose('Dependency criterion','complete-run');await click('Add prerequisite');
 handler=async(path,options)=>{if(options?.method)throw new Error('Synthetic save unconfirmed');return queue;};await submit('Queue campaign');await submit('Queue campaign');let writes=requests.filter(([,o])=>o?.method).map(([,o])=>JSON.parse(o.body));assert.equal(writes[0].request_id,writes[1].request_id);assert.equal(writes[0].raw_input,'{"original":1e-400}');assert.deepEqual(writes[0].dependencies,[{job_id:'predecessor',requirement:'complete-run'}]);assert.deepEqual(writes[0].exclusive_resources,['dataset:original','machine:fixed']);
 await click('Remove prerequisite predecessor');await choose('Execution method','manual');handler=async()=>queue;await submit('Queue campaign');writes=requests.filter(([,o])=>o?.method).map(([,o])=>JSON.parse(o.body));assert.notEqual(writes.at(-1).request_id,writes[0].request_id);assert.equal(writes.at(-1).raw_input,null);assert.deepEqual(writes.at(-1).dependencies,[]);assert.ok(screen.getByText(/Job preserved. Scheduled workers are disabled/));assert.equal(changed,1);
});
test('queue input files reject excess bytes and preserve decoded original UTF-8 without normalizing numbers',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});await show();await open('Queue a campaign with prerequisites');const input=screen.getByLabelText('Original UTF-8 queue input file');await act(async()=>fireEvent.change(input,{target:{files:[]}}));await act(async()=>fireEvent.change(input,{target:{files:[{size:256001}]}}));assert.ok(screen.getByText('Queue input exceeds 256 KB.'));await act(async()=>fireEvent.change(input,{target:{files:[{size:20,arrayBuffer:async()=>new TextEncoder().encode('{"original":1e-400}').buffer}]}}));assert.equal(screen.getByLabelText('Original queue input text').value,'{"original":1e-400}');
});
test('review cancel and external-run actions include only their applicable preserved references',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});queue.jobs=[{...job('review','awaiting-review'),run_id:'run-original'},job('manual','manual'),job('queued')];snapshot.records.assessments=[{id:'assessment-original',campaign_id:CAMPAIGN,claim_id:'claim-original',label:'inconclusive',evidence:[{kind:'runs',id:'run-original'}]}];snapshot.records.runs=[{id:'external',campaign_id:CAMPAIGN,status:'failed'}];await show();await open('Review, cancel or attach recorded evidence');await choose('Job for queue action','review');await act(async()=>fireEvent.click(screen.getByRole('checkbox')));await change('Recorded action reason','Original evidence review rationale');await submit('Preserve queue action');let body=JSON.parse(requests.find(([,o])=>o?.method)[1].body);assert.deepEqual(body.assessment_ids,['assessment-original']);assert.equal(body.run_id,null);
 await choose('Queue action','attach-run');await choose('Job for queue action','manual');await choose('Preserved external run','external');await submit('Preserve queue action');body=JSON.parse(requests.filter(([,o])=>o?.method).at(-1)[1].body);assert.deepEqual(body.assessment_ids,[]);assert.equal(body.run_id,'external');
 await choose('Queue action','cancel');await choose('Job for queue action','queued');await submit('Preserve queue action');body=JSON.parse(requests.filter(([,o])=>o?.method).at(-1)[1].body);assert.equal(body.action,'cancel');assert.equal(body.run_id,null);assert.ok(screen.getByText('Queue action and its original reason preserved.'));
});
test('queue view pages claims and jobs retains original coverage and exports the complete private history',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});queue.jobs=Array.from({length:22},(_,index)=>({...job('job-'+index,index===0?'running':'queued'),priority:index%2+1,blockers:index===1?['Original prerequisite']:[],exclusive_resources:index===0?['machine:fixed']:[],dependencies:index===0?[{job_id:'predecessor',requirement:'reviewed-evidence'}]:[],followup_of:index===0?'older':null,run_id:index===0?'recorded-run':null}));queue.events=[{id:'event',created_at:STAMP,event:'queued',status:'queued',job_id:'original',reason:'Original event',details:{zero:0}}];globalThis.__claimQueueRows=Array.from({length:51},(_,i)=>({claim:{id:'claim-'+i,description:'Original claim '+i,location:'Section 1',claim_type:'numerical'},assessment:i===0?{label:'inconclusive'}:null,campaignIds:i===1?[]:[CAMPAIGN],jobs:i===0?[queue.jobs[0]]:[]}));const original=structuredClone(queue);render(React.createElement(ClaimQueueView,{snapshot,queue}));await click('Next claims');assert.ok(screen.getByText('Original claim 50'));await click('Previous claims');await click('Next jobs');await click('Previous jobs');assert.ok(screen.getByText('Scoped network cancellation'));assert.ok(screen.getByText(/Exclusive resources: machine:fixed/));assert.deepEqual(queue,original);
 let blob;const created=t.mock.method(URL,'createObjectURL',value=>{blob=value;return'blob:synthetic';});const revoked=t.mock.method(URL,'revokeObjectURL',()=>{});t.mock.method(window.HTMLAnchorElement.prototype,'click',()=>{});await click('Download private queue history');assert.equal(created.mock.callCount(),1);assert.deepEqual(JSON.parse(await blob.text()),queue);await act(async()=>t.mock.timers.tick(1000));assert.equal(revoked.mock.callCount(),1);
});

test('initial unknown failures report unavailable counts and evidence refresh failures retain their reason',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});handler=async()=>{throw null;};await show();assert.match(screen.getByRole('alert').textContent,/Queue request failed.*Queue counts and status are unavailable/);assert.equal(screen.queryByTestId('claim-queue'),null);
 cleanup();handler=async()=>queue;await act(async()=>render(React.createElement(ClaimQueue,{snapshot,onEvidenceChanged:async()=>{throw new Error('Evidence refresh unavailable');}})));await click('Refresh queue and evidence');assert.match(screen.getByRole('alert').textContent,/Evidence refresh unavailable/);
});

test('enabled workers preserve an initial job and unknown campaign identities remain visible',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});queue.workers_enabled=true;queue.jobs=[{...job('orphan'),campaign_id:'unresolved-campaign'}];globalThis.__claimQueueRows=[{claim:{id:'claim',description:'Original unmatched claim'},assessment:null,campaignIds:['unresolved-campaign'],jobs:queue.jobs}];await show();assert.equal(screen.queryByText(/Scheduled workers are disabled in this environment/),null);assert.equal(screen.getAllByText(/unresolved-campaign/).length,2);await open('Queue a campaign with prerequisites');await choose('Campaign to queue',CAMPAIGN);await change('Original queue input text','{}');await change('Job rationale and follow-up reason','Original initial job');await submit('Queue campaign');const body=JSON.parse(requests.find(([,o])=>o?.method)[1].body);assert.equal(body.followup_of,null);assert.ok(screen.getByText(/Ready automatic jobs are picked up/));
});

test('review deselection removes only that assessment and an unconfirmed action retains input for retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});queue.jobs=[{...job('review','awaiting-review'),run_id:'run'}];snapshot.records.assessments=[{id:'assessment',campaign_id:CAMPAIGN,claim_id:'claim',label:'inconclusive',evidence:[{kind:'runs',id:'run'}]}];await show();await open('Review, cancel or attach recorded evidence');await choose('Job for queue action','review');await act(async()=>fireEvent.click(screen.getByRole('checkbox')));await act(async()=>fireEvent.click(screen.getByRole('checkbox')));assert.equal(screen.getByRole('button',{name:'Preserve queue action'}).disabled,true);await act(async()=>fireEvent.click(screen.getByRole('checkbox')));await change('Recorded action reason','Preserve original review');handler=async(path,options)=>{if(options?.method)throw null;return queue;};await submit('Preserve queue action');assert.ok(screen.getByText('Queue request failed. Your original input is retained.'));assert.equal(screen.getByLabelText('Recorded action reason').value,'Preserve original review');assert.equal(changed,0);
});
