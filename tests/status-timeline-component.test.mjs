import './support/dom.mjs';
import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import React from 'react';
import {cleanup, render, screen, within} from '@testing-library/react';

globalThis.__timelineReact = React;
const hook = registerHooks({resolve(specifier, context, next) {
  return specifier === '@/app/components/user-preferences' ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(`export const LocalDateTime=({value})=>globalThis.__timelineReact.createElement('time',{dateTime:value},value);`)} : next(specifier, context);
}});
const {RealWorldStatusTimeline} = await import('../app/components/real-world-status-timeline.tsx');
const {REAL_WORLD_STEPS} = await import('../lib/real-world-progress.ts');
hook.deregister();
afterEach(cleanup);
const time = index => new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString();
const entry = (index, outcome = 'completed') => ({id: index + 1, status: REAL_WORLD_STEPS[index].status, started_at: time(index), completed_at: outcome ? time(index + 1) : null, outcome});
const show = job => render(React.createElement(RealWorldStatusTimeline, {job}));
const steps = () => within(screen.getByRole('list', {name: 'Test progress'})).getAllByRole('listitem');

test('active timeline distinguishes completed current and next steps using recorded times', () => {
  show({status: 'configuring', status_history: [entry(0), entry(1), entry(2, null)]});
  const rows = steps();
  assert.deepEqual(rows.map(row => row.dataset.state), ['completed', 'completed', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  assert.equal(rows[2].getAttribute('aria-current'), 'step');
  assert.match(rows[0].textContent, /Completed.*1 min 0 s/);
  assert.equal(rows[0].querySelector('time').getAttribute('dateTime'), time(1));
  assert.match(rows[2].textContent, /In progressStarted/);
  assert.equal(rows[2].querySelector('time').getAttribute('dateTime'), time(2));
  assert.match(rows[3].textContent, /Up next/);
  assert.match(rows[4].textContent, /Pending/);
  assert.equal(screen.queryByText(/Missing completion times/), null);
});

test('fully recorded completion shows durable finish time without inventing a final phase duration', () => {
  show({status: 'completed', status_history: [...REAL_WORLD_STEPS.map((_, i) => entry(i)), {id: 8, status: 'completed', started_at: time(7), completed_at: time(7), outcome: 'completed'}]});
  const rows = steps();
  assert.ok(rows.every(row => row.dataset.state === 'completed'));
  assert.equal(rows.at(-1).querySelector('time').getAttribute('dateTime'), time(7));
  assert.doesNotMatch(rows.at(-1).textContent, /0 s/);
  assert.equal(screen.queryByText(/Missing completion times/), null);
});

test('recorded failure and cancellation show stop times skipped work and successful cleanup', () => {
  for (const outcome of ['failed', 'cancelled']) {
    show({status: outcome, status_history: [entry(0), entry(1, outcome), entry(6), {id: 8, status: outcome, started_at: time(7), completed_at: time(7), outcome}]});
    const rows = steps();
    assert.equal(rows[1].dataset.state, outcome); assert.match(rows[1].textContent, /Stopped/);
    assert.equal(rows[1].querySelector('time').getAttribute('dateTime'), time(2));
    assert.ok(rows.slice(2, 6).every(row => row.dataset.state === 'skipped' && row.textContent.includes('Not run')));
    assert.equal(rows[6].dataset.state, 'completed');
    assert.equal(rows[7].dataset.state, outcome);
    cleanup();
  }
});

test('legacy outcomes label missing timestamps and unknown history without using job timestamps', () => {
  for (const status of ['completed', 'failed', 'cancelled']) {
    show({status, created_at: time(0), updated_at: time(7)});
    assert.equal(document.querySelectorAll('time').length, 0);
    assert.ok(screen.getByText(/Missing completion times are not estimated/));
    assert.ok(screen.getAllByText('Completion time not recorded').length);
    if (status !== 'completed') {
      assert.ok(screen.getByText('Stop time not recorded'));
      assert.ok(screen.getAllByText('History unavailable').length);
    }
    cleanup();
  }
});

test('future controller phases stay current and missing starts are left blank', () => {
  show({status: 'future-controller-phase'});
  const row = steps()[0];
  assert.equal(row.getAttribute('aria-current'), 'step');
  assert.match(row.textContent, /future-controller-phaseIn progress/);
  assert.equal(row.querySelector('time'), null);
});

test('a recorded completion with no recorded start never receives a duration', () => {
  show({status: 'bootstrapping', status_history: [{...entry(0), started_at: null}]});
  const first = steps()[0];
  assert.equal(first.querySelector('time').getAttribute('dateTime'), time(1));
  assert.doesNotMatch(first.textContent, / min | s$/);
});
