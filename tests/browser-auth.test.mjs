import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const fixture = Symbol.for('jumpserve.browser-auth.test');
const stub = 'data:text/javascript,' + encodeURIComponent(`export function createClient(){return globalThis[Symbol.for('jumpserve.browser-auth.test')];}`);
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(specifier === '@/lib/supabase/client' ? stub : specifier, context);
} });
const { readBrowserSession, requireAccessToken, SessionCheckError, hasResolvedAuthState } = await import('../lib/browser-auth.ts');
hook.deregister();

test('returned session errors remain unavailable rather than becoming a sign-in requirement', async () => {
  const cause = { name: 'AuthRetryableFetchError', message: 'Failed to fetch' };
  globalThis[fixture] = { auth: { getSession: async () => ({ data: { session: null }, error: cause }) } };
  await assert.rejects(requireAccessToken('Sign in to launch.'), error => {
    assert.ok(error instanceof SessionCheckError);
    assert.equal(error.cause, cause);
    assert.match(error.message, /connection and retry/);
    assert.notEqual(error.message, 'Sign in to launch.');
    return true;
  });
});

test('rejected session promises retain their cause and can recover on a later read', async () => {
  const cause = new TypeError('Failed to fetch');
  globalThis[fixture] = { auth: { getSession: async () => { throw cause; } } };
  await assert.rejects(readBrowserSession(), error => error instanceof SessionCheckError && error.cause === cause);
  const session = { access_token: 'local-unit-fixture-token' };
  globalThis[fixture].auth.getSession = async () => ({ data: { session }, error: null });
  assert.equal(await readBrowserSession(), session);
  assert.equal(await requireAccessToken(), session.access_token);
});

test('a successful empty read still requires sign-in and does not perform OAuth or sign-out', async () => {
  // The fixture exposes only getSession: any other auth mutation would fail.
  globalThis[fixture] = { auth: { getSession: async () => ({ data: { session: null }, error: null }) } };
  assert.equal(await readBrowserSession(), null);
  await assert.rejects(requireAccessToken('Sign in to launch.'), { message: 'Sign in to launch.' });
});

test('background work cannot reuse a newly signed-in account for a previous owner', async () => {
  globalThis[fixture] = { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-token', user: { id: 'owner-b' } } }, error: null }) } };
  await assert.rejects(requireAccessToken('Sign in.', 'owner-a'), /account changed/);
  assert.equal(await requireAccessToken('Sign in.', 'owner-b'), 'fixture-token');
});

test('concurrent consumers share a read but later retries start a fresh one', async () => {
  let complete, calls = 0;
  const auth = { getSession: () => { calls++; return new Promise(resolve => { complete = resolve; }); } };
  const first = readBrowserSession(auth), second = readBrowserSession(auth);
  assert.equal(calls, 1);
  complete({ data: { session: null }, error: null });
  await Promise.all([first, second]);
  const retry = readBrowserSession(auth);
  assert.equal(calls, 2);
  complete({ data: { session: null }, error: null });
  await retry;
});

test('a slow SDK read times out for the UI, retains its in-flight refresh and later recovers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let complete, calls = 0;
  const auth = { getSession: () => { calls++; return new Promise(resolve => { complete = resolve; }); } };
  const first = readBrowserSession(auth);
  const failed = assert.rejects(first, error => error instanceof SessionCheckError && /timed out/.test(error.cause.message));
  t.mock.timers.tick(15_000);
  await failed;
  const retry = readBrowserSession(auth);
  assert.equal(calls, 1);
  const session = { access_token: 'local-recovery-fixture' };
  complete({ data: { session }, error: null });
  assert.equal(await retry, session);
});

test('empty initial events cannot overwrite a failed read; explicit sign-out remains authoritative', () => {
  assert.equal(hasResolvedAuthState('INITIAL_SESSION', null), false);
  assert.equal(hasResolvedAuthState('TOKEN_REFRESHED', null), false);
  assert.equal(hasResolvedAuthState('SIGNED_OUT', null), true);
  assert.equal(hasResolvedAuthState('INITIAL_SESSION', { access_token: 'fixture' }), true);
  assert.equal(hasResolvedAuthState('SIGNED_IN', { access_token: 'fixture' }), true);
});
