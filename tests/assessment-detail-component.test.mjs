import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import * as catalog from '../lib/research-paper-catalog.ts';
import * as publicQueue from '../lib/research-public-queue.ts';
import {QUEUE_POLL_MS} from '../lib/research-experiment-queue.ts';

globalThis.__detailReact = React; globalThis.__detailCatalog = catalog; globalThis.__detailPublic = publicQueue;
const boundary = name => `export function ${name}(props){globalThis.__detailCaptures.push({name:'${name}',props});return globalThis.__detailReact.createElement('section',{'data-boundary':'${name}'},props.error??'');}`;
const replacements = {
  'next/link': "export default function Link({prefetch,...props}){return globalThis.__detailReact.createElement('a',props);}",
  '@/app/components/user-preferences': "export function LocalDateTime({value}){return globalThis.__detailReact.createElement('time',{dateTime:value},value??'Not recorded');}",
  '@/lib/research-paper-catalog': "export const loadPaperDetail=(...args)=>globalThis.__detailRead(...args);export const paperWorkflowLabel=(...args)=>globalThis.__detailCatalog.paperWorkflowLabel(...args);export const validPaperAuthors=(...args)=>globalThis.__detailCatalog.validPaperAuthors(...args);export const loadPaperMetadata=(...args)=>globalThis.__detailCatalog.loadPaperMetadata(...args);",
  '@/lib/research-public-queue': "export const loadPublicStudyQueue=(...args)=>globalThis.__detailQueueRead(...args);export const assessmentSummaryFromPublicQueue=(...args)=>globalThis.__detailPublic.assessmentSummaryFromPublicQueue(...args);",
  './shared-assessment-records': boundary('SharedAssessmentRecords'),
  './public-experiment-queue': boundary('PublicExperimentQueue'),
  './experiment-queue': boundary('AssessmentGapExperiments'),
};
const hook = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {AssessmentDetail} = await import('../app/components/research-workflow/assessment-detail.tsx'); hook.deregister();

const ID = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222', STAMP = '2026-11-07T00:00:00Z';
const uid = index => '00000000-0000-4000-8000-' + String(index).padStart(12, '0');
let detail, queue, detailReader, queueReader, detailCalls, queueCalls;
const captures = name => globalThis.__detailCaptures.filter(value => value.name === name);
const last = name => captures(name).at(-1)?.props;
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
function fixture() {
  return {version: 'research-public-queue-v1', access: 'public-read-only', study: {id: ID, title: 'Queue source title'}, jobs: [], workers_enabled: true, coverage: {jobs: 0}, limitations: 'Public original status projection', autonomy: {version: 'research-autonomy-v3', access: 'public-read-only', defaults: {maximum_spend_usd: null, elapsed_days: 7, attempts_per_claim: null}, enabled: true, workflows: [{study_id: ID, max_spend_cents: null, max_attempts: null, committed_cents: 0, status: 'running', reason: 'Original running state', created_at: STAMP, updated_at: STAMP, deadline_at: '2099-01-01T00:00:00Z'}], tasks: [], coverage: {workflows: 1, tasks: 0}}};
}
beforeEach(() => {
  detail = {version: 'research-paper-detail-v1', access: 'public-read-only', paper: {id: ID, title: 'Retained paper title', authors: ['Jane Doe', 'María José'], initiated_by: 'Verified Owner', created_at: STAMP, workflow_status: 'running', published: false}, preparation_status: 'confirmed'};
  queue = fixture(); detailCalls = []; queueCalls = []; globalThis.__detailCaptures = [];
  detailReader = async () => detail; queueReader = async () => queue;
  globalThis.__detailRead = (...args) => {detailCalls.push(args); return detailReader(...args);};
  globalThis.__detailQueueRead = (...args) => {queueCalls.push(args); return queueReader(...args);};
});
afterEach(cleanup);
const show = async (props = {}) => {let view; await act(async () => {view = render(React.createElement(AssessmentDetail, {assessmentId: ID, ...props}));}); return view;};
const click = async name => {await act(async () => {fireEvent.click(screen.getByRole('button', {name, exact: true}));});};
const advance = async (t, milliseconds = QUEUE_POLL_MS) => {await act(async () => {t.mock.timers.tick(milliseconds);});};
const stage = () => document.querySelector('[data-assessment-stage]')?.textContent;

test('public detail retains recorded bibliography owner timestamp zero jobs and published navigation', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); detail.paper.published = true; await show({jobId: OTHER});
  assert.ok(screen.getByRole('heading', {name: 'Retained paper title'})); assert.ok(screen.getByText('Jane Doe, María José')); assert.ok(screen.getByText('Initiated by: Verified Owner'));
  assert.equal(document.querySelector('time').getAttribute('datetime'), STAMP); assert.ok(screen.getByText('Published assessment'));
  assert.equal(screen.getByRole('link', {name: 'Back to assessments'}).getAttribute('href'), '/research-verification/assessments');
  assert.equal(screen.getByRole('button', {name: 'Read published assessment'}).getAttribute('href'), '/research-verification/assessments/' + ID);
  assert.equal(stage(), 'Awaiting next stage'); assert.ok(screen.getByText('0 of 0 finished')); assert.equal(last('PublicExperimentQueue').data, queue); assert.equal(last('PublicExperimentQueue').jobId, OTHER);
  assert.equal(detailCalls.length, 1); await advance(t, QUEUE_POLL_MS - 1); assert.equal(detailCalls.length, 1); await advance(t, 1); assert.equal(detailCalls.length, 2); assert.equal(queueCalls.length, 2);
});

test('a ready first-phase assessment links to owner selection without inventing a completed assessment', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); detail.preparation_status = 'ready'; detail.paper.authors = null; detail.paper.initiated_by = null;
  queue.autonomy.workflows = []; queue.autonomy.coverage.workflows = 0;
  await show(); assert.equal(stage(), 'Ready for review'); assert.ok(screen.getByText('Authors unavailable')); assert.ok(screen.getByText('Initiated by: Name unavailable')); assert.ok(screen.getByText('Not published'));
  assert.equal(screen.getByRole('button', {name: 'Choose central claims and testable findings'}).getAttribute('href'), '/research-verification/new-assessment/' + ID);
  assert.equal(screen.queryByRole('button', {name: 'Read published assessment'}), null); assert.ok(screen.getAllByText('Not recorded').length > 0);
});
test('a historical paper without a workflow does not invent a status badge',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});detail.paper.workflow_status=null;detail.preparation_status=null;queue.autonomy.workflows=[];queue.autonomy.coverage.workflows=0;await show();assert.equal(document.querySelectorAll('[data-slot="badge"]').length,1);assert.ok(screen.getByText('Not published'));
});

test('claim progress sorts preparation first and preserves findings while expanding only on request', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const tasks = Array.from({length: 23}, (_, index) => ({id: uid(index + 1), study_id: ID, claim_id: uid(index + 101), claim_title: 'Claim ' + (index + 1), stage: index === 0 ? 'assessment' : 'building', status: index === 0 ? 'finished' : 'blocked', label: 'inconclusive', attempts: 0, reason: 'Original recorded state', created_at: STAMP, updated_at: STAMP}));
  tasks.push(...[24, 25].map(index => ({id: uid(index), study_id: ID, claim_id: null, claim_title: null, stage: 'intake', status: 'finished', label: null, attempts: 0, reason: 'Original preparation', created_at: STAMP, updated_at: index === 25 ? '2026-11-07T00:01:00Z' : STAMP})));
  queue.autonomy.tasks = tasks.reverse(); queue.autonomy.coverage.tasks = tasks.length; const original = structuredClone(queue);
  await show(); let rows = within(screen.getByRole('table')).getAllByRole('row'); assert.equal(rows.length, 21); assert.match(rows[1].textContent, /^Paper preparation/); assert.match(rows[2].textContent, /^Paper preparation/);
  assert.match(rows[3].textContent, /^Claim 1/); assert.ok(screen.getByText('1 of 23 finished')); assert.ok(screen.getAllByText('inconclusive').length > 0);
  await click('Show more claims'); rows = within(screen.getByRole('table')).getAllByRole('row'); assert.equal(rows.length, 26); assert.equal(screen.queryByRole('button', {name: 'Show more claims'}), null); assert.deepEqual(queue, original);
  assert.equal(captures('SharedAssessmentRecords').length, 0); await click('View assessment records'); assert.equal(last('SharedAssessmentRecords').studyId, ID); assert.equal(screen.getByRole('button', {name: 'Hide assessment records'}).getAttribute('aria-expanded'), 'true');
  await click('Hide assessment records'); assert.equal(document.querySelector('[data-boundary="SharedAssessmentRecords"]'), null);
});

test('deferred reads retain explicit loading state and unrecorded values until their own responses arrive', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); const metadata = deferred(), progress = deferred(); detailReader = () => metadata.promise; queueReader = () => progress.promise;
  detail.preparation_status = null; const view = await show(); assert.ok(screen.getByRole('status', {name: ''})); assert.ok(screen.getByRole('heading', {name: 'Loading assessment…'}));
  await act(async () => {metadata.resolve(detail);}); assert.equal(stage(), 'Loading…'); assert.ok(screen.getByText('Unknown')); assert.equal(last('PublicExperimentQueue').data, null);
  await act(async () => {progress.resolve(queue);}); assert.equal(stage(), 'Awaiting next stage'); assert.equal(last('PublicExperimentQueue').error, '');
  view.unmount(); assert.ok(detailCalls[0][1].aborted); assert.ok(queueCalls[0][1].aborted); const count = detailCalls.length; await advance(t, QUEUE_POLL_MS * 3); assert.equal(detailCalls.length, count);
});

test('a failed status refresh retains prior details with a stale warning and retries both independent reads', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); await show(); detailReader = async () => {throw new Error('Synthetic catalog interruption');}; queueReader = async () => {throw new Error('Synthetic queue interruption');}; await advance(t);
  assert.ok(screen.getByRole('heading', {name: 'Retained paper title'})); assert.match(screen.getByRole('alert').textContent, /Previously retrieved details may be stale/); assert.equal(last('PublicExperimentQueue').error, 'Synthetic queue interruption');
  const signal = detailCalls.at(-1)[1]; detailReader = async () => detail; queueReader = async () => queue; await click('Retry status'); assert.equal(signal.aborted, true); assert.equal(screen.queryByRole('alert'), null); assert.equal(last('PublicExperimentQueue').error, '');
});

test('initial failures retain unknown stage and useful bounded messages without an empty successful status', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); detail.preparation_status = null; queueReader = async () => {throw 'Unstructured queue failure';}; await show(); assert.equal(stage(), 'Unknown'); assert.equal(last('PublicExperimentQueue').error, 'Assessment progress is unavailable.');
  cleanup(); detailReader = async () => {throw 'Unstructured catalog failure';}; await show(); assert.ok(screen.getByRole('heading', {name: 'Paper title unavailable'})); assert.match(screen.getByRole('alert').textContent, /Assessment details are unavailable/); assert.equal(screen.queryByRole('region', {name: 'Assessment status'}), null);
  cleanup(); detailReader = async () => {throw new Error('Recorded metadata failure');}; queueReader = async () => queue; await show(); assert.ok(screen.getByRole('heading', {name: 'Queue source title'})); assert.equal(stage(), 'Awaiting next stage'); assert.ok(screen.getByRole('alert'));
  cleanup(); detailReader = async () => ({...detail, paper: {...detail.paper, title: null}}); await show(); assert.ok(screen.getByRole('heading', {name: 'Queue source title'}));
});

test('late metadata and progress from an abandoned identity cannot overwrite the current assessment', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); const oldDetail = deferred(), oldQueue = deferred();
  detailReader = id => id === ID ? oldDetail.promise : Promise.resolve({...detail, paper: {...detail.paper, id: OTHER, title: 'Current assessment'}});
  queueReader = id => id === ID ? oldQueue.promise : Promise.resolve({...queue, study: {...queue.study, id: OTHER}, autonomy: {...queue.autonomy, workflows: [] , coverage: {workflows: 0, tasks: 0}}});
  const view = await show(); const signals = [detailCalls[0][1], queueCalls[0][1]];
  await act(async () => {view.rerender(React.createElement(AssessmentDetail, {assessmentId: OTHER, gapId: ID, launchId: OTHER}));});
  assert.ok(signals.every(signal => signal.aborted)); assert.ok(screen.getByRole('heading', {name: 'Current assessment'})); assert.deepEqual(last('AssessmentGapExperiments'), {studyId: OTHER, gapId: ID, launchId: OTHER});
  await act(async () => {oldDetail.resolve(detail); oldQueue.resolve(queue);}); assert.ok(screen.getByRole('heading', {name: 'Current assessment'})); assert.equal(last('PublicExperimentQueue').studyId, OTHER);
});

test('late failures after unmount create no stale alert or new status poll', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); const metadata = deferred(), progress = deferred(); detailReader = () => metadata.promise; queueReader = () => progress.promise;
  const view = await show(); view.unmount(); await act(async () => {metadata.reject(new Error('Abandoned metadata error')); progress.reject(new Error('Abandoned progress error'));});
  await advance(t, QUEUE_POLL_MS * 3); assert.equal(detailCalls.length, 1); assert.equal(queueCalls.length, 1); assert.equal(screen.queryByRole('alert'), null);
});
