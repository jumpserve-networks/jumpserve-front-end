import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {act, cleanup, render, screen} from '@testing-library/react';
import {WorkerHeartbeat, WorkerHeartbeatStatus} from '../app/components/platform-worker-heartbeat.tsx';

afterEach(cleanup);
const seenAt = '2026-11-07T00:00:00Z', seen = Date.parse(seenAt);

test('recorded worker timestamps distinguish fresh, delayed, invalid and missing evidence', () => {
  const {rerender} = render(React.createElement(WorkerHeartbeatStatus, {seenAt, now: seen + 1000}));
  assert.match(screen.getByRole('status').textContent, /Fresh/);
  assert.ok(screen.getByText('Age: 1 seconds · browser clock'));
  assert.ok(screen.getByText(seenAt));
  rerender(React.createElement(WorkerHeartbeatStatus, {seenAt, now: seen + 91000}));
  assert.match(screen.getByRole('status').textContent, /Delayed/);
  assert.ok(screen.getByText('Age: 91 seconds · browser clock'));
  rerender(React.createElement(WorkerHeartbeatStatus, {seenAt: '', now: seen}));
  assert.match(screen.getByRole('status').textContent, /Unavailable/);
  assert.ok(screen.getByText('Not recorded'));
  assert.equal(screen.queryByText(/Age:/), null);
  rerender(React.createElement(WorkerHeartbeatStatus, {seenAt: 'invalid', now: seen}));
  assert.match(screen.getByRole('status').textContent, /Invalid recorded heartbeat/);
  assert.ok(screen.getByText('invalid'));
});

test('heartbeat ages without network polls and removes both timers on unmount', t => {
  let initial, interval, clock = seen;
  t.mock.method(Date, 'now', () => clock);
  const timeout = t.mock.method(window, 'setTimeout', (callback, delay) => {initial = callback; assert.equal(delay, 0); return 7;});
  const timer = t.mock.method(window, 'setInterval', (callback, delay) => {interval = callback; assert.equal(delay, 1000); return 9;});
  const clearTimeout = t.mock.method(window, 'clearTimeout', () => {});
  const clearInterval = t.mock.method(window, 'clearInterval', () => {});
  const fetch = t.mock.method(globalThis, 'fetch', async () => {assert.fail('Heartbeat aging needs no fetch');});
  const {unmount} = render(React.createElement(WorkerHeartbeat, {seenAt}));
  assert.match(screen.getByRole('status').textContent, /Waiting for the browser clock/);
  act(() => initial());
  assert.match(screen.getByRole('status').textContent, /Fresh/);
  clock = seen + 91000;
  act(() => interval());
  assert.match(screen.getByRole('status').textContent, /Delayed/);
  assert.equal(timeout.mock.callCount(), 1); assert.equal(timer.mock.callCount(), 1);
  assert.equal(fetch.mock.callCount(), 0);
  unmount();
  assert.equal(clearTimeout.mock.calls[0].arguments[0], 7);
  assert.equal(clearInterval.mock.calls[0].arguments[0], 9);
});

test('server markup starts with unknown freshness and preserves the exact recorded timestamp', () => {
  const html = renderToString(React.createElement(WorkerHeartbeat, {seenAt}));
  assert.match(html, /Waiting for the browser clock/);
  assert.ok(html.includes(seenAt));
  assert.equal(html.includes('Age:'), false);
});
