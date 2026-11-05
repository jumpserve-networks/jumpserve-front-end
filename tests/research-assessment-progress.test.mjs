import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(s,c,next){return next(s.startsWith('@/lib/')?new URL('../lib/'+s.slice(6)+'.ts',import.meta.url).href:s.startsWith('./research-')?s+'.ts':s,c);}});
const {assessmentProgress}=await import('../lib/research-assessment-progress.ts');hook.deregister();
const study='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',stamp='2026-10-22T00:00:00Z';
function fixture(){return {version:'research-public-queue-v1',access:'public-read-only',study:{id:study,title:'A paper'},jobs:[],workers_enabled:true,coverage:{jobs:0},limitations:'Synthetic',autonomy:{version:'research-autonomy-v3',access:'public-read-only',defaults:{maximum_spend_usd:100,elapsed_days:7,attempts_per_claim:null},enabled:true,workflows:[{study_id:study,max_spend_cents:10000,max_attempts:null,committed_cents:0,status:'running',reason:'Recorded',created_at:stamp,updated_at:stamp,deadline_at:stamp}],tasks:[{id,study_id:study,claim_id:id,claim_title:'Claim',stage:'planning',status:'blocked',label:'untested',attempts:0,reason:'Paused',created_at:stamp,updated_at:stamp}],coverage:{workflows:1,tasks:1}}};}
test('assessment overview shows the recorded stage without turning a blocker into a finding',()=>{
 const q=fixture(),p=assessmentProgress(q);assert.equal(p.stage,'Experiment planning');assert.equal(p.counts.blocked,1);assert.equal(p.counts.finished,0);assert.equal(p.counts.reproduced,0);assert.equal(p.lastUpdated,stamp);
});
test('parallel running claims retain both stages and the latest recorded timestamp',()=>{
 const q=fixture();q.autonomy.tasks[0].stage='building';q.autonomy.tasks[0].status='running';
 q.autonomy.tasks.push({...q.autonomy.tasks[0],id:study,claim_id:study,stage:'execution',updated_at:'2026-10-22T01:00:00Z'});q.autonomy.coverage.tasks=2;
 const p=assessmentProgress(q);assert.equal(p.stage,'Experiment implementation; Experiment execution');assert.equal(p.counts.running,2);assert.equal(p.lastUpdated,'2026-10-22T01:00:00Z');
});
test('operational repairs remain visible at their recorded scientific stage',()=>{
 const q=fixture();q.autonomy.tasks[0].repair_progress={version:'autonomous-repair-v1',id:study,state:'repairing',category:'implementation',revision:1,updated_at:stamp};
 assert.equal(assessmentProgress(q).stage,'Experiment planning · Repairing');
});
test('terminal workflows do not imply conclusive claim findings and missing progress is not zero',()=>{
 const q=fixture();q.autonomy.workflows[0].status='completed-with-blockers';const p=assessmentProgress(q);
 assert.equal(p.stage,'Finished with gaps');assert.equal(p.counts.reproduced,0);assert.equal(p.counts.finished,0);
 assert.deepEqual(assessmentProgress(null),{stage:'Not recorded',lastUpdated:null,counts:null});
 assert.equal(assessmentProgress(null,'ready').stage,'Ready for review');
 q.autonomy.workflows=[];q.autonomy.tasks=[];q.autonomy.coverage={workflows:0,tasks:0};
 assert.equal(assessmentProgress(q).counts,null);
});
