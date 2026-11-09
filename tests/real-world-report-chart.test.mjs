import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import React from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {RealWorldReportChart} from '../app/components/real-world-report-chart.tsx';

afterEach(cleanup);
const props = change => ({title: 'Recorded RTT', unit: 'ms', clock: 'Seconds since scheduled start', description: 'Original socket samples; missing values remain gaps.', series: [{label: 'Receiver 1', points: [{x: 0, y: 0}, {x: 10, y: 1}]}], ...change});
const show = change => render(React.createElement(RealWorldReportChart, props(change)));
const samplePaths = svg => [...svg.querySelectorAll('path[stroke-width="1.8"]')];
const inspect = value => fireEvent.change(screen.getByRole('slider', {name: 'Inspect Recorded RTT at a time'}), {target: {value: String(value)}});
const focusLine = svg => svg.querySelector('line[stroke-dasharray="3 3"]');

test('empty and invalid traces expose missing data without an invented axis or sample', () => {
  const view = show({series: []}); assert.ok(screen.getByText('No recorded samples for the selected series.')); assert.equal(screen.queryByRole('img'), null); assert.equal(screen.queryByRole('slider'), null);
  for (const points of [[], [{x: 0, y: null}], [{x: NaN, y: 2}], [{x: 1, y: Infinity}]]) {view.rerender(React.createElement(RealWorldReportChart, props({series: [{label: 'Receiver 1', points}]}))); assert.equal(screen.queryByRole('img'), null);}
});

test('accessible chart axes preserve decimal units and include the scheduled window', () => {
  show({scheduledEnd: 60}); const svg = screen.getByRole('img', {name: /^Recorded RTT \(ms\)/}); assert.match(svg.querySelector('desc').textContent, /Horizontal axis: Seconds since scheduled start/); assert.ok(screen.getByText('Scheduled end')); const end = svg.querySelector('line[stroke-dasharray="5 4"]'); assert.equal(end.getAttribute('x1'), '684'); assert.equal(end.getAttribute('x2'), '684'); assert.equal(samplePaths(svg)[0].getAttribute('d'), 'M64.00,214.00 L167.33,28.81'); assert.ok(screen.getByText('1.08')); assert.equal(focusLine(svg), null);
});

test('null and nonfinite samples split traces while isolated finite samples retain their dots', () => {
  show({series: [{label: 'Receiver 1', points: [{x: 0, y: 1}, {x: 1, y: null}, {x: 2, y: 2}, {x: 3, y: null}, {x: NaN, y: 4}, {x: 5, y: Infinity}, {x: 6, y: 0}, {x: 7, y: 1}, {x: 8, y: null}, {x: 9, y: 0}]}]}); const svg = screen.getByRole('img'); const path = samplePaths(svg)[0].getAttribute('d'); assert.equal((path.match(/M/g) ?? []).length, 4); assert.equal((path.match(/L/g) ?? []).length, 1); assert.equal(/NaN|Infinity/.test(path), false); assert.equal(svg.querySelectorAll('circle').length, 3); assert.ok([...svg.querySelectorAll('circle')].every(circle => Number.isFinite(Number(circle.getAttribute('cy')))));
});

test('series visibility controls retain original colors and patterns across twenty receivers', () => {
  show({series: Array.from({length: 20}, (_, n) => ({label: 'Receiver ' + (n + 1), points: [{x: 0, y: n}]}))}); let paths = samplePaths(screen.getByRole('img')); assert.equal(paths.length, 20); assert.equal(paths[0].getAttribute('stroke'), 'var(--chart-1)'); assert.equal(paths[4].getAttribute('stroke'), 'var(--chart-5)'); assert.equal(paths[5].getAttribute('stroke'), 'var(--chart-1)'); assert.equal(paths[0].getAttribute('stroke-dasharray'), null); assert.equal(paths[5].getAttribute('stroke-dasharray'), '7 3'); assert.equal(paths[10].getAttribute('stroke-dasharray'), '2 3'); assert.equal(paths[15].getAttribute('stroke-dasharray'), '9 3 2 3');
  fireEvent.click(screen.getByRole('button', {name: 'Receiver 1', exact: true})); assert.equal(screen.getByRole('button', {name: 'Receiver 1', exact: true}).getAttribute('aria-pressed'), 'false'); paths = samplePaths(screen.getByRole('img')); assert.equal(paths.length, 19); assert.equal(paths[0].getAttribute('stroke'), 'var(--chart-2)');
  for (let n = 2; n <= 20; n++) fireEvent.click(screen.getByRole('button', {name: 'Receiver ' + n, exact: true})); assert.equal(screen.queryByRole('img'), null); assert.ok(screen.getByText('No recorded samples for the selected series.')); fireEvent.click(screen.getByRole('button', {name: 'Receiver 1', exact: true})); assert.equal(samplePaths(screen.getByRole('img')).length, 1); assert.equal(screen.getByRole('button', {name: 'Receiver 1', exact: true}).getAttribute('aria-pressed'), 'true');
});

test('the time slider reports the nearest recorded sample and preserves missing values and ties', () => {
  show({scheduledEnd: 10, series: [{label: 'Receiver 1', points: [{x: 0, y: 0}, {x: 10, y: 4}]}, {label: 'Receiver 2', points: [{x: 0, y: null}, {x: 10, y: 0}]}, {label: 'No samples', points: []}]}); assert.ok(screen.getByText('Move over the chart or use the time slider to inspect samples.')); inspect(500); assert.ok(screen.getByText('Receiver 1: 0.000 ms at 0.00 s')); assert.ok(screen.getByText('Receiver 2: Unavailable ms at 0.00 s')); assert.ok(screen.getByText('No samples: Unavailable ms at Unavailable s')); assert.equal(focusLine(screen.getByRole('img')).getAttribute('x1'), '374');
  inspect(1000); assert.ok(screen.getByText('Receiver 1: 4.000 ms at 10.00 s')); assert.ok(screen.getByText('Receiver 2: 0.000 ms at 10.00 s')); fireEvent.click(screen.getByRole('button', {name: 'Receiver 2'})); assert.equal(screen.queryByText('Receiver 2: 0.000 ms at 10.00 s'), null);
});

test('pointer inspection maps CSS dimensions to chart time and clamps outside the plot', t => {
  show(); const svg = screen.getByRole('img'); t.mock.method(svg, 'getBoundingClientRect', () => ({left: 100, width: 350}));
  for (const [clientX, slider, x] of [[0, '0', '64'], [287, '500', '374'], [1000, '1000', '684']]) {fireEvent.pointerMove(svg, {clientX}); assert.equal(screen.getByRole('slider').value, slider); assert.equal(focusLine(svg).getAttribute('x1'), x);}
});

test('recorded trace duration may exceed the scheduled end and zero scales stay finite', () => {
  const view = show({scheduledEnd: 0, series: [{label: 'Zero', points: [{x: 0, y: 0}]}]}); assert.ok(screen.getByText('Scheduled end')); assert.equal(samplePaths(screen.getByRole('img'))[0].getAttribute('d'), 'M64.00,214.00');
  view.rerender(React.createElement(RealWorldReportChart, props({scheduledEnd: 5, series: [{label: 'Tail', points: [{x: 0, y: 8}, {x: 10, y: 0}]}]}))); const svg = screen.getByRole('img'); assert.equal(svg.querySelector('line[stroke-dasharray="5 4"]').getAttribute('x1'), '374'); assert.ok(samplePaths(svg)[0].getAttribute('d').endsWith('L684.00,214.00')); assert.ok(screen.getByText('8.6'));
  view.rerender(React.createElement(RealWorldReportChart, props())); assert.equal(screen.queryByText('Scheduled end'), null);
});
