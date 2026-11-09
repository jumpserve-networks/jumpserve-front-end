import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';

const replacements = {
  '@supabase/ssr': `export const createBrowserClient=(...args)=>globalThis.__supabaseUnit.browser(...args);export const createServerClient=(...args)=>globalThis.__supabaseUnit.server(...args);`,
  '@supabase/supabase-js': 'export const createClient=(...args)=>globalThis.__supabaseUnit.static(...args);',
  'next/headers': 'export const cookies=async()=>globalThis.__supabaseUnit.cookies;',
  '@/lib/profile-store': 'export const writeOwnProfile=(...args)=>globalThis.__supabaseUnit.write(...args);',
};
const hook = registerHooks({resolve(specifier, context, next) {return Object.hasOwn(replacements, specifier) ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const browser = await import('../lib/supabase/client.ts');
const server = await import('../lib/supabase/server.ts');
const {saveProfile} = await import('../app/profile/actions.ts');
hook.deregister();
let state, originalEnvironment;
beforeEach(() => {
  originalEnvironment = {...process.env};
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic-project.example.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anonymous-key';
  state = {calls: [], writes: [], user: null, cookieWrites: [],
    cookies: {getAll: () => [{name: 'original-session', value: 'synthetic-session'}], set: (...args) => state.cookieWrites.push(args)},
    browser: (...args) => {state.calls.push({kind: 'browser', args}); return state.client;},
    server: (...args) => {state.calls.push({kind: 'server', args}); return state.client;},
    static: (...args) => {state.calls.push({kind: 'static', args}); return state.client;},
    write: async (...args) => {state.writes.push(args); if (state.failure !== undefined) throw state.failure; return state.profile;},
    profile: {id: 'verified-owner', first_name: 'Synthetic', last_name: 'Owner', timezone: 'UTC'},
  };
  state.client = {auth: {getUser: async () => ({data: {user: state.user}})}};
  globalThis.__supabaseUnit = state;
});
afterEach(() => {for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key]; Object.assign(process.env, originalEnvironment);});

test('browser, cookie-aware server and static clients receive only the configured public credentials', async () => {
  assert.equal(browser.createClient(), state.client);
  assert.equal(await server.createClient(), state.client);
  assert.equal(server.createStaticClient(), state.client);
  assert.deepEqual(state.calls.map(call => call.kind), ['browser', 'server', 'static']);
  for (const {args} of state.calls) assert.deepEqual(args.slice(0, 2), ['https://synthetic-project.example.test', 'synthetic-anonymous-key']);
  const adapter = state.calls[1].args[2].cookies;
  assert.deepEqual(adapter.getAll(), [{name: 'original-session', value: 'synthetic-session'}]);
  const refreshed = [{name: 'refreshed-session', value: 'synthetic-refreshed', options: {httpOnly: true, sameSite: 'lax', secure: true, path: '/'}}];
  adapter.setAll(refreshed);
  assert.deepEqual(state.cookieWrites, [['refreshed-session', 'synthetic-refreshed', refreshed[0].options]]);
  state.cookies.set = () => {throw new Error('Synthetic server-component cookies are read-only');};
  assert.doesNotThrow(() => adapter.setAll(refreshed));
});

test('missing public configuration fails before creating any Supabase adapter', async () => {
  for (const missing of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
    const previous = process.env[missing]; delete process.env[missing];
    assert.throws(() => browser.createClient(), /Missing NEXT_PUBLIC_SUPABASE_URL/);
    await assert.rejects(server.createClient(), /Missing NEXT_PUBLIC_SUPABASE_URL/);
    assert.throws(() => server.createStaticClient(), /Missing NEXT_PUBLIC_SUPABASE_URL/);
    process.env[missing] = previous;
  }
  assert.deepEqual(state.calls, []);
});

test('profile action verifies Google identity before calling the owner-only writer', async () => {
  const input = {first_name: 'Changed', last_name: 'Owner', timezone: 'UTC'};
  for (const user of [null, {id: 'email-only', app_metadata: {provider: 'email'}}, {id: 'anonymous', is_anonymous: true, app_metadata: {provider: 'google'}}]) {
    state.user = user;
    assert.deepEqual(await saveProfile(input), {error: 'Your session has expired. Sign in again to save your profile.'});
  }
  assert.deepEqual(state.writes, []);
  state.user = {id: 'verified-owner', app_metadata: {provider: 'google'}, identities: [{provider: 'google'}]};
  assert.deepEqual(await saveProfile(input), {profile: state.profile});
  assert.deepEqual(state.writes, [[state.client, state.user, input]]);
});

test('profile persistence failures remain failures and retain useful non-sensitive diagnostics', async () => {
  state.user = {id: 'verified-owner', app_metadata: {provider: 'google'}};
  for (const failure of [new Error('Synthetic validation rejected'), 'unstructured']) {
    state.failure = failure;
    assert.deepEqual(await saveProfile({}), {error: failure instanceof Error ? failure.message : 'Profile could not be saved.'});
  }
});
