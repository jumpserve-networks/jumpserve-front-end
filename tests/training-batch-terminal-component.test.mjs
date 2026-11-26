import './support/dom.mjs';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';

test('the terminal uses the signed-in session, filters by role and closes when the step ends', async t => {
  const endpoint = 'wss://fixture.execute-api.us-east-1.amazonaws.com/terminal';
  const previous = process.env.NEXT_PUBLIC_JUMPSERVE_TRAINING_TERMINAL_URL;
  process.env.NEXT_PUBLIC_JUMPSERVE_TRAINING_TERMINAL_URL = endpoint;
  const unsubscribe = t.mock.fn();
  globalThis.__terminalSupabase = { auth: {
    async getSession() { return { data: { session: { access_token: 'fixture.session.jwt' } }, error: null }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe } } }; },
  } };
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@/lib/supabase/client') return {
      shortCircuit: true, url: 'data:text/javascript,export const createClient = () => globalThis.__terminalSupabase;',
    };
    return next(specifier, context);
  } });
  t.after(() => {
    cleanup();
    hooks.deregister();
    delete globalThis.__terminalSupabase;
    if (previous === undefined) delete process.env.NEXT_PUBLIC_JUMPSERVE_TRAINING_TERMINAL_URL;
    else process.env.NEXT_PUBLIC_JUMPSERVE_TRAINING_TERMINAL_URL = previous;
  });
  const { TrainingBatchTerminal } = await import('../app/components/research-workflow/training-batch-terminal.tsx');
  const connections = [];
  const nativeSocket = globalThis.WebSocket;
  t.after(() => { globalThis.WebSocket = nativeSocket; });
  globalThis.WebSocket = class extends EventTarget {
    constructor(url, protocols) {
      super();
      this.url = url.href;
      this.protocols = protocols;
      this.close = t.mock.fn();
      this.send = t.mock.fn();
      connections.push(this);
    }
  };
  const props = { batchId: 13, paperId: 'JSB-E01', role: 'verifier' };
  const viewer = render(React.createElement(TrainingBatchTerminal, { ...props, active: true }));
  await act(async () => {});
  const [socket] = connections;
  assert.equal(socket.url, endpoint + '?batch=13&paper=JSB-E01');
  assert.deepEqual(socket.protocols, ['jumpserve-terminal-v1', 'fixture.session.jwt']);
  await act(async () => {
    const earlier = new Event('message');
    earlier.data = JSON.stringify({ stage: 'generator-stage', role: 'generator', lost: false, output: [
      { sequence: 1, stream: 'stdout', text: 'Output from the other worker' },
    ] });
    socket.dispatchEvent(earlier);
    const event = new Event('message');
    event.data = JSON.stringify({ stage: 'stage-id', role: 'verifier', lost: false, output: [
      { sequence: 1, stream: 'stderr', text: '<input>fixture output</input>' },
    ] });
    socket.dispatchEvent(event);
  });
  const output = screen.getByLabelText('Read-only terminal output');
  assert.equal(output.textContent, '<input>fixture output</input>');
  assert.equal(output.querySelector('input'), null);
  assert.equal(socket.send.mock.callCount(), 0);
  viewer.rerender(React.createElement(TrainingBatchTerminal, { ...props, active: false }));
  assert.ok(screen.getByText('Live stream ended'));
  assert.equal(output.textContent, '<input>fixture output</input>');
  assert.equal(socket.close.mock.callCount(), 1);
  assert.equal(unsubscribe.mock.callCount(), 1);
});
