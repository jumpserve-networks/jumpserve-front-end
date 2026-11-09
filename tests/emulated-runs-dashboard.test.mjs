import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';

const {EmulatedRunChartsPanel} = await import('../app/components/emulated-runs-dashboard.tsx');
afterEach(cleanup);

const parent = (id = 1, change = {}) => ({id, createdAt: '2026-11-01T00:00:00Z', snapshotLengthSeconds: 1, bottleneckRateMegabit: 10, ...change});
const run = (id = 1, change = {}) => ({id, parentRunId: 1, createdAt: '2026-11-01T00:00:00Z', clientNumber: id,
  delayAddedMs: 0, clientStartDelayMs: 0, clientFileSizeMegabytes: 5, congestionControlAlgorithmId: id,
  congestionControlAlgorithmName: id === 1 ? 'cubic' : 'bbr', ...change});
const stat = (id, runId, time, change = {}) => ({id, emulatedRunId: runId, snapshotIndex: time, elapsedSeconds: time,
  megabitsPerSecond: 4 + time, roundTripTimeMs: 20 + time, bottleneckQueuingDelayMs: time / 10,
  inFlightPackets: 7 + time, congestionWindowBytes: (10 + time) * 1500, ...change});
const fixture = change => ({parentRuns: [parent()], runs: [run(), run(2)], stats: [stat(1, 1, 0), stat(2, 1, 1), stat(3, 2, 0), stat(4, 2, 1)], ...change});
const article = title => screen.getByRole('heading', {name: title, level: 2}).closest('article');
const paths = svg => [...svg.querySelectorAll('path[stroke]:not([stroke="transparent"])')];
const hits = svg => [...svg.querySelectorAll('circle[fill="transparent"][pointer-events="all"]')];
const legend = scope => within(scope).getAllByRole('button').filter(button => button.hasAttribute('aria-pressed'));
function coordinates(svg, transform = point => ({x: point.x, y: point.y})) {
  // JSDOM has no SVG geometry implementation; use a known identity viewport.
  svg.getScreenCTM = () => ({inverse: () => ({})});
  svg.createSVGPoint = () => ({x: 0, y: 0, matrixTransform() {return transform(this);}});
}
async function expand(title) {
  fireEvent.click(screen.getByRole('button', {name: `Expand ${title} chart`}));
  const dialog = await screen.findByRole('dialog', {name: `Expanded View: ${title}`});
  const svg = within(dialog).getByRole('img', {name: `${title} over time`});
  coordinates(svg); return {dialog, svg};
}

test('empty parents, clientless runs and missing metrics remain distinct', () => {
  const {rerender} = render(React.createElement(EmulatedRunChartsPanel, fixture({parentRuns: []})));
  assert.ok(screen.getByText('No parent run selected.'));
  rerender(React.createElement(EmulatedRunChartsPanel, fixture({runs: []})));
  assert.ok(screen.getByText('This parent run has no child rows in emulated_runs.'));
  rerender(React.createElement(EmulatedRunChartsPanel, fixture({runs: [run()], stats: []})));
  assert.equal(screen.getAllByText('No points available for this metric.').length, 4);
  assert.ok(screen.getByText('0 total samples across selected child runs'));
  assert.equal(screen.queryAllByRole('img').length, 0);
});

test('charts preserve an explicit parent selection and label missing client metadata without inventing values', () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture({parentRuns: [parent(), parent(2)], initialSelectedParentRunId: 2,
    runs: [run(), run(9, {parentRunId: 2, congestionControlAlgorithmName: null, congestionControlAlgorithmId: 9,
      delayAddedMs: null, clientStartDelayMs: null, clientFileSizeMegabytes: null}), run(10, {parentRunId: null})], stats: [stat(1, 9, 0)]})));
  assert.ok(screen.getByText('1 total samples across selected child runs'));
  assert.equal(screen.getAllByRole('button', {name: 'id 9 n/a n/a start n/a size'}).length, 4);
  assert.equal(screen.queryByRole('button', {name: /cubic 0ms/}), null);
  assert.equal(screen.getAllByRole('img').length, 4);
});

test('expanded slices tolerate all-hidden clients and keep large legends inside the chart bounds',async()=>{
 const runs=Array.from({length:30},(_,index)=>run(index+1));render(React.createElement(EmulatedRunChartsPanel,fixture({runs,stats:runs.map((value,index)=>stat(index+1,value.id,0))})));const {dialog,svg}=await expand('Throughput');fireEvent.mouseMove(svg,{clientX:100,clientY:100});assert.ok(within(svg).getByText(/sum Mbps:/));for(const button of legend(dialog))fireEvent.click(button);fireEvent.mouseMove(svg,{clientX:100,clientY:100});assert.equal(within(svg).queryByText(/x \(seconds\):/),null);
});

test('a pinned cwnd point loses its companion marker when updated measurements no longer contain a companion',async()=>{
 const view=render(React.createElement(EmulatedRunChartsPanel,fixture()));const {svg}=await expand('Congestion Window');fireEvent.click(hits(svg)[0]);assert.ok(within(svg).getByText('in-flight (packets): 7'));view.rerender(React.createElement(EmulatedRunChartsPanel,fixture({stats:[stat(1,1,0,{inFlightPackets:null}),stat(2,1,1,{inFlightPackets:null})]})));assert.equal(svg.querySelectorAll('circle[stroke-dasharray]').length,0);
});

test('all metric paths preserve units, zeros, bottleneck bounds and cwnd companion series', () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture()));
  const throughput = within(article('Throughput')).getByRole('img');
  assert.equal(throughput.getAttribute('viewBox'), '0 0 460 220');
  assert.equal(throughput.closest('button').getAttribute('aria-label'), 'Expand Throughput chart');
  assert.equal(paths(throughput).length, 3); // Two clients and the measured-time sum.
  assert.equal(paths(throughput)[0].getAttribute('d'), 'M56 138 L442 130.5');
  assert.equal(paths(throughput)[2].getAttribute('d'), 'M56 108 L442 93');
  assert.equal(within(throughput).getByText('20').getAttribute('text-anchor'), 'end');
  assert.equal(within(throughput).getByText('0.00').getAttribute('text-anchor'), 'end');
  const cwnd = within(article('Congestion Window')).getByRole('img');
  assert.equal(paths(cwnd).filter(path => path.hasAttribute('stroke-dasharray')).length, 2);
  assert.ok(within(cwnd).getByText('packets'));
  assert.match(article('Congestion Window').textContent, /Dashed line shows in-flight packets/);
  assert.ok(within(article('Throughput')).getByRole('button', {name: 'sum Mbps', pressed: true}));
});

test('invalid metrics are omitted, valid zero remains, and snapshot/index times are used when elapsed time is absent', () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture({parentRuns: [parent(1, {bottleneckRateMegabit: null})], runs: [run(1, {congestionControlAlgorithmName: null, congestionControlAlgorithmId: null})], stats: [
    stat(1, 1, 1, {elapsedSeconds: null, snapshotIndex: 2, megabitsPerSecond: 0, roundTripTimeMs: null, congestionWindowBytes: NaN}),
    stat(2, 1, 2, {elapsedSeconds: Infinity, snapshotIndex: null, megabitsPerSecond: null, roundTripTimeMs: NaN, congestionWindowBytes: null}),
    stat(3, 1, 3, {elapsedSeconds: null, snapshotIndex: null, megabitsPerSecond: 0, roundTripTimeMs: Infinity, congestionWindowBytes: null}),
  ]})));
  assert.equal(within(article('Round-trip Time')).queryByRole('img'), null);
  assert.equal(within(article('Congestion Window')).queryByRole('img'), null);
  assert.equal(paths(within(article('Throughput')).getByRole('img')).length, 2);
  assert.equal(legend(article('Throughput'))[0].textContent.trim(), 'n/a 0ms 0ms start 5MB');
  assert.ok(within(article('Throughput')).getByText('2.00'));
});

test('legend visibility toggles client and sum series without expanding the chart, including an all-hidden state', () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture()));
  const panel = article('Throughput'), buttons = legend(panel), svg = within(panel).getByRole('img');
  fireEvent.mouseEnter(buttons[0]); fireEvent.click(buttons[0]);
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'false'); assert.equal(paths(svg).length, 2);
  fireEvent.mouseEnter(buttons[0]); fireEvent.mouseLeave(buttons[0]); fireEvent.doubleClick(buttons[0]);
  fireEvent.click(buttons[1]);
  assert.ok(within(svg).getByText(/All series hidden/));
  assert.equal(screen.queryByRole('dialog'), null);
  fireEvent.click(buttons[0]); assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
  assert.equal(within(svg).queryByText(/All series hidden/), null);
  const sum = within(panel).getByRole('button', {name: 'sum Mbps'});
  fireEvent.click(sum); assert.equal(sum.getAttribute('aria-pressed'), 'false');
  assert.equal(paths(svg).length, 1);
});
test('the throughput sum can be highlighted independently and null elapsed ties keep finite samples first',async()=>{
 render(React.createElement(EmulatedRunChartsPanel,fixture({stats:[stat(1,1,0,{elapsedSeconds:null}),stat(2,1,0),stat(3,2,0),stat(4,2,1)]})));const {dialog,svg}=await expand('Throughput');fireEvent.mouseEnter(within(dialog).getByRole('button',{name:'sum Mbps'}));assert.ok([...svg.querySelectorAll('path')].some(path=>path.getAttribute('stroke-width')==='4.2'));fireEvent.mouseLeave(within(dialog).getByRole('button',{name:'sum Mbps'}));for(const button of legend(dialog))fireEvent.click(button);fireEvent.mouseMove(svg,{clientX:100,clientY:100});assert.ok([...svg.querySelectorAll('line')].some(line=>line.getAttribute('stroke')==='#64748b'));
});

test('expanded chart and explicit close retain the original inline chart', async () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture()));
  const {dialog, svg} = await expand('Throughput');
  assert.equal(svg.getAttribute('viewBox'), '0 0 1200 620');
  assert.equal(within(dialog).queryByRole('button', {name: /Expand/}), null);
  fireEvent.click(within(dialog).getByRole('button', {name: 'Close'}));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.ok(screen.getByRole('button', {name: 'Expand Throughput chart'}));
});

test('expanded point callouts report exact throughput and time, pin one client, and clear on outside pointer input', async () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture()));
  const {svg} = await expand('Throughput');
  let points = hits(svg);
  fireEvent.mouseEnter(points[0]);
  assert.ok(within(svg).getByText('y (Mbps): 4')); assert.ok(within(svg).getByText('x (seconds): 0.00'));
  fireEvent.mouseMove(points[0]); // Same sample should retain the existing selection.
  fireEvent.click(points[0]);
  points = hits(svg); fireEvent.mouseEnter(points[2]); fireEvent.mouseMove(points[2]); fireEvent.click(points[2]);
  assert.ok(within(svg).getByText('cubic, 0ms, 0ms start, 5MB'));
  fireEvent.mouseMove(points[1]);
  assert.ok(within(svg).getByText('y (Mbps): 5')); assert.ok(within(svg).getByText('x (seconds): 1.00'));
  fireEvent.mouseLeave(points[1]); // Pin survives leaving the selected point.
  assert.ok(within(svg).getByText('y (Mbps): 5'));
  fireEvent.pointerDown(document.body);
  assert.equal(within(svg).queryByText(/y \(Mbps\):/), null);
});

test('expanded cwnd callouts convert bytes to packets and retain measured in-flight values separately', async () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture()));
  const {svg} = await expand('Congestion Window');
  fireEvent.mouseEnter(hits(svg)[0]);
  assert.ok(within(svg).getByText('cwnd (packets): 10'));
  assert.ok(within(svg).getByText('in-flight (packets): 7'));
  fireEvent.mouseMove(hits(svg)[1]);
  assert.ok(within(svg).getByText('cwnd (packets): 11'));
  assert.ok(within(svg).getByText('in-flight (packets): 8'));
});

test('expanded cursor slice shows nearest samples and their throughput sum, clears outside the plot', async () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture()));
  const {svg} = await expand('Throughput');
  fireEvent.mouseMove(svg, {clientX: 90, clientY: 100});
  assert.ok(within(svg).getByText(/cubic 0ms 0ms start 5MB: 4 Mbps/));
  assert.ok(within(svg).getByText('sum Mbps: 8 Mbps'));
  fireEvent.mouseMove(svg, {clientX: 1160, clientY: 100});
  assert.ok(within(svg).getByText('sum Mbps: 10 Mbps'));
  fireEvent.mouseMove(svg, {clientX: 10, clientY: 100});
  assert.equal(within(svg).queryByText(/sum Mbps:/), null);
  fireEvent.mouseMove(svg, {clientX: 500, clientY: 100}); fireEvent.mouseLeave(svg);
  assert.equal(within(svg).queryByText(/x \(seconds\):/), null);
});

test('SVG geometry failures do not display invented coordinates or stale slices', async () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture()));
  const {svg} = await expand('Throughput');
  for (const transform of [() => ({x: NaN, y: 10}), () => ({x: 10, y: Infinity}), () => ({x: -1, y: 100}),
    () => ({x: 1201, y: 100}), () => ({x: 100, y: -1}), () => ({x: 100, y: 621}), () => ({x: 100, y: 25}), () => ({x: 100, y: 489})]) {
    coordinates(svg, transform); fireEvent.mouseMove(svg, {clientX: 100, clientY: 100});
    assert.equal(within(svg).queryByText(/sum Mbps:/), null);
  }
  svg.getScreenCTM = () => null; fireEvent.mouseMove(svg, {clientX: 100, clientY: 100});
  assert.equal(within(svg).queryByText(/sum Mbps:/), null);
});

test('legend pinning highlights one client, ignores another pin, and hiding the pinned series clears it', async () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture()));
  const {dialog, svg} = await expand('Throughput');
  const buttons = legend(dialog);
  fireEvent.mouseEnter(buttons[0]); assert.equal(paths(svg)[0].getAttribute('opacity'), '1');
  assert.equal(paths(svg)[1].getAttribute('opacity'), '0.28');
  fireEvent.mouseLeave(buttons[0]); assert.equal(paths(svg)[1].getAttribute('opacity'), '1');
  fireEvent.doubleClick(buttons[0]); fireEvent.mouseLeave(buttons[0]);
  fireEvent.mouseEnter(buttons[1]); fireEvent.doubleClick(buttons[1]); fireEvent.mouseLeave(buttons[1]);
  assert.equal(paths(svg)[0].getAttribute('opacity'), '1'); assert.equal(paths(svg)[1].getAttribute('opacity'), '0.28');
  fireEvent.mouseEnter(hits(svg)[0]); assert.ok(within(svg).getByText('y (Mbps): 4'));
  fireEvent.click(buttons[0]); assert.equal(buttons[0].getAttribute('aria-pressed'), 'false');
  assert.equal(within(svg).queryByText(/y \(Mbps\):/), null);
  assert.equal(paths(svg)[0].getAttribute('opacity'), '1');
});

test('cwnd missing companions stay unavailable and nearest recorded companion samples are used', async () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture({stats: [
    stat(1, 1, 0, {inFlightPackets: null}), stat(2, 1, 1, {congestionWindowBytes: null}),
    stat(3, 2, 0, {inFlightPackets: null}), stat(4, 2, 1, {inFlightPackets: NaN}),
  ]})));
  const {svg} = await expand('Congestion Window');
  fireEvent.mouseEnter(hits(svg)[0]);
  assert.ok(within(svg).getByText('in-flight (packets): 8'));
  fireEvent.mouseEnter(hits(svg)[1]);
  assert.ok(within(svg).getByText('in-flight (packets): n/a'));
  fireEvent.mouseMove(svg, {clientX: 1160, clientY: 100});
  assert.ok(within(svg).getByText(/cubic 0ms 0ms start 5MB: cwnd 10 packets, in-flight 8 packets/));
  assert.ok(within(svg).getByText(/bbr 0ms 0ms start 5MB: cwnd 11 packets, in-flight n\/a/));
});

test('zero-time, low-rate and repeated-index samples remain finite and chronologically ordered', async () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture({parentRuns: [parent(1, {bottleneckRateMegabit: 0})], runs: [run()],
    stats: [stat(3, 1, 0, {elapsedSeconds: null, snapshotIndex: null, megabitsPerSecond: 0}),
      stat(2, 1, 0, {elapsedSeconds: 0.004, snapshotIndex: 0, megabitsPerSecond: 0.0001}),
      stat(1, 1, 0, {elapsedSeconds: 0, snapshotIndex: 0, megabitsPerSecond: 0})]})));
  const {svg} = await expand('Throughput');
  for (const path of paths(svg)) assert.doesNotMatch(path.getAttribute('d'), /NaN|Infinity/);
  fireEvent.mouseEnter(hits(svg)[0]); assert.ok(within(svg).getByText('y (Mbps): 0'));
  fireEvent.mouseLeave(hits(svg)[0]); assert.equal(within(svg).queryByText(/y \(Mbps\):/), null);
});

test('sub-millimegabit throughput keeps distinct axis ticks and a nonzero measured readout', async () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture({parentRuns: [parent(1, {bottleneckRateMegabit: 0.0005})],
    runs: [run()], stats: [stat(1, 1, 0, {megabitsPerSecond: 0.0001})]})));
  const {svg} = await expand('Throughput');
  const labels = [...svg.querySelectorAll('text[text-anchor="end"]:not([transform])')].map(item => item.textContent);
  assert.deepEqual(labels, ['0', '2.5e-4', '5e-4', '7.5e-4', '0.001']);
  fireEvent.mouseEnter(hits(svg)[0]);
  assert.ok(within(svg).getByText('y (Mbps): 1e-4'));
});

test('empty metric cards still expand and dismiss through the dialog keyboard control', async () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture({runs: [run()], stats: []})));
  const card = article('Throughput'); fireEvent.mouseEnter(card.parentElement); fireEvent.mouseLeave(card.parentElement);
  fireEvent.click(card);
  const dialog = await screen.findByRole('dialog', {name: 'Expanded View: Throughput'});
  assert.ok(within(dialog).getByText('No points available for this metric.'));
  fireEvent.keyDown(dialog, {key: 'Escape'});
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
});

test('card hover restores other charts on leave and a missing requested parent falls back to the newest record', () => {
  render(React.createElement(EmulatedRunChartsPanel, fixture({initialSelectedParentRunId: 999})));
  const card = article('Throughput'), other = article('Round-trip Time');
  fireEvent.mouseEnter(card.parentElement); assert.match(other.parentElement.className, /opacity-65/);
  fireEvent.mouseLeave(card.parentElement); assert.match(other.parentElement.className, /opacity-100/);
  fireEvent.mouseEnter(card.parentElement); fireEvent.mouseLeave(card.parentElement.parentElement);
  assert.match(other.parentElement.className, /opacity-100/);
  const svg = within(card).getByRole('img');
  fireEvent.mouseMove(svg); fireEvent.mouseLeave(svg); // Compact charts do not show cursor readouts.
  assert.equal(within(svg).queryByText(/x \(seconds\):/), null);
});
