import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assessmentStepLabel, loadAssessmentWizardProgress, ASSESSMENT_PROGRESS_VERSION} from '../lib/assessment-wizard-progress.ts';

const id = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const fixture = () => ({version: ASSESSMENT_PROGRESS_VERSION, access: 'public-read-only', assessments: [{id, step: 2}, {id: other, step: null}]});

test('wizard progress uses the same four numbered step names as the assessment', () => {
  assert.deepEqual([1,2,3,4].map(assessmentStepLabel), ['Step 1 · Paper Upload','Step 2 · Initial Assessment','Step 3 · Experiment Steps','Step 4 · Setup & Run Commands']);
});
test('one anonymous bounded GET verifies every requested identity without sending credentials', async () => {
  let calls = 0;
  const result = await loadAssessmentWizardProgress([id, other], undefined, async (path, options) => {
    calls++; const url = new URL(path,'https://example.test');
    assert.equal(url.pathname, '/research-verification/api/assessment-progress');assert.deepEqual(url.searchParams.getAll('id'),[id,other]);
    assert.equal(options.method,'GET');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.deepEqual(options.headers,{Accept:'application/json'});
    return Response.json(fixture());
  });
  assert.equal(calls,1);assert.deepEqual(result,fixture());
});
test('invalid input never starts a request and malformed coverage cannot invent steps', async () => {
  for (const ids of [[],[id,id],['invalid'],Array(11).fill(id)]) await assert.rejects(loadAssessmentWizardProgress(ids,undefined,()=>assert.fail('No request')));
  for (const assessments of [[],[{id,step:2}],[{id,step:2},{id,step:3}],[{id,step:5},{id:other,step:null}],[{id,step:'2'},{id:other,step:null}]]) {
    await assert.rejects(loadAssessmentWizardProgress([id,other],undefined,async()=>Response.json({...fixture(),assessments})),/could not be verified/);
  }
  await assert.rejects(loadAssessmentWizardProgress([id],undefined,async()=>new Response('Private database details',{status:503})),/temporarily unavailable/);
  await assert.rejects(loadAssessmentWizardProgress([id],undefined,async()=>new Response('x'.repeat(10001))),/could not be verified/);
});
test('caller cancellation still aborts the bounded progress request',async()=>{
  const controller=new AbortController();let requestSignal;
  const pending=loadAssessmentWizardProgress([id],controller.signal,async(_path,options)=>{
    requestSignal=options.signal;
    return new Promise((_resolve,reject)=>requestSignal.addEventListener('abort',()=>reject(requestSignal.reason),{once:true}));
  });
  controller.abort(new Error('Assessment page changed'));await assert.rejects(pending,/page changed/);assert.equal(requestSignal.aborted,true);
});
