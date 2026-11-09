import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';

globalThis.__indexReact = React;
const replacements = {
  'next/link': `export default function Link({href,...props}) {return globalThis.__indexReact.createElement('a',{...props,href});}`,
  'next/navigation': `export const useRouter=()=>({push:(...args)=>globalThis.__indexPush(...args)});`,
  '@/app/components/user-preferences': `export const LocalDateTime=({value,fallback})=>globalThis.__indexReact.createElement('time',{},value??fallback);`,
};
const hook = registerHooks({resolve(specifier, context, next) {
  return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);
}});
const {ParentRunIndex} = await import('../app/components/parent-run-index.tsx');
hook.deregister();
afterEach(() => {cleanup(); delete globalThis.__indexPush;});

const parent = (id, change = {}) => ({id, createdAt: '2026-11-01T00:00:00Z', snapshotLengthSeconds: 1,
  chartDurationSeconds: id, clientCount: 2, clientSummaryLine: `Fixture run ${id}`, clientFlowCompletionTimes: [
    {clientNumber: 1, flowCompletionTimeMs: id * 1000}, {clientNumber: 2, flowCompletionTimeMs: id * 100}],
  ccaLabels: ['bbr', 'cubic'], delayLabels: ['0ms', '10ms'], clientStartDelayMsValues: [0, id],
  clientFileSizeMegabytesValues: [5], totalClientFileSizeMegabytes: id * 10, bottleneckRateMegabit: id * 10,
  queueBufferSizeKilobyte: id * 100, ...change});
const options = values => values.map(value => ({value, count: 2}));
const filters = () => ({clientCounts: options([1, 2]), ccaLabels: options(['bbr', 'cubic']), ccaLabelsByClientNumber: {1: options(['bbr', 'cubic']), 2: options(['bbr', 'cubic'])},
  addedDelaysMs: options([0, 10]), clientStartDelaysMs: options([0, 5]), clientFileSizesMegabytes: options([5, 10]),
  bottleneckRatesMegabit: options([10, 20]), queueBufferSizesKilobyte: options([125, 500])});
const page = change => ({parentRuns: [parent(1), parent(3), parent(2)], filterOptions: filters(), page: 1, pageSize: 10,
  totalPages: 3, totalCount: 30, hasMore: true, ...change});
const show = value => render(React.createElement(ParentRunIndex, {initialPage: value ?? page()}));
const rowIds = () => [...screen.getByRole('table').querySelectorAll('tbody tr')].map(row => Number(row.querySelector('a').getAttribute('href').match(/parent-run\/(\d+)/)[1]));
function publicFetch(t, reply = request => page({page: Number(request.searchParams.get('page'))})) {
  return t.mock.method(globalThis, 'fetch', async (url, options) => {
    const request = new URL(url, 'http://localhost:6001');
    assert.equal(request.pathname, '/congestion-control-emulated/api/parent-runs'); assert.equal(options.cache, 'no-store');
    assert.equal(options.headers?.Authorization, undefined);
    return Response.json(reply(request));
  });
}
async function openFilter(label) {
  fireEvent.click(screen.getByRole('button', {name: new RegExp(`^${label}:`)}));
  return screen.findByRole('dialog', {name: `${label} filters`});
}
async function closeFilter(dialog) {
  fireEvent.keyDown(dialog, {key: 'Escape'});
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
}

test('initial data is not refetched, table ordering and measured units are visible, and rows navigate by pointer and keyboard', t => {
  const fetch = publicFetch(t), pushes = []; globalThis.__indexPush = value => pushes.push(value);
  show(); assert.equal(fetch.mock.callCount(), 0); assert.deepEqual(rowIds(), [3, 2, 1]);
  const table = screen.getByRole('table'); assert.match(table.textContent, /C1: 1 s/); assert.match(table.textContent, /C2: 100 ms/);
  const row = table.querySelector('tbody tr'); fireEvent.click(row); fireEvent.keyDown(row, {key: 'Enter'}); fireEvent.keyDown(row, {key: ' '}); fireEvent.keyDown(row, {key: 'ArrowDown'});
  assert.deepEqual(pushes, Array(3).fill('/congestion-control-emulated/parent-run/3?page=1'));
  assert.equal(within(row).getByRole('link').getAttribute('href'), pushes[0]);
});

test('every table sort uses recorded values, handles unknown values and resolves equal values by parent identity', () => {
  show(page({parentRuns: [parent(2), parent(1), parent(3, {chartDurationSeconds: null, clientFlowCompletionTimes: [], totalClientFileSizeMegabytes: null,
    clientStartDelayMsValues: [], queueBufferSizeKilobyte: null, bottleneckRateMegabit: null})]}));
  for (const label of ['Elapsed', 'Flow Times', 'File Size', 'Start Delay', 'Queue', 'Bottleneck']) {
    fireEvent.click(screen.getByRole('button', {name: label, exact: true})); assert.deepEqual(rowIds(), label === 'Start Delay' ? [3, 2, 1] : [3, 1, 2], label);
    fireEvent.click(screen.getByRole('button', {name: label, exact: true})); assert.deepEqual(rowIds(), [2, 1, 3], label);
  }
  fireEvent.click(screen.getByRole('button', {name: 'Run', exact: true})); assert.deepEqual(rowIds(), [3, 2, 1]);
  fireEvent.click(screen.getByRole('button', {name: 'Run', exact: true})); assert.deepEqual(rowIds(), [1, 2, 3]);
});

test('grid and table preserve recorded zero and missing values and retain the current page in detail links', () => {
  show(page({page: 2, parentRuns: [parent(1, {clientCount: 1, createdAt: null, chartDurationSeconds: 0,
    clientFlowCompletionTimes: [{clientNumber: 1, flowCompletionTimeMs: 0}, {clientNumber: 2, flowCompletionTimeMs: NaN}], totalClientFileSizeMegabytes: null})]}));
  const table = screen.getByRole('table'); assert.match(table.textContent, /0 s/); assert.match(table.textContent, /C1: 0 ms/); assert.match(table.textContent, /C2: None/);
  assert.ok(screen.getByText('Unknown timestamp'));
  fireEvent.click(screen.getByRole('button', {name: 'Grid view'})); assert.equal(screen.queryByRole('table'), null);
  const link = screen.getByRole('link', {name: /Fixture run 1/}); assert.match(link.textContent, /1 client/); assert.match(link.textContent, /Total file size: None/);
  assert.equal(link.getAttribute('href'), '/congestion-control-emulated/parent-run/1?page=2');
  fireEvent.click(screen.getByRole('button', {name: 'Table view'})); assert.ok(screen.getByRole('table'));
});

test('pagination clamps jumps, prevents duplicate current-page reads and disables pending controls', async t => {
  const pending = []; t.mock.method(globalThis, 'fetch', (url, options) => new Promise(resolve => pending.push({url, options, resolve})));
  show(); fireEvent.click(screen.getByRole('button', {name: '1', exact: true})); assert.equal(pending.length, 0);
  fireEvent.click(screen.getByRole('button', {name: 'Next', exact: true})); assert.equal(pending.length, 1);
  assert.equal(new URL(pending[0].url, locationOrigin()).searchParams.get('page'), '2');
  assert.equal(screen.getByRole('button', {name: 'Next'}).disabled, true);
  await act(async () => pending[0].resolve(Response.json(page({page: 2}))));
  assert.equal(screen.getByRole('textbox', {name: 'Go to page'}).value, '2');
  const jump = screen.getByRole('textbox', {name: 'Go to page'});
  fireEvent.change(jump, {target: {value: '999'}}); fireEvent.submit(jump.closest('form'));
  assert.equal(new URL(pending[1].url, locationOrigin()).searchParams.get('page'), '3');
  await act(async () => pending[1].resolve(Response.json(page({page: 3}))));
  assert.equal(screen.getByRole('button', {name: 'Next'}).disabled, true);
  fireEvent.change(jump, {target: {value: 'not-a-page'}}); fireEvent.submit(jump.closest('form')); assert.equal(pending.length, 2);
  fireEvent.change(jump, {target: {value: '-10'}}); fireEvent.submit(jump.closest('form'));
  assert.equal(new URL(pending[2].url, locationOrigin()).searchParams.get('page'), '1');
  await act(async () => pending[2].resolve(Response.json(page())));
  assert.equal(screen.getByRole('button', {name: 'Prev'}).disabled, true);
});
function locationOrigin() {return 'http://localhost:6001';}

test('page failures retain the recorded page and allow retry, including untyped and JSON failures', async t => {
  const responses = [async () => new Response('Unavailable', {status: 503}), async () => {throw null;}, async () => new Response('invalid json'), async () => Response.json(page({page: 2}))];
  t.mock.method(globalThis, 'fetch', () => responses.shift()()); show();
  for (let attempt = 0; attempt < 3; attempt++) {
    fireEvent.click(screen.getByRole('button', {name: 'Next'})); await screen.findByRole('alert');
    assert.deepEqual(rowIds(), [3, 2, 1]); assert.equal(screen.getByRole('button', {name: 'Next'}).disabled, false);
  }
  fireEvent.click(screen.getByRole('button', {name: 'Next'})); await waitFor(() => assert.equal(screen.queryByRole('alert'), null));
  await waitFor(() => assert.equal(screen.getByRole('textbox', {name: 'Go to page'}).value, '2'));
});

test('search normalization resets pagination and filtered retrieval failures keep prior measurements', async t => {
  const fetch = publicFetch(t); show(page({page: 2}));
  fireEvent.change(screen.getByRole('textbox', {name: 'Parent run ID search'}), {target: {value: ' Target '}});
  await waitFor(() => assert.equal(screen.getByRole('textbox', {name: 'Go to page'}).value, '1'));
  let request = new URL(fetch.mock.calls[0].arguments[0], locationOrigin()); assert.equal(request.searchParams.get('search'), 'target'); assert.equal(request.searchParams.get('pageSize'), '10');
  fireEvent.click(screen.getByRole('button', {name: 'Clear filters'}));
  await waitFor(() => assert.equal(fetch.mock.callCount(), 2));
  request = new URL(fetch.mock.calls[1].arguments[0], locationOrigin()); assert.equal(request.searchParams.has('search'), false);
});

test('filter changes discard stale responses and abort the superseded request', async t => {
  const pending = []; t.mock.method(globalThis, 'fetch', (url, options) => new Promise(resolve => pending.push({url, options, resolve})));
  show(); const input = screen.getByRole('textbox', {name: 'Parent run ID search'});
  fireEvent.change(input, {target: {value: 'old'}}); fireEvent.change(input, {target: {value: 'new'}});
  await act(async () => pending[1].resolve(Response.json(page({parentRuns: [parent(20)], totalPages: 1}))));
  assert.ok(screen.getByText('Parent #20'));
  await act(async () => pending[0].resolve(Response.json(page({parentRuns: [parent(10)], totalPages: 1}))));
  assert.ok(screen.getByText('Parent #20')); assert.equal(screen.queryByText('Parent #10'), null);
  assert.equal(pending[0].options.signal.aborted, true);
});

test('client count and ordered CCA selections are transmitted as independent server filters', async t => {
  const fetch = publicFetch(t); show();
  let dialog = await openFilter('Number of clients');
  fireEvent.click(within(dialog).getByRole('checkbox', {name: /2 clients/}));
  await waitFor(() => assert.equal(fetch.mock.callCount(), 1)); await closeFilter(dialog);
  dialog = await openFilter('CCA'); fireEvent.click(within(dialog).getByRole('checkbox', {name: /bbr/}));
  fireEvent.click(within(dialog).getByRole('button', {name: 'Ordered only'}));
  const all = within(dialog).getAllByRole('checkbox', {name: /cubic/}); assert.equal(all.length, 3);
  fireEvent.click(all[1]); fireEvent.click(all[2]); await closeFilter(dialog);
  await waitFor(() => assert.ok(fetch.mock.callCount() >= 4));
  const request = new URL(fetch.mock.calls.at(-1).arguments[0], locationOrigin());
  assert.deepEqual(request.searchParams.getAll('clientCount'), ['2']); assert.deepEqual(request.searchParams.getAll('cca'), ['bbr']);
  assert.deepEqual(request.searchParams.getAll('ccaClient1'), ['cubic']); assert.deepEqual(request.searchParams.getAll('ccaClient2'), ['cubic']);
});

test('empty result pages expose no fabricated table or pagination', () => {
  show(page({parentRuns: [], totalCount: 0, totalPages: 1}));
  assert.ok(screen.getByText('No parent runs matched your filters.')); assert.equal(screen.queryByRole('table'), null);
  assert.equal(screen.queryByRole('button', {name: 'Next'}), null);
});

test('an obsolete filtered rejection cannot clear the current loading state or expose its error', async t => {
  const pending = []; t.mock.method(globalThis, 'fetch', (url, options) => new Promise((resolve, reject) => pending.push({url, options, resolve, reject})));
  const {unmount} = show(); const input = screen.getByRole('textbox', {name: 'Parent run ID search'});
  fireEvent.change(input, {target: {value: 'old'}}); fireEvent.change(input, {target: {value: 'new'}});
  await act(async () => pending[0].reject(new Error('obsolete failure')));
  assert.equal(screen.queryByRole('alert'), null); assert.equal(screen.getByRole('button', {name: 'Next'}).disabled, true);
  unmount(); assert.equal(pending[1].options.signal.aborted, true);
  await act(async () => pending[1].reject(new Error('aborted after unmount')));
});

test('a new filter supersedes pending pagination and only the current read can update data', async t => {
  const pending = []; t.mock.method(globalThis, 'fetch', (url, options) => new Promise((resolve, reject) => pending.push({url, options, resolve, reject})));
  show(); fireEvent.click(screen.getByRole('button', {name: 'Next'}));
  fireEvent.change(screen.getByRole('textbox', {name: 'Parent run ID search'}), {target: {value: 'new'}});
  assert.equal(pending[0].options.signal.aborted, true);
  await act(async () => pending[0].reject(new Error('old page failed')));
  assert.equal(screen.queryByRole('alert'), null); assert.equal(screen.getByRole('button', {name: 'Go'}).disabled, true);
  await act(async () => pending[1].resolve(Response.json(page({parentRuns: [parent(20)]}))));
  assert.ok(screen.getByText('Parent #20')); assert.equal(screen.getByRole('button', {name: 'Go'}).disabled, false);
});

test('current filtered errors retain their diagnostics while empty or unknown failures stay explicit', async t => {
  const replies = [async () => new Response('Unavailable', {status: 503}), async () => {throw null;}, async () => Response.json(page())];
  t.mock.method(globalThis, 'fetch', () => replies.shift()()); show();
  const input = screen.getByRole('textbox', {name: 'Parent run ID search'});
  for (const value of ['first', 'second']) {
    fireEvent.change(input, {target: {value}});
    assert.equal((await screen.findByRole('alert')).textContent, 'Failed to load parent run page.');
    assert.equal(screen.getByRole('button', {name: 'Next'}).disabled, false);
  }
  fireEvent.click(screen.getByRole('button', {name: 'Clear filters'}));
  await waitFor(() => assert.equal(screen.queryByRole('alert'), null));
});

test('every numeric filter expands its recorded options and retains only the selected values in server requests', async t => {
  const wide = filters();
  for (const field of ['addedDelaysMs', 'clientStartDelaysMs', 'clientFileSizesMegabytes', 'bottleneckRatesMegabit', 'queueBufferSizesKilobyte']) wide[field] = options([0, 1, 2, 3, 4, 5, 6]);
  const fetch = publicFetch(t, request => page({filterOptions: wide, page: Number(request.searchParams.get('page'))}));
  show(page({filterOptions: wide})); fireEvent.click(screen.getByRole('button', {name: 'Show more filters'}));
  for (const [label, parameter] of [['Added Delay', 'addedDelayMs'], ['Client File Size', 'clientFileSizeMb'],
    ['Client Start Delay', 'clientStartDelayMs'], ['Queue Buffer Size', 'queueBufferKbyte'], ['Bottleneck Rate', 'bottleneckRateMbit']]) {
    const dialog = await openFilter(label);
    assert.equal(within(dialog).getAllByRole('checkbox').length, 6);
    fireEvent.click(within(dialog).getByRole('button', {name: 'Show more (1)'}));
    let boxes = within(dialog).getAllByRole('checkbox'); assert.equal(boxes.length, 7);
    fireEvent.click(boxes[0]); fireEvent.click(boxes[6]); fireEvent.click(boxes[0]);
    await waitFor(() => assert.deepEqual(new URL(fetch.mock.calls.at(-1).arguments[0], locationOrigin()).searchParams.getAll(parameter), ['6']));
    fireEvent.click(within(dialog).getByRole('button', {name: 'Show less'}));
    assert.equal(within(dialog).getAllByRole('checkbox').length, 6);
    await closeFilter(dialog);
  }
  fireEvent.click(screen.getByRole('button', {name: 'Show less'}));
  assert.equal(screen.queryByRole('button', {name: /^Client Start Delay:/}), null);
  fireEvent.click(screen.getByRole('button', {name: 'Clear filters'}));
  await waitFor(() => assert.equal(new URL(fetch.mock.calls.at(-1).arguments[0], locationOrigin()).searchParams.size, 2));
});

test('long CCA lists expand without losing selection and empty ordered-client options remain explicit', async t => {
  const wide = filters(); wide.ccaLabels = options(['bbr', 'cubic', 'reno', 'vegas', 'westwood', 'hybla', 'dctcp']); wide.ccaLabelsByClientNumber = {};
  const fetch = publicFetch(t, () => page({filterOptions: wide})); show(page({filterOptions: wide}));
  const dialog = await openFilter('CCA');
  assert.equal(within(dialog).getAllByRole('checkbox').length, 6);
  fireEvent.click(within(dialog).getByRole('button', {name: 'Show more (1)'}));
  fireEvent.click(within(dialog).getByRole('checkbox', {name: /dctcp/}));
  await waitFor(() => assert.equal(fetch.mock.callCount(), 1));
  fireEvent.click(within(dialog).getByRole('button', {name: 'Ordered only'}));
  assert.ok(within(dialog).getByText('No client 1 CCA values found.'));
  assert.ok(within(dialog).getByText('No client 2 CCA values found.'));
  fireEvent.click(within(dialog).getByRole('checkbox', {name: /dctcp/}));
  fireEvent.click(within(dialog).getByRole('button', {name: 'Show less'}));
  await closeFilter(dialog);
});

test('long result histories show bounded page controls with gaps and fetch the selected page', async t => {
  const fetch = publicFetch(t, request => page({page: Number(request.searchParams.get('page')), totalPages: 50}));
  show(page({page: 25, totalPages: 50, totalCount: 500}));
  for (const value of ['1', '2', '24', '25', '26', '49', '50']) assert.ok(screen.getByRole('button', {name: value, exact: true}));
  assert.equal(screen.queryByRole('button', {name: '10', exact: true}), null);
  fireEvent.click(screen.getByRole('button', {name: '49', exact: true}));
  await waitFor(() => assert.equal(screen.getByRole('textbox', {name: 'Go to page'}).value, '49'));
  assert.equal(new URL(fetch.mock.calls[0].arguments[0], locationOrigin()).searchParams.get('page'), '49');
  fireEvent.click(screen.getByRole('button',{name:'Prev',exact:true}));await waitFor(()=>assert.equal(screen.getByRole('textbox',{name:'Go to page'}).value,'48'));
});

test('removing ordered CCA and client-count filters clears only those exact selections',async t=>{
 const fetch=publicFetch(t);show();let dialog=await openFilter('Number of clients');const count=within(dialog).getByRole('checkbox',{name:/2 clients/});fireEvent.click(count);fireEvent.click(count);await closeFilter(dialog);dialog=await openFilter('CCA');fireEvent.click(within(dialog).getByRole('button',{name:'Ordered only'}));const values=within(dialog).getAllByRole('checkbox',{name:/cubic/});for(const control of values.slice(1)){fireEvent.click(control);fireEvent.click(control);}await closeFilter(dialog);await waitFor(()=>assert.ok(fetch.mock.callCount()>0));const query=new URL(fetch.mock.calls.at(-1).arguments[0],locationOrigin()).searchParams;for(const key of ['clientCount','ccaClient1','ccaClient2'])assert.equal(query.has(key),false);
});

test('missing catalog filter values remain explicit rather than suggesting invented options',async()=>{
 const missing=filters();missing.ccaLabels=[];missing.addedDelaysMs=[];show(page({filterOptions:missing}));let dialog=await openFilter('CCA');assert.ok(within(dialog).getByText('No CCA values found.'));await closeFilter(dialog);dialog=await openFilter('Added Delay');assert.ok(within(dialog).getByText('No delay values found.'));await closeFilter(dialog);
});

test('empty optional numeric filters and populated grid metadata keep their recorded distinctions',async()=>{
 const missing=filters();missing.clientStartDelaysMs=[];missing.queueBufferSizesKilobyte=[];missing.bottleneckRatesMegabit=[];
 show(page({filterOptions:missing,parentRuns:[parent(1,{totalClientFileSizeMegabytes:0})]}));fireEvent.click(screen.getByRole('button',{name:'Show more filters'}));
 for(const label of ['Client Start Delay','Queue Buffer Size','Bottleneck Rate']){const dialog=await openFilter(label);assert.equal(within(dialog).queryByRole('checkbox'),null);await closeFilter(dialog);}
 fireEvent.click(screen.getByRole('button',{name:'Grid view'}));const link=screen.getByRole('link',{name:/Fixture run 1/});assert.match(link.textContent,/2 clients/);assert.match(link.textContent,/Total file size: 0 MB/);
});
