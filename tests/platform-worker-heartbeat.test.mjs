import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { workerHeartbeat } from '../lib/platform-worker-heartbeat.ts';

// Render the real shared badge and heartbeat component without changing the
// existing test harness or requiring a live private API, session or worker.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      const base = new URL('../' + specifier.slice(2), import.meta.url);
      specifier = ['.ts', '.tsx'].map(extension => base.href + extension).find(url => existsSync(new URL(url))) || specifier;
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.tsx')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
    };
    return next(url, context);
  },
});
let WorkerHeartbeat, WorkerHeartbeatStatus;
try { ({ WorkerHeartbeat, WorkerHeartbeatStatus } = await import('../app/components/platform-worker-heartbeat.tsx')); }
finally { hooks.deregister(); }

const now = Date.parse('2026-10-31T02:38:00.000Z');
const atAge = milliseconds => new Date(now - milliseconds).toISOString();

test('heartbeat freshness includes zero and exactly 90 seconds, but not 90 seconds plus 1 ms', () => {
  for (const age of [0, 1, 89_999, 90_000]) {
    assert.equal(workerHeartbeat(atAge(age), now).state, 'fresh');
    assert.equal(workerHeartbeat(atAge(age), now).ageSeconds, Math.floor(age / 1000));
  }
  for (const age of [90_001, 91_000, 86_400_000]) assert.equal(workerHeartbeat(atAge(age), now).state, 'delayed');
});

test('missing, empty, invalid and non-timestamp values are explicitly unavailable without an age', () => {
  for (const value of [null, undefined, '', 'bad', ' ', '0', '2026-10-31', '2026-10-31T02:38:00', '2026-02-30T00:00:00Z', '2025-02-29T00:00:00Z', '2026-13-01T00:00:00Z', '2026-10-31T24:00:00Z', '2026-10-31T02:38:60Z', '2026-10-31T02:38:00+25:00', 0, {}, true]) {
    const result = workerHeartbeat(value, now);
    assert.equal(result.state, 'unknown', String(value));
    assert.equal(result.label, 'Unavailable');
    assert.equal(result.ageSeconds, null);
  }
});

test('future timestamps are unknown even when only one millisecond ahead', () => {
  for (const ahead of [1, 1000, 86_400_000]) {
    const result = workerHeartbeat(atAge(-ahead), now);
    assert.equal(result.state, 'unknown');
    assert.match(result.detail, /future/);
    assert.equal(result.ageSeconds, null);
  }
});

test('timezone offsets and recorded Postgres fractional seconds identify the same instant', () => {
  for (const value of ['2026-10-31T04:37:00+02:00', '2026-10-30T21:37:00-05:00', '2026-10-31T02:37:00.000000+00:00', '2026-10-31 02:37:00+00:00']) {
    assert.equal(workerHeartbeat(value, now).state, 'fresh');
    assert.equal(workerHeartbeat(value, now).ageSeconds, 60);
  }
  assert.equal(workerHeartbeat('2024-02-29T00:00:00Z', now).state, 'delayed');
});

test('an unavailable browser clock cannot invent a freshness classification', () => {
  for (const clock of [null, NaN, Infinity, -Infinity]) {
    assert.equal(workerHeartbeat(atAge(0), clock).state, 'unknown');
    assert.equal(workerHeartbeat(atAge(0), clock).ageSeconds, null);
  }
});

test('aging the same recorded timestamp changes freshness without new worker evidence', () => {
  const recorded = atAge(90_000);
  assert.equal(workerHeartbeat(recorded, now).state, 'fresh');
  assert.equal(workerHeartbeat(recorded, now + 1).state, 'delayed');
  assert.equal(recorded, atAge(90_000));
});

test('rendered states have accessible text, raw evidence and theme-aware status colors', () => {
  for (const [value, label, detail, color] of [
    [atAge(0), 'Fresh', 'within the last 90 seconds', 'dark:text-lime-300'],
    [atAge(90_001), 'Delayed', 'more than 90 seconds', 'dark:text-amber-300'],
    [null, 'Unavailable', 'No worker heartbeat recorded', 'text-muted-foreground'],
    ['invalid<timestamp>', 'Unavailable', 'Invalid recorded heartbeat', 'text-muted-foreground'],
    [atAge(-1), 'Unavailable', 'in the future', 'text-muted-foreground'],
  ]) {
    const markup = renderToStaticMarkup(createElement(WorkerHeartbeatStatus, { seenAt: value, now }));
    assert.match(markup, /role="status"/);
    assert.match(markup, /aria-atomic="true"/);
    assert.ok(markup.includes(label));
    assert.ok(markup.includes(detail));
    assert.ok(markup.includes(color));
    assert.match(markup, /break-all/);
    assert.ok(markup.includes(value === null ? 'Not recorded' : value.replaceAll('<', '&lt;').replaceAll('>', '&gt;')));
    if (label === 'Unavailable') assert.ok(!markup.includes('Age:'));
  }
});

test('raw offset timestamp is displayed unchanged and initial server render does not claim freshness', () => {
  const recorded = '2026-10-31T04:37:00.000000+02:00';
  const markup = renderToStaticMarkup(createElement(WorkerHeartbeat, { seenAt: recorded }));
  assert.ok(markup.includes(recorded));
  assert.ok(markup.includes('Unavailable'));
  assert.ok(markup.includes('Waiting for the browser clock'));
  assert.ok(!markup.includes('Age:'));
});
