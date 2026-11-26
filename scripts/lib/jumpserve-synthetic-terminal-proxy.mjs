import { once } from 'node:events';
import { createRequire } from 'node:module';
import { StringDecoder } from 'node:string_decoder';
import { pathToFileURL } from 'node:url';

export const terminalPrefix = 'JUMPSERVE_TERMINAL\t';

// Both peers are private to the worker's Docker network namespace.
export function executorTerminalProxy({ upstream, port, output }) {
  const { WebSocket, WebSocketServer } = createRequire(import.meta.url)('ws');
  const server = new WebSocketServer({ host: '127.0.0.1', port, perMessageDeflate: false });
  server.on('connection', client => {
    const executor = new WebSocket(upstream, { perMessageDeflate: false });
    const decoders = new Map();
    function forward(socket, data, binary) {
      socket.send(data, { binary }, error => { if (error) socket.terminate(); });
    }
    client.on('message', (data, binary) => {
      if (executor.readyState === WebSocket.CONNECTING) {
        executor.once('open', () => forward(executor, data, binary));
      } else if (executor.readyState === WebSocket.OPEN) {
        forward(executor, data, binary);
      }
    });
    executor.on('message', (data, binary) => {
      if (client.readyState === WebSocket.OPEN) forward(client, data, binary);
      if (binary) return;
      let message;
      try { message = JSON.parse(data); } catch { return; }
      const params = message?.params;
      if (typeof params?.processId !== 'string') return;
      if (message.method === 'process/closed') {
        for (const [stream, decoder] of decoders.get(params.processId) ?? []) {
          const text = decoder.end();
          if (text) output(stream, text);
        }
        decoders.delete(params.processId);
      }
      if (message.method !== 'process/output' || !['stdout', 'stderr', 'pty'].includes(params.stream) ||
          typeof params.chunk !== 'string') return;
      if (!decoders.has(params.processId)) decoders.set(params.processId, new Map());
      const streams = decoders.get(params.processId);
      if (!streams.has(params.stream)) streams.set(params.stream, new StringDecoder('utf8'));
      const text = streams.get(params.stream).write(Buffer.from(params.chunk, 'base64'));
      if (text) output(params.stream, text);
    });
    for (const [socket, peer] of [[executor, client], [client, executor]]) {
      socket.on('error', () => peer.terminate());
      socket.on('close', () => peer.terminate());
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [upstream, port] = process.argv.slice(2);
  let skipped = false;
  const server = executorTerminalProxy({ upstream, port: Number(port), output(stream, text) {
    if (process.stdout.writableLength > 128_000) {
      skipped = true;
      return;
    }
    if (skipped) {
      process.stdout.write(terminalPrefix + JSON.stringify({ stream: 'notice', text: '\n[Some terminal output was skipped.]\n' }) + '\n');
      skipped = false;
    }
    // Keep each forwarded frame below the WebSocket gateway's 32 KiB frame limit
    // even if JSON escaping expands every character.
    for (let offset = 0; offset < text.length;) {
      let end = Math.min(offset + 3_500, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
      process.stdout.write(terminalPrefix + JSON.stringify({ stream, text: text.slice(offset, end) }) + '\n');
      offset = end;
    }
  } });
  await once(server, 'listening');
  process.stdout.write('ready\n');
}
