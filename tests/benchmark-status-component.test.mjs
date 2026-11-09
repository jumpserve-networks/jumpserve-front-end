import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {PUBLIC_BENCHMARK_COLUMNS} from '../lib/benchmark-progress.ts';

globalThis.__statusReact = React;
const replacements = {
  'next/link': 'export default function Link({children,...props}){return globalThis.__statusReact.createElement("a",props,children);}',
  '@/app/components/user-preferences': 'export const LocalDateTime=({value})=>globalThis.__statusReact.createElement("time",{dateTime:value},"Recorded: "+value);',
  '@/lib/supabase/client': 'export const createClient=()=>globalThis.__statusClient;',
  '@/lib/browser-auth': 'export const requireAccessToken=(...args)=>globalThis.__statusToken(...args);',
  '@/lib/benchmark-api': 'export const cancelBenchmark=(...args)=>globalThis.__statusCancel(...args);',
};
const hooks = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {BenchmarkStatus,ProgressBar} = await import('../app/components/benchmark-status.tsx'); hooks.deregister();
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
test('unknown lifecycle states do not render an invented progress bar',()=>{
 render(React.createElement(ProgressBar,{status:'future-phase'}));assert.equal(document.body.textContent,'');assert.equal(document.querySelector('.animate-pulse'),null);
});
const originalApi = process.env.NEXT_PUBLIC_BENCHMARK_API_URL;
const realSetInterval = globalThis.setInterval, realClearInterval = globalThis.clearInterval;
const job = (changes = {}) => ({id: 'synthetic-job', created_at: '2026-11-07T00:00:00Z', status: 'pending', config: {num_clients: 2, client_ccas: ['cubic', 'cubic'], client_delays_ms: [0, 10], bottleneck_all_client_rate_mbit: 80}, ec2_instance_id: null, parent_run_id: null, error_message: null, requested_by: 'private-contact@example.invalid', ...changes});
let jobs, query, queries, count, channels, removed, intervals, apiCalls, api, token, tokenCalls, cancel, cancellations, view;
beforeEach(t => {
  jobs = []; count = 0; queries = []; channels = []; removed = []; intervals = new Map(); apiCalls = []; tokenCalls = 0; cancellations = []; view = null;
  query = async () => ({data: structuredClone(jobs)}); api = async () => ({ok: true, json: async () => ({events: []})}); token = async () => 'synthetic-verified-session'; cancel = async () => ({});
  process.env.NEXT_PUBLIC_BENCHMARK_API_URL = 'https://benchmark-api.example.invalid';
  t.mock.method(globalThis, 'setInterval', (callback, ms, ...args) => {if (ms !== 5000) return realSetInterval(callback, ms, ...args); const id = Symbol('poll'); intervals.set(id, callback); return id;}); t.mock.method(globalThis, 'clearInterval', id => intervals.has(id) ? intervals.delete(id) : realClearInterval(id));
  t.mock.method(globalThis, 'fetch', (...args) => {apiCalls.push(args); return api(...args);});
  globalThis.__statusToken = (...args) => {tokenCalls++; return token(...args);}; globalThis.__statusCancel = (...args) => {cancellations.push(args); return cancel(...args);};
  globalThis.__statusClient = {
    from(table) {return {select(columns, options) {
      queries.push({table, columns, options});
      if (table === 'emulated_snapshot_stats') return Promise.resolve({count});
      assert.equal(table, 'benchmark_jobs'); return {order(column, options) {assert.equal(column, 'created_at'); assert.deepEqual(options, {ascending: false}); return {limit(limit) {assert.equal(limit, 20); return query();}};}};
    }};},
    channel(name) {const channel = {name, callback: null, on(type, filter, callback) {assert.equal(type, 'postgres_changes'); assert.deepEqual(filter, {event: 'INSERT', schema: 'public', table: 'emulated_snapshot_stats'}); this.callback = callback; return this;}, subscribe() {return this;}}; channels.push(channel); return channel;},
    removeChannel(channel) {removed.push(channel);},
  };
});
afterEach(() => {cleanup(); if (originalApi === undefined) delete process.env.NEXT_PUBLIC_BENCHMARK_API_URL; else process.env.NEXT_PUBLIC_BENCHMARK_API_URL = originalApi;});
const show = async (canManage = false) => {await act(async () => {view = render(React.createElement(BenchmarkStatus, {canManage}));});};
const click = async name => {await act(async () => {fireEvent.click(screen.getByRole('button', {name, exact: true}));});};
const poll = async () => {await act(async () => {for (const callback of [...intervals.values()]) callback();});};

test('status reads use the explicit public projection and preserve the previous list across a null poll', async () => {
  query = async () => ({data: null}); await show(); assert.ok(screen.getByText('No benchmark jobs yet. Run one above!')); assert.deepEqual(queries, [{table: 'benchmark_jobs', columns: PUBLIC_BENCHMARK_COLUMNS, options: undefined}]);
  jobs = [job({id: 'job/with ? query'})]; query = async () => ({data: structuredClone(jobs)}); await poll(); assert.ok(screen.getByText('2 clients | cubic | 0,10ms | 80 Mbit')); assert.equal(screen.getByRole('link', {name: 'View progress'}).getAttribute('href'), '/congestion-control-emulated/benchmarks/job%2Fwith%20%3F%20query'); assert.ok(screen.getByText('Recorded: 2026-11-07T00:00:00Z')); assert.equal(screen.queryByText('private-contact@example.invalid'), null); assert.equal(screen.queryByRole('button', {name: 'Cancel'}), null);
  query = async () => ({data: null}); await poll(); assert.ok(screen.getByRole('link', {name: 'View progress'})); view.unmount(); assert.equal(intervals.size, 0);
});

test('an unmounted loading view ignores the original late response and clears polling', async () => {
  const pending = deferred(); query = () => pending.promise; view = render(React.createElement(BenchmarkStatus)); assert.ok(screen.getByText('Loading jobs...')); view.unmount(); assert.equal(intervals.size, 0); await act(async () => pending.resolve({data: [job()]})); assert.equal(document.body.textContent, '');
});

test('recorded lifecycle statuses control progress, log availability, cancellation and final result routes', async () => {
  const statuses = ['pending', 'launching', 'installing', 'cloning', 'running', 'completed', 'failed', 'terminated', 'cancelled', 'unrecognized'];
  jobs = statuses.map((status, index) => job({id: 'job-' + index, status, parent_run_id: status === 'completed' ? 42 : null, error_message: status === 'failed' ? 'Original retained launch failure' : null}));
  await show(true); assert.equal(screen.getAllByRole('link', {name: 'View progress'}).length, 10); assert.equal(screen.getAllByRole('button', {name: 'Cancel', exact: true}).length, 5); assert.equal(screen.getAllByRole('button', {name: 'Show logs'}).length, 7); assert.equal(screen.getByRole('link', {name: 'View Results'}).getAttribute('href'), '/congestion-control-emulated/parent-run/42'); assert.ok(screen.getByText('Original retained launch failure')); assert.ok(screen.getByText('unrecognized')); assert.equal(document.querySelectorAll('.animate-pulse').length, 5); assert.equal(channels.length, 1); view.unmount(); assert.deepEqual(removed, channels);
});

test('multiple-bottleneck summaries distinguish missing topology and rates from recorded zero', async () => {
  jobs = [job({id: 'missing', status: 'completed', config: {...job().config, script: 'netem_multi_bottleneck.py'}}), job({id: 'recorded', status: 'completed', parent_run_id: 0, config: {...job().config, script: 'netem_multi_bottleneck.py', topology: 'dumbbell', bottleneck_rates_mbit: [80, 0]}})]; await show(); assert.ok(screen.getByText('2 clients | cubic | 0,10ms | Topology missing | Rates missing Mbit')); assert.ok(screen.getByText('2 clients | cubic | 0,10ms | dumbbell | 80 / 0 Mbit')); assert.equal(screen.queryByRole('link', {name: 'View Results'}), null);
});

test('live metrics keep recorded zero, numeric strings and subscription cleanup', async () => {
  jobs = [job({status: 'running'})]; count = 2; await show(); assert.ok(screen.getByText('2 snapshots')); assert.equal(screen.queryByText(/Throughput:/), null); assert.equal(channels[0].name, 'benchmark-metrics-synthetic-job');
  await act(async () => channels[0].callback({new: {megabits_per_second: '0', round_trip_time_ms: '12.35'}})); assert.ok(screen.getByText('Throughput: 0.0 Mbps')); assert.ok(screen.getByText('RTT: 12.3 ms')); assert.ok(screen.getByText('3 snapshots')); view.unmount(); assert.deepEqual(removed, channels);
});

test('a null snapshot count renders no invented metric and real inserts make the first snapshot visible', async () => {
  jobs = [job({status: 'running'})]; count = null; await show(); assert.equal(screen.queryByText(/snapshots$/), null); await act(async () => channels[0].callback({new: {megabits_per_second: '7.25', round_trip_time_ms: 0}})); assert.ok(screen.getByText('1 snapshots')); assert.ok(screen.getByText('RTT: 0.0 ms'));
});

test('logs load only while expanded and keep their exact original text across unsuccessful polls', async () => {
  jobs = [job()]; await show(); assert.deepEqual(apiCalls, []); api = async () => ({ok: true, json: async () => ({events: [{timestamp: 0, message: '<original-log>\nFirst result'}]})}); await click('Show logs'); assert.ok(screen.getByText('<original-log>\nFirst result', {normalizer: value => value})); assert.equal(apiCalls[0][0], 'https://benchmark-api.example.invalid/benchmarks/logs?jobId=synthetic-job'); assert.equal(intervals.size, 2);
  for (const value of [{ok: false}, {ok: true, json: async () => ({})}, {ok: true, json: async () => ({events: []})}, Error('Synthetic transport unavailable')]) {api = async () => {if (value instanceof Error) throw value; return value;}; await poll(); assert.ok(screen.getByText('<original-log>\nFirst result', {normalizer: text => text}));}
  await click('Hide logs'); assert.equal(intervals.size, 1); assert.equal(screen.queryByText('<original-log>\nFirst result', {normalizer: value => value}), null);
});

test('an absent log API leaves the waiting state and a collapsed view ignores its late response', async () => {
  jobs = [job()]; delete process.env.NEXT_PUBLIC_BENCHMARK_API_URL; await show(); await click('Show logs'); assert.ok(screen.getByText('Waiting for logs...')); assert.deepEqual(apiCalls, []); await click('Hide logs');
  process.env.NEXT_PUBLIC_BENCHMARK_API_URL = 'https://benchmark-api.example.invalid'; const pending = deferred(); api = () => pending.promise; await click('Show logs'); await click('Hide logs'); await act(async () => pending.resolve({ok: true, json: async () => ({events: [{message: 'Obsolete late response'}]})}));
  api = async () => ({ok: true, json: async () => ({events: []})}); await click('Show logs'); assert.ok(screen.getByText('Waiting for logs...')); assert.equal(screen.queryByText('Obsolete late response'), null); view.unmount(); assert.equal(intervals.size, 0);
});

test('cancellation requires a fresh verified session and retains API errors until explicitly dismissed', async () => {
  jobs = [job()]; await show(true); await click('Cancel'); assert.ok(screen.getByRole('alertdialog', {name: 'Cancel this benchmark?'})); assert.deepEqual(cancellations, []); await click('Keep running'); await waitFor(() => assert.equal(screen.queryByRole('alertdialog'), null));
  await click('Cancel'); cancel = async () => {throw Error('Original cancellation rejected');}; await click('Cancel benchmark'); assert.equal(screen.getByRole('alert').textContent, 'Original cancellation rejected'); assert.deepEqual(cancellations, [['synthetic-job', 'synthetic-verified-session']]); assert.equal(tokenCalls, 1);
  cancel = async () => {throw null;}; await click('Cancel benchmark'); assert.equal(screen.getByRole('alert').textContent, 'Unable to cancel this benchmark.'); await click('Keep running'); await waitFor(() => assert.equal(screen.queryByRole('alertdialog'), null)); await click('Cancel'); assert.equal(screen.queryByRole('alert'), null);
});

test('authentication rejection never invokes cancellation and a pending cancellation disables duplicate actions', async () => {
  jobs = [job()]; await show(true); await click('Cancel'); token = async () => {throw Error('Sign in before cancellation');}; await click('Cancel benchmark'); assert.equal(screen.getByRole('alert').textContent, 'Sign in before cancellation'); assert.deepEqual(cancellations, []);
  const pending = deferred(); token = async () => 'synthetic-verified-session'; cancel = () => pending.promise; await click('Cancel benchmark'); assert.equal(screen.getByRole('button', {name: 'Cancelling...'}).disabled, true); assert.equal(screen.getByRole('button', {name: 'Keep running'}).disabled, true);
  fireEvent.keyDown(screen.getByRole('alertdialog'), {key: 'Escape'}); assert.ok(screen.getByRole('alertdialog')); jobs = [job({status: 'cancelled'})]; await act(async () => pending.resolve({status: 'cancelled'})); await waitFor(() => assert.equal(screen.queryByRole('alertdialog'), null)); assert.ok(screen.getByText('cancelled', {exact: true})); assert.equal(screen.queryByRole('button', {name: 'Cancel', exact: true}), null); assert.deepEqual(cancellations, [['synthetic-job', 'synthetic-verified-session']]);
});
