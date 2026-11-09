import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

const hook = registerHooks({resolve(specifier, context, next) {
  return specifier === '@/lib/research-workflow-api' ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent('export const researchRequest=(...args)=>globalThis.__preparationUnit.request(...args);')} : next(specifier, context);
}});
const {PaperPreparation} = await import('../app/components/research-workflow/paper-preparation.tsx');
hook.deregister();
let state;
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const status = () => ({version: 'research-preparation-v1', available_plan: {plan_id: 'available-v1', title: 'Source-bound checks', claims: 2, automatic_jobs: 1, manual_jobs: 0, provenance: {limitations: 'Arithmetic consistency only.'}}, prepared: [], uploaded_plan_bytes: 500000, limitation: 'Synthetic development fixture'});
const prepared = () => ({id: 'retained-plan', plan_id: 'retained-v1', manifest_sha256: 'a'.repeat(64),
  jobs: [{id: 'original-job', campaign_id: 'original-campaign', title: 'Original arithmetic check', execution_mode: 'automatic', status: 'not-queued'}],
  planned_jobs: 1, queued_jobs: 0, automatic_jobs: 1, manual_jobs: 0, status: 'prepared', provenance: {}});
const actionCalls = action => state.calls.filter(call => call.options?.body && JSON.parse(call.options.body).action === action);
const show = (studyId = 'synthetic-study') => render(React.createElement(PaperPreparation, {studyId, onSaved: async () => {state.saved++; if (state.savedFailure) throw state.savedFailure;}}));
const start = () => screen.getByRole('button', {name: /Prepare (available checks|uploaded plan) and queue/});
const ready = () => screen.findByText(/Source-bound checks: 2 claims/);
beforeEach(() => {
  state = {calls: [], saved: 0, summary: status(), plan: prepared(),
    handle: async (_path, options) => {
      if (!options?.body) return structuredClone(state.summary);
      const body = JSON.parse(options.body);
      if (body.action === 'prepare') return {prepared: structuredClone(state.plan)};
      if (body.action === 'enqueue') return {job: {...state.plan.jobs[0], study_id: 'synthetic-study', status: 'queued'}};
      throw new Error('Unexpected preparation action');
    },
    request: async (path, options) => {state.calls.push({path, options}); return state.handle(path, options);},
  };
  globalThis.__preparationUnit = state;
});
afterEach(cleanup);
function upload(raw, name = 'source-plan.json') {
  const bytes = typeof raw === 'string' ? new TextEncoder().encode(raw) : raw;
  fireEvent.change(screen.getByLabelText('Preparation plan JSON'), {target: {files: [{name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)}]}});
}

test('available preparation shows actual scope and queues each preserved job before notifying the workspace', async () => {
  show(); assert.ok(screen.getByText('Loading preparation availability…')); await ready();
  assert.ok(screen.getByText('Arithmetic consistency only.'));
  fireEvent.click(start());
  await screen.findByText(/1 numerical job definitions and 0 operator tasks preserved/);
  await waitFor(() => assert.equal(state.saved, 1));
  assert.equal(actionCalls('prepare').length, 1); assert.equal(actionCalls('enqueue').length, 1);
  const prepare = JSON.parse(actionCalls('prepare')[0].options.body);
  assert.equal(prepare.action, 'prepare'); assert.match(prepare.request_id, /^[a-f0-9-]{36}$/); assert.equal(prepare.plan_input, undefined);
  assert.deepEqual(JSON.parse(actionCalls('enqueue')[0].options.body), {action: 'enqueue', prepared_id: 'retained-plan', job_id: 'original-job'});
  assert.ok(state.calls.every(call => call.path === '/studies/synthetic-study/prepare'));
});

test('missing plans disable preparation while completed and partially queued plans retain their identities', async () => {
  state.summary.available_plan = null;
  const complete = prepared(); complete.id = 'completed-plan'; complete.plan_id = 'completed-v1'; complete.jobs[0].status = 'queued'; complete.queued_jobs = 1;
  state.summary.prepared = [prepared(), complete];
  show(); await screen.findByText(/This paper needs a source-grounded preparation plan/);
  assert.equal(start().disabled, true); assert.ok(screen.getByText('Job definitions saved.'));
  fireEvent.click(screen.getByRole('button', {name: 'Resume queueing this plan'}));
  await waitFor(() => assert.equal(state.saved, 1));
  assert.equal(actionCalls('prepare').length, 0); assert.equal(actionCalls('enqueue').length, 1);
  assert.equal(JSON.parse(actionCalls('enqueue')[0].options.body).prepared_id, 'retained-plan');
});

test('unconfirmed preparation retries use the original request identity and successful completion opens a fresh identity', async () => {
  const ordinary = state.handle; let attempts = 0;
  state.handle = async (path, options) => {
    if (options?.body && JSON.parse(options.body).action === 'prepare' && attempts++ === 0) throw new Error('Synthetic submission unconfirmed');
    return ordinary(path, options);
  };
  show(); await ready(); fireEvent.click(start());
  await screen.findByRole('alert'); assert.match(screen.getByRole('alert').textContent, /Synthetic submission unconfirmed.*Previously saved records and jobs remain preserved/);
  fireEvent.click(start()); await waitFor(() => assert.equal(state.saved, 2));
  const identities = actionCalls('prepare').map(call => JSON.parse(call.options.body).request_id);
  assert.equal(identities.length, 2); assert.equal(identities[0], identities[1]);
  fireEvent.click(start()); await waitFor(() => assert.equal(state.saved, 3));
  assert.notEqual(JSON.parse(actionCalls('prepare')[2].options.body).request_id, identities[0]);
});

test('simultaneous start events cannot create duplicate preparation requests', async () => {
  const pending = deferred(); const ordinary = state.handle;
  state.handle = (path, options) => options?.method === 'POST' ? pending.promise : ordinary(path, options);
  show(); await ready(); const button = start();
  await act(async () => {button.click(); button.click();});
  assert.equal(actionCalls('prepare').length, 1);
  assert.equal(screen.getByLabelText('Preparation plan JSON').disabled, true);
  await act(async () => pending.reject(new Error('Synthetic acknowledgement unavailable')));
  await screen.findByRole('alert');
  assert.equal(start().disabled, false);
});

test('initial capability errors and malformed status remain explicit without enabling preparation', async () => {
  for (const failure of [new Error('Synthetic status unavailable'), 'unstructured']) {
    state.handle = async () => {throw failure;}; show();
    const alert = await screen.findByRole('alert');
    assert.match(alert.textContent, failure instanceof Error ? /Synthetic status unavailable/ : /Preparation is unavailable/);
    assert.equal(screen.queryByText('Loading preparation availability…'), null); cleanup();
  }
  state.handle = async () => ({}); show();
  assert.match((await screen.findByRole('alert')).textContent, /Preparation status is incomplete/);
});

test('unmount and assessment changes abort old status reads and ignore late outcomes', async () => {
  for (const succeeds of [true, false]) {
    const pending = deferred(); state.handle = () => pending.promise;
    const view = show(); const signal = state.calls.at(-1).options.signal; view.unmount();
    assert.equal(signal.aborted, true);
    await act(async () => {if (succeeds) pending.resolve(status()); else pending.reject(new Error('Late unavailable status'));});
    assert.equal(screen.queryByRole('alert'), null);
  }
});

test('uploaded plan preserves exact UTF-8 whitespace and source text in the queued request', async () => {
  show(); await ready();
  const original = ' {\n "paper":"Ω 東京", "zero":0, "missing":null\n}\n'; upload(original);
  await screen.findByText(/Plan selected: source-plan.json/);
  fireEvent.click(start()); await waitFor(() => assert.equal(state.saved, 1));
  assert.equal(JSON.parse(actionCalls('prepare')[0].options.body).plan_input, original);
});

test('invalid files and oversized original or encoded requests never reach preparation', async () => {
  show(); await ready();
  fireEvent.change(screen.getByLabelText('Preparation plan JSON'), {target: {files: []}});
  assert.equal(screen.queryByRole('alert'), null);
  for (const [raw, expected] of [
    ['x'.repeat(500001), /upload byte limit/],
    ['{', /JSON|property name/],
    [new Uint8Array([0xff]), /encoded data|encoding/i],
    [JSON.stringify({text: '"'.repeat(130000)}), /Encoded preparation request exceeds/],
  ]) {
    upload(raw); await screen.findByRole('alert');
    await waitFor(() => assert.match(screen.getByRole('alert').textContent, expected));
    assert.equal(start().textContent, 'Prepare available checks and queue jobs');
  }
  assert.equal(actionCalls('prepare').length, 0);
});

test('file read failures preserve diagnostics without treating an invalid file as a selected plan', async () => {
  show(); await ready();
  for (const failure of [new Error('Synthetic original file read failed'), 'unstructured']) {
    fireEvent.change(screen.getByLabelText('Preparation plan JSON'), {target: {files: [{name: 'source-plan.json', size: 4, arrayBuffer: async () => {throw failure;}}]}});
    await waitFor(() => assert.equal(screen.getByRole('alert').textContent, failure instanceof Error ? failure.message : 'Invalid preparation plan.'));
  }
});

test('refresh failures and recovery preserve the original preparation error and update verified availability', async () => {
  show(); await ready();
  for (const failure of [new Error('Synthetic refresh unavailable'), 'unstructured']) {
    state.handle = async () => {throw failure;};
    fireEvent.click(screen.getByRole('button', {name: 'Refresh preparation status'}));
    await waitFor(() => assert.equal(screen.getByRole('alert').textContent, failure instanceof Error ? failure.message : 'Preparation status is unavailable.'));
  }
  state.handle = async () => ({...status(), available_plan: {...status().available_plan, provenance: {}}});
  fireEvent.click(screen.getByRole('button', {name: 'Refresh preparation status'}));
  await screen.findByText('Review the plan’s original scope before starting.');
  assert.equal(screen.queryByRole('alert'), null);
  state.handle = async (_path, options) => {if (options?.method === 'POST') throw 'unstructured'; throw new Error('Synthetic recovery refresh also unavailable');};
  fireEvent.click(start()); await screen.findByRole('alert');
  assert.match(screen.getByRole('alert').textContent, /^Preparation paused\. Previously saved records/);
  assert.doesNotMatch(screen.getByRole('alert').textContent, /recovery refresh also unavailable/);
});
