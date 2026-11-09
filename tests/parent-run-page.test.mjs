// Await the server data-selection units before rendering their synchronous tree.
// Next Flight streaming, authentication and browser navigation are separate checks.
import assert from 'node:assert/strict';
import {beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {JSDOM} from 'jsdom';

globalThis.__parentPageReact = React;
const replacements = {
  'next/link': "export default function Link(props){return globalThis.__parentPageReact.createElement('a',props);}",
  'next/navigation': "export function notFound(){throw Object.assign(new Error('Synthetic Next notFound'),{code:'NEXT_NOT_FOUND'});}",
  '@/app/components/user-preferences': "export function LocalDateTime({value,fallback}){return globalThis.__parentPageReact.createElement('time',{dateTime:value},value??fallback);}",
  '@/lib/emulated-runs-data': "export const fetchParentRunSummary=(id)=>globalThis.__parentPageRead(id); export const fetchCachedParentRunDashboardData=(id)=>globalThis.__parentPageDashboard(id);",
  './parent-run-charts': "export function ParentRunCharts({parentRunId}){return globalThis.__parentPageCharts(parentRunId);}",
  '@/app/components/emulated-runs-dashboard': "export function EmulatedRunChartsPanel(props){return globalThis.__parentPagePanel(props);}",
};
const hook = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const {default: Page, generateMetadata} = await import('../app/(modules)/congestion-control-emulated/parent-run/[id]/page.tsx');
const {ParentRunCharts} = await import('../app/(modules)/congestion-control-emulated/parent-run/[id]/parent-run-charts.tsx');
hook.deregister();

let summary, reads, dashboard, panel;
beforeEach(() => {
  summary = {id: 42, clientCount: 2, clientSummaryLine: 'Client 1 BBR · Client 2 CUBIC', createdAt: '2026-11-01T00:00:00Z', totalClientFileSizeMegabytes: 0, clientStartDelayMsValues: [0, 12.345], queueBufferSizeKilobyte: 125, bottleneckRateMegabit: 80};
  reads = []; dashboard = {parentRuns: [{id: 42}], runs: [{id: 100, emulated_parent_run_id: 42}], stats: [{emulated_run_id: 100, snapshot_index: 0}]}; panel = null;
  globalThis.__parentPageRead = async id => {reads.push(id); return summary;};
  globalThis.__parentPageDashboard = async id => {reads.push(id); return dashboard;};
  globalThis.__parentPageCharts = id => React.createElement('div', {'data-chart-parent': id});
  globalThis.__parentPagePanel = props => {panel = props; return React.createElement('div', {'data-measurements': props.stats.length});};
});
const props = (id = '42', page) => ({params: Promise.resolve({id}), searchParams: Promise.resolve(page === undefined ? {} : {page})});
const doc = async options => new JSDOM(renderToStaticMarkup(await Page(options))).window.document;
const card = (document, label) => [...document.querySelectorAll('article')].find(node => node.querySelector('p')?.textContent === label)?.lastElementChild.textContent;

test('parent-run metadata uses the recorded integer identity and does not query data', async () => {
  assert.deepEqual(await generateMetadata(props()), {title: {absolute: 'Jumpserve | 42'}});
  assert.deepEqual(await generateMetadata(props('invalid')), {title: {absolute: 'Jumpserve'}}); assert.deepEqual(reads, []);
});

test('invalid run identities stop at notFound before any data request', async () => {
  for (const id of ['invalid', '1.5', 'Infinity']) await assert.rejects(Page(props(id)), {code: 'NEXT_NOT_FOUND'});
  assert.deepEqual(reads, []);
});

test('missing parent rows remain explicit and never show an empty completed dashboard', async () => {
  summary = null; const document = await doc(props()); assert.equal(document.querySelector('h1').textContent, 'No parent run data found');
  assert.equal(document.querySelector('[data-chart-parent]'), null); assert.equal(document.querySelector('time'), null); assert.deepEqual(reads, [42]);
});

test('run details retain zero workload recorded units source timestamp and canonical links', async () => {
  const document = await doc(props('42', ['3', '9'])); const text = document.body.textContent;
  assert.match(text, /Emulated Run Explorer \| 42/); assert.match(text, /2 clients/); assert.match(text, /Client 1 BBR · Client 2 CUBIC/);
  assert.equal(card(document, 'Total File Size'), '0 MB'); assert.equal(card(document, 'Client Start Delay'), '0 ms, 12.35 ms'); assert.equal(card(document, 'Queue Buffer Size'), '125 kbytes'); assert.equal(card(document, 'Bottleneck Rate'), '80 mbit');
  assert.equal(document.querySelector('time').getAttribute('datetime'), summary.createdAt);
  assert.equal(document.querySelector('[aria-label="Return to test lookup page 3"]').getAttribute('href'), '/congestion-control-emulated/test-lookup?page=3');
  assert.equal([...document.querySelectorAll('a')].find(a => a.textContent.includes('Chat with AI')).getAttribute('href'), '/congestion-control-emulated/chat?parentRunId=42'); assert.equal(document.querySelector('[data-chart-parent]').getAttribute('data-chart-parent'), '42'); assert.deepEqual(reads, [42]);
});

test('unknown values stay missing and invalid return pages use the first lookup page', async () => {
  summary = {...summary, clientCount: 1, totalClientFileSizeMegabytes: null, clientStartDelayMsValues: [], queueBufferSizeKilobyte: null, bottleneckRateMegabit: null, createdAt: null};
  for (const page of [undefined, '', 'invalid', '0', '-3', []]) {
    const document = await doc(props('42', page)); assert.match(document.body.textContent, /1 client(?!s)/); assert.equal(document.querySelector('time').textContent, 'Unknown timestamp');
    for (const label of ['Total File Size', 'Client Start Delay', 'Queue Buffer Size', 'Bottleneck Rate']) assert.equal(card(document, label), 'None');
    assert.equal(document.querySelector('[aria-label="Return to test lookup page 1"]').getAttribute('href'), '/congestion-control-emulated/test-lookup?page=1');
  }
});

test('pending chart data renders the actual four-placeholder fallback without implying completion', async () => {
  globalThis.__parentPageCharts = () => {throw new Promise(() => {});}; const document = await doc(props());
  assert.match(document.body.textContent, /Loading chart data/); assert.equal(document.querySelectorAll('.animate-pulse').length, 4); assert.equal(document.querySelector('[data-chart-parent]'), null);
});

test('chart data selection passes the exact recorded parent runs clients and statistics to the chart boundary', async () => {
  const result = await ParentRunCharts({parentRunId: 42}); const document = new JSDOM(renderToStaticMarkup(result)).window.document;
  assert.deepEqual(reads, [42]); assert.equal(panel.parentRuns, dashboard.parentRuns); assert.equal(panel.runs, dashboard.runs); assert.equal(panel.stats, dashboard.stats); assert.equal(panel.initialSelectedParentRunId, 42); assert.equal(document.querySelector('[data-measurements]').getAttribute('data-measurements'), '1');
  globalThis.__parentPageDashboard = async () => {throw new Error('Synthetic data read failure');}; await assert.rejects(ParentRunCharts({parentRunId: 42}), /data read failure/);
});
