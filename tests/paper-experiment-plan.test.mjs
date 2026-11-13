import assert from 'node:assert/strict';
import {test} from 'node:test';
import {confirmPaperSections, reviewedSections, validateExperimentPlan, validateExperimentPlanView} from '../lib/paper-experiment-plan.ts';
import {experimentPlanRequest} from '../lib/paper-experiment-plan-model.ts';
import {confirmAndPlan, refreshExperimentPlan, cancelExperimentPlan} from '../lib/paper-experiment-plan-runner.ts';
import {breakdownFixture, planFixture, hierarchicalPlanFixture, legacyPlanRequestFixture} from './support/experiment-plan-fixture.mjs';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {privateDirectory,privateJSON} from '../scripts/lib/paper-evaluation-store.mjs';
import {sha256} from '../lib/paper-intake-model.ts';
const original=breakdownFixture();
test('confirmation edits descriptions and removes entries while keeping original evidence immutable',()=>{
 const review=reviewedSections(original);review.access[0].description='Corrected prerequisite';review.validate=[];
 const saved=confirmPaperSections(original,review);assert.equal(saved.sections.access[0].description,'Corrected prerequisite');assert.equal(saved.sections.access[0].quote,original.sections.access[0].quote);assert.equal(saved.sections.access[0].page,1);assert.equal(saved.sections.validate.length,0);assert.notEqual(original.sections.access[0].description,'Corrected prerequisite');
 for(const mutate of [v=>v.access.push(v.access[0]),v=>v.access[0].id='invented',v=>v.access[0].quote='invented',v=>delete v.data,v=>v.data[0].description=' ']){const bad=reviewedSections(original);mutate(bad);assert.throws(()=>confirmPaperSections(original,bad));}
});
test('planning input contains only confirmed sections and neutral references with no execution tools',()=>{
 const reviewed=reviewedSections(original);reviewed.access=[];const request=experimentPlanRequest(confirmPaperSections(original,reviewed));
 assert.equal(request.background,true);assert.equal(request.store,true);assert.equal(request.tools,undefined);assert.equal(request.text.format.strict,true);
 const input=JSON.parse(request.input);assert.equal(input.sections.access.length,0);assert.equal(input.sections.experiment[0].ref,'experiment-1');assert.equal(input.sections.experiment[0].quote,original.sections.experiment[0].quote);assert.equal(request.input.includes('experiment-original'),false);
});
test('plans must cover each confirmed experiment exactly once and use retained sources',()=>{
 assert.deepEqual(validateExperimentPlan(planFixture(),original),planFixture());
 for(const mutate of [p=>p.experiments=[],p=>p.experiments.push(p.experiments[0]),p=>p.experiments[0].experiment_refs=['invented'],p=>p.experiments[0].steps[0].source_refs=['access-99'],p=>p.experiments[0].steps[0].source_refs=[],p=>p.experiments[0].steps[0].basis='completed',p=>p.experiments[0].steps[0].instructions='x'.repeat(1201)]){const bad=planFixture();mutate(bad);assert.throws(()=>validateExperimentPlan(bad,original));}
 const empty=structuredClone(original);empty.sections.experiment=[];assert.deepEqual(validateExperimentPlan({experiments:[]},empty),{experiments:[]});assert.throws(()=>validateExperimentPlan(planFixture(),empty));
});
function fixture(){
 const calls=[];let row={study_id:'study',owner_id:'owner',status:'submitting',intake_revision:4,confirmed_at:new Date().toISOString(),confirmed_breakdown:original,submit_token:'token',provider_response_id:null,request:experimentPlanRequest(original),deadline_at:'2099-01-01T00:00:00Z',updated_at:new Date().toISOString(),plan:null,reason:null};
 let admitted=false;
 const ops={save:async(operation,payload)=>{calls.push([operation,payload]);if(operation==='confirm'){const first=!admitted;admitted=true;return{...row,admitted:first};}if(operation==='submitted')row={...row,status:'processing',provider_response_id:payload.response_id};else if(operation==='finish')row={...row,status:'ready',plan:payload.plan};else row={...row,status:operation==='cancel'?'cancelled':operation};return row;},create:async()=>{calls.push(['model']);return{id:'resp_original',status:'queued'};},retrieve:async()=>({id:'resp_original',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(planFixture())}]}]}),cancel:async()=>({id:'resp_original',status:'cancelled'})};
 return{calls,ops,get row(){return row;}};
}
test('concurrent confirmations admit one model call, and lost acknowledgements retry only the save',async()=>{
 const f=fixture(),save=f.ops.save;let lost=true;f.ops.save=async(op,payload)=>{const result=await save(op,payload);if(op==='submitted'&&lost){lost=false;throw new Error('Lost acknowledgement');}return result;};
 await Promise.all([confirmAndPlan({},experimentPlanRequest(original),f.ops),confirmAndPlan({},experimentPlanRequest(original),f.ops)]);
 assert.equal(f.calls.filter(c=>c[0]==='model').length,1);assert.equal(f.calls.filter(c=>c[0]==='submitted').length,2);
 f.ops.retrieve=async()=>({id:'resp_original',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(hierarchicalPlanFixture())}]}]});
 const finished=await refreshExperimentPlan(f.row,f.ops);assert.equal(finished.status,'ready');assert.deepEqual(finished.plan,hierarchicalPlanFixture());
});
test('unconfirmed/rejected admissions and empty confirmed experiments make zero model calls',async()=>{
 const f=fixture();f.ops.save=async()=>{throw new Error('Confirmation refused');};await assert.rejects(confirmAndPlan({},experimentPlanRequest(original),f.ops),/Confirmation refused/);assert.equal(f.calls.length,0);
 const empty=fixture();empty.ops.save=async()=>({...empty.row,status:'ready',admitted:false,plan:{experiments:[]}});await confirmAndPlan({},null,empty.ops);assert.equal(empty.calls.length,0);
});
test('ambiguous submissions are retained and never resubmitted or falsely cancelled',async()=>{
 const f=fixture();f.ops.create=async()=>{f.calls.push(['model']);throw new Error('Lost response');};const row=await confirmAndPlan({},experimentPlanRequest(original),f.ops);assert.equal(row.status,'uncertain');
 await refreshExperimentPlan(row,f.ops);await confirmAndPlan({},experimentPlanRequest(original),f.ops);assert.equal(f.calls.filter(c=>c[0]==='model').length,1);await assert.rejects(cancelExperimentPlan(row,f.ops),/reconciled/);
});
test('malformed, refused and incomplete outputs retain failure evidence without inference retries',async()=>{
 for(const response of [{id:'resp_original',status:'incomplete',output:[]},{id:'resp_original',status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]},{id:'resp_original',status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"experiments":[]}'}]}]}]){
  const f=fixture();const row=await confirmAndPlan({},experimentPlanRequest(original),f.ops);f.ops.retrieve=async()=>response;assert.equal((await refreshExperimentPlan(row,f.ops)).status,'failed');assert.equal(f.calls.at(-1)[1].response,response);assert.equal(f.calls.filter(c=>c[0]==='model').length,1);
 }
});
test('deadlines cancel the original response; mismatched identities and nonterminal cancellation cannot mark a plan stopped',async()=>{
 const f=fixture();let row=await confirmAndPlan({},experimentPlanRequest(original),f.ops);row={...row,deadline_at:'2000-01-01T00:00:00Z'};f.ops.retrieve=async()=>({id:'resp_original',status:'in_progress'});assert.equal((await refreshExperimentPlan(row,f.ops)).status,'cancelled');
 f.ops.retrieve=async()=>({id:'resp_other',status:'in_progress'});await assert.rejects(refreshExperimentPlan(row,f.ops),/does not match/);
 f.ops.retrieve=async()=>({id:'resp_original',status:'in_progress'});f.ops.cancel=async()=>({id:'resp_original',status:'in_progress'});await assert.rejects(cancelExperimentPlan({...row,deadline_at:'2099-01-01T00:00:00Z'},f.ops),/not been confirmed/);
});
test('client validation rejects plans without a confirmation and requires a plan in ready status',()=>{
 const v={version:'paper-experiment-plan-v1',study_id:'study',stage:'awaiting_confirmation',intake_revision:4,confirmed_at:null,confirmed_breakdown:null,plan:null,reason:null};assert.equal(validateExperimentPlanView(v,'study'),v);assert.throws(()=>validateExperimentPlanView({...v,plan:planFixture()},'study'));assert.throws(()=>validateExperimentPlanView({...v,stage:'ready'},'study'));
});
test('browser-free evaluation supports offline checks and frozen replay without model or database calls',async()=>{
 const args=['--import','./scripts/lib/register-typescript.mjs','scripts/evaluate-experiment-plan.mjs'];
 const offline=spawnSync(process.execPath,args,{encoding:'utf8',timeout:10000});assert.equal(offline.status,0,offline.stderr);assert.equal(JSON.parse(offline.stdout).model_calls,0);
 const name='unit-replay-'+randomUUID(),directory=join(process.cwd(),'.test-artifacts','experiment-plan-evaluations',name),request=legacyPlanRequestFixture(JSON.parse(experimentPlanRequest(original).input));
 const saved={breakdown:original,request,identity:sha256(JSON.stringify({breakdown:original,request})),response:{id:'resp_fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(planFixture())}]}]}};
 await privateDirectory(directory);await privateJSON(join(directory,'run.json'),saved);
 const replay=spawnSync(process.execPath,[...args,'--replay',name],{encoding:'utf8',timeout:10000});assert.equal(replay.status,0,replay.stderr);assert.equal(JSON.parse(replay.stdout).model_calls,0);assert.equal(JSON.parse(replay.stdout).experiments,1);
 await privateJSON(join(directory,'run.json'),{...saved,breakdown:{...original,limitation:'Tampered original'}});
 const tampered=spawnSync(process.execPath,[...args,'--replay',name],{encoding:'utf8',timeout:10000});assert.equal(tampered.status,1);assert.match(tampered.stderr,/frozen identity/);
});
test('a named uncertain evaluation is never resubmitted when its command is rerun',async()=>{
 const name='unit-unknown-'+randomUUID(),directory=join(process.cwd(),'.test-artifacts','experiment-plan-evaluations',name),request=experimentPlanRequest(original);
 const saved={breakdown:original,request,identity:sha256(JSON.stringify({breakdown:original,request})),status:'uncertain',token:'original-request-token'};
 await privateDirectory(directory);await privateJSON(join(directory,'run.json'),saved);
 const result=spawnSync(process.execPath,['--import','./scripts/lib/register-typescript.mjs','scripts/evaluate-experiment-plan.mjs','--live','--run',name],{encoding:'utf8',timeout:10000,env:{...process.env,OPENAI_API_KEY:'synthetic-offline-key'}});
 assert.equal(result.status,1);assert.match(result.stderr,/will not be repeated/);assert.deepEqual(JSON.parse(await readFile(join(directory,'run.json'),'utf8')),saved);
});
