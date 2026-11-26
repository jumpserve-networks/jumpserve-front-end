import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { createTerminalPublisher } from '../scripts/lib/jumpserve-synthetic-terminal.mjs';
import { executorTerminalProxy, terminalPrefix } from '../scripts/lib/jumpserve-synthetic-terminal-proxy.mjs';

test('the relay sends only terminal output to current viewers of the matching paper', async () => {
  const published = [];
  const subscriptions = [];
  const open = createTerminalPublisher({
    batchId: 13, endpoint: 'https://fixture.execute-api.us-east-1.amazonaws.com/terminal', table: 'fixture',
    registry: { async send(command) {
      subscriptions.push(command.input);
      return { Items: [
        { connectionId: { S: 'viewer' }, expiresAt: { N: String(Math.ceil(Date.now() / 1_000) + 60) } },
        { connectionId: { S: 'expired' }, expiresAt: { N: '1' } },
      ] };
    } },
    gateway: { async send({ input }) { published.push({ id: input.ConnectionId, message: JSON.parse(input.Data) }); } },
  });
  const terminal = open('JSB-E01', 'generator');
  terminal.append('{"kind":"codex_started"}');
  terminal.append(terminalPrefix + JSON.stringify({ stream: 'prompt', text: 'private prompt' }));
  terminal.append(terminalPrefix + JSON.stringify({ stream: 'stdout', text: 'first output\n' }));
  terminal.append(terminalPrefix + JSON.stringify({ stream: 'stderr', text: 'second output\n' }));
  await terminal.finish();
  assert.equal(subscriptions[0].ExpressionAttributeValues[':channel'].S, '13/JSB-E01');
  assert.equal(published.length, 1);
  assert.equal(published[0].id, 'viewer');
  assert.equal(published[0].message.role, 'generator');
  assert.deepEqual(published[0].message.output, [
    { sequence: 1, stream: 'stdout', text: 'first output\n' },
    { sequence: 2, stream: 'stderr', text: 'second output\n' },
  ]);
});

test('the pinned Codex executor delivers stdout and stderr through the proxy before exit',
  { skip: process.env.JUMPSERVE_TEST_LOCAL_EXECUTOR !== '1', timeout: 12_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), 'jumpserve-terminal-test-'));
    t.after(() => rm(home, { force: true, recursive: true }));
    const reserve = createServer().listen(0, '127.0.0.1');
    await once(reserve, 'listening');
    const upstream = `ws://127.0.0.1:${reserve.address().port}`;
    await new Promise(resolve => reserve.close(resolve));
    const child = spawn('codex', ['exec-server', '--listen', upstream], {
      env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: home }, stdio: 'ignore',
    });
    t.after(() => { child.kill(); });
    for (let attempt = 0; ; attempt++) {
      const probe = new WebSocket(upstream);
      try {
        await once(probe, 'open');
        probe.close();
        break;
      } catch (error) {
        if (attempt === 49) throw error;
        await delay(50);
      }
    }
    const output = [];
    const proxy = executorTerminalProxy({ upstream, port: 0, output: (stream, text) => output.push([stream, text]) });
    await once(proxy, 'listening');
    const client = new WebSocket(`ws://127.0.0.1:${proxy.address().port}`);
    t.after(() => { client.terminate(); proxy.close(); });
    await once(client, 'open');
    const messages = [];
    client.on('message', data => {
      const message = JSON.parse(data);
      messages.push(message);
      if (message.id === 1 && message.result) {
        client.send(JSON.stringify({ method: 'initialized', params: {} }));
        client.send(JSON.stringify({ id: 2, method: 'process/start', params: {
          processId: 'fixture', argv: ['/bin/sh', '-c', "printf 'out\\n'; printf 'err\\n' >&2; sleep 1"],
          cwd: new URL(`file://${home}`).href, env: { PATH: '/usr/bin:/bin' }, tty: false, pipeStdin: false,
        } }));
      }
    });
    client.send(JSON.stringify({ id: 1, method: 'initialize', params: { clientName: 'jumpserve-test' } }));
    for (let attempt = 0; output.length < 2 && attempt < 100; attempt++) await delay(10);
    assert.deepEqual(output.sort(), [['stderr', 'err\n'], ['stdout', 'out\n']]);
    assert.equal(messages.some(message => message.method === 'process/exited'), false);
  });
