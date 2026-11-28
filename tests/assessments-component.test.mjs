import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';

globalThis.__assessmentReact = React;
const listURL = new URL('../lib/research-assessment-list.ts', import.meta.url).href;
const progressURL = new URL('../lib/assessment-wizard-progress.ts', import.meta.url).href;
const sources = {
  'next/link': `export default function Link({href,scroll,prefetch,replace,...props}) {return globalThis.__assessmentReact.createElement('a',{...props,href});}`,
  'next/form': `export default function Form({action,...props}) {return globalThis.__assessmentReact.createElement('form',{...props,action});}`,
  'next/navigation': `export const useRouter=()=>({push:globalThis.__trainingBatchNavigate});`,
  '@/app/components/user-preferences': `export const useUserPreferences=()=>globalThis.__assessmentPreferences; export const LocalDateTime=({value})=>globalThis.__assessmentReact.createElement('time',{},value);`,
  '@/lib/research-assessment-list': `export {assessmentListPath} from ${JSON.stringify(listURL)};export const loadAssessmentList=(...args)=>globalThis.__assessmentLoad(...args);`,
  '@/lib/assessment-wizard-progress': `export {assessmentStepLabel} from ${JSON.stringify(progressURL)};export const loadAssessmentWizardProgress=(...args)=>globalThis.__assessmentProgress(...args);`,
  '@/lib/research-assessment-delete': `export const deleteAssessment=(...args)=>globalThis.__assessmentDelete(...args);`,
};
const hook = registerHooks({resolve(specifier, context, next) {
  if (sources[specifier]) return {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(sources[specifier])};
  return next(specifier, context);
}});
const {Assessments} = await import('../app/components/research-workflow/assessments.tsx');
const {StartSyntheticBatch} = await import('../app/components/research-workflow/start-synthetic-batch.tsx');
const {TrainingBatchHistoryRow} = await import('../app/components/research-workflow/training-batch-history-row.tsx');
const {TrainingBatchProgress} = await import('../app/components/research-workflow/training-batch-progress.tsx');
hook.deregister();
afterEach(() => {cleanup(); delete globalThis.__assessmentPreferences; delete globalThis.__assessmentLoad; delete globalThis.__assessmentDelete; delete globalThis.__assessmentProgress; delete globalThis.__trainingBatchNavigate;});

const id = '91169871-14c2-4bde-a0a5-50bf78403d86';
const paper = change => ({id, title: 'Synthetic networking paper', authors: ['Fixture Author'], initiated_by: 'Fixture Initiator',
  created_at: '2026-11-01T00:00:00Z', workflow_status: 'running', published: false, ...change});
const catalog = (papers, next_cursor = null) => ({version: 'research-paper-catalog-v1', access: 'public-read-only', papers, coverage: {papers: papers.length}, next_cursor});
function show(props = {}, value = catalog([paper()])) {
  globalThis.__assessmentLoad ??= async () => value;
  globalThis.__assessmentProgress ??= async ids => ({assessments: ids.map(id=>({id,step:2}))});
  return render(React.createElement(Assessments, props));
}

test('any part of a training batch row opens its detail page while the batch link stays keyboard accessible', () => {
  const navigations = [];
  globalThis.__trainingBatchNavigate = href => navigations.push(href);
  const href = '/research-verification/training-batch/12';
  render(React.createElement('table', null, React.createElement('tbody', null,
    React.createElement(TrainingBatchHistoryRow, { batchId: 12 },
      React.createElement('td', null, 'Completed'),
      React.createElement('td', null, React.createElement('span', { title: 'paper.pdf · Passed' }, '✓'))))));

  const link = screen.getByRole('link', { name: 'View batch 12' });
  assert.equal(link.getAttribute('href'), href);
  assert.equal(link.tabIndex, 0);
  fireEvent.click(screen.getByRole('cell', { name: 'Completed' }));
  fireEvent.click(screen.getByTitle('paper.pdf · Passed'));
  assert.deepEqual(navigations, [href, href]);
});

test('the stop control sends one request and waits for the coordinator to report interruption', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const initial = { id: 12, status: 'running', canStop: true, stale: false,
    requestedAt: null, startedAt: null, updatedAt: null, finishedAt: null, stopPhase: null,
    versions: { generator: null, verifier: null }, papers: [] };
  const interrupted = { ...initial, status: 'interrupted', canStop: undefined };
  let accept;
  let progress = initial;
  const fetch = t.mock.method(globalThis, 'fetch', (_url, options) => options.method === 'POST'
    ? new Promise(resolve => { accept = resolve; }) : Promise.resolve(Response.json(progress)));
  render(React.createElement(TrainingBatchProgress, { id: 12, initial }));
  const button = screen.getByRole('button', { name: 'Stop Batch' });
  fireEvent.click(button);
  fireEvent.click(button);
  assert.ok(screen.getByRole('button', { name: 'Requesting stop…' }).disabled);
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(fetch.mock.calls[0].arguments, ['/research-verification/api/synthetic-batch/12/stop', { method: 'POST' }]);

  await act(async () => accept(Response.json({ status: 'requested' }, { status: 202 })));
  assert.ok(screen.getByText(/Stop requested/));
  assert.ok(screen.getByText('Running'));
  progress = interrupted;
  await act(async () => t.mock.timers.tick(10_000));
  assert.ok(screen.getByText('Interrupted'));
  assert.equal(screen.queryByRole('button', { name: 'Stop Batch' }), null);
  assert.equal(screen.queryByText(/Stop requested/), null);
});

test('the batch launcher sends one request and navigates to its own progress page', async t => {
  const batchId = 12;
  const navigations = [];
  globalThis.__trainingBatchNavigate = path => navigations.push(path);
  let resolve;
  const fetch = t.mock.method(globalThis, 'fetch', () => new Promise(done => { resolve = done; }));
  const title = 'Training Batches';
  const { container, rerender } = render(React.createElement(StartSyntheticBatch, { title, disabled: true }));
  const button = screen.getByRole('button', { name: 'Start synthetic batch' });
  assert.equal(button.parentElement, screen.getByRole('heading', { name: title }).parentElement);
  assert.ok(button.disabled);
  fireEvent.click(button);
  assert.equal(fetch.mock.callCount(), 0);
  rerender(React.createElement(StartSyntheticBatch, { title, disabled: false }));
  assert.equal(button.disabled, false);
  assert.equal(container.querySelector('.training-batch-launch-graphic'), null);
  fireEvent.click(button);
  fireEvent.click(button);
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(fetch.mock.calls[0].arguments, ['/research-verification/api/synthetic-batch/start', { method: 'POST' }]);
  assert.ok(screen.getByRole('button', { name: 'Requesting start…' }).disabled);
  assert.equal(screen.getByRole('status').textContent, 'Waiting for the AWS coordinator');
  assert.equal(container.querySelector('.training-batch-launch-graphic')?.getAttribute('aria-hidden'), 'true');
  await act(async () => resolve(Response.json({ batchId }, { status: 202 })));
  assert.deepEqual(navigations, [`/research-verification/training-batch/${batchId}`]);
});

test('the launch graphic stays through coordinator preparation and disappears when the batch runs', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const initial = { id: 12, status: 'requested', stale: false, requestedAt: null, startedAt: null,
    updatedAt: null, finishedAt: null, stopPhase: null, versions: { generator: null, verifier: null }, papers: [] };
  const statuses = ['unconfirmed', 'preparing', 'running'];
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...initial, status: statuses.shift() }));
  const { container } = render(React.createElement(TrainingBatchProgress, { id: 12, initial }));
  const graphic = () => container.querySelector('.training-batch-launch-graphic');
  assert.ok(graphic());
  assert.equal(screen.getByRole('status').textContent, 'Waiting for the coordinator');
  for (const label of ['Start unconfirmed', 'Preparing the batch']) {
    await act(async () => { t.mock.timers.tick(10_000); });
    assert.ok(graphic());
    assert.equal(screen.getByRole('status').textContent, label);
  }
  await act(async () => { t.mock.timers.tick(10_000); });
  assert.equal(graphic(), null);
  assert.equal(screen.getByRole('status').textContent, 'Running');
});

test('running Generator and Verifier timers tick between polls and switch to recorded durations', async t => {
  const timestamp = '2026-11-01T00:01:10.000Z';
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: Date.parse(timestamp) });
  const startedGenerator = '2026-11-01T00:01:05.000Z';
  const startedVerifier = '2026-11-01T00:00:05.000Z';
  const first = { id: 12, status: 'running', stale: false, requestedAt: null, startedAt: startedVerifier,
    updatedAt: timestamp, finishedAt: null, stopPhase: null, versions: { generator: null, verifier: null },
    papers: [
      { id: 'paper-1', fileName: 'first.pdf', status: 'generating', assessmentId: null, score: null,
        steps: { generator: { status: 'running', durationMs: null, startedAt: startedGenerator } } },
      { id: 'paper-2', fileName: 'second.pdf', status: 'verifying', assessmentId: null, score: null,
        steps: { verifier: { status: 'running', durationMs: null, startedAt: startedVerifier } } },
    ],
  };
  const final = { ...first, status: 'completed', finishedAt: '2026-11-01T00:01:20.000Z', papers: first.papers.map((paper, index) => ({
    ...paper, status: 'completed', steps: index === 0
      ? { generator: { status: 'completed', durationMs: 11_420, startedAt: startedGenerator } }
      : { verifier: { status: 'completed', durationMs: 72_310, startedAt: startedVerifier } },
  })) };
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(final));
  render(React.createElement(TrainingBatchProgress, { id: 12, initial: first }));
  const generator = within(screen.getByRole('list', { name: 'Assessment steps for first.pdf' }));
  const verifier = within(screen.getByRole('list', { name: 'Assessment steps for second.pdf' }));
  assert.equal(generator.getByRole('timer').textContent, '5 seconds');
  assert.equal(verifier.getByRole('timer').textContent, '1 minute 5 seconds');
  await act(async () => { t.mock.timers.tick(3_000); });
  assert.equal(generator.getByRole('timer').textContent, '8 seconds');
  assert.equal(verifier.getByRole('timer').textContent, '1 minute 8 seconds');
  assert.equal(fetch.mock.callCount(), 0);
  await act(async () => { t.mock.timers.tick(7_000); });
  assert.equal(screen.queryByRole('timer'), null);
  assert.ok(generator.getByText('11 seconds'));
  assert.ok(verifier.getByText('1 minute 12 seconds'));
  await act(async () => { t.mock.timers.tick(20_000); });
  assert.ok(generator.getByText('11 seconds'));
  assert.equal(fetch.mock.callCount(), 1);
});

test('training batch progress reports saved assessments and stops polling at a terminal result', async t => {
  const batchId = 12;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const timestamp = '2026-11-01T00:00:00Z';
  const first = { id: batchId, requestedAt: timestamp, startedAt: timestamp, updatedAt: timestamp,
    finishedAt: null, stale: false, status: 'running', stopPhase: null, canViewAssessmentLinks: true,
    versions: { generator: 4, verifier: 2 },
    papers: [{ id: 'paper-1', fileName: 'paper.pdf', status: 'verifying', assessmentId: id, score: null, steps: {
      generator: { status: 'completed', durationMs: 903_400 }, verifier: { status: 'running', durationMs: null },
    } }] };
  const final = { ...first, status: 'completed', finishedAt: timestamp,
    papers: [{ ...first.papers[0], status: 'completed', score: { earned: 9, maximum: 10 }, steps: {
      ...first.papers[0].steps, verifier: { status: 'completed', durationMs: 121_500 },
    } }] };
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(final));
  render(React.createElement(TrainingBatchProgress, { id: batchId, initial: first }));
  assert.ok(screen.getByText('Verifying'));
  assert.equal(screen.getByRole('link', { name: 'paper.pdf' }).getAttribute('href'), `/research-verification/assessment/${id}`);
  assert.ok(screen.getByRole('columnheader', { name: 'Assessment ID' }));
  assert.ok(screen.getByRole('cell', { name: id }));
  const [generator, verifier] = within(screen.getByRole('list', { name: 'Assessment steps for paper.pdf' })).getAllByRole('listitem');
  assert.ok(within(generator).getByText('Generator'));
  assert.ok(within(generator).getByText('15 minutes 3 seconds'));
  assert.ok(within(verifier).getByText('Verifier'));
  assert.ok(within(verifier).getByText('Running'));
  assert.equal(within(verifier).queryByRole('timer'), null);
  await act(async () => { t.mock.timers.tick(10_000); });
  assert.ok(screen.getByText('9 / 10'));
  assert.ok(screen.getByText('1 of 1 papers completed · 1 imperfect score'));
  assert.equal(screen.queryByText(/earned full credit/), null);
  assert.equal(screen.getByRole('progressbar', { name: 'Papers completed' }).value, 1);
  assert.ok(within(verifier).getByText('Completed'));
  assert.ok(within(verifier).getByText('2 minutes 1 second'));
  await act(async () => { t.mock.timers.tick(30_000); });
  assert.equal(fetch.mock.callCount(), 1);
});

test('the batch summary counts passed papers, imperfect scores, and verification errors', () => {
  const paper = (index, status, earned) => ({
    id: `paper-${index}`, fileName: `paper-${index}.pdf`, status, assessmentId: null, score: { earned, maximum: 10 },
  });
  render(React.createElement(TrainingBatchProgress, { id: 12, initial: {
    id: 12, requestedAt: null, startedAt: null, updatedAt: null, finishedAt: null, stale: false,
    status: 'completed', stopPhase: null, versions: { generator: null, verifier: null },
    papers: [
      ...Array.from({ length: 10 }, (_, index) => paper(index, 'passed', 10)),
      ...Array.from({ length: 4 }, (_, index) => paper(index + 10, 'completed', 9)),
      paper(14, 'verification_error', 5),
    ],
  } }));
  assert.ok(screen.getByText('14 of 15 papers completed · 10 passed · 4 imperfect scores · 1 verification error'));
});

test('training batch viewers can read saved assessment IDs and see which papers are pending', () => {
  render(React.createElement(TrainingBatchProgress, { id: 12, initial: {
    id: 12, requestedAt: null, startedAt: null, updatedAt: null, finishedAt: null, stale: false,
    status: 'stopped', stopPhase: 'verifying', versions: { generator: null, verifier: null },
    papers: [
      { id: 'JSB-E01', fileName: 'saved.pdf', status: 'stopped', assessmentId: id, score: null },
      { id: 'JSB-E02', fileName: 'pending.pdf', status: 'pending', assessmentId: null, score: null },
      { id: 'JSB-E03', fileName: 'failed.pdf', status: 'generation_error', assessmentId: null, score: null },
    ],
  } }));
  assert.ok(screen.getByRole('cell', { name: id }));
  assert.equal(screen.queryByRole('link', { name: 'saved.pdf' }), null);
  const [saved, pending] = screen.getAllByRole('row').slice(1);
  assert.equal(saved.cells[1].textContent, id);
  assert.equal(pending.cells[1].textContent, '—');
  assert.ok(within(saved).getByText('Time unavailable'));
  const pendingSteps = within(pending).getByRole('list');
  assert.equal(within(pendingSteps).getAllByText('Pending').length, 2);
  assert.ok(screen.getByRole('cell', { name: 'Generation error' }));
});

test('paper status is plain text and closing a step’s details ends activity polling', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const at = '2026-11-01T00:00:00Z';
  const batch = { id: 12, requestedAt: at, startedAt: at, updatedAt: at,
    finishedAt: null, stale: false, status: 'running', stopPhase: null, activityAvailable: true,
    versions: { generator: 4, verifier: 1 },
    papers: [{ id: 'JSB-E01', fileName: 'paper.pdf', status: 'generating', assessmentId: null, score: null }] };
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ generator: [
    { at, kind: 'command_started', program: 'python3' },
  ], verifier: [] }));
  render(React.createElement(TrainingBatchProgress, { id: 12, initial: batch }));
  assert.equal(fetch.mock.callCount(), 0);
  const status = screen.getByRole('cell', { name: 'Generating' });
  assert.equal(status.childElementCount, 0);
  fireEvent.click(status);
  assert.equal(screen.queryByRole('dialog'), null);
  assert.equal(fetch.mock.callCount(), 0);
  const button = screen.getByRole('button', { name: 'View Generator details for paper.pdf' });
  await act(async () => fireEvent.click(button));
  assert.ok(screen.getByRole('dialog', { name: 'Generator details' }));
  assert.ok(screen.getByText('Running python3'));
  assert.equal(fetch.mock.calls[0].arguments[0], '/research-verification/api/synthetic-batch/12/activity?paper=JSB-E01');
  await act(async () => { t.mock.timers.tick(4_000); });
  assert.equal(fetch.mock.callCount(), 2);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Close' })));
  await act(async () => { t.mock.timers.tick(4_000); });
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(screen.queryByRole('dialog'), null);
});

test('the Generator and Verifier open their own step details and activity', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const at = '2026-11-01T00:00:00Z';
  const batch = { id: 12, requestedAt: at, startedAt: at, updatedAt: at, finishedAt: null, stale: false,
    status: 'running', stopPhase: null, activityAvailable: true, versions: { generator: 4, verifier: 2 },
    papers: [{ id: 'JSB-E01', fileName: 'paper.pdf', status: 'verifying', assessmentId: id, score: null, steps: {
      generator: { status: 'completed', durationMs: 903_400 }, verifier: { status: 'running', durationMs: null },
    } }] };
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({
    generator: [{ at, kind: 'command_started', program: 'python3' }],
    verifier: [{ at, kind: 'review_preflight' }],
  }));
  render(React.createElement(TrainingBatchProgress, { id: 12, initial: batch }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'View Generator details for paper.pdf' })));
  const generator = within(screen.getByRole('dialog', { name: 'Generator details' }));
  assert.ok(generator.getByText('v4'));
  assert.ok(generator.getByText('15 minutes 3 seconds'));
  assert.ok(generator.getByText('Running python3'));
  assert.equal(generator.queryByText('Checking evidence before verification'), null);
  await act(async () => { t.mock.timers.tick(4_000); });
  assert.equal(fetch.mock.callCount(), 1);
  await act(async () => fireEvent.click(generator.getByRole('button', { name: 'Close' })));

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'View Verifier details for paper.pdf' })));
  const verifier = within(screen.getByRole('dialog', { name: 'Verifier details' }));
  assert.ok(verifier.getByText('v2'));
  assert.ok(verifier.getByText('Running'));
  assert.ok(verifier.getByText('Checking evidence before verification'));
  assert.equal(verifier.queryByText('Running python3'), null);
  await act(async () => { t.mock.timers.tick(4_000); });
  assert.equal(fetch.mock.callCount(), 3);
});

test('table is the default view and recorded title, initiator, stage and detail link appear', async () => {
  show();
  const table = await screen.findByRole('table');
  assert.match(table.textContent, /Fixture Initiator/);
  await screen.findByText('Step 2 · Paper Breakdown');assert.equal(screen.queryByText('In progress'),null);
  assert.equal(screen.queryByText('Not published'),null);
  assert.equal(screen.getByRole('link', {name: 'Synthetic networking paper'}).getAttribute('href'), `/research-verification/assessment/${id}`);
  assert.equal(screen.getByRole('button', {name: 'Table'}).getAttribute('aria-current'), 'page');
  assert.equal(screen.getByRole('button', {name: 'All Assessments'}).getAttribute('aria-current'), 'page');
  assert.equal(screen.getByLabelText('Filter by name').getAttribute('type'), 'search');
  assert.equal(screen.queryByRole('button',{name:/Delete assessment/}),null);
});
test('each table row shows its saved wizard step instead of a shared workflow status',async()=>{
 const ids=Array.from({length:4},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);let reads=0;
 globalThis.__assessmentProgress=async requested=>{reads++;assert.deepEqual(requested,ids);return{assessments:ids.map((id,i)=>({id,step:i+1}))};};
 show({},catalog(ids.map((id,i)=>paper({id,title:'Paper '+(i+1)}))));
 for(const label of ['Step 1 · Paper Upload','Step 2 · Paper Breakdown','Step 3 · Experiment Steps','Step 4 · Experiment Setup'])await screen.findByText(label);
 assert.equal(reads,1);assert.equal(screen.queryByText('In progress'),null);
});
test('private assessments link to the canonical assessment in both views and stay out of public progress reads',async()=>{
 const previewId='22222222-2222-4222-8222-222222222222';
 globalThis.__assessmentPreferences={userId:'owner'};
 globalThis.__assessmentProgress=async ids=>{assert.deepEqual(ids,[id]);return{assessments:[{id,step:5}]};};
 const rows=catalog([paper(),paper({id:previewId,title:'Private paper',authors:null,private_preview:true})]);
 for(const view of ['table','card']){
  const result=show({mine:true,view},rows);
  assert.equal((await screen.findByRole('link',{name:'Private paper'})).getAttribute('href'),`/research-verification/assessment/${previewId}`);
  await screen.findByText('Private',{exact:true});await screen.findByText('Step 5 · Experiment Results');
  assert.equal(screen.queryByRole('button',{name:'Delete assessment: Private paper'}),null);
  result.unmount();
 }
});
test('unavailable progress keeps the assessment list usable and retries without guessing a step',async()=>{
 let calls=0;globalThis.__assessmentProgress=async ids=>{if(++calls===1)throw new Error('Explicit outage');return{assessments:ids.map(id=>({id,step:3}))};};
 show();await screen.findByText('Step unavailable');assert.ok(screen.getByRole('link',{name:'Synthetic networking paper'}));assert.equal(screen.queryByText('Step 1 · Paper Upload'),null);
 assert.match(screen.getByRole('alert').textContent,/steps could not be refreshed/);fireEvent.click(screen.getByRole('button',{name:'Retry steps'}));
 await screen.findByText('Step 3 · Experiment Steps');assert.equal(screen.queryByRole('alert'),null);assert.equal(calls,2);
});
test('progress refreshes serially and stale status remains labeled until a successful retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let calls=0;
 globalThis.__assessmentProgress=async ids=>{calls++;if(calls===2)throw new Error('Explicit outage');return{assessments:ids.map(id=>({id,step:calls===1?2:4}))};};
 await act(async()=>{show();});assert.ok(screen.getByText('Step 2 · Paper Breakdown'));
 await act(async()=>{t.mock.timers.tick(10000);});assert.ok(screen.getByText('Step 2 · Paper Breakdown'));assert.match(screen.getByRole('alert').textContent,/may be stale/);
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Retry steps'}));});assert.ok(screen.getByText('Step 4 · Experiment Setup'));assert.equal(screen.queryByRole('alert'),null);
});
test('unmount aborts a pending progress read and ignores its late response',async()=>{
 let signal,resolve;globalThis.__assessmentProgress=(_ids,value)=>{signal=value;return new Promise(done=>{resolve=done;});};
 const {unmount}=show();await screen.findByRole('table');await waitFor(()=>assert.equal(signal?.aborted,false));unmount();assert.equal(signal.aborted,true);
 await act(async()=>{resolve({assessments:[{id,step:4}]});});assert.equal(screen.queryByText('Step 4 · Experiment Setup'),null);
});
test('owner deletion requires confirmation and refreshes the personal list only after persistence succeeds',async()=>{
 globalThis.__assessmentPreferences={userId:'owner'};let deleted=false;const calls=[];
 globalThis.__assessmentLoad=async()=>catalog(deleted?[]:[paper()]);
 globalThis.__assessmentDelete=async(...args)=>{calls.push(args);deleted=true;};
 show({mine:true});fireEvent.click(await screen.findByRole('button',{name:'Delete assessment: Synthetic networking paper'}));
 const dialog=await screen.findByRole('alertdialog');assert.match(dialog.textContent,/remain privately retained/);assert.equal(calls.length,0);
 fireEvent.click(screen.getByRole('button',{name:'Keep assessment'}));assert.equal(calls.length,0);
 fireEvent.click(screen.getByRole('button',{name:'Delete assessment: Synthetic networking paper'}));
 fireEvent.click(await screen.findByRole('button',{name:'Delete assessment',exact:true}));
 await screen.findByRole('heading',{name:'You have no assessments yet'});assert.deepEqual(calls,[[id,'owner']]);assert.ok(screen.getByText('Assessment deleted.'));
});
test('failed deletion keeps the card and dialog with a retryable error',async()=>{
 globalThis.__assessmentPreferences={userId:'owner'};globalThis.__assessmentDelete=async()=>{throw new Error('Stop running work before deleting.');};show({mine:true,view:'card'});
 fireEvent.click(await screen.findByRole('button',{name:'Delete assessment: Synthetic networking paper'}));fireEvent.click(await screen.findByRole('button',{name:'Delete assessment',exact:true}));
 assert.match((await screen.findByRole('alert')).textContent,/Stop running/);assert.ok(screen.getByRole('article',{hidden:true}));assert.ok(screen.getByRole('alertdialog'));assert.equal(screen.getByRole('button',{name:'Delete assessment',exact:true}).disabled,false);
 fireEvent.click(screen.getByRole('button',{name:'Keep assessment'}));await waitFor(()=>assert.equal(screen.queryByRole('alertdialog'),null));
});
test('a pending deletion cannot submit twice and keeps a usable close control',async()=>{
 globalThis.__assessmentPreferences={userId:'owner'};let resolve,calls=0;
 globalThis.__assessmentDelete=()=>{calls++;return new Promise(done=>{resolve=done;});};show({mine:true});
 fireEvent.click(await screen.findByRole('button',{name:'Delete assessment: Synthetic networking paper'}));const confirm=await screen.findByRole('button',{name:'Delete assessment',exact:true});
 fireEvent.click(confirm);fireEvent.click(confirm);assert.equal(calls,1);assert.equal(screen.getByRole('button',{name:'Deleting…'}).disabled,true);assert.equal(screen.getByRole('button',{name:'Close'}).disabled,false);
 await act(async()=>{resolve();});await waitFor(()=>assert.equal(screen.queryByRole('alertdialog'),null));
});
test('the first catalogue page offers an older page without a redundant newest-page link',async()=>{
 show({},catalog([paper()],'next'));await screen.findByRole('link',{name:'Older assessments'});assert.equal(screen.queryByRole('link',{name:'Newest assessments'}),null);
});
test('missing catalogue bibliography remains loading until its own metadata arrives and records missing initiator names',async t=>{
 const prior=process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL='https://catalog.example.test';t.after(()=>{if(prior===undefined)delete process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL;else process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL=prior;});let resolve;t.mock.method(globalThis,'fetch',()=>new Promise(done=>{resolve=done;}));show({before:'older'},catalog([paper({title:null,authors:null,initiated_by:null})]));await screen.findByText('Reading paper title…');assert.ok(screen.getByText('Name unavailable'));assert.ok(screen.getByRole('link',{name:'Newest assessments'}));assert.equal(screen.queryByRole('link',{name:'Older assessments'}),null);await waitFor(()=>assert.equal(typeof resolve,'function'));resolve(Response.json({version:'research-paper-catalog-v1',access:'public-read-only',id,title:'Retained metadata title',authors:['Retained Author']}));await screen.findByRole('link',{name:'Retained metadata title'});assert.ok(screen.getByText('Retained Author'));
});

test('card view, personal scope and name filters survive view and pagination links', async () => {
  globalThis.__assessmentPreferences = {userId: 'owner'};
  const requests = [];
  globalThis.__assessmentLoad = async (options, signal) => {requests.push({options, signal}); return catalog([paper({workflow_status: null, published: true, initiated_by: null})], 'next-page');};
  const {container} = show({mine: true, view: 'card', name: 'Fixture', before: 'older-page'});
  await screen.findByRole('article');
  assert.equal(screen.queryByRole('table'), null);
  assert.match(screen.getByRole('article').textContent, /Initiated by: Name unavailable/);
  await screen.findByText('Step 2 · Paper Breakdown');assert.equal(container.querySelectorAll('[data-slot="badge"]').length, 1);
  assert.equal(screen.queryByText('Published assessment'),null);
  const older = new URL(screen.getByRole('link', {name: 'Older assessments'}).href);
  assert.equal(older.searchParams.get('mine'), '1'); assert.equal(older.searchParams.get('view'), 'card');
  assert.equal(older.searchParams.get('name'), 'Fixture'); assert.equal(older.searchParams.get('before'), 'next-page');
  assert.equal(new URL(screen.getByRole('link', {name: 'Newest assessments'}).href).searchParams.has('before'), false);
  assert.equal(container.querySelector('input[name="mine"]').value, '1');
  assert.equal(container.querySelector('input[name="view"]').value, 'card');
  assert.deepEqual(requests[0].options, {userId: 'owner', before: 'older-page', name: 'Fixture'});
  assert.equal(requests[0].signal.aborted, false);
  assert.ok(screen.getByRole('button', {name: 'Clear'}));
});

test('personal lists wait for sign-in and retain the requested filters in the login link', () => {
  let calls = 0;
  globalThis.__assessmentLoad = async () => {calls++; return catalog([]);};
  globalThis.__assessmentPreferences = {loading: true};
  const {rerender} = show({mine: true, name: 'Target', view: 'card'});
  assert.equal(screen.getByRole('status').textContent, 'Checking sign-in…'); assert.equal(calls, 0);
  globalThis.__assessmentPreferences = {loading: false};
  rerender(React.createElement(Assessments, {mine: true, name: 'Target', view: 'card'}));
  const login = new URL(screen.getByRole('link', {name: 'Sign in'}).href);
  assert.equal(login.searchParams.get('next'), '/research-verification/assessments?mine=1&view=card&name=Target');
  assert.equal(calls, 0);
});

test('authentication errors expose a retry without loading an unscoped personal list', () => {
  let retries = 0, calls = 0;
  globalThis.__assessmentPreferences = {loading: false, error: 'Session check failed', refresh() {retries++;}};
  globalThis.__assessmentLoad = async () => {calls++; return catalog([]);};
  show({mine: true});
  assert.match(screen.getByRole('alert').textContent, /Session check failed/);
  fireEvent.click(screen.getByRole('button', {name: 'Retry sign-in check'}));
  assert.equal(retries, 1); assert.equal(calls, 0);
});

test('failed catalogue retrieval can retry without preserving a partial list', async () => {
  let calls = 0;
  globalThis.__assessmentLoad = async () => {if (++calls === 1) throw new Error('Catalogue unavailable'); return catalog([paper()]);};
  show();
  assert.match((await screen.findByRole('alert')).textContent, /Catalogue unavailable/);
  assert.equal(screen.queryByRole('table'), null);
  fireEvent.click(screen.getByRole('button', {name: 'Try again'}));
  await screen.findByRole('table');
  assert.equal(calls, 2); assert.equal(screen.queryByRole('alert'), null);
});

test('untyped failures do not imply that assessment counts are known', async () => {
  globalThis.__assessmentLoad = async () => {throw null;}; show();
  assert.match((await screen.findByRole('alert')).textContent, /Counts are unknown/);
});

test('empty lists distinguish name matches, older pages, personal lists and public submissions', async () => {
  for (const [props, expected] of [[{name: 'Target'}, 'No assessments match this name'], [{before: 'cursor'}, 'No assessments on this page'], [{mine: true}, 'You have no assessments yet'], [{}, 'No paper assessments submitted yet']]) {
    globalThis.__assessmentPreferences = {userId: 'owner'};
    show(props, catalog([]));
    await screen.findByRole('heading', {name: expected});
    assert.ok(screen.getByRole('link', {name: props.name ? 'Clear name filter' : 'Assess a paper'}));
    cleanup(); delete globalThis.__assessmentLoad;
  }
});

test('unmount aborts outstanding catalogue reads and ignores late results', async () => {
  let resolve, signal;
  globalThis.__assessmentLoad = (_options, value) => {signal = value; return new Promise(done => {resolve = done;});};
  const {unmount} = show({name: 'Target'});
  assert.equal(screen.getByRole('status').textContent, 'Filtering assessments…');
  unmount(); assert.equal(signal.aborted, true); resolve(catalog([paper()]));
  await waitFor(() => assert.equal(screen.queryByRole('table'), null));
});
