import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'node:crypto';
import { terminalPrefix } from './jumpserve-synthetic-terminal-proxy.mjs';

const streams = ['stdout', 'stderr', 'pty', 'notice'];
const replayCharacters = 64_000;
const bufferedCharacters = 2_000_000;
const maxBufferedFrames = 8_000;

export function createTerminalPublisher({ batchId, endpoint, table, env = process.env,
  gateway, registry }) {
  endpoint ??= env.JUMPSERVE_TRAINING_TERMINAL_ENDPOINT;
  table ??= env.JUMPSERVE_TRAINING_TERMINAL_TABLE;
  if (!endpoint && !table) return undefined;
  const settings = { region: 'us-east-1', maxAttempts: 1, ignoreConfiguredEndpointUrls: true };
  if (!/^https:\/\/[a-z0-9]+\.execute-api\.us-east-1\.amazonaws\.com\/terminal$/.test(endpoint ?? '') ||
      !/^[A-Za-z0-9_.-]{3,255}$/.test(table ?? '')) {
    console.error('The training batch terminal relay is misconfigured.');
    return undefined;
  }
  gateway ??= new ApiGatewayManagementApiClient({ ...settings, endpoint });
  registry ??= new DynamoDBClient(settings);

  return function open(paperId, role) {
    const stage = randomUUID();
    const viewers = new Map();
    const frames = [];
    let characters = 0;
    let sequence = 0;
    let nextQuery = 0;
    let nextHeartbeat = 0;
    let inFlight;
    let reportedFailure = false;

    async function refreshViewers(now) {
      let cursor;
      const validUntil = Math.floor(now / 1_000);
      const found = new Set();
      let replayIndex = frames.length;
      let replaySize = 0;
      while (replayIndex > 0 && replaySize < replayCharacters) {
        replaySize += frames[--replayIndex].text.length;
      }
      do {
        const page = await registry.send(new QueryCommand({
          TableName: table, ConsistentRead: true, ExclusiveStartKey: cursor,
          KeyConditionExpression: 'channel = :channel',
          FilterExpression: 'expiresAt > :now AND connectedAt <= :ready',
          ExpressionAttributeValues: { ':channel': { S: `${batchId}/${paperId}` },
            ':now': { N: String(validUntil) }, ':ready': { N: String(now - 1_200) } },
        }), { abortSignal: AbortSignal.timeout(3_000) });
        for (const item of page.Items ?? []) {
          const id = item.connectionId.S;
          found.add(id);
          if (!viewers.has(id)) viewers.set(id, {
            sequence: (frames[replayIndex]?.sequence ?? sequence + 1) - 1,
            expiresAt: Number(item.expiresAt.N), gone: false,
          });
        }
        cursor = page.LastEvaluatedKey;
      } while (cursor);
      for (const id of viewers.keys()) if (!found.has(id)) viewers.delete(id);
    }

    async function deliver(id, viewer, heartbeat) {
      if (viewer.gone || viewer.expiresAt <= Date.now() / 1000) return;
      const first = frames.findIndex(frame => frame.sequence > viewer.sequence);
      const lost = first >= 0 && frames[first].sequence > viewer.sequence + 1;
      if (first === -1 && !heartbeat) return;
      let end = first;
      let size = 0;
      while (end >= 0 && end < frames.length && size + frames[end].bytes <= 26_000) {
        size += frames[end++].bytes;
      }
      const output = first === -1 ? [] : frames.slice(first, end).map(({ sequence, stream, text }) => ({ sequence, stream, text }));
      try {
        await gateway.send(new PostToConnectionCommand({ ConnectionId: id,
          Data: Buffer.from(JSON.stringify({ stage, role, lost, output })),
        }), { abortSignal: AbortSignal.timeout(3_000) });
        viewer.sequence = output.at(-1)?.sequence ?? viewer.sequence;
      } catch (error) {
        if (error.name !== 'GoneException') throw error;
        viewer.gone = true;
      }
    }

    function tick(force = false) {
      if (inFlight) return inFlight;
      const now = Date.now();
      inFlight = (async () => {
        if (force || now >= nextQuery) {
          nextQuery = now + 2_000;
          await refreshViewers(now);
        }
        const heartbeat = now >= nextHeartbeat;
        if (heartbeat) nextHeartbeat = now + 15_000;
        const deliveries = await Promise.allSettled([...viewers].map(([id, viewer]) => deliver(id, viewer, heartbeat)));
        if (deliveries.some(result => result.status === 'rejected')) throw new Error('Terminal delivery failed.');
      })().catch(() => {
        if (!reportedFailure) console.error('Could not relay live training batch terminal output.');
        reportedFailure = true;
      }).finally(() => { inFlight = undefined; });
      return inFlight;
    }

    const timer = setInterval(tick, 200);
    timer.unref();
    return {
      append(line) {
        if (!line.startsWith(terminalPrefix) || line.length > 24_000) return;
        let value;
        try { value = JSON.parse(line.slice(terminalPrefix.length)); } catch { return; }
        if (!streams.includes(value?.stream) || typeof value?.text !== 'string' || !value.text ||
            value.text.length > 3_500) return;
        const frame = { sequence: ++sequence, stream: value.stream, text: value.text };
        frames.push({ ...frame, bytes: Buffer.byteLength(JSON.stringify(frame)) + 1 });
        characters += frame.text.length;
        while (characters > bufferedCharacters || frames.length > maxBufferedFrames) {
          characters -= frames.shift().text.length;
        }
      },
      async finish() {
        clearInterval(timer);
        await inFlight;
        // Send the final buffered output while keeping AWS failures off the assessment path.
        await tick(true);
        const deadline = Date.now() + 3_000;
        while (Date.now() < deadline && !reportedFailure &&
          [...viewers.values()].some(viewer => !viewer.gone && viewer.expiresAt > Date.now() / 1000 &&
            viewer.sequence < sequence)) {
          await tick();
        }
      },
    };
  };
}
