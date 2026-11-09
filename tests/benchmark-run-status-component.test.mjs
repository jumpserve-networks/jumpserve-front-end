import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {PUBLIC_BENCHMARK_COLUMNS} from '../lib/benchmark-progress.ts';

globalThis.__runStatusReact = React;
const replacements = {
  'next/link': "export default function Link(props){return globalThis.__runStatusReact.createElement('a',props);}",
  '@/app/components/user-preferences': "export function useDateTime(){return value=>'Recorded: '+value;}",
  '@/lib/supabase/client': "export function createClient(){return globalThis.__runStatusClient;}",
  '@/lib/browser-auth': "export const requireAccessToken=()=>globalThis.__runStatusToken();",
  '@/lib/benchmark-api': "export const getBenchmarkLogs=(...args)=>globalThis.__runStatusLogs(...args); export const cancelBenchmark=(...args)=>globalThis.__runStatusCancel(...args);",
};
const hook = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {BenchmarkRunStatus} = await import('../app/components/benchmark-run-status.tsx'); hook.deregister();
let queries, logCalls, cancelCalls, tokenCalls, poll, logs, cancel;
const initialJob = (change = {}) => ({id: 'synthetic-job', status: 'running', created_at: '2026-11-01T00:00:00Z', error_message: null, ec2_instance_id: null, parent_run_id: null,
  config: {experiment_name: 'Synthetic networking run', num_clients: 2, client_ccas: ['bbr', 'cubic'], client_delays_ms: [0, 10], bottleneck_all_client_rate_mbit: 80, script: 'netem_nines.py'}, ...change});
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
beforeEach(() => {
  queries = []; logCalls = []; cancelCalls = []; tokenCalls = 0;
  poll = async () => ({data: initialJob(), error: null}); logs = async () => []; cancel = async () => ({status: 'cancelled'});
  globalThis.__runStatusClient = {from(table) {const query = {table}; queries.push(query); const chain = {select(columns) {query.columns = columns; return chain;}, eq(column, value) {query[column] = value; return chain;}, abortSignal(signal) {query.signal = signal; return chain;}, maybeSingle() {return poll(query);}}; return chain;}};
  globalThis.__runStatusLogs = (...args) => {logCalls.push(args); return logs(...args);};
  globalThis.__runStatusToken = async () => {tokenCalls++; return 'synthetic-verified-session';};
  globalThis.__runStatusCancel = (...args) => {cancelCalls.push(args); return cancel(...args);};
});
afterEach(cleanup);
const show = async (job = initialJob(), canManage = false) => {let view; await act(async () => {view = render(React.createElement(BenchmarkRunStatus, {initialJob: job, canManage}));}); return view;};
const advance = async (t, ms = 5000) => {await act(async () => {t.mock.timers.tick(ms);});};
const click = async name => {await act(async () => {fireEvent.click(screen.getByRole('button', {name, exact: true}));});};

test('public progress shows recorded configuration and polls only explicit public columns after five seconds', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); await show();
  assert.ok(screen.getByRole('heading', {name: 'Synthetic networking run'})); assert.ok(screen.getByText('Recorded: 2026-11-01T00:00:00Z')); assert.ok(screen.getByText('2 (bbr, cubic)')); assert.ok(screen.getByText('0, 10 ms')); assert.ok(screen.getByText('80 Mbit/s')); assert.ok(screen.getByText('Awaiting instance assignment')); assert.equal(screen.queryByRole('button', {name: 'Cancel benchmark'}), null);
  assert.equal(screen.getByLabelText('Benchmark log output').textContent, 'Waiting for the instance to send its first logs…'); assert.equal(queries.length, 0); await advance(t, 4999); assert.equal(queries.length, 0); await advance(t, 1);
  assert.equal(queries.length, 1); assert.equal(queries[0].table, 'benchmark_jobs'); assert.equal(queries[0].columns, PUBLIC_BENCHMARK_COLUMNS); assert.equal(queries[0].id, 'synthetic-job'); assert.ok(queries[0].signal instanceof AbortSignal);
});

test('completed runs link only recorded results and allow six late log reads then stop polling', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); logs = async () => [{message: '<original-log>'}, {message: 'Original final result'}];
  const job = initialJob({status: 'completed', parent_run_id: 42, ec2_instance_id: 'i-synthetic'}); job.config = {...job.config, script: 'netem_multi_bottleneck.py', topology: 'dumbbell', bottleneck_rates_mbit: [80, 0]}; await show(job, true);
  assert.equal(screen.getByRole('button', {name: 'View results'}).getAttribute('href'), '/congestion-control-emulated/parent-run/42'); assert.equal(screen.getByRole('button', {name: 'Configure another benchmark'}).getAttribute('href'), '/congestion-control-emulated/benchmarks'); assert.equal(screen.getByLabelText('Benchmark log output').textContent, '<original-log>\nOriginal final result'); assert.ok(screen.getByText('80 / 0 Mbit/s')); assert.ok(screen.getByText('dumbbell')); assert.equal(screen.queryByRole('button', {name: 'Cancel benchmark'}), null);
  for (let tick = 0; tick < 8; tick++) await advance(t);
  assert.equal(logCalls.length, 7); assert.equal(queries.length, 0); await click('Refresh logs'); assert.equal(logCalls.length, 8);
});

test('failed unknown-phase and missing-result runs retain honest step states and empty-log messages', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  for (const [status, error] of [['failed', 'Benchmark failed during running (exit 1)'], ['cancelled', null], ['completed', null]]) {
    const job = initialJob({status, error_message: error}); job.config = {...job.config, experiment_name: '', script: ''}; const view = await show(job);
    assert.ok(screen.getByRole('heading', {name: 'Run progress'})); assert.ok(screen.getByText('Default script')); assert.equal(screen.getByLabelText('Benchmark log output').textContent, 'No log entries are available for this run.'); assert.equal(screen.queryByRole('button', {name: 'View results'}), null);
    const steps = screen.getByRole('list', {name: 'Benchmark steps'});
    if (status === 'failed') {assert.ok(screen.getByRole('alert', {name: ''})); assert.ok(within(steps).getByText('Failed'));}
    if (status === 'cancelled') assert.equal(within(steps).getAllByText('Unconfirmed').length, 4);
    if (status === 'completed') assert.ok(within(steps).getByText('No results link was reported. Review the run logs for details.'));
    view.unmount();
  }
});

test('missing multibottleneck topology stays unrecorded instead of inventing a rate', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); const job = initialJob({status: 'terminated'}); job.config = {...job.config, script: 'netem_multi_bottleneck.py'}; await show(job);
  assert.ok(screen.getByText('Not recorded')); assert.ok(screen.getByText('Not recorded Mbit/s')); assert.equal(queries.length, 0);
});

test('status read failures preserve the last known state and clear after the next successful poll', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); await show();
  for (const result of [{data: null, error: {message: 'Synthetic database interruption'}}, {data: null, error: null}, 'non-Error rejection']) {
    poll = async () => {if (typeof result === 'string') throw result; return result;}; await advance(t); assert.match(screen.getByRole('alert').textContent, /Status updates interrupted/); assert.ok(screen.getByText('running', {exact: true}));
  }
  poll = async () => ({data: initialJob({status: 'completed', parent_run_id: 44}), error: null}); await advance(t); assert.equal(screen.queryByRole('alert'), null); assert.equal(screen.getByRole('button', {name: 'View results'}).getAttribute('href'), '/congestion-control-emulated/parent-run/44'); const count = queries.length; await advance(t); assert.equal(queries.length, count);
});

test('cancel requires an explicit confirmation and a verified session then clears the active polling state', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); await show(initialJob(), true); await click('Cancel benchmark'); assert.ok(screen.getByText('Cancel this benchmark and terminate its EC2 instance?')); assert.deepEqual(cancelCalls, []); await click('Keep running'); assert.equal(screen.queryByRole('button', {name: 'Confirm cancellation'}), null);
  const pending = deferred(); cancel = () => pending.promise; await click('Cancel benchmark'); await click('Confirm cancellation'); assert.equal(screen.getByRole('button', {name: 'Cancelling…'}).disabled, true); assert.equal(screen.getByRole('button', {name: 'Keep running'}).disabled, true); assert.deepEqual(cancelCalls, [['synthetic-job', 'synthetic-verified-session']]); assert.equal(tokenCalls, 1);
  await act(async () => {pending.resolve({status: 'cancelled'});}); assert.ok(screen.getByText('cancelled', {exact: true})); assert.equal(screen.queryByRole('button', {name: 'Keep running'}), null); const count = queries.length; await advance(t); assert.equal(queries.length, count);
});

test('a poll already in progress cannot restore active status after cancellation', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); const pending = deferred(); poll = () => pending.promise; await show(initialJob(), true); await advance(t); await click('Cancel benchmark'); await click('Confirm cancellation'); assert.ok(screen.getByText('cancelled', {exact: true})); assert.equal(queries[0].signal.aborted, true);
  await act(async () => {pending.resolve({data: initialJob({status: 'running'}), error: null});}); assert.ok(screen.getByText('cancelled', {exact: true}));
});

test('concurrently delivered cancellation and stale poll preserve the terminal result through React batching', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); const pendingPoll = deferred(), pendingCancel = deferred(); poll = () => pendingPoll.promise; cancel = () => pendingCancel.promise;
  await show(initialJob(), true); await advance(t); await click('Cancel benchmark'); await click('Confirm cancellation');
  await act(async () => {pendingCancel.resolve({status: 'cancelled'}); await Promise.resolve(); pendingPoll.resolve({data: initialJob({status: 'running'}), error: null});});
  assert.ok(screen.getByText('cancelled', {exact: true})); assert.equal(screen.queryByRole('button', {name: 'Cancel benchmark'}), null);
});

test('cancel failures keep the confirmation available and never label the run cancelled', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); await show(initialJob(), true); await click('Cancel benchmark');
  for (const error of [new Error('Synthetic cancellation failure'), 'non-Error rejection']) {
    cancel = async () => {throw error;}; await click('Confirm cancellation'); assert.match(screen.getByRole('alert').textContent, /Synthetic cancellation failure|Unable to cancel/); assert.equal(screen.getByRole('button', {name: 'Confirm cancellation'}).disabled, false); assert.ok(screen.getByText('running', {exact: true}));
  }
});

test('log failures preserve original text and manual refresh retries the same job', async t => {
  t.mock.timers.enable({apis: ['setTimeout']}); logs = async () => {throw new Error('Synthetic log retrieval failure');}; await show(); assert.ok(screen.getByRole('alert')); await click('Refresh logs'); assert.equal(logCalls.length, 2);
  logs = async () => [{message: 'Retained original log'}]; await click('Refresh logs'); assert.equal(screen.queryByRole('alert'), null); assert.equal(screen.getByLabelText('Benchmark log output').textContent, 'Retained original log'); logs = async () => {throw 'non-Error rejection';}; await advance(t); assert.equal(screen.getByRole('alert').textContent, 'Unable to load benchmark logs.'); assert.equal(screen.getByLabelText('Benchmark log output').textContent, 'Retained original log'); assert.ok(logCalls.every(([id]) => id === 'synthetic-job'));
});

test('unmount aborts pending status and log reads and ignores either late success or late failure', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  for (const fail of [false, true]) {
    const pendingLog = deferred(), pendingPoll = deferred(); logs = () => pendingLog.promise; poll = () => pendingPoll.promise; const view = await show(); assert.equal(screen.getByLabelText('Benchmark log output').getAttribute('aria-busy'), 'true'); assert.equal(screen.getByLabelText('Benchmark log output').textContent, 'Loading logs…'); await advance(t); const query = queries.at(-1), [, signal] = logCalls.at(-1); view.unmount(); assert.equal(query.signal.aborted, true); assert.equal(signal.aborted, true);
    await act(async () => {if (fail) {pendingLog.reject(new Error('Late log failure')); pendingPoll.reject(new Error('Late status failure'));} else {pendingLog.resolve([{message: 'Late log'}]); pendingPoll.resolve({data: initialJob(), error: null});}}); assert.equal(screen.queryByRole('alert'), null);
  }
});
