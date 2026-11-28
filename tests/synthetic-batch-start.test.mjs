import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendCommandCommand, SSMClient } from '@aws-sdk/client-ssm';

const hook = registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { shortCircuit: true, url: 'data:text/javascript,export {}' };
  if (specifier === '@/lib/auth') {
    return { shortCircuit: true, url: 'data:text/javascript,export const getGoogleUser=async()=>globalThis.__syntheticBatchUser;' };
  }
  return next(specifier, context);
} });
const { POST } = await import('../app/(modules)/research-verification/api/synthetic-batch/start/route.ts');
const { GET } = await import('../app/(modules)/research-verification/api/synthetic-batch/[id]/route.ts');
const { GET: ACTIVITY } = await import('../app/(modules)/research-verification/api/synthetic-batch/[id]/activity/route.ts');
const { POST: STOP } = await import('../app/(modules)/research-verification/api/synthetic-batch/[id]/stop/route.ts');
const { getTrainingBatchHistorySource, listTrainingBatches } = await import('../lib/synthetic-batch-server.ts');
hook.deregister();

const origin = 'https://jumpserve.example';
const ownerId = '4229e90e-aa07-4ae7-b395-e4f8c142202c';
const instanceId = 'i-0123456789abcdef0';
const bucket = 'fixture-training-batches';
const batchId = 12;
const assessmentId = '91169871-14c2-4bde-a0a5-50bf78403d86';
const settings = {
  NEXT_PUBLIC_SITE_URL: origin,
  JUMPSERVE_SYNTHETIC_BATCH_OWNER_ID: ownerId,
  JUMPSERVE_SYNTHETIC_BATCH_INSTANCE_ID: instanceId,
  JUMPSERVE_TRAINING_BATCH_BUCKET: bucket,
};
const previous = Object.fromEntries(Object.keys(settings).map(name => [name, process.env[name]]));
const request = ({ requestOrigin = origin, query = '', body } = {}) => new Request(
  `${origin}/research-verification/api/synthetic-batch/start${query}`,
  { method: 'POST', headers: { origin: requestOrigin }, body },
);
const status = (id = batchId) => GET(new Request(origin), { params: Promise.resolve({ id: String(id) }) });
const stop = (id = batchId, { requestOrigin = origin, query = '', body } = {}) => STOP(new Request(
  `${origin}/research-verification/api/synthetic-batch/${id}/stop${query}`,
  { method: 'POST', headers: { origin: requestOrigin }, body },
), { params: Promise.resolve({ id: String(id) }) });
const activity = paper => ACTIVITY(new Request(`${origin}?paper=${encodeURIComponent(paper)}`),
  { params: Promise.resolve({ id: String(batchId) }) });

function mockStorage(t, listings = {}) {
  const records = new Map();
  const etag = key => `"${JSON.stringify(records.get(key))}"`;
  const client = t.mock.method(S3Client.prototype, 'send', async command => {
    assert.equal(command.input.Bucket, bucket);
    const key = command.input.Key;
    if (command instanceof ListObjectsV2Command) {
      assert.equal(command.input.Prefix, 'requests/');
      return listings[command.input.ContinuationToken ?? 'first'] ?? {};
    }
    if (command instanceof PutObjectCommand) {
      if ((command.input.IfNoneMatch === '*' && records.has(key)) ||
          (command.input.IfMatch && (!records.has(key) || command.input.IfMatch !== etag(key)))) {
        throw Object.assign(new Error('Version mismatch'), { name: 'PreconditionFailed' });
      }
      records.set(key, JSON.parse(command.input.Body));
      return {};
    }
    assert.ok(command instanceof GetObjectCommand);
    if (!records.has(key)) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
    const body = JSON.stringify(records.get(key));
    return { ETag: etag(key), Body: { transformToString: async () => body } };
  });
  return { records, client };
}

beforeEach(() => {
  Object.assign(process.env, settings);
  globalThis.__syntheticBatchUser = { id: ownerId };
});
afterEach(() => {
  delete globalThis.__syntheticBatchUser;
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('the owner can stop only the specified active batch on the configured coordinator', async t => {
  const { records, client } = mockStorage(t);
  const startedAt = new Date().toISOString();
  records.set(`requests/${batchId}.json`, { ownerId, requestedAt: startedAt, dispatch: 'requested' });
  const progressKey = `progress/${batchId}.json`;
  records.set(progressKey, { status: 'preparing', startedAt, updatedAt: startedAt, finishedAt: null,
    stopPhase: null, versions: { generator: null, verifier: null }, papers: [] });

  let receipt = { Command: { CommandId: 'accepted' } };
  const send = t.mock.method(SSMClient.prototype, 'send', async (command, options) => {
    assert.ok(command instanceof SendCommandCommand);
    assert.deepEqual(command.input, { DocumentName: 'JumpServeStopTrainingBatchById', DocumentVersion: '1',
      Parameters: { BatchId: [String(batchId)] }, InstanceIds: [instanceId], TimeoutSeconds: 30 });
    assert.ok(options.abortSignal instanceof AbortSignal);
    return receipt;
  });

  assert.equal((await (await status()).json()).canStop, true);
  globalThis.__syntheticBatchUser = { id: 'another-viewer' };
  assert.equal((await (await status()).json()).canStop, undefined);
  globalThis.__syntheticBatchUser = { id: ownerId };
  const accepted = await stop(batchId, { body: new Uint8Array(0) });
  assert.equal(accepted.status, 202);
  assert.equal(accepted.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await accepted.json(), { status: 'requested' });
  assert.equal(records.get(progressKey).status, 'preparing');
  receipt = {};
  assert.equal((await stop()).status, 502);
  assert.equal(send.mock.callCount(), 2);
  assert.ok(client.mock.calls.every(call => call.arguments[0] instanceof GetObjectCommand));
});

test('invalid, non-owner, cross-origin, and inactive stops send no AWS command', async t => {
  const { records } = mockStorage(t);
  const send = t.mock.method(SSMClient.prototype, 'send', async () => assert.fail('AWS stop must be blocked'));
  globalThis.__syntheticBatchUser = null;
  assert.equal((await stop()).status, 401);
  globalThis.__syntheticBatchUser = { id: 'another-viewer' };
  assert.equal((await stop()).status, 403);
  globalThis.__syntheticBatchUser = { id: ownerId };
  assert.equal((await stop(batchId, { requestOrigin: 'https://another-origin.example' })).status, 403);
  assert.equal((await stop(batchId, { query: '?target=other' })).status, 400);
  assert.equal((await stop(batchId, { body: '{"document":"AWS-RunShellScript"}' })).status, 400);
  for (const id of ['01', '-1', '2147483648', assessmentId]) assert.equal((await stop(id)).status, 404);
  assert.equal((await stop()).status, 404);

  const now = new Date().toISOString();
  const requestKey = `requests/${batchId}.json`;
  const progressKey = `progress/${batchId}.json`;
  records.set(requestKey, { ownerId: 'previous-owner', requestedAt: now, dispatch: 'requested' });
  records.set(progressKey, { status: 'running', updatedAt: now, versions: { generator: null, verifier: null }, papers: [] });
  assert.equal((await stop()).status, 403);
  records.set(requestKey, { ownerId, requestedAt: now, dispatch: 'requested' });
  records.get(progressKey).status = 'completed';
  assert.equal((await (await status()).json()).canStop, undefined);
  assert.equal((await stop()).status, 409);
  records.delete(progressKey);
  assert.equal((await stop()).status, 409);
  assert.equal(send.mock.callCount(), 0);
});

test('the authenticated owner can request only the fixed SSM document on the configured coordinator', async t => {
  const { records } = mockStorage(t);
  const send = t.mock.method(SSMClient.prototype, 'send', async function (command, options) {
    assert.ok(command instanceof SendCommandCommand);
    const [id] = command.input.Parameters.BatchId;
    assert.equal(records.get(`requests/${id}.json`).ownerId, ownerId);
    assert.deepEqual(command.input, {
      DocumentName: 'JumpServeStartTrainingBatchById', DocumentVersion: '1', Parameters: { BatchId: [id] },
      InstanceIds: [instanceId], TimeoutSeconds: 30,
    });
    assert.equal(await this.config.maxAttempts(), 1);
    assert.equal(await this.config.region(), 'us-east-1');
    assert.ok(options.abortSignal instanceof AbortSignal);
    return { Command: { CommandId: 'accepted' } };
  });
  const streamedEmptyPost = request({ body: new Uint8Array(0) });
  assert.ok(streamedEmptyPost.body);
  const ids = [];
  for (const emptyPost of [request(), streamedEmptyPost]) {
    const result = await POST(emptyPost);
    assert.equal(result.status, 202);
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    const { batchId: id } = await result.json();
    ids.push(id);
    const progress = await status(id);
    assert.equal(progress.status, 200);
    assert.equal(progress.headers.get('cache-control'), 'private, no-store');
    assert.equal((await progress.json()).status, 'requested');
  }
  assert.deepEqual(ids, [1, 2]);
  assert.equal(send.mock.callCount(), 2);
});

test('concurrent starts reserve distinct integer IDs and preserve each request', async t => {
  const { records } = mockStorage(t);
  const send = t.mock.method(SSMClient.prototype, 'send', async () => ({ Command: { CommandId: 'accepted' } }));
  const responses = await Promise.all([POST(request()), POST(request()), POST(request())]);
  assert.deepEqual(responses.map(response => response.status), [202, 202, 202]);
  const ids = await Promise.all(responses.map(async response => (await response.json()).batchId));
  assert.deepEqual(ids.sort((a, b) => a - b), [1, 2, 3]);
  assert.equal(records.get('batch-sequence.json'), 3);
  for (const id of ids) assert.equal(records.get(`requests/${id}.json`).ownerId, ownerId);
  assert.equal(send.mock.callCount(), 3);
});

test('unauthenticated, other-account, cross-origin, parameterized and disabled starts send no command', async t => {
  const send = t.mock.method(SSMClient.prototype, 'send', async () => assert.fail('AWS send must be blocked'));
  const { client } = mockStorage(t);
  globalThis.__syntheticBatchUser = null;
  assert.equal((await POST(request())).status, 401);
  assert.equal((await status()).status, 401);
  globalThis.__syntheticBatchUser = { id: 'not-the-owner' };
  assert.equal((await POST(request())).status, 403);
  globalThis.__syntheticBatchUser = { id: ownerId };
  assert.equal((await POST(request({ requestOrigin: 'https://cross-origin.example' }))).status, 403);
  assert.equal((await POST(request({ query: '?target=i-other' }))).status, 400);
  assert.equal((await POST(request({ body: '{"command":"alternate-command"}' }))).status, 400);
  for (const invalid of ['invalid', '01', '0', '1e3', '2147483648', assessmentId]) assert.equal((await status(invalid)).status, 404);
  delete process.env.JUMPSERVE_SYNTHETIC_BATCH_INSTANCE_ID;
  assert.equal((await POST(request())).status, 404);
  assert.equal(send.mock.callCount(), 0);
  assert.equal(client.mock.callCount(), 0);
});

test('history follows storage pages and includes requests from previous starters', async t => {
  const previousBatch = 2;
  const requestKey = id => `requests/${id}.json`;
  const older = new Date('2026-11-01T00:00:00Z');
  const newer = new Date('2026-11-02T00:00:00Z');
  const { records, client } = mockStorage(t, {
    first: { NextContinuationToken: 'next', Contents: [{ Key: requestKey(previousBatch), LastModified: older }] },
    next: { Contents: [{ Key: requestKey(batchId), LastModified: newer }, { Key: 'requests/invalid.json' }] },
  });
  records.set(requestKey(previousBatch), { ownerId: 'previous-owner', requestedAt: older.toISOString(), dispatch: 'requested' });
  records.set(requestKey(batchId), { ownerId, requestedAt: newer.toISOString(), dispatch: 'requested' });
  const history = await listTrainingBatches({ kind: 's3', bucket }, 1);
  assert.deepEqual(history.batches.map(batch => batch.id), [batchId, previousBatch]);
  assert.equal(history.hasMore, false);
  assert.doesNotMatch(JSON.stringify(history), /ownerId|previous-owner/);
  assert.equal(client.mock.calls.filter(call => call.arguments[0] instanceof ListObjectsV2Command).length, 2);
});

test('local development opens CLI journals and returns only safe progress fields', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'jumpserve-local-training-'));
  const originals = { NODE_ENV: process.env.NODE_ENV, JUMPSERVE_LOCAL_TRAINING_BATCH_DIRECTORY: process.env.JUMPSERVE_LOCAL_TRAINING_BATCH_DIRECTORY };
  t.after(async () => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  });
  const startedAt = '2026-11-02T00:00:00Z';
  const fixture = join(directory, `batch-${assessmentId}`);
  await mkdir(fixture);
  await writeFile(join(fixture, 'batch.json'), JSON.stringify({
    status: 'stopped', started_at: startedAt, finished_at: '2026-11-02T00:00:05Z',
    stop: { phase: 'verifying', reason: '/private/reason' },
    runtime: { skill_snapshot: '/private/path' },
    cases: [
      { paper_id: 'paper-1', pdf: '/private/paper.pdf', status: 'stopped',
        score: { earned: 9, rubric_maximum: 10 },
        steps: { generator: { status: 'completed', durationMs: 3_650, internal: 'private' } },
        database: { assessment_id: assessmentId, generator_result_id: ownerId } },
      { paper_id: 'paper-2', pdf: '/private/pending.pdf', status: 'pending', database: { assessment_id: ownerId } },
    ],
  }));
  await mkdir(join(directory, 'invalid'));
  await writeFile(join(directory, 'invalid', 'batch.json'), '{');
  await symlink(fixture, join(directory, 'linked'));
  await writeFile(join(directory, 'training-batch-index.json'), JSON.stringify([`batch-${assessmentId}`, 'invalid', 'linked']));

  process.env.JUMPSERVE_LOCAL_TRAINING_BATCH_DIRECTORY = directory;
  process.env.NODE_ENV = 'development';
  assert.deepEqual(getTrainingBatchHistorySource(), { kind: 's3', bucket });
  delete process.env.JUMPSERVE_TRAINING_BATCH_BUCKET;
  const source = getTrainingBatchHistorySource();
  assert.deepEqual(source, { kind: 'local', directory });
  const history = await listTrainingBatches(source, 1);
  assert.deepEqual(history.batches, [{ id: 1, recordedAt: startedAt, status: 'stopped', total: 2, passed: 0, papers: [
    { id: 'paper-1', fileName: 'paper.pdf', status: 'stopped' },
    { id: 'paper-2', fileName: 'pending.pdf', status: 'pending' },
  ] }]);
  const response = await status(1);
  assert.equal(response.status, 200);
  const detail = await response.json();
  assert.equal(detail.requestedAt, null);
  assert.equal(detail.startedAt, startedAt);
  assert.deepEqual(detail.papers[0], { id: 'paper-1', fileName: 'paper.pdf', status: 'stopped', assessmentId,
    score: { earned: 9, maximum: 10 }, steps: { generator: { status: 'completed', durationMs: 3_650 } } });
  assert.equal(detail.papers[1].assessmentId, null);
  assert.equal(detail.papers[1].steps, undefined);
  assert.equal(detail.canViewAssessmentLinks, undefined);
  assert.doesNotMatch(JSON.stringify(detail), /private|generator_result_id/);
  assert.ok(!JSON.stringify(detail).includes(ownerId));
  process.env.NODE_ENV = 'production';
  assert.equal(getTrainingBatchHistorySource(), null);
});

test('an uncertain dispatch keeps the same progress URL and can reconcile a later coordinator update', async t => {
  const { records } = mockStorage(t);
  const send = t.mock.method(SSMClient.prototype, 'send', async () => ({}));
  const result = await POST(request());
  assert.equal(result.status, 202);
  const { batchId: id } = await result.json();
  assert.equal((await (await status(id)).json()).status, 'unconfirmed');

  const timestamp = new Date().toISOString();
  records.set(`progress/${id}.json`, {
    status: 'stopped', updatedAt: timestamp, startedAt: timestamp, finishedAt: timestamp, stopPhase: 'verifying',
    versions: { generator: 4, verifier: 2, sha256: 'private' },
    papers: [{ id: 'paper-1', fileName: 'paper.pdf', status: 'stopped', assessmentId,
      steps: { generator: { status: 'completed', durationMs: 0, startedAt: timestamp, internal: 'private' },
        verifier: { status: 'stopped', durationMs: -1, startedAt: 'private' }, other: { status: 'completed', durationMs: 2 } },
      score: { earned: 9, maximum: 10, internal: 'private' }, answer_key_sha256: 'private' }],
    reason: 'raw private error',
  });
  const progress = await status(id);
  const state = await progress.json();
  assert.equal(state.status, 'stopped');
  assert.equal(state.stopPhase, 'verifying');
  assert.deepEqual(state.papers[0].score, { earned: 9, maximum: 10 });
  assert.deepEqual(state.papers[0].steps, {
    generator: { status: 'completed', durationMs: 0, startedAt: timestamp }, verifier: { status: 'stopped', durationMs: null },
  });
  assert.equal(state.papers[0].assessmentId, assessmentId);
  assert.equal(state.canViewAssessmentLinks, true);
  assert.doesNotMatch(JSON.stringify(state), /private|ownerId/);
  globalThis.__syntheticBatchUser = { id: 'another-signed-in-viewer' };
  const sharedProgress = await status(id);
  assert.equal(sharedProgress.status, 200);
  const shared = await sharedProgress.json();
  assert.deepEqual(shared.papers[0], state.papers[0]);
  assert.equal(shared.canViewAssessmentLinks, undefined);
  assert.doesNotMatch(JSON.stringify(shared), /private|ownerId/);
  assert.equal((await status()).status, 404);
  globalThis.__syntheticBatchUser = null;
  assert.equal((await status(id)).status, 401);
  assert.equal(send.mock.callCount(), 1);
});

test('a request-store failure prevents dispatch', async t => {
  const { client } = mockStorage(t);
  client.mock.mockImplementation(async () => { throw new Error('storage unavailable'); });
  const send = t.mock.method(SSMClient.prototype, 'send', async () => assert.fail('AWS send must be blocked'));
  assert.equal((await POST(request())).status, 502);
  assert.equal(send.mock.callCount(), 0);
});

test('signed-in viewers can see bounded worker activity without private terminal content', async t => {
  const { records, client } = mockStorage(t);
  const at = '2026-11-01T00:00:00Z';
  records.set(`requests/${batchId}.json`, { ownerId, requestedAt: at, dispatch: 'requested' });
  records.set(`progress/${batchId}.json`, { activityAvailable: true, papers: [{ id: 'JSB-E01' }] });
  records.set(`activity/${batchId}/JSB-E01.json`, { generator: [
    { at, kind: 'command_started', program: 'python3', command: 'python3 /private' },
    { at, kind: 'command_completed', program: '<script>', exitCode: 2, output: 'private' },
    { at, kind: 'agent_message', text: 'private' },
    { at: 'private', kind: 'turn_started' },
  ] });
  globalThis.__syntheticBatchUser = null;
  assert.equal((await activity('JSB-E01')).status, 401);
  assert.equal((await activity('../../other')).status, 404);
  assert.equal(client.mock.callCount(), 0);
  globalThis.__syntheticBatchUser = { id: 'a-signed-in-viewer' };
  assert.equal((await activity('JSB-E02')).status, 404);
  const response = await activity('JSB-E01');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { generator: [
    { at, kind: 'command_started', program: 'python3' },
    { at, kind: 'command_completed', exitCode: 2 },
  ], verifier: [] });
});
