import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { afterEach, beforeEach, test } from 'node:test';
import { SendCommandCommand, SSMClient } from '@aws-sdk/client-ssm';

const hook = registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return { shortCircuit: true, url: 'data:text/javascript,export {}' };
  if (specifier === '@/lib/auth') {
    return { shortCircuit: true, url: 'data:text/javascript,export const getGoogleUser=async()=>globalThis.__syntheticBatchUser;' };
  }
  return next(specifier, context);
} });
const { POST } = await import('../app/(modules)/research-verification/api/synthetic-batch/start/route.ts');
hook.deregister();

const origin = 'https://jumpserve.example';
const ownerId = '4229e90e-aa07-4ae7-b395-e4f8c142202c';
const instanceId = 'i-0123456789abcdef0';
const settings = {
  NEXT_PUBLIC_SITE_URL: origin,
  JUMPSERVE_SYNTHETIC_BATCH_OWNER_ID: ownerId,
  JUMPSERVE_SYNTHETIC_BATCH_INSTANCE_ID: instanceId,
};
const previous = Object.fromEntries(Object.keys(settings).map(name => [name, process.env[name]]));
const request = ({ requestOrigin = origin, query = '', body } = {}) => new Request(
  `${origin}/research-verification/api/synthetic-batch/start${query}`,
  { method: 'POST', headers: { origin: requestOrigin }, body },
);

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

test('the authenticated owner can request only the fixed SSM document on the configured coordinator', async t => {
  const send = t.mock.method(SSMClient.prototype, 'send', async function (command, options) {
    assert.ok(command instanceof SendCommandCommand);
    assert.deepEqual(command.input, {
      DocumentName: 'JumpServeStartSyntheticBatch', DocumentVersion: '1', InstanceIds: [instanceId], TimeoutSeconds: 30,
    });
    assert.equal(await this.config.maxAttempts(), 1);
    assert.equal(await this.config.region(), 'us-east-1');
    assert.ok(options.abortSignal instanceof AbortSignal);
    return { Command: { CommandId: 'accepted' } };
  });
  const result = await POST(request());
  assert.equal(result.status, 202);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await result.json(), { status: 'requested' });
  assert.equal(send.mock.callCount(), 1);
});

test('unauthenticated, other-account, cross-origin, parameterized and disabled starts send no command', async t => {
  const send = t.mock.method(SSMClient.prototype, 'send', async () => assert.fail('AWS send must be blocked'));
  globalThis.__syntheticBatchUser = null;
  assert.equal((await POST(request())).status, 401);
  globalThis.__syntheticBatchUser = { id: 'not-the-owner' };
  assert.equal((await POST(request())).status, 403);
  globalThis.__syntheticBatchUser = { id: ownerId };
  assert.equal((await POST(request({ requestOrigin: 'https://cross-origin.example' }))).status, 403);
  assert.equal((await POST(request({ query: '?target=i-other' }))).status, 400);
  assert.equal((await POST(request({ body: '{"command":"alternate-command"}' }))).status, 400);
  delete process.env.JUMPSERVE_SYNTHETIC_BATCH_INSTANCE_ID;
  assert.equal((await POST(request())).status, 404);
  assert.equal(send.mock.callCount(), 0);
});

test('missing AWS receipts and provider failures leave launch unconfirmed', async t => {
  const send = t.mock.method(SSMClient.prototype, 'send', async () => ({}));
  assert.equal((await POST(request())).status, 502);
  send.mock.mockImplementation(async () => { throw new Error('INTERNAL AWS DETAILS'); });
  const unavailable = await POST(request());
  assert.equal(unavailable.status, 502);
  assert.deepEqual(await unavailable.json(), { error: 'AWS did not confirm the batch start request.' });
  assert.equal(send.mock.callCount(), 2);
});
