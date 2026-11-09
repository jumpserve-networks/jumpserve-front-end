import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';

globalThis.__reportReact = React;
const replacements = {
  'next/link': 'export default function Link({href,...props}) {return globalThis.__reportReact.createElement("a",{...props,href});}',
  'next/navigation': 'export const useSearchParams=()=>globalThis.__reportParams;',
  '@/app/components/user-preferences': 'export const useTimeZone=()=>globalThis.__reportZone; export const LocalDateTime=({value})=>globalThis.__reportReact.createElement("time",{},new Date(value).toISOString());',
  '@/lib/real-world-api': 'export const realWorldRequest=(...args)=>globalThis.__reportRequest(...args);',
  '@/lib/report-download': 'export const downloadReportFile=(...args)=>globalThis.__reportDownloads.push(args);',
  '@/app/components/real-world-report-chart': 'export function RealWorldReportChart(props){globalThis.__reportCharts.set(props.title,props);return globalThis.__reportReact.createElement("section",{"aria-label":props.title});}',
};
const hook = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {RealWorldReport} = await import('../app/components/real-world-report.tsx');
const {RealWorldReports} = await import('../app/components/real-world-reports.tsx');
const {RealWorldReportComparison} = await import('../app/components/real-world-report-comparison.tsx');
hook.deregister();

const BASE = '/congestion-control-real-world/test-results';
const id = n => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const placement = region => ({region, zone_id: region + '-az1', instance_type: 't3.medium'});
function report(n = 1, cca = 'cubic', value = 8, overrides = {}) {
  const configuration = {server: placement('us-east-2'), bottleneck: placement('us-west-2'), receivers: [placement('eu-west-1')], duration_seconds: 60, rate_mbit: 10, buffer_kbytes: 125, ...overrides};
  return {can_manage: true, analysis_version: 'real-world-v1', job: {job_id: id(n), status: 'completed', created_at: Date.parse('2026-09-20T12:00:00Z') / 1000, runtime_revision: 'original-runtime', config: {...configuration, cca, notes: 'Synthetic throughput hypothesis ' + n}, nodes: [{...configuration.server, name: 'server', role: 'server', image_id: 'ami-original'}, {...configuration.receivers[0], name: 'receiver-1', role: 'receiver'}]},
    receivers: [{name: 'receiver-1', placement: configuration.receivers[0], received_bytes: 1_000_000, duration_seconds: 1, mean_mbit_per_second: value, retransmits: 0, preflight_rtt_ms: 0, rtt: {samples: 2, median: 0, p95: 3}, throughput_intervals: 3, tcp_samples: 2,
      throughput: [{start: 0, seconds: 1, duration_seconds: 1, received_bytes: 0, mbit_per_second: 0}, {start: 1, seconds: 2, duration_seconds: 1, received_bytes: 1_000_000, mbit_per_second: 8}, {start: 3, seconds: 4, duration_seconds: 1, received_bytes: 1_000_000, mbit_per_second: 8}], tcp: [{seconds: 0, rtt_ms: null, cwnd_bytes: null}, {seconds: 1, rtt_ms: 0, cwnd_bytes: 2000}]}],
    queue: [{seconds: 0, backlog_bytes: 0, queue_delay_ms: 0, drops: 0, sent_bytes: 0}, {seconds: 1, backlog_bytes: null, queue_delay_ms: null, drops: null, sent_bytes: null}, {seconds: 2, backlog_bytes: 2000, queue_delay_ms: 1.6, drops: 2, sent_bytes: 4000}],
    summary: {combined_mean_mbit_per_second: value, jain_fairness: .8, received_bytes: 1_000_000, queue_delay: {samples: 3, median: 0, p95: 1.6}, observed_queue_drops: 2, start_skew_ms: 0},
    provenance: [{name: 'server', kernel: 'original-kernel', iperf_version: 'iperf-3.16', image_id: 'ami-original', success: true}], sources: [{name: 'original.json', sha256: 'a'.repeat(64), version_id: 'retained-original-version', bytes: 100}, {name: 'legacy.json', sha256: 'b'.repeat(64), version_id: null, bytes: 50}], warnings: [],
    comparison: {eligible: true, exclusions: [], key: 'server-checked', configuration: {configuration, runtime_revision: 'original-runtime', machines: [{name: 'server', kernel: 'original-kernel', image_id: 'ami-original', iperf_version: 'iperf-3.16'}]}}};
}
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
let requests, handler, view, printed, clipboard;
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
beforeEach(t => {
  requests = []; printed = 0; clipboard = [];
  globalThis.__reportZone = 'UTC'; globalThis.__reportDownloads = []; globalThis.__reportCharts = new Map();
  globalThis.__reportRequest = (path, options = {}) => {requests.push({path, options}); return handler(path, options);};
  handler = async path => {assert.fail('Unexpected service call: ' + path);};
  window.history.replaceState(null, '', BASE); globalThis.__reportParams = new URLSearchParams();
  t.mock.method(window, 'print', () => printed++);
  t.mock.method(globalThis, 'fetch', () => {assert.fail('Tests must not contact a live service');});
  Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async text => clipboard.push(text)}});
});
afterEach(() => {cleanup(); if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard); else delete navigator.clipboard;});
const click = async element => {await act(async () => fireEvent.click(element));};
const button = name => screen.getByRole('button', {name, exact: true});
const disabled = element => element.matches(':disabled,[aria-disabled="true"]');
const chart = title => globalThis.__reportCharts.get(title);
const showOne = jobId => (view = render(React.createElement(RealWorldReport, {jobId: jobId ?? id(1)})));
const showList = () => (view = render(React.createElement(RealWorldReports)));
const params = query => {window.history.replaceState(null, '', BASE + (query ? '?' + query : '')); globalThis.__reportParams = new URLSearchParams(query);};
const syncQuery = () => {globalThis.__reportParams = new URLSearchParams(window.location.search); view.rerender(React.createElement(RealWorldReports));};
const setQuery = query => {params(query); view.rerender(React.createElement(RealWorldReports));};
async function choose(label, name) {
  await click(screen.getByRole('combobox', {name: label, exact: true}));
  await act(async () => {const option = screen.getByRole('option', {name, exact: true}); fireEvent.pointerDown(option, {pointerType: 'mouse', button: 0}); fireEvent.click(option);});
}
async function loaded(data = report()) {handler = async () => data; await act(async () => {showOne(data.job.job_id);}); assert.ok(screen.getByText('Measurement checks')); return data;}
async function history(jobs, cursor = null) {handler = async path => {assert.equal(path, '/reports'); return {tests: jobs, cursor};}; await act(async () => {showList();}); assert.equal(screen.queryByText('Loading test history…'), null);}
const selected = ids => 'selected=' + ids.map(id).join(',');

test('saved results retry a failed request and abort both superseded and unmounted requests', async () => {
  const first = deferred(); handler = () => first.promise; showOne(); assert.ok(screen.getByRole('status')); assert.equal(requests[0].path, '/reports/' + id(1));
  await act(async () => first.reject(new Error('Saved report temporarily unavailable'))); assert.match(screen.getByRole('alert').textContent, /temporarily unavailable/);
  const retry = deferred(); handler = () => retry.promise; await click(button('Retry loading results')); assert.equal(requests[0].options.signal.aborted, true);
  await act(async () => retry.resolve(report())); assert.ok(screen.getByText('Measurement checks')); assert.equal(screen.queryByRole('alert'), null);
  const next = deferred(); handler = () => next.promise; view.rerender(React.createElement(RealWorldReport, {jobId: id(2)})); assert.equal(requests[1].options.signal.aborted, true);
  view.unmount(); assert.equal(requests[2].options.signal.aborted, true); await act(async () => next.resolve(report(2))); assert.equal(screen.queryByText('Measurement checks'), null);
});

test('a stale report failure after unmount does not render an error', async () => {
  const pending = deferred(); handler = () => pending.promise; showOne(); view.unmount(); await act(async () => pending.reject(new Error('late response'))); assert.equal(screen.queryByRole('alert'), null);
});

test('saved measurements retain zero values source hashes configuration and module links', async () => {
  const data = await loaded(); assert.ok(screen.getByText('original-runtime')); assert.ok(screen.getByText('a'.repeat(64))); assert.ok(screen.getByText('retained-original-version'));
  assert.ok(screen.getByText('ami-original')); assert.ok(screen.getByText(/original-kernel/)); assert.ok(screen.getByText(/iperf-3.16/)); assert.ok(screen.getAllByText(/Unavailable/).length >= 2);
  const tables = screen.getAllByRole('table'); const receiver = within(tables[1]).getAllByRole('row')[1]; assert.match(receiver.textContent, /8\.0001\.0001\.0000\.00020\.0000/);
  for (const [name, suffix] of [['Chat with AI', '/chat?jobId='], ['Manage test', '/run-a-test/'], ['Add to comparison', '/test-results?selected=']]) assert.equal(screen.getByText(name).closest('a').getAttribute('href'), '/congestion-control-real-world' + suffix + data.job.job_id);
  assert.ok(screen.getByText(/complete measurement and provenance/)); assert.ok(screen.getByText(/not exact TCP transfer-start/));
});

test('excluded incomplete results preserve missing values without inventing measurements or management access', async () => {
  const data = report(); data.can_manage = false; data.job.config.notes = ''; data.comparison.eligible = false; data.comparison.exclusions = ['Transfer incomplete']; data.warnings = ['One source is missing']; data.summary.received_bytes = null;
  Object.assign(data.receivers[0], {received_bytes: null, retransmits: null, preflight_rtt_ms: null, mean_mbit_per_second: null, duration_seconds: null, throughput: undefined, tcp: undefined}); delete data.queue; data.provenance[0].kernel = null; data.provenance[0].iperf_version = null;
  await loaded(data); assert.ok(screen.getByText('Transfer incomplete')); assert.ok(screen.getByText('One source is missing')); assert.equal(screen.queryByRole('link', {name: 'Manage test'}), null); assert.equal(screen.queryByText('Hypothesis / notes'), null);
  assert.deepEqual(chart('Receiver throughput').series[0].points, []); assert.deepEqual(chart('Sender RTT').series[0].points, []); assert.deepEqual(chart('Estimated queue drain time').series[0].points, []);
  assert.ok(within(screen.getAllByRole('table')[1]).getAllByText('Unavailable').length >= 5);
});

test('traces keep receiver clocks gaps decimal units and null samples for every shared queue metric', async () => {
  await loaded(); assert.deepEqual(chart('Receiver throughput').series[0].points, [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 8}, {x: 2, y: 8}, {x: 3, y: null}, {x: 3, y: 8}, {x: 4, y: 8}]);
  assert.deepEqual(chart('Sender RTT').series[0].points, [{x: 0, y: null}, {x: 1, y: 0}]); assert.deepEqual(chart('Sender congestion window').series[0].points, [{x: 0, y: null}, {x: 1, y: 2}]); assert.equal(chart('Sender RTT').scheduledEnd, 60);
  await choose('Shared queue metric', 'Backlog'); assert.equal(chart('Shared queue backlog').unit, 'kB'); assert.deepEqual(chart('Shared queue backlog').series[0].points, [{x: 0, y: 0}, {x: 1, y: null}, {x: 2, y: 2}]);
  await choose('Shared queue metric', 'Cumulative drops'); assert.equal(chart('Cumulative queue drops').unit, 'packets'); assert.deepEqual(chart('Cumulative queue drops').series[0].points, [{x: 0, y: 0}, {x: 1, y: null}, {x: 2, y: 2}]);
  await choose('Shared queue metric', 'Estimated drain time'); assert.equal(chart('Estimated queue drain time').unit, 'ms');
});

test('receiver trace and JSON exports preserve original results and clock definitions', async () => {
  const data = await loaded(); for (const name of ['Receiver CSV', 'Trace CSV', 'Results JSON', 'Print / PDF']) await click(button(name));
  const [receivers, traces, json] = globalThis.__reportDownloads; assert.equal(receivers[0], id(1) + '-receivers.csv'); assert.match(receivers[1], /received_bytes/); assert.equal(receivers[2], 'text/csv;charset=utf-8'); assert.match(traces[1], /receiver_transfer_elapsed/); assert.match(traces[1], /scheduled_start/); assert.deepEqual(JSON.parse(json[1]), data); assert.equal(json[2], 'application/json'); assert.equal(printed, 1);
});

test('raw report links expose only returned expiring URLs and disable concurrent requests', async () => {
  await loaded(); const pending = deferred(); handler = path => {assert.equal(path, '/reports/' + id(1) + '/artifacts'); return pending.promise;}; await click(button('Get raw report links')); assert.equal(button('Get raw report links').disabled, true);
  await act(async () => pending.resolve({artifacts: [{name: 'receiver-original.json', url: 'https://example.invalid/synthetic-signed-original'}]})); const link = screen.getByRole('link', {name: 'receiver-original.json'}); assert.equal(link.getAttribute('href'), 'https://example.invalid/synthetic-signed-original'); assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noreferrer'); assert.equal(button('Get raw report links').disabled, false);
});

for (const failure of [new Error('Raw object missing'), 'non-error failure']) test('raw report failure retains measured results: ' + String(failure), async () => {
  await loaded(); handler = async () => {throw failure;}; await click(button('Get raw report links')); assert.equal(screen.getByRole('alert').textContent, failure instanceof Error ? failure.message : 'Raw reports are unavailable.'); assert.ok(screen.getByText('Measurement checks')); assert.equal(button('Get raw report links').disabled, false);
});

test('history waits for the saved time zone and distinguishes empty history from unmatched filters', async () => {
  globalThis.__reportZone = null; await history([]); assert.ok(screen.getByText('Loading your time zone…')); assert.ok(screen.getByLabelText('From date (loading time zone)')); assert.equal(screen.queryByText(/No tests yet/), null);
  globalThis.__reportZone = 'UTC'; view.rerender(React.createElement(RealWorldReports)); assert.ok(screen.getByText(/No tests yet/)); assert.equal(button('Select filtered tests').disabled, true);
  cleanup(); params('search=absent'); await history([report().job]); assert.ok(screen.getByText('No tests match these filters.')); assert.match(screen.getByText(/Showing 0 of 1/).textContent, /All available history/);
});

test('history pagination deduplicates tests and encodes cursors while refresh replaces the history', async () => {
  const first = report().job, second = report(2, 'bbr').job; second.config.notes = ''; await history([first], 'opaque +/cursor'); handler = async path => {assert.equal(path, '/reports?cursor=opaque+%2B%2Fcursor'); return {tests: [first, second], cursor: null};}; await click(button('Load older tests')); assert.equal(screen.getAllByRole('checkbox').length, 2); assert.equal(screen.queryByRole('button', {name: 'Load older tests'}), null);
  assert.equal(screen.getAllByRole('link', {name: 'View results'})[1].getAttribute('href'), BASE + '/' + id(2)); handler = async path => {assert.equal(path, '/reports'); return {tests: [second], cursor: null};}; await click(button('Refresh')); assert.equal(screen.queryByRole('checkbox', {name: 'Select test ' + id(1)}), null); assert.equal(screen.getAllByRole('checkbox').length, 1);
});

for (const failure of [new Error('History temporarily unavailable'), null]) test('history failures remain visible and can be refreshed: ' + String(failure), async () => {
  handler = async () => {throw failure;}; await act(async () => {showList();}); assert.equal(screen.getByRole('alert').textContent, failure instanceof Error ? failure.message : 'Could not load saved tests.'); assert.equal(button('Refresh').disabled, false); handler = async () => ({tests: [report().job], cursor: null}); await click(button('Refresh')); assert.equal(screen.queryByRole('alert'), null); assert.ok(screen.getByRole('checkbox'));
});

test('an unmounted history request ignores both success and failure', async () => {
  for (const reject of [false, true]) {const pending = deferred(); handler = () => pending.promise; showList(); const signal = requests.at(-1).options.signal; view.unmount(); assert.equal(signal.aborted, true); await act(async () => reject ? pending.reject(new Error('late history')) : pending.resolve({tests: [report().job], cursor: null})); assert.equal(screen.queryByRole('alert'), null);}
});

test('search placement algorithm status and inclusive local date controls update the shareable URL', async () => {
  const a = report().job, b = report(2, 'bbr').job; b.config.receivers[0] = placement('ap-northeast-1'); await history([a, b]);
  fireEvent.change(screen.getByLabelText('Test ID or hypothesis'), {target: {value: 'hypothesis 2'}}); syncQuery(); assert.equal(screen.getAllByRole('checkbox').length, 1); assert.equal(globalThis.__reportParams.get('search'), 'hypothesis 2');
  await choose('Algorithm filter', 'BBR'); syncQuery(); await choose('Any machine’s Region', 'ap-northeast-1'); syncQuery(); await choose('Test status', 'completed'); syncQuery();
  fireEvent.change(screen.getByLabelText('From date (UTC)'), {target: {value: '2026-09-20'}}); syncQuery(); fireEvent.change(screen.getByLabelText('Through date (UTC)'), {target: {value: '2026-09-20'}}); syncQuery(); assert.equal(screen.getAllByRole('checkbox').length, 1);
  assert.deepEqual(Object.fromEntries(globalThis.__reportParams), {search: 'hypothesis 2', cca: 'bbr', region: 'ap-northeast-1', status: 'completed', from: '2026-09-20', to: '2026-09-20'});
  await choose('Algorithm filter', 'All algorithms'); syncQuery(); await choose('Any machine’s Region', 'All loaded Regions'); syncQuery(); await choose('Test status', 'All statuses'); syncQuery(); assert.equal(globalThis.__reportParams.has('cca'), false); assert.equal(globalThis.__reportParams.has('region'), false); assert.equal(globalThis.__reportParams.has('status'), false);
  await click(button('Clear filters')); syncQuery(); assert.equal(window.location.pathname, BASE); assert.equal(window.location.search, ''); assert.equal(screen.getAllByRole('checkbox').length, 2);
});

test('selection toggles deduplicate filtered tests and enforce the sixty-test limit', async () => {
  const jobs = Array.from({length: 61}, (_, n) => report(n + 1).job); await history(jobs); await click(screen.getByRole('checkbox', {name: 'Select test ' + id(1)})); syncQuery(); assert.deepEqual(globalThis.__reportParams.get('selected'), id(1)); await click(screen.getByRole('checkbox', {name: 'Select test ' + id(1)})); syncQuery(); assert.equal(globalThis.__reportParams.has('selected'), false);
  await click(button('Select filtered tests')); syncQuery(); assert.equal(globalThis.__reportParams.get('selected').split(',').length, 60); assert.equal(disabled(screen.getByRole('checkbox', {name: 'Select test ' + id(61)})), true); assert.equal(disabled(screen.getByRole('checkbox', {name: 'Select test ' + id(1)})), false);
  await click(button('Clear selection')); syncQuery(); assert.equal(button('Copy results link').disabled, true); assert.equal(disabled(screen.getByRole('checkbox', {name: 'Select test ' + id(61)})), false);
});

test('comparison algorithm and outcome controls validate a contrast before building', async () => {
  params(selected([1, 2]) + '&baseline=invalid&comparison=invalid&metric=invalid'); await history([report().job, report(2).job]); assert.match(screen.getByRole('combobox', {name: 'Baseline algorithm'}).textContent, /CUBIC/); assert.match(screen.getByRole('combobox', {name: 'Comparison algorithm'}).textContent, /BBR/);
  await choose('Baseline algorithm', 'BBR'); syncQuery(); assert.ok(screen.getByText('Choose two different algorithms.')); assert.equal(button('Build comparison · 2 tests').disabled, true); await choose('Comparison algorithm', 'CUBIC'); syncQuery(); assert.equal(button('Build comparison · 2 tests').disabled, false);
  await choose('Whole-test outcome', 'Jain fairness of flow averages (index)'); syncQuery(); assert.equal(globalThis.__reportParams.get('metric'), 'jain_fairness');
});

test('comparison loading is bounded to four concurrent reports and caches complete results', async () => {
  const ids = [1, 2, 3, 4, 5, 6]; params(selected(ids)); await history(ids.map(n => report(n, n < 4 ? 'cubic' : 'bbr').job)); const pending = new Map(); handler = path => {const p = deferred(); pending.set(path, p); return p.promise;}; await click(button('Build comparison · 6 tests')); assert.equal(pending.size, 4); assert.equal(button('Refresh').disabled, true); assert.equal(button('Clear selection').disabled, true); assert.ok(screen.getAllByRole('checkbox').every(disabled));
  await act(async () => pending.get('/reports/' + id(1) + '?summary=1').resolve(report(1))); assert.equal(pending.size, 5); assert.ok(button('Reading results · 1 / 6'));
  await act(async () => pending.get('/reports/' + id(2) + '?summary=1').resolve(report(2))); assert.equal(pending.size, 6);
  await act(async () => {for (const n of [3, 4, 5, 6]) pending.get('/reports/' + id(n) + '?summary=1').resolve(report(n, n < 4 ? 'cubic' : 'bbr'));}); assert.ok(screen.getByText('Configuration-matched comparison')); assert.equal(requests.length, 7); await click(button('Build comparison · 6 tests')); assert.equal(requests.length, 7);
  setQuery(selected([1, 2])); assert.ok(screen.getByText(/The selection changed/)); await click(button('Build comparison · 2 tests')); assert.equal(requests.length, 7); assert.ok(screen.getByText('Configuration-matched comparison'));
  handler = async path => {assert.equal(path, '/reports'); return {tests: ids.map(n => report(n).job), cursor: null};}; await click(button('Refresh')); assert.equal(screen.queryByText('Configuration-matched comparison'), null); handler = async path => report(Number(path.slice(9, 17))); await click(button('Build comparison · 2 tests')); assert.equal(requests.length, 10);
});

test('a missing selected result prevents displaying a partial comparison and records every failure', async () => {
  params(selected([1, 2, 3])); await history([]); handler = async path => {if (path.includes(id(1))) return report(); if (path.includes(id(2))) throw new Error('Original object not found'); throw 'missing';}; await click(button('Build comparison · 3 tests')); assert.match(screen.getByRole('alert').textContent, /00000002: Original object not found/); assert.match(screen.getByRole('alert').textContent, /00000003: Test results unavailable/); assert.equal(screen.queryByText('Configuration-matched comparison'), null); assert.ok(screen.getByText(/Comparison incomplete/));
});

test('unmounting aborts a comparison and discards late success and errors', async () => {
  params(selected([1, 2, 3, 4, 5])); await history([]); const pending = []; handler = (_path, options) => {const p = deferred(); pending.push({...p, signal: options.signal}); return p.promise;}; await click(button('Build comparison · 5 tests')); assert.equal(pending.length, 4); view.unmount(); assert.ok(pending.every(p => p.signal.aborted)); await act(async () => {pending[0].reject(new Error('late failure')); for (const p of pending.slice(1)) p.resolve(report());}); assert.equal(pending.length, 4); assert.equal(screen.queryByRole('alert'), null);
});

test('copying a selected results URL reports clipboard success and provides a manual fallback', async t => {
  params(selected([1, 2])); await history([]); await click(button('Copy results link')); assert.deepEqual(clipboard, [window.location.href]); assert.ok(screen.getByText(/Results link copied/)); t.mock.method(navigator.clipboard, 'writeText', async () => {throw new Error('clipboard denied');}); await click(button('Copy results link')); assert.ok(screen.getByText('Copy the address from your browser to save this test selection.'));
});

const comparisonProps = reports => ({reports, baseline: 'cubic', comparison: 'bbr', metric: 'combined_mean_mbit_per_second'});
test('comparison renders real bootstrap intervals and exports full matching configurations and original reports', async () => {
  const reports = Array.from({length: 10}, (_, n) => report(n + 1, n < 5 ? 'cubic' : 'bbr', n)); view = render(React.createElement(RealWorldReportComparison, comparisonProps(reports))); assert.ok(screen.getByText(/1 matched configurations · 0 excluded/)); const svg = screen.getByRole('img'); assert.equal(svg.querySelectorAll('circle').length, 10); assert.equal(svg.querySelectorAll('line[stroke-width="3"]').length, 2); assert.equal(screen.queryByText('Insufficient repetitions'), null);
  await click(button('Comparison CSV')); await click(button('Comparison JSON')); await click(button('Print / PDF')); const [csv, json] = globalThis.__reportDownloads; assert.match(csv[1], /delta_comparison_minus_baseline/); assert.ok(csv[1].includes(id(1))); const output = JSON.parse(json[1]); assert.equal(output.result.blocks[0].delta, 5); assert.equal(output.bootstrap_samples, 2000); assert.equal(output.minimum_repetitions, 5); assert.deepEqual(output.reports, reports); assert.equal(printed, 1);
});

test('unmatched configurations exclusions and sparse repetitions stay explicit when inspecting groups', async () => {
  const a = report(1), b = report(2, 'bbr', 9), unmatched = report(3, 'cubic', 0, {rate_mbit: 20}); const excluded = report(4); excluded.comparison.eligible = false; excluded.comparison.exclusions = ['Missing original provenance']; const rows = [a, a, b, unmatched, excluded]; view = render(React.createElement(RealWorldReportComparison, comparisonProps(rows))); assert.ok(screen.getByText(/1 matched configurations · 2 excluded/)); assert.ok(screen.getByText('No matched contrast')); assert.ok(screen.getByText('Missing original provenance')); assert.ok(screen.getByText('Duplicate test ID; counted only once')); assert.ok(screen.getAllByText('Insufficient repetitions').length >= 3);
  await click(button('Group 2')); assert.ok(screen.getByText(/Replication counts are unbalanced/)); assert.equal(screen.getByRole('img').querySelectorAll('circle').length, 1); assert.equal(screen.getByRole('img').querySelector('circle').getAttribute('cx'), '100'); await choose('Inspect configuration', 'Group 1 · 1 / 1 tests'); assert.equal(screen.getByRole('img').querySelectorAll('circle').length, 2);
  await click(button('Group 2')); view.rerender(React.createElement(RealWorldReportComparison, comparisonProps([a, b]))); assert.equal(screen.getByRole('img').querySelectorAll('circle').length, 2); assert.equal(screen.queryByText(/Replication counts are unbalanced/), null);
});

test('an empty comparison disables CSV and exports exclusions without inventing a configuration', async () => {
  const invalid = report(); invalid.summary.combined_mean_mbit_per_second = null; render(React.createElement(RealWorldReportComparison, comparisonProps([invalid]))); assert.ok(screen.getByText(/No eligible configuration groups/)); assert.equal(button('Comparison CSV').disabled, true); assert.equal(screen.queryByRole('img'), null); await click(button('Comparison JSON')); const output = JSON.parse(globalThis.__reportDownloads[0][1]); assert.deepEqual(output.result.blocks, []); assert.match(output.result.excluded[0].reason, /unavailable/);
});
