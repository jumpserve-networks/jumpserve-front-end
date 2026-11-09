import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';

globalThis.__aggregateReact = React;
const hook = registerHooks({resolve(specifier, context, next) {
  return specifier === 'next/link' ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(`export default function Link({href,...props}) {return globalThis.__aggregateReact.createElement('a',{...props,href});}`)} : next(specifier, context);
}});
const {AggregateGraphsPanel} = await import('../app/components/aggregate-graphs-panel.tsx');
const {ResearchComparisonPanel}=await import('../app/components/research-comparison-panel.tsx');
hook.deregister();
afterEach(cleanup);

function experiment(id, cca = 'bbr', delay = 10, repetition = 0, change = {}) {
  const configuration = {numberOfClients: 2, rateMbps: 80, bufferKib: 125, snapshotMs: 100,
    topology: 'single-bottleneck', topologyConfig: null, jobConfig: {script: 'netem_nines.py'},
    clients: [1, 2].map(clientNumber => ({clientNumber, delayMs: clientNumber === 1 ? delay : 11, startDelayMs: 0, workloadMb: 100, cca}))};
  return configuration.clients.map(client => ({configuration, parentRunId: id, numberOfClients: 2,
    clientNumber: client.clientNumber, delayAddedMs: client.delayMs, clientStartDelayMs: 0,
    flowCompletionTimeMs: 1000 * client.clientNumber + delay * 10 + repetition * 100 + (cca === 'cubic' ? 500 : 0),
    averageThroughputMbps: null, runCount: 1, congestionControlAlgorithmName: cca, clientFileSizeMegabytes: 100,
    queueBufferSizeKilobyte: 125, bottleneckRateMegabit: 80, ...change}));
}
function fixture() {
  const points = []; let id = 1;
  for (const cca of ['bbr', 'cubic']) for (const delay of [10, 20]) for (let repetition = 0; repetition < 5; repetition++) points.push(...experiment(id++, cca, delay, repetition));
  return points;
}
const show = (points = fixture()) => render(React.createElement(AggregateGraphsPanel, {data: points}));
const selectView = label => fireEvent.click(within(screen.getByRole('group', {name: 'Chart view'})).getByRole('button', {name: label}));
const selectMode = label => fireEvent.click(within(screen.getByRole('group', {name: 'Explorer mode'})).getByRole('button', {name: label}));
const dots = svg => [...svg.querySelectorAll('circle[tabindex="0"]')];
test('comparison exclusions count every parent with the same missing launch configuration',()=>{
 for(const count of [1,2]){render(React.createElement(ResearchComparisonPanel,{points:Array.from({length:count},(_,index)=>experiment(index+1)).flat().map(point=>({...point,configuration:{...point.configuration,jobConfig:null}})),selectedClients:[1,2]}));assert.ok(screen.getByText('Runner configuration unavailable or unsupported: '+count+(count===1?' parent run':' parent runs')));cleanup();}
});
test('missing configuration descriptors stay unavailable across all preset client records',async()=>{
 const points=experiment(1,'bbr',10,0,{congestionControlAlgorithmName:null,clientStartDelayMs:null,clientFileSizeMegabytes:null,bottleneckRateMegabit:null});show(points);
 fireEvent.click(screen.getByRole('button',{name:'Presets'}));const dialog=await screen.findByRole('dialog',{name:'Select Available Tests'});assert.match(dialog.textContent,/0 tests/);assert.doesNotMatch(dialog.textContent,/NaN|undefined/);assert.ok(screen.getByText('Filtered dataset: 2 client measurements across 1 active tests.'));
});

test('measurement and filter definitions expand accessibly without changing selected outcomes', async () => {
  show();
  fireEvent.click(screen.getByRole('button', {name: 'About these measurements'}));
  await screen.findByText('One benchmark execution containing the client runs that were launched together.');
  assert.ok(screen.getByText('Flow Completion Time: how long a client took to finish its transfer. Lower is better.'));
  fireEvent.click(screen.getByRole('button', {name: 'Filter definitions'}));
  await screen.findByText('Configured bottleneck link rate for the parent run.');
  assert.ok(screen.getByText('Client file size. Larger workloads usually create longer FCT values.'));
  assert.ok(screen.getByText('Filtered dataset: 40 client measurements across 20 active tests.'));
  assert.equal(document.querySelectorAll('dl').length, 2);
});

test('select-all and deselect controls retain explicit test selections and close through Done', async () => {
  show(); fireEvent.click(screen.getByRole('button', {name: 'Presets'}));
  const dialog = await screen.findByRole('dialog', {name: 'Select Available Tests'});
  fireEvent.click(within(dialog).getByRole('button', {name: 'Select All'}));
  assert.ok(within(dialog).getAllByText('20 tests active').length);
  fireEvent.click(within(dialog).getByRole('button', {name: 'Select All'}));
  assert.equal(screen.getByText('Filtered dataset: 40 client measurements across 20 active tests.').textContent, 'Filtered dataset: 40 client measurements across 20 active tests.');
  fireEvent.click(within(dialog).getByRole('button', {name: 'Select All'}));
  fireEvent.click(within(dialog).getByRole('button', {name: 'Deselect All'}));
  fireEvent.click(within(dialog).getByRole('button', {name: 'Done'}));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.equal(screen.queryByRole('button', {name: 'Use Filter Matches'}), null);
});

test('empty aggregate results remain explicit and compare mode explains why no estimate exists', () => {
  show([]);
  assert.ok(screen.getByRole('heading', {name: 'Aggregate Graphs'}));
  assert.ok(screen.getByText('Filtered dataset: 0 client measurements across 0 active tests.'));
  assert.ok(screen.getByText('No flow completion data matches the current filters.'));
  selectMode('Compare Cohorts');
  assert.ok(screen.getByText(/No configuration-matched comparison is available/));
  assert.equal(screen.queryByRole('table'), null);
  assert.equal(screen.getByRole('link', {name: 'Go to emulated tests module'}).getAttribute('href'), '/congestion-control-emulated');
});

test('connected runs show recorded clients and test count, and expose accessible per-point measurements', () => {
  show();
  assert.ok(screen.getByText('Filtered dataset: 40 client measurements across 20 active tests.'));
  const svg = screen.getByRole('img', {name: /Parent-run line chart/});
  assert.equal(dots(svg).length, 40);
  assert.match(dots(svg)[0].getAttribute('aria-label'), /Parent \d+, client [12], delay \d+ ms, flow completion time/);
  assert.match(dots(svg)[0].getAttribute('aria-label'), /queue buffer 125 KB, workload 100 MB/);
  fireEvent.focus(dots(svg)[0]);
  assert.ok(svg.querySelector('rect[pointer-events="none"], g[pointer-events="none"]'));
  fireEvent.mouseLeave(svg);
});

test('scatter and ECDF views report actual measurements on hover and keyboard focus', () => {
  show(experiment(1));
  for (const [view, name] of [['Scatter', /Run-level scatter plot/], ['ECDF', /Empirical cumulative distribution/]]) {
    selectView(view); const svg = screen.getByRole('img', {name});
    assert.equal(dots(svg).length, 2);
    fireEvent.mouseEnter(dots(svg)[0]); assert.ok(svg.querySelector('rect'));
    const text = svg.textContent; assert.match(text, /1\.1|1\.10|1100/);
    fireEvent.mouseLeave(svg); fireEvent.focus(dots(svg)[1]); assert.ok(svg.querySelector('rect'));
    assert.match(dots(svg)[1].getAttribute('aria-label'), /parent run 1/);
    for (const path of svg.querySelectorAll('path')) assert.doesNotMatch(path.getAttribute('d'), /NaN|Infinity/);
  }
});

test('heatmap percentiles change the statistic within each recorded client and delay bucket', () => {
  show([...experiment(1, 'bbr', 10, 0), ...experiment(2, 'bbr', 10, 2), ...experiment(3, 'bbr', 10, 10)]);
  selectView('Heatmap');
  const svg = screen.getByRole('img', {name: /Heatmap of percentile/});
  const percentile = screen.getByRole('group', {name: 'Heatmap percentile'});
  fireEvent.click(within(percentile).getByRole('button', {name: 'p50'}));
  assert.ok(within(svg).getByText('1300')); assert.ok(within(svg).getByText('2300'));
  fireEvent.click(within(percentile).getByRole('button', {name: 'max'}));
  assert.ok(within(svg).getByText('2100')); assert.ok(within(svg).getByText('3100'));
  fireEvent.click(within(percentile).getByRole('button', {name: 'p90'}));
  assert.ok(within(svg).getByText('1940')); assert.ok(within(svg).getByText('2940'));
});

test('other-client delay uses only paired two-client parents and keeps the primary outcome attached to its own parent', () => {
  show([...experiment(1), ...experiment(2, 'bbr', 20), ...experiment(3, 'bbr', 10, 0, {numberOfClients: 3})]);
  selectView('Other Client Delay');
  const svg = screen.getByRole('img', {name: /Scatter plot of flow completion time versus the other/});
  assert.equal(dots(svg).length, 2);
  assert.match(dots(svg)[0].getAttribute('aria-label'), /client 1, flow completion time.*other client 2 added delay 11 ms/);
  fireEvent.mouseEnter(dots(svg)[0]); assert.ok(svg.querySelector('rect'));
  fireEvent.focus(dots(svg)[1]); assert.ok(svg.querySelector('rect'));
  assert.equal(screen.queryByRole('group', {name: 'Client filter'}), null);
});

test('other-client delay counts only plotted parents and comparison mode counts its own selected outcomes', () => {
  const duplicate = experiment(3);
  show([...experiment(1), ...experiment(2, 'bbr', 10, 0, {numberOfClients: 3}), ...duplicate, duplicate[0],
    experiment(4)[0], ...experiment(5).map((point, i) => ({...point, clientNumber: i + 2}))]);
  selectView('Other Client Delay');
  assert.equal(dots(screen.getByRole('img', {name: /Scatter plot of flow completion time versus the other/})).length, 1);
  assert.ok(screen.getByText('Filtered dataset: 1 client measurements across 1 active tests.'));
  selectMode('Compare Cohorts');
  assert.ok(screen.getByText('Filtered dataset: 10 client measurements across 5 active tests.'));
});

test('client and parent filters change visible outcomes and reset restores recorded data', () => {
  show();
  const clients = screen.getByRole('group', {name: 'Client filter'});
  fireEvent.click(within(clients).getByRole('button', {name: 'Client 2'}));
  assert.ok(screen.getByText('Filtered dataset: 20 client measurements across 20 active tests.'));
  fireEvent.click(within(clients).getByRole('button', {name: 'Client 1'}));
  assert.ok(screen.getByText('No flow completion data matches the current filters.'));
  // Client choices are independent of the inline experiment filters.
  selectMode('Compare Cohorts');
  fireEvent.click(within(screen.getByRole('group', {name: 'Client filter'})).getByRole('button', {name: 'Client 1'}));
  selectMode('Explore');
  fireEvent.change(screen.getByRole('textbox', {name: 'Parent Run'}), {target: {value: '20'}});
  assert.ok(screen.getByText('Filtered dataset: 1 client measurements across 1 active tests.'));
  fireEvent.click(screen.getByRole('button', {name: 'Reset'}));
  assert.ok(screen.getByText('Filtered dataset: 20 client measurements across 20 active tests.'));
});

test('inline configuration filters use OR within a category and intersect independent categories', () => {
  show([...experiment(1, 'bbr', 10), ...experiment(2, 'cubic', 10, 0, {clientFileSizeMegabytes: 50, queueBufferSizeKilobyte: 500, bottleneckRateMegabit: 100})]);
  fireEvent.click(screen.getByRole('button', {name: 'BBR', exact: true}));
  assert.ok(screen.getByText('Filtered dataset: 2 client measurements across 1 active tests.'));
  fireEvent.click(screen.getByRole('button', {name: 'CUBIC', exact: true}));
  assert.ok(screen.getByText('Filtered dataset: 4 client measurements across 2 active tests.'));
  fireEvent.click(screen.getByRole('button', {name: '50 MB', exact: true}));
  assert.ok(screen.getByText('Filtered dataset: 2 client measurements across 1 active tests.'));
  fireEvent.click(screen.getByRole('button', {name: '50 MB', exact: true}));
  fireEvent.click(screen.getByRole('button', {name: '125 KB', exact: true}));
  assert.ok(screen.getByText('Filtered dataset: 2 client measurements across 1 active tests.'));
  fireEvent.click(screen.getByRole('button', {name: 'BBR', exact: true}));
  assert.ok(screen.getByText('No flow completion data matches the current filters.'));
  fireEvent.click(screen.getByRole('button', {name: 'Reset'}));
  assert.ok(screen.getByText('Filtered dataset: 4 client measurements across 2 active tests.'));
});

test('matched cohort comparison records parent repetitions and signed effects, with provenance links', () => {
  show(); selectMode('Compare Cohorts');
  assert.ok(screen.getByText('2 matched configurations · 10 BBR parent runs · 10 CUBIC parent runs · 0 excluded parent runs'));
  assert.ok(screen.getByRole('heading', {name: 'Median FCT difference'}));
  assert.ok(screen.getAllByText('+0.500 s').length > 0);
  assert.ok(screen.getByRole('table'));
  fireEvent.click(screen.getAllByRole('button', {name: 'Settings and run IDs'})[0]);
  assert.ok(screen.getByRole('link', {name: '#1'}));
  assert.equal(screen.getByRole('link', {name: '#1'}).getAttribute('href'), '/congestion-control-emulated/parent-run/1');
  assert.ok(screen.getByText(/No trial-pair IDs or randomization are recorded/));
});

test('facet grid separates workload and queue settings and labels empty combinations', () => {
  show([...experiment(1), ...experiment(2, 'cubic', 20, 0, {clientFileSizeMegabytes: 50, queueBufferSizeKilobyte: 500})]);
  selectMode('Facet Grid');
  assert.equal(screen.getAllByRole('img', {name: /Facet scatter/}).length, 2);
  assert.equal(screen.getAllByText('No data').length, 2);
  const svg = screen.getAllByRole('img', {name: /Facet scatter/})[0];
  for (const circle of svg.querySelectorAll('circle')) assert.ok(Number.isFinite(Number(circle.getAttribute('cx'))));
});

test('box plots show one matched delay sweep, repetition counts and unavailable uncertainty when sparse', () => {
  show([...experiment(1), ...experiment(2, 'bbr', 20)]);
  selectView('Box Plot');
  assert.ok(screen.getByRole('img', {name: /Box plot of flow completion/}));
  assert.ok(screen.getByText('2 observed delay levels · 1 parent runs per level · 0 points excluded'));
  assert.ok(screen.getByText(/The planned delay grid is not recorded/));
  const svg = screen.getByRole('img', {name: /Box plot of flow completion/});
  const target = svg.querySelector('[tabindex="0"]'); assert.ok(target);
  fireEvent.mouseEnter(target); assert.ok(svg.querySelector('rect[pointer-events="none"], g[pointer-events="none"]'));
  fireEvent.focus(target); fireEvent.mouseLeave(svg);
});

test('missing and invalid completions do not become zero-valued chart points or valid comparisons', () => {
  show([...experiment(1, 'bbr', 10, 0, {flowCompletionTimeMs: null}), ...experiment(2, 'cubic', 10, 0, {flowCompletionTimeMs: Infinity})]);
  assert.ok(screen.getByText('Filtered dataset: 0 client measurements across 0 active tests.'));
  assert.equal(screen.queryByRole('img'), null);
  selectMode('Compare Cohorts');
  assert.ok(screen.getByText(/No configuration-matched comparison is available/));
  assert.ok(screen.getByText('Excluded from comparison'));
});

test('preset selection lists only matching parent configurations and can return to ordinary filter matches', async () => {
  show(); fireEvent.click(screen.getByRole('button', {name: 'Presets'}));
  const dialog = await screen.findByRole('dialog', {name: 'Select Available Tests'});
  const matches = within(dialog).getAllByRole('button', {name: 'View matched parent runs (5)'});
  assert.ok(matches.length >= 2);
  fireEvent.click(matches[0]);
  assert.ok(within(dialog).getAllByText(/#\d+ \| 2 clients/).length > 0);
  const card = matches[0].closest('[data-slot="collapsible"]').parentElement;
  const checkbox = within(card).getByRole('checkbox'); fireEvent.click(checkbox);
  assert.equal(checkbox.getAttribute('aria-checked'), 'true');
  fireEvent.click(within(dialog).getByRole('button', {name: 'Close test selection modal'}));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.ok(screen.getByRole('button', {name: 'Use Filter Matches'}));
  fireEvent.click(screen.getByRole('button', {name: 'Use Filter Matches'}));
  assert.ok(screen.getByText('Filtered dataset: 40 client measurements across 20 active tests.'));
});

function plotCoordinates(svg) {
  // JSDOM has no layout or pointer capture. Supply only those DOM boundaries;
  // the actual chart handlers and coordinate transformations run unchanged.
  svg.getBoundingClientRect = () => ({left: 0, top: 0, width: 1120, height: 440, right: 1120, bottom: 440});
  const captured = new Set();
  svg.setPointerCapture = id => captured.add(id);
  svg.hasPointerCapture = id => captured.has(id);
  svg.releasePointerCapture = id => captured.delete(id);
  return captured;
}
const positions = svg => dots(svg).map(dot => [Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))]);

test('connected-run zoom ignores the margins, pans only its captured pointer, and restores exact recorded positions', () => {
  show(); const svg = screen.getByRole('img', {name: /Parent-run line chart/}); const captured = plotCoordinates(svg); const original = positions(svg);
  const zoomOut = screen.getByRole('button', {name: 'Zoom out'}), reset = screen.getByRole('button', {name: 'Reset zoom'});
  assert.equal(zoomOut.disabled, true); assert.equal(reset.disabled, true);
  fireEvent.pointerDown(svg, {pointerId: 4, button: 0, clientX: 500, clientY: 180}); assert.equal(captured.size, 0);
  fireEvent.pointerMove(svg, {pointerId: 4, clientX: 500, clientY: 180});
  fireEvent.doubleClick(svg, {clientX: 0, clientY: 0}); assert.deepEqual(positions(svg), original);
  fireEvent.doubleClick(svg, {clientX: 560, clientY: 200}); assert.equal(zoomOut.disabled, false); assert.notDeepEqual(positions(svg), original);
  fireEvent.doubleClick(svg, {clientX: 600, clientY: 200}); const zoomed = positions(svg);
  fireEvent.pointerDown(svg, {pointerId: 4, button: 2, clientX: 500, clientY: 180}); assert.equal(captured.size, 0);
  fireEvent.pointerDown(svg, {pointerId: 4, button: 0, clientX: 0, clientY: 0}); assert.equal(captured.size, 0);
  fireEvent.pointerDown(svg, {pointerId: 4, button: 0, clientX: 500, clientY: 180}); assert.ok(captured.has(4)); assert.match(svg.getAttribute('class'), /cursor-grabbing/);
  fireEvent.mouseEnter(dots(svg)[0]); assert.equal(svg.querySelector('g[pointer-events="none"]'), null);
  fireEvent.pointerMove(svg, {pointerId: 8, clientX: 800, clientY: 250}); assert.deepEqual(positions(svg), zoomed);
  const measuredBounds=svg.getBoundingClientRect;for(const bounds of [{left:0,top:0,width:0,height:440},{left:0,top:0,width:1120,height:0}]){svg.getBoundingClientRect=()=>bounds;fireEvent.pointerMove(svg,{pointerId:4,clientX:500,clientY:180});assert.deepEqual(positions(svg),zoomed);}svg.getBoundingClientRect=measuredBounds;
  fireEvent.pointerMove(svg, {pointerId: 4, clientX: 300, clientY: 300}); assert.notDeepEqual(positions(svg), zoomed);
  for (const point of positions(svg)) assert.ok(point.every(Number.isFinite));
  fireEvent.pointerUp(svg, {pointerId: 8}); assert.ok(captured.has(4));
  fireEvent.pointerCancel(svg, {pointerId: 4}); assert.equal(captured.size, 0); assert.doesNotMatch(svg.getAttribute('class'), /cursor-grabbing/);
  fireEvent.click(zoomOut); assert.equal(zoomOut.disabled, false); fireEvent.click(zoomOut); assert.equal(zoomOut.disabled, true); assert.deepEqual(positions(svg), original);
  fireEvent.doubleClick(svg, {clientX: 560, clientY: 200}); fireEvent.click(reset); assert.deepEqual(positions(svg), original); assert.equal(reset.disabled, true);
});

test('connected-run pointer distance clears stale hover without changing measurements or treating missing metadata as zero', () => {
  show([experiment(1)[0], ...experiment(2, 'bbr', 10, 0, {queueBufferSizeKilobyte: null, clientFileSizeMegabytes: null})]);
  const svg = screen.getByRole('img', {name: /Parent-run line chart/}); plotCoordinates(svg); const original = positions(svg); const first = dots(svg)[0];
  fireEvent.mouseEnter(first); assert.match(svg.textContent, /Other client delay: n\/a/);
  fireEvent.pointerMove(svg, {pointerId: 1, clientX: Number(first.getAttribute('cx')), clientY: Number(first.getAttribute('cy'))}); assert.match(svg.textContent, /Other client delay: n\/a/);
  fireEvent.pointerMove(svg, {pointerId: 1, clientX: 0, clientY: 0}); assert.doesNotMatch(svg.textContent, /Other client delay:/);
  fireEvent.mouseEnter(dots(svg)[1]); assert.match(svg.textContent, /Queue buffer: n\/a/); assert.match(svg.textContent, /Workload: n\/a/);
  fireEvent.pointerMove(svg, {pointerId: 1, clientX: 1120, clientY: 440}); assert.doesNotMatch(svg.textContent, /Queue buffer:/); assert.deepEqual(positions(svg), original);
});

test('matched box sweeps retain repetition imbalance and confidence availability when changing the selected configuration', () => {
  show([...fixture(), ...experiment(100, 'bbr', 10)]); selectView('Box Plot');
  assert.ok(screen.getByText('2 observed delay levels · Unbalanced: 5–6 parent runs per level · 0 points excluded'));
  assert.equal(screen.queryByText('Insufficient repetitions'), null);
  const table = screen.getByRole('table'); assert.equal(within(table).getAllByRole('row').length, 3);
  fireEvent.click(screen.getByRole('button', {name: /Sweep configuration/}));
  const alternatives = screen.getAllByRole('button', {name: /Client 2 · cubic \/ cubic/}); assert.ok(alternatives.length);
  fireEvent.click(alternatives[0]);
  assert.ok(screen.getByText('1 observed delay levels · 5 parent runs per level · 0 points excluded'));
  assert.equal(within(screen.getByRole('table')).getAllByRole('row').length, 2);
  const svg = screen.getByRole('img', {name: /Box plot of flow completion/}); fireEvent.focus(svg.querySelector('[tabindex="0"]')); assert.match(svg.textContent, /Runs: 5/);
});

test('box plots reject imported outcomes without complete launch provenance while exploratory views retain them', () => {
  show(experiment(1).map(point => ({...point, configuration: {...point.configuration, jobConfig: null}}))); selectView('Box Plot');
  assert.ok(screen.getByText(/No sweep has a complete supported launch configuration\. 2 points excluded/));
  selectView('Scatter'); assert.equal(dots(screen.getByRole('img', {name: /Run-level scatter/})).length, 2);
});

test('rate and client-count filters intersect metadata and reset leaves an unrelated selected chart intact', () => {
  show([...experiment(1), ...experiment(2, 'bbr', 10, 0, {numberOfClients: 3, bottleneckRateMegabit: 100}), ...experiment(3, 'bbr', 10, 0, {bottleneckRateMegabit: null})]);
  selectView('Scatter'); fireEvent.click(screen.getByRole('button', {name: '100 mbit', exact: true}));
  assert.ok(screen.getByText('Filtered dataset: 2 client measurements across 1 active tests.'));
  fireEvent.click(screen.getByRole('button', {name: '2', exact: true})); assert.ok(screen.getByText('No flow completion data matches the current filters.'));
  fireEvent.click(screen.getByRole('button', {name: 'Reset'})); assert.ok(screen.getByRole('img', {name: /Run-level scatter/}));
  assert.ok(screen.getByText('Filtered dataset: 6 client measurements across 3 active tests.'));
});

test('presets apply a union of matched parents, can deselect a group, and explicitly show unmatched categories', async () => {
  show(); fireEvent.click(screen.getByRole('button', {name: 'Presets'})); const dialog = await screen.findByRole('dialog', {name: 'Select Available Tests'});
  const matching = within(dialog).getAllByRole('button', {name: 'View matched parent runs (5)'});
  const allCards = matching.map(button => button.closest('[data-slot="collapsible"]').parentElement);
  const cards = [allCards[0], allCards.find(card => card.textContent.includes('CUBIC / CUBIC'))]; assert.ok(cards[1]);
  for (const card of cards) fireEvent.click(within(card).getByRole('checkbox'));
  assert.ok(within(dialog).getAllByText('10 tests active').length);
  fireEvent.click(within(cards[0]).getByRole('checkbox')); assert.ok(within(dialog).getAllByText('5 tests active').length);
  fireEvent.click(within(dialog).getAllByRole('button', {name: 'View matched parent runs (0)'})[0]); assert.ok(within(dialog).getByText('No available tests match this category.'));
  fireEvent.click(within(dialog).getByRole('button', {name: 'Close test selection modal'})); await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.ok(screen.getByText('Filtered dataset: 10 client measurements across 5 active tests.'));
  assert.ok(screen.getByLabelText('Selected test groups'));
});
