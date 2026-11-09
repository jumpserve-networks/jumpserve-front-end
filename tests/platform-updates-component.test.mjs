import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {PLATFORM_REPOSITORIES} from '../lib/platform-updates.ts';

globalThis.__platformReact = React;
const replacements = {
  'next/link': 'export default function Link({href,...props}){return globalThis.__platformReact.createElement("a",{...props,href});}',
  '@/lib/supabase/client': 'export const createClient=()=>globalThis.__platformClient();',
  '@/app/components/platform-worker-heartbeat': 'export const WorkerHeartbeat=({seenAt})=>globalThis.__platformReact.createElement("time",{},seenAt??"Heartbeat not recorded");',
};
const hook = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {PlatformUpdates} = await import('../app/components/platform-updates.tsx'); hook.deregister();
const id = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const STAMP = '2026-11-07T12:00:00Z', KEY = 'jumpserve-platform-control:' + id(1);
function task(n, status = 'queued', changes = {}) {return {id: id(n), title: 'Recorded improvement ' + n, objective: 'Synthetic objective ' + n, repositories: [...PLATFORM_REPOSITORIES], status, reason: 'Recorded reason ' + n, max_reserved_cents: 10000, committed_cents: 0, deadline_at: STAMP, cancel_requested: false, authorization_version: 'original-authority-v1', created_at: STAMP, updated_at: STAMP, ...changes};}
const event = (n, sequence = String(n), changes = {}) => ({id: id(n + 100), task_id: id(2), sequence, actor: 'supervisor', kind: 'qualified-change', message: 'Original event ' + n, details: {}, created_at: STAMP, ...changes});
function snapshot(changes = {}) {return {version: 'platform-supervisor-v1', operator_id: id(1), operator_role: 'owner', settings: {paused: false, automatic_releases: true, worker_status: 'reconciling', worker_reason: 'Original worker diagnostic', worker_seen_at: STAMP, authorization_version: 'original-authority-v1', revision: 1}, authorization: {version: 'original-authority-v1', policy_sha256: 'a'.repeat(64), created_at: STAMP}, tasks: [task(2)], events: [event(1)], changes: [], releases: [], runs: [], artifacts: [], has_more_tasks: false, has_more_events: false, ...changes};}
const available = data => ({status: 'available', data: data ?? snapshot()});
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
const realInterval = window.setInterval, realClearInterval = window.clearInterval;
let timers, cleared, channel, client, subscriptions, changes, requests, reply, view, nextId;
beforeEach(t => {
  timers = new Map(); cleared = []; subscriptions = []; changes = []; requests = []; nextId = 900;
  Object.defineProperty(globalThis, 'sessionStorage', {configurable: true, value: window.sessionStorage}); sessionStorage.clear();
  channel = {on(type, filter, callback) {changes.push({type, filter, callback}); return this;}, subscribe(callback) {subscriptions.push(callback); return this;}};
  client = {channel: t.mock.fn(() => channel), removeChannel: t.mock.fn(async () => {})}; globalThis.__platformClient = () => client;
  t.mock.method(window, 'setInterval', (callback, ms, ...args) => {if (ms !== 10000) return realInterval(callback, ms, ...args); const key = nextId++; timers.set(key, callback); return key;});
  t.mock.method(window, 'clearInterval', key => {if (timers.has(key)) {cleared.push(key); timers.delete(key);} else realClearInterval(key);});
  t.mock.method(crypto, 'randomUUID', () => id(nextId++));
  reply = async () => Response.json(available());
  t.mock.method(globalThis, 'fetch', async (url, options) => {requests.push({url, options}); return reply(url, options);});
});
afterEach(() => {cleanup(); sessionStorage.clear(); if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage); else delete globalThis.sessionStorage;});
const show = (data, taskId) => (view = render(React.createElement(PlatformUpdates, {initial: data?.status ? data : available(data), taskId})));
const button = name => screen.getByRole('button', {name, exact: true});
const click = async element => {await act(async () => fireEvent.click(element));};
const refresh = () => click(button('Refresh'));
const change = (name, value) => fireEvent.change(screen.getByLabelText(name, {exact: true}), {target: {value}});
const posts = () => requests.filter(request => request.options?.method === 'POST').map(request => JSON.parse(request.options.body));
const form = () => screen.getByLabelText('Title', {exact: true}).closest('form');
async function openForm() {await click(screen.getByText('Queue a platform improvement'));}
async function submitForm() {await act(async () => fireEvent.submit(form()));}

test('initial recorded health remains visible without an initial network request and subscriptions clean up', () => {
  show(); assert.equal(requests.length, 0); assert.ok(screen.getByText('Accepting work')); assert.ok(screen.getByText('Original worker diagnostic')); assert.ok(screen.getByText('Automatic merges and releases enabled')); assert.ok(screen.getByText('Authority: original-authority-v1')); assert.ok(screen.getByText(STAMP)); assert.ok(screen.getByText('Category policy details are unavailable from this server.'));
  assert.deepEqual(client.channel.mock.calls[0].arguments, ['platform-updates:all']); assert.equal(changes[0].type, 'postgres_changes'); assert.deepEqual(changes[0].filter, {event: 'INSERT', schema: 'public', table: 'platform_events'}); assert.equal(timers.size, 1);
  const timer = [...timers.keys()][0]; view.unmount(); assert.deepEqual(cleared, [timer]); assert.equal(client.removeChannel.mock.calls[0].arguments[0], channel);
});

test('unavailable and forbidden reads expose no owner controls and can recover from a recorded refresh', async () => {
  show({status: 'forbidden', reason: 'Only configured operators'}); assert.ok(screen.getByText('Platform operator access required')); assert.equal(screen.queryByRole('button', {name: 'Pause new work'}), null); assert.equal(screen.queryByText('Queue a platform improvement'), null);
  await refresh(); assert.ok(screen.getByText('Accepting work')); reply = async () => Response.json({status: 'unavailable'}); await refresh(); assert.ok(screen.getByText('Platform status unavailable')); assert.ok(screen.getByText('Platform status is temporarily unavailable.'));
  reply = async () => Response.json({status: 'forbidden', reason: 'Operator was removed'}); await refresh(); assert.ok(screen.getByText('Operator was removed'));
  reply = async () => Response.json({}, {status: 401}); await refresh(); assert.ok(screen.getByText('Your session ended. Sign in again to view platform activity.'));
});

test('empty records missing authority and viewer access remain explicit', () => {
  const data = snapshot({operator_role: 'viewer', authorization: null, tasks: [], events: []}); data.settings.worker_reason = null; show(data); assert.ok(screen.getByText('No platform improvements have been recorded yet.')); assert.ok(screen.getByText('No activity events have been recorded.')); assert.ok(screen.getByText('Authority: Not configured')); assert.ok(screen.getByText('No additional worker message.')); assert.equal(screen.queryByRole('button', {name: 'Pause new work'}), null); assert.equal(screen.queryByText('Queue a platform improvement'), null);
});

test('category policies distinguish unlimited zero finite calls and assessment/task scopes', () => {
  const categories = ['research_assessment', 'platform_manual', 'platform_maintenance', 'platform_repair'].map((category, n) => ({category, label: 'Category ' + n, scope: n === 0 ? 'assessment' : 'platform-task', max_spend_cents: n === 0 ? -1 : 0, max_model_calls: n === 0 ? -1 : 1000, revision: n + 1})); show(snapshot({budget_categories: categories})); const table = screen.getByRole('table'); assert.equal(within(table).getAllByText('Unlimited').length, 2); assert.equal(within(table).getAllByText('$0.00').length, 3); assert.equal(within(table).getAllByText('1,000').length, 3); assert.ok(screen.getByText('Per assessment · revision 1')); assert.ok(screen.getByText('Per platform task · revision 4'));
});

test('live statuses and polling share a single in-flight refresh and preserve task-specific queries', async () => {
  show(snapshot(), id(2)); assert.deepEqual(client.channel.mock.calls[0].arguments, ['platform-updates:' + id(2)]); const pending = deferred(); reply = () => pending.promise;
  await act(async () => subscriptions[0]('SUBSCRIBED')); assert.ok(screen.getByText('Live events with polling recovery')); await act(async () => {changes[0].callback(); [...timers.values()][0]();}); assert.equal(requests.length, 1); assert.equal(requests[0].url, '/api/platform-updates?task=' + id(2)); assert.deepEqual(requests[0].options, {cache: 'no-store'});
  await act(async () => pending.resolve(Response.json(available()))); for (const status of ['CHANNEL_ERROR', 'TIMED_OUT']) {await act(async () => subscriptions[0](status)); assert.ok(screen.getByText('Live stream reconnecting · polling active'));} await act(async () => subscriptions[0]('CLOSED')); assert.equal(requests.length, 1);
});

test('missing realtime support retains polling and removes only its owned interval', async () => {
  globalThis.__platformClient = () => {throw new Error('Synthetic realtime unavailable');}; show(); assert.ok(screen.getByText('Polling recorded status')); await act(async () => [...timers.values()][0]()); assert.equal(requests.length, 1); view.unmount(); assert.equal(timers.size, 0); assert.equal(client.removeChannel.mock.callCount(), 0);
});

test('paginated tasks and bigint events merge by original identity without losing earlier pages on polling', async () => {
  const initial = snapshot({tasks: [task(4), task(3)], events: [event(4, '9007199254740994'), event(3, '9007199254740993')], has_more_tasks: true, has_more_events: true}); show(initial);
  reply = async url => {assert.equal(new URL(url, 'http://localhost').searchParams.get('before_task'), id(3)); return Response.json(available(snapshot({tasks: [task(3, 'testing', {title: 'Updated original task'}), task(2)], events: [], has_more_tasks: false, has_more_events: true})));}; await click(button('Load older improvements')); assert.equal(screen.getAllByText('Updated original task').length, 1); assert.ok(screen.getByText('Recorded improvement 2')); assert.equal(screen.queryByRole('button', {name: 'Load older improvements'}), null);
  reply = async url => {assert.equal(new URL(url, 'http://localhost').searchParams.get('before_event'), '9007199254740993'); return Response.json(available(snapshot({tasks: [], events: [event(3, '9007199254740993', {message: 'Updated original event'}), event(2, '9007199254740992')], has_more_tasks: true, has_more_events: false})));}; await click(button('Load earlier activity')); assert.equal(screen.getAllByText('Updated original event').length, 1); assert.equal(screen.queryByRole('button', {name: 'Load earlier activity'}), null);
  reply = async () => Response.json(available(snapshot({tasks: [task(5, 'completed', {created_at: '2026-11-08T00:00:00Z'})], events: [event(5, '9007199254740995')], has_more_tasks: true, has_more_events: true}))); await refresh(); const links = screen.getAllByRole('link').filter(link => link.querySelector('h3')); assert.deepEqual(links.map(link => link.querySelector('h3').textContent), ['Recorded improvement 5', 'Recorded improvement 4', 'Updated original task', 'Recorded improvement 2']); assert.deepEqual([...screen.getByRole('list').querySelectorAll('li > p')].map(item => item.textContent), ['Original event 5', 'Original event 4', 'Updated original event', 'Original event 2']); assert.equal(screen.queryByRole('button', {name: 'Load earlier activity'}), null); assert.equal(screen.queryByRole('button', {name: 'Load older improvements'}), null);
});

for (const failure of [new Error('Synthetic refresh failed'), 'unexpected failure']) test('refresh errors preserve previously recorded activity: ' + String(failure), async () => {
  show(); reply = async () => {throw failure;}; await refresh(); assert.ok(screen.getByText(failure instanceof Error ? failure.message : 'Refresh failed; the recorded history is retained.')); assert.ok(screen.getByText('Recorded improvement 2')); assert.ok(screen.getByText('Original event 1'));
});

test('invalid refresh documents fail closed and late success or failure cannot update an unmounted view', async () => {
  show(); reply = async () => Response.json(available({version: 'invalid', settings: {}})); await refresh(); assert.ok(screen.getByText('Unrecognized platform status.')); assert.ok(screen.getByText('Recorded improvement 2')); view.unmount();
  for (const rejects of [false, true]) {show(); const pending = deferred(); reply = () => pending.promise; await refresh(); view.unmount(); await act(async () => rejects ? pending.reject(new Error('late failure')) : pending.resolve(Response.json(available()))); assert.equal(screen.queryByRole('main'), null);}
});

test('owner pause resume and release controls submit exact identities and retain recorded state', async () => {
  const data = snapshot(); show(data); reply = async (_url, options) => {if (options?.method === 'POST') {const {action} = JSON.parse(options.body); if (action === 'pause') data.settings.paused = true; if (action === 'resume') data.settings.paused = false; if (action === 'disable-releases') data.settings.automatic_releases = false; if (action === 'enable-releases') data.settings.automatic_releases = true; return Response.json({recorded: true});} return Response.json(available(data));};
  for (const name of ['Pause new work', 'Resume new work', 'Disable automatic releases', 'Enable automatic releases']) {await click(button(name)); assert.ok(screen.getByText('Control recorded.')); assert.equal(sessionStorage.getItem(KEY), null);}
  assert.deepEqual(posts().map(value => value.action), ['pause', 'resume', 'disable-releases', 'enable-releases']); for (const value of posts()) {assert.equal(value.task_id, null); assert.deepEqual(value.payload, {}); assert.match(value.request_id, /^30000000-/);} assert.equal(new Set(posts().map(value => value.request_id)).size, 4);
});

test('uncertain controls disable new actions and reconcile the same stored request after remount', async () => {
  show(); reply = async () => Response.json({error: 'Synthetic acknowledgement lost'}, {status: 503}); await click(button('Pause new work')); const original = posts()[0]; assert.deepEqual(JSON.parse(sessionStorage.getItem(KEY)), original); assert.ok(screen.getByText('Synthetic acknowledgement lost')); assert.equal(button('Pause new work').disabled, true); view.unmount();
  show(); assert.ok(screen.getByText('An earlier control request needs reconciliation. Retry it with its original identity.')); reply = async (_url, options) => Response.json(options?.method === 'POST' ? {recorded: true} : available()); await click(button('Reconcile original control request')); assert.deepEqual(posts(), [original, original]); assert.equal(button('Pause new work').disabled, false); assert.equal(sessionStorage.getItem(KEY), null);
});

test('an in-flight control keeps its identity and blocks duplicate controls until its receipt arrives', async () => {
  show(); const pending = deferred(); reply = (_url, options) => options?.method === 'POST' ? pending.promise : Promise.resolve(Response.json(available())); await click(button('Pause new work')); assert.equal(button('Pause new work').disabled, true); assert.equal(button('Disable automatic releases').disabled, true); assert.equal(screen.queryByRole('button', {name: 'Reconcile original control request'}), null); await act(async () => pending.resolve(Response.json({recorded: true}))); assert.ok(screen.getByText('Control recorded.')); assert.equal(posts().length, 1);
});

test('fallback control failures remain reconcilable without discarding the original request', async () => {
  show(); reply = async () => Response.json({}, {status: 500}); await click(button('Pause new work')); assert.ok(screen.getByText('Control request is unconfirmed. Retry the same request.')); const original = posts()[0]; reply = async () => {throw 'unexpected transport failure';}; await click(button('Reconcile original control request')); assert.ok(screen.getByText('Control request is unconfirmed.')); assert.deepEqual(posts(), [original, original]);
});

test('storage read write and cleanup failures preserve in-memory reconciliation and server authority', async t => {
  t.mock.method(window.Storage.prototype, 'getItem', () => {throw new Error('Synthetic storage disabled');}); show(); t.mock.method(window.Storage.prototype, 'setItem', () => {throw new Error('Synthetic storage disabled');}); t.mock.method(window.Storage.prototype, 'removeItem', () => {throw new Error('Synthetic storage disabled');}); reply = async (_url, options) => Response.json(options?.method === 'POST' ? {recorded: true} : available()); await click(button('Pause new work')); assert.ok(screen.getByText('Control recorded.')); assert.equal(button('Pause new work').disabled, false); assert.equal(posts().length, 1);
});

test('invalid retained controls do not grant owner controls to viewers or issue requests', () => {
  sessionStorage.setItem(KEY, '{invalid JSON'); show(snapshot({operator_role: 'viewer'})); assert.equal(requests.length, 0); assert.equal(screen.queryByRole('button', {name: 'Pause new work'}), null); assert.equal(screen.queryByRole('button', {name: 'Reconcile original control request'}), null);
});

test('enqueue validates trimmed objectives repositories and elapsed time before preserving a task', async () => {
  show(); await openForm(); await submitForm(); assert.ok(screen.getByText('Enter a valid title.')); assert.equal(posts().length, 0); change('Title', '  New measured capability  '); change('Objective and acceptance criteria', '  Preserve original evidence and verify the repair.  '); change('Elapsed-time limit (hours)', '0.01'); await submitForm(); assert.ok(screen.getByText('Invalid task elapsed limit.')); assert.equal(posts().length, 0);
  change('Elapsed-time limit (hours)', '1.5'); const check = screen.getByRole('checkbox', {name: 'jumpserve-infra'}); await click(check); await click(check); await click(screen.getByRole('checkbox', {name: 'jumpserve-front-end'})); reply = async (_url, options) => Response.json(options?.method === 'POST' ? {recorded: true} : available()); await submitForm(); const value = posts()[0]; assert.equal(value.action, 'enqueue'); assert.equal(value.payload.title, 'New measured capability'); assert.equal(value.payload.objective, 'Preserve original evidence and verify the repair.'); assert.equal(value.payload.elapsed_seconds, 5400); assert.deepEqual(value.payload.repositories, [PLATFORM_REPOSITORIES[1], PLATFORM_REPOSITORIES[2]]); assert.notEqual(value.task_id, value.request_id); assert.equal(screen.getByLabelText('Title').value, ''); assert.equal(screen.getByLabelText('Objective and acceptance criteria').value, '');
});

test('enqueue rejects an empty repository scope and missing authority disables the submit control', async () => {
  show(); await openForm(); change('Title', 'Recorded task'); change('Objective and acceptance criteria', 'Objective with exact checks'); for (const repo of PLATFORM_REPOSITORIES) await click(screen.getByRole('checkbox', {name: repo.split('/')[1]})); await submitForm(); assert.ok(screen.getByText('Select the affected JumpServe repositories.')); assert.equal(posts().length, 0); view.unmount(); show(snapshot({authorization: null})); await openForm(); assert.equal(button('Queue improvement').disabled, true);
});

test('a failed browser request-identity generator cannot enqueue a task and reports the failure', async t => {
  show(); await openForm(); change('Title', 'Synthetic capability'); change('Objective and acceptance criteria', 'Exact original evidence required'); t.mock.method(crypto, 'randomUUID', () => {throw 'Synthetic identity generation unavailable';}); await submitForm(); assert.ok(screen.getByText('Invalid platform task.')); assert.equal(posts().length, 0); assert.equal(sessionStorage.getItem(KEY), null);
});

test('task detail retains original evidence verified links reconciliation and cancellation status', async () => {
  const data = snapshot({changes: [{id: id(10), repository: PLATFORM_REPOSITORIES[0], base_sha: 'original-base', head_sha: 'qualified-head', merge_sha: 'recorded-merge', summary: 'Original change summary', status: 'verified', pr_url: 'https://github.com/' + PLATFORM_REPOSITORIES[0] + '/pull/7', tree_sha256: 'c'.repeat(64)}], releases: [{id: id(11), component: 'Synthetic backend', repository: PLATFORM_REPOSITORIES[1], revision: 'deployed-original-revision', status: 'completed', external_id: 'original-release', verification: {zero: 0, missing: null}, details: {}, created_at: STAMP, updated_at: STAMP}], runs: [{id: id(12), number: 1, status: 'unknown', reconciled: true, reason: 'Original uncertain outcome', reserved_cents: 0, usage: {input_tokens: 0}, request_artifact_id: id(13), response_artifact_id: id(14), created_at: STAMP, ended_at: null}], artifacts: [{id: id(13), task_id: id(2), name: 'Original request bytes', sha256: 'd'.repeat(64), byte_count: 0, media_type: 'application/json', provenance: {}, created_at: STAMP}], events: [event(1, '1', {details: {zero: 0, missing: null}})]}); show(data, id(2)); assert.ok(screen.getByRole('heading', {name: 'Recorded improvement 2', level: 1})); assert.equal(screen.getByRole('link', {name: 'All platform updates'}).getAttribute('href'), '/platform-updates'); assert.equal(screen.queryByText('Queue a platform improvement'), null); assert.ok(screen.getByText('original-base → recorded-merge')); const pr = screen.getByRole('link', {name: 'View pull request'}); assert.equal(pr.target, '_blank'); assert.equal(pr.rel, 'noreferrer'); assert.ok(screen.getByText('deployed-original-revision')); assert.ok(screen.getByText('Original unknown outcome reconciled separately')); assert.ok(screen.getByText('Original uncertain outcome')); assert.ok(screen.getByText('SHA-256 ' + 'd'.repeat(64))); assert.ok(screen.getByText(/0 bytes/)); assert.equal(screen.getByRole('link', {name: 'Original request'}).getAttribute('href'), '/api/platform-updates/artifacts/' + id(13)); assert.equal(screen.getByRole('link', {name: 'Captured response'}).getAttribute('href'), '/api/platform-updates/artifacts/' + id(14)); assert.equal(screen.queryByRole('link', {name: 'View improvement'}), null);
  reply = async (_url, options) => {if (options?.method === 'POST') {data.tasks[0].cancel_requested = true; return Response.json({recorded: true});} return Response.json(available(data));}; await click(button('Cancel work')); assert.equal(posts()[0].task_id, id(2)); assert.equal(posts()[0].action, 'cancel'); assert.equal(button('Cancellation requested').disabled, true);
});

test('terminal details hide cancellation and preserve unpublished changes and absent outputs', () => {
  const data = snapshot({tasks: [task(2, 'completed')], changes: [{id: id(10), repository: PLATFORM_REPOSITORIES[0], base_sha: 'base', head_sha: null, merge_sha: null, summary: 'Unpublished original', status: 'queued', pr_url: 'javascript:unsafe', tree_sha256: 'c'.repeat(64)}], releases: [{id: id(11), component: 'Unverified release', revision: 'revision', status: 'blocked', updated_at: STAMP, verification: null}], runs: [{id: id(12), number: 2, status: 'failed', reconciled: false, reason: null, usage: null, request_artifact_id: id(13), response_artifact_id: null}]}); show(data, id(2)); assert.equal(screen.queryByRole('button', {name: 'Cancel work'}), null); assert.ok(screen.getByText('base → Unpublished')); assert.equal(screen.queryByRole('link', {name: 'View pull request'}), null); assert.equal(screen.queryByRole('link', {name: 'Captured response'}), null); assert.equal(screen.queryByText('Recorded verification'), null); assert.equal(screen.queryByText('Reported usage'), null);
});

test('unknown task details show absent change and release records without inventing task state', () => {
  show(snapshot({operator_role: 'viewer', tasks: [], events: []}), id(999)); assert.ok(screen.getByRole('heading', {name: 'Platform Updates', level: 1})); assert.ok(screen.getByText('No tested changes have been recorded.')); assert.ok(screen.getByText('No production release has been recorded.')); assert.ok(screen.getByText('No activity events have been recorded.')); assert.equal(screen.queryByRole('button', {name: 'Cancel work'}), null);
});
