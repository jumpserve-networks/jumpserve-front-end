import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';

globalThis.__studyDashboardReact = React;
const replacements = {
  'next/link': 'export default function Link({href,...props}){return globalThis.__studyDashboardReact.createElement("a",{...props,href});}',
  '@/app/components/user-preferences': 'export const useDateTime=()=>value=>value??"Unavailable";',
};
const hooks = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {Http2Dashboard} = await import('../app/components/http2-study/dashboard.tsx');
const {IPv6Dashboard} = await import('../app/components/ipv6-study/dashboard.tsx');
hooks.deregister();

let requests, fetcher;
beforeEach(t => {
  requests = []; fetcher = async () => ({ok: true, json: async () => ({measurements: []})});
  t.mock.method(globalThis, 'fetch', (...args) => {requests.push(args); return fetcher(...args);});
});
afterEach(cleanup);
const click = async target => act(async () => {fireEvent.click(target);});
async function choose(label, name) {
  await click(screen.getByRole('combobox', {name: label, exact: true}));
  await act(async () => {const option = screen.getByRole('option', {name, exact: true}); fireEvent.pointerDown(option, {pointerType: 'mouse', button: 0}); fireEvent.click(option);});
}
function http2() {
  const configurations = [true, false, null].map((tls, i) => ({id: 'Synthetic-' + i, proxy: 'Synthetic proxy', version: i ? null : '1.0', mode: 'H2EE', tls, details: {}, actual_resources: i ? null : {cpus: 1}}));
  const summaries = configurations.map((config, i) => ({configuration_id: config.id, run_id: 'run-' + i, planned: 2, recorded: 2, missing: 0, unknown: 1, recoded: 1, author_counts: {received: 1, unknown: 1}, preserved_counts: {dropped: 1, unknown: 1}, published_counts: i ? null : {received: 0}, scope_observed: 1, scope_mismatches: 0, comparisons: {paired_cases: i ? null : 2, author_pair_differences: 0, known_pairs: 1, translation: {published_accepted_change: i ? null : 0, corrected_accepted_change: 1}}}));
  return {campaign: {recorded_runs: 3, planned_measurements: 6}, configurations, summaries, runs: [{id: 'run-0', original_execution_at: '2026-01-01T00:00:00Z'}], followups: [{id: 'synthetic-endpoint-control', recorded: 2, planned: 2, summary: {agreement: 1, disagreement: 1, unknown_or_failed: 0}}]};
}
const cases = () => [{test_id: 1, side: 'client', description: 'Original recorded zero code', expected: 'reset', expected_scope: null, author_outcome: 'received', outcome: 'unknown', error_code: 0, reason: null, status: 'unavailable'}, {test_id: 2, side: 'server', description: 'Original missing code', expected: 'goaway', expected_scope: 'connection', author_outcome: 'dropped', outcome: 'dropped', error_code: null, reason: 'Original timeout', status: 'recorded'}];

test('HTTP2 dashboard keeps recorded zero error codes separate from unavailable evidence and published counts', async () => {
  fetcher = async () => ({ok: true, json: async () => ({measurements: cases()})});
  await act(async () => {render(React.createElement(Http2Dashboard, {data: http2()}));});
  assert.equal(requests[0][0], '/http2-compliance-study/api/measurements?runId=run-0');
  assert.ok(screen.getByText('Original timeout')); assert.ok(screen.getByText('Original recorded zero code'));
  const rows = within(screen.getAllByRole('table').at(-1)).getAllByRole('row');
  assert.equal(within(rows[1]).getByText('0').textContent, '0');
  assert.ok(within(rows[2]).getByText('unavailable'));
  assert.ok(screen.getByText(/TLS yes/)); assert.ok(screen.getByText(/not a compliance rate/));
  assert.equal(screen.getByRole('link', {name: /Prepare a question/}).getAttribute('href'), '/http2-compliance-study/chat?configuration=Synthetic-0');
  assert.ok(screen.getByRole('img', {name: 'Published versus archived original counts'}).textContent.includes('unreported'));
});

test('HTTP2 archive selection aborts old requests and displays nullable TLS and pair provenance', async () => {
  fetcher = async () => ({ok: true, json: async () => ({measurements: cases()})});
  await act(async () => {render(React.createElement(Http2Dashboard, {data: http2()}));});
  await click(screen.getByRole('button', {name: 'Show all archived versions'}));
  await choose('Recorded configuration', 'Synthetic-1');
  assert.equal(requests[0][1].signal.aborted, true); assert.ok(screen.getByText(/TLS no/));
  assert.ok(screen.getByText('not applicable: client only'));
  await choose('Recorded configuration', 'Synthetic-2'); assert.ok(screen.getByText(/TLS unavailable/));
  await click(screen.getByRole('button', {name: 'Show published subset'}));
  assert.ok(screen.getByText(/TLS yes/));
});

test('HTTP2 measurement HTTP failures and incomplete vectors stay visible as errors', async () => {
  for (const [response, error] of [[{ok: false, status: 503}, 'Measurements unavailable (HTTP 503)'], [{ok: true, json: async () => ({measurements: []})}, 'Per-test coverage mismatch']]) {
    fetcher = async () => response;
    await act(async () => {render(React.createElement(Http2Dashboard, {data: http2()}));});
    assert.equal(screen.getByRole('alert').textContent, error);
    assert.equal(screen.queryByText('Original timeout'), null); cleanup();
  }
});

test('HTTP2 unmounted success and failure responses cannot replace the current page', async () => {
  for (const failure of [false, true]) {
    let settle; fetcher = () => new Promise((resolve, reject) => {settle = failure ? reject : resolve;});
    const view = render(React.createElement(Http2Dashboard, {data: http2()}));
    assert.ok(screen.getByText('Loading recorded cases…')); view.unmount();
    assert.equal(requests.at(-1)[1].signal.aborted, true);
    await act(async () => {settle(failure ? new Error('Late stale failure') : {ok: true, json: async () => ({measurements: cases()})});});
    assert.equal(screen.queryByRole('alert'), null); assert.equal(screen.queryByText('Original timeout'), null);
  }
});

test('HTTP2 missing configurations do not trigger evidence requests or fabricate summaries', async () => {
  const data = http2(); data.summaries = [];
  render(React.createElement(Http2Dashboard, {data}));
  assert.ok(screen.getByText('No recorded configuration is available.')); assert.equal(requests.length, 0);
});
test('HTTP2 translation comparisons preserve negative changes without adding a positive sign',async()=>{
 const data=http2();data.summaries[0].comparisons.translation.corrected_accepted_change=-1;data.summaries[1].comparisons.translation.published_accepted_change=0;data.summaries[1].comparisons.translation.corrected_accepted_change=0;fetcher=async()=>({ok:true,json:async()=>({measurements:cases()})});await act(async()=>render(React.createElement(Http2Dashboard,{data})));assert.ok(screen.getByText('-1 cases'));
});

function ipv6() {
  const configurations = ['v4-only', 'v6-only', 'ds'].map((family, i) => ({id: 'synthetic-' + i, mtu: 'mtu1500', family, cohort: 'dnssec', upstream: 'no-lgi', edns_bytes: 4096}));
  const statistic = {mean: 0, min: 0, max: 0, n: 2, planned: 3, missing: 1, invalid: 0, pooled: 0, routing_sensitivity_mean: null, routing_sensitivity_n: 0, paired_v6_minus_v4_mean_pp: null, paired_days: 0};
  return {meta: {validation: {reproduced_cells: 0, published_cells: 12}}, configurations,
    summaries: configurations.map((c, i) => ({configuration_id: c.id, epoch: 'current', statistics: {TIMEOUT: {...statistic, mean: i === 2 ? null : i * 2}}})),
    comparisons: [{configuration_id: 'synthetic-0', epoch: 'current', metric: 'TIMEOUT', published: 5, difference_pp: -5}],
    runs: [{id: 'retained-failure', status: 'failed', reason: 'Original missing archive day'}, {id: 'complete-day', status: 'complete', reason: null}]};
}

test('IPv6 dashboard keeps zero observations missing values denominators and paper comparisons distinct', () => {
  render(React.createElement(IPv6Dashboard, {data: ipv6()}));
  assert.ok(screen.getByText(/0 \/ 12 absolute cells reproduced/));
  const rows = within(screen.getByRole('table')).getAllByRole('row');
  const cells = within(rows[1]).getAllByRole('cell');
  assert.equal(cells[1].textContent, '0'); assert.equal(cells[2].textContent, '5'); assert.equal(cells[3].textContent, '-5');
  assert.equal(cells[5].textContent, '2 / 3'); assert.equal(cells[6].textContent, '1 / 0');
  assert.ok(screen.getByText(/Original missing archive day/)); assert.equal(screen.queryByText('complete-day'), null);
  assert.equal(screen.getByRole('link', {name: /1500.*v4-only/}).getAttribute('href'), '/ipv6-dns-study/chat?configuration=synthetic-0');
  assert.equal(screen.getAllByRole('img').length, 2);
  assert.ok(screen.getAllByRole('img').every(svg => !svg.innerHTML.includes('NaN')));
  assert.equal(requests.length, 0);
});

test('IPv6 controls independently select epoch cohort upstream EDNS and metric without inventing observations', async () => {
  render(React.createElement(IPv6Dashboard, {data: ipv6()}));
  for (const [label, name] of [['Historical epoch', 'May 25–Jun 14 · pre-LGI'], ['DNSSEC cohort', 'no-dnssec'], ['Recorded upstream', 'lgi'], ['EDNS payload (bytes)', '512'], ['Metric', 'SERVFAIL']]) await choose(label, name);
  assert.ok(screen.getByText('No valid observations for this configuration. Missing or invalid values are not zero.'));
  assert.equal(screen.queryByRole('img'), null);
  assert.ok(screen.getByText('SERVFAIL · recorded daily mean (%)'));
});
test('IPv6 charts label missing day denominators separately from a recorded daily mean',()=>{
 const data=ipv6();delete data.summaries[0].statistics.TIMEOUT.n;delete data.summaries[0].statistics.TIMEOUT.planned;render(React.createElement(IPv6Dashboard,{data}));assert.ok([...document.querySelectorAll('svg title')].some(title=>title.textContent.includes('missing/missing days')));
});
