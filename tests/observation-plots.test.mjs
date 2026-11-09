import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import React from 'react';
import {cleanup, render, screen} from '@testing-library/react';
import {ObservationPlots} from '../app/components/research-workflow/observations.tsx';

afterEach(cleanup);
const row = (change = {}) => ({id: 'one', observation_id: 'observation', configuration_identity: 'config', metric: 'throughput', units: 'Mbps', status: 'recorded', value: '0', details: {published: '0'}, ...change});
const show = (rows, extra = {}) => render(React.createElement(ObservationPlots, {rows, ...extra}));

test('published and measured zero remain distinct, finite data points with provenance labels', () => {
  const {container} = show([row()]);
  const plot = screen.getByRole('img', {name: 'Published and reproduced values for throughput / Mbps'});
  assert.equal(plot.querySelectorAll('circle').length, 1);
  assert.equal(plot.querySelectorAll('rect').length, 1);
  assert.match(plot.textContent, /observation · config: published 0, reproduced 0 Mbps/);
  assert.equal(container.querySelectorAll('figure').length, 1);
  for (const node of plot.querySelectorAll('[cx], [cy], rect')) {
    for (const attr of ['cx', 'cy', 'x', 'y']) if (node.hasAttribute(attr)) assert.equal(Number.isFinite(Number(node.getAttribute(attr))), true);
  }
});

test('unrecorded values remain missing and valid published references still plot', () => {
  show([row({status: 'failed', value: '123', details: {published: '8'}})], {measurementLabel: 'Observed'});
  const plot = screen.getByRole('img', {name: 'Published and observed values for throughput / Mbps'});
  assert.equal(plot.querySelectorAll('circle').length, 1);
  assert.equal(plot.querySelectorAll('rect').length, 0);
  assert.match(plot.textContent, /observed failed/);
});

test('mixed missing, invalid and finite measurements retain only their own points', () => {
  show([row({details: null, value: 1}), row({id: 'two', value: 'invalid', details: {published: 'invalid'}}), row({id: 'three', value: null, details: {published: null}})]);
  const plot = screen.getByRole('img');
  assert.equal(plot.querySelectorAll('circle').length, 0);
  assert.equal(plot.querySelectorAll('rect').length, 1);
  assert.match(plot.querySelector('title').textContent, /3 observation identities/);
});

test('empty and nonfinite groups do not fabricate measurements or charts', () => {
  const {rerender} = show([]);
  assert.equal(screen.queryByRole('img'), null);
  rerender(React.createElement(ObservationPlots, {rows: [row({details: {}, value: 'Infinity'})]}));
  assert.equal(screen.queryByRole('img'), null);
  assert.match(screen.getByText(/no finite values to plot/).textContent, /missing values remain missing/);
});

test('an overflowing scale falls back to exact table values instead of invalid SVG coordinates', () => {
  show([row({value: -Number.MAX_VALUE, details: {published: Number.MAX_VALUE}})]);
  assert.equal(screen.queryByRole('img'), null);
  assert.match(screen.getByText(/finite scaling range/).textContent, /Exact values remain in the table and export/);
});

test('multiple observations use separate x positions and excess metrics are explicitly bounded', () => {
  show([row({value: -5, details: {published: 10}}), row({id: 'second', value: 4}), ...['a', 'b', 'c', 'd'].map(metric => row({id: metric, metric}))]);
  assert.equal(screen.getAllByRole('img').length, 4);
  const first = screen.getAllByRole('img')[0];
  assert.deepEqual([...first.querySelectorAll('circle')].map(n => n.getAttribute('cx')), ['64', '524']);
  assert.ok(screen.getByText(/Showing four metric plots/));
});
