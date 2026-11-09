import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {render, screen, fireEvent, waitFor, cleanup} from '@testing-library/react';

const hook = registerHooks({resolve(specifier, context, next) {
  if (specifier === '@/lib/research-workflow-api') return {shortCircuit: true, url: 'data:text/javascript,export const researchRequest=(...args)=>globalThis.__cancelRequest(...args);'};
  return next(specifier, context);
}});
const {NetworkJobCancel} = await import('../app/components/research-workflow/network-job-cancel.tsx');
hook.deregister();
afterEach(() => {cleanup(); delete globalThis.__cancelRequest;});

function form(onSaved = async () => {}) {
  const result = render(React.createElement(NetworkJobCancel, {studyId: 'study', jobId: 'job', onSaved}));
  fireEvent.click(screen.getByText('Cancel running networking experiment'));
  return {...result, reason: screen.getByLabelText('Networking cancellation reason'), button: screen.getByRole('button', {name: 'Request networking cancellation'})};
}

test('cancellation is disabled without a reason and preserves input during a pending request', async () => {
  let complete, saved = 0;
  const requests = [];
  globalThis.__cancelRequest = (path, options) => {requests.push({path, options}); return new Promise(resolve => {complete = resolve;});};
  const {reason, button} = form(async () => {saved++;});
  assert.equal(button.disabled, true);
  fireEvent.change(reason, {target: {value: '  '}});
  assert.equal(button.disabled, true);
  fireEvent.change(reason, {target: {value: 'Stop this experiment'}});
  assert.equal(button.disabled, false);
  fireEvent.click(button);
  assert.equal(reason.disabled, true);
  assert.equal(button.disabled, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/studies/study/network');
  assert.equal(requests[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].options.body), {action: 'cancel', request_id: JSON.parse(requests[0].options.body).request_id, job_id: 'job', reason: 'Stop this experiment'});
  assert.match(JSON.parse(requests[0].options.body).request_id, /^[a-f0-9-]{36}$/);
  complete({});
  await waitFor(() => assert.match(screen.getByRole('status').textContent, /Cancellation recorded/));
  assert.equal(saved, 1);
  assert.equal(reason.value, 'Stop this experiment');
  assert.equal(button.disabled, false);
});

test('uncertain retries retain the request identity; editing the reason starts a new request', async () => {
  const requests = [];
  let saved = 0;
  globalThis.__cancelRequest = async (_path, options) => {requests.push(JSON.parse(options.body)); throw new Error('Not confirmed');};
  const {reason, button} = form(async () => {saved++;});
  fireEvent.change(reason, {target: {value: 'Stop'}});
  fireEvent.click(button);
  await waitFor(() => assert.equal(screen.getByRole('status').textContent, 'Not confirmed'));
  fireEvent.click(button);
  await waitFor(() => assert.equal(button.disabled, false));
  assert.equal(requests.length, 2);
  assert.equal(requests[0].request_id, requests[1].request_id);
  fireEvent.change(reason, {target: {value: 'Stop for a different reason'}});
  fireEvent.click(button);
  await waitFor(() => assert.equal(button.disabled, false));
  assert.notEqual(requests[2].request_id, requests[0].request_id);
  assert.equal(saved, 0);
});

test('untyped failures keep an honest unconfirmed state and permit retry', async () => {
  globalThis.__cancelRequest = async () => {throw null;};
  const {reason, button} = form();
  fireEvent.change(reason, {target: {value: 'Stop'}});
  fireEvent.click(button);
  await waitFor(() => assert.match(screen.getByRole('status').textContent, /Cancellation was not confirmed/));
  assert.equal(button.disabled, false);
});
