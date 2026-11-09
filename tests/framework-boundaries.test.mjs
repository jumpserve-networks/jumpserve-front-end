// Real Next request/response objects; Supabase verification is the only adapter.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {beforeEach, afterEach, test} from 'node:test';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import {NextRequest} from 'next/server.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const hook = registerHooks({resolve(specifier, context, next) {
  if (specifier === 'next/server') return next('next/server.js', context);
  const replacements = {
    '@supabase/ssr': 'export const createServerClient=(...args)=>globalThis.__frameworkCreate(...args);',
    '@/lib/supabase/server': 'export async function createClient(){return {auth:{getUser:async()=>({data:{user:globalThis.__frameworkState.user}})}};}',
    'next/navigation': "export function redirect(url){throw Object.assign(new Error('Synthetic Next redirect'),{code:'NEXT_REDIRECT',url});}",
  };
  return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);
}});
const {proxy, config: proxyConfig} = await import('../proxy.ts');
const {getGoogleUser, requireGoogleUser} = await import('../lib/auth.ts');
const {default: nextConfig} = await import('../next.config.ts');
const {default: postcss} = await import('../postcss.config.mjs');
const {default: eslintConfig} = await import('../eslint.config.mjs');
hook.deregister();
let state, originalEnvironment;
beforeEach(() => {
  originalEnvironment = {...process.env}; process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth.example.test'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-public-key';
  state = {user: null, clients: [], refreshed: []}; globalThis.__frameworkState = state;
  globalThis.__frameworkCreate = (url, key, options) => {
    state.clients.push({url, key, options}); return {auth: {getUser: async () => {
      state.originalCookies = options.cookies.getAll(); options.cookies.setAll(state.refreshed); return {data: {user: state.user}};
    }}};
  };
});
afterEach(() => {for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key]; Object.assign(process.env, originalEnvironment);});
const google = () => ({id: 'verified-owner', app_metadata: {provider: 'google'}, identities: [{provider: 'google'}]});
const request = path => new NextRequest('https://jumpserve.quaint-lab.org' + path, {headers: {cookie: 'original-session=retained'}});

test('redirect configuration puts personal catalogue aliases before broad namespace and detail redirects', async () => {
  const redirects = await nextConfig.redirects(); assert.ok(redirects.length > 30); assert.ok(redirects.every(value => value.permanent === true));
  for (const prefix of ['/research-verification', '/module/research-verification', '/modules/research-verification']) {
    const exact = redirects.findIndex(value => value.source === prefix + '/workspace'); const broad = redirects.findIndex(value => value.source === prefix + '/:path*');
    assert.ok(exact >= 0); if (broad >= 0) assert.ok(exact < broad);
    assert.equal(redirects[exact].destination, '/research-verification/assessments?mine=1');
  }
  assert.ok(redirects.some(value => value.source === '/experiment-queue/:path*' && value.destination === '/research-verification/experiment-queue/:path*'));
  assert.ok(redirects.some(value => value.source === '/benchmarks/:path*' && value.destination === '/congestion-control-emulated/benchmarks/:path*'));
  assert.ok(redirects.some(value => value.source === '/modules/congestion-control-real-world/:path*' && value.destination === '/congestion-control-real-world/:path*'));
});

test('build revision uses the release commit then explicit local revision then the local fallback', () => {
  const source = 'import config from "./next.config.ts";process.stdout.write(JSON.stringify(config.env));';
  for (const [commit, explicit, expected] of [['synthetic-release-commit', 'synthetic-local-revision', 'synthetic-release-commit'], ['', 'synthetic-local-revision', 'synthetic-local-revision'], ['', '', 'local']]) {
    const raw = execFileSync(process.execPath, ['--import', './tests/support/tsx-loader.mjs', '--input-type=module', '-e', source], {cwd: root, env: {...process.env, AWS_COMMIT_ID: commit, JUMPSERVE_BUILD_REVISION: explicit}, stdio: ['ignore', 'pipe', 'pipe']});
    assert.deepEqual(JSON.parse(raw), {JUMPSERVE_BUILD_REVISION: expected});
  }
});

test('CSS and lint configuration retain shared UI rules and exclude generated artifacts', () => {
  assert.deepEqual(postcss.plugins, {'@tailwindcss/postcss': {}});
  const controls = eslintConfig.find(entry => entry.files?.includes('app/**/*.tsx') && entry.rules?.['no-restricted-syntax']);
  assert.ok(controls); assert.ok(controls.ignores.includes('app/components/ui/**')); assert.equal(controls.rules['no-restricted-syntax'][0], 'error');
  assert.ok(eslintConfig.some(entry => entry.ignores?.includes('coverage/**')));
  const matcher = new RegExp('^' + proxyConfig.matcher[0] + '$');
  for (const path of ['/research-verification/assessment/id', '/login', '/api/session']) assert.ok(matcher.test(path));
  for (const path of ['/_next/static/chunk.js', '/_next/image', '/favicon.ico', '/source.png']) assert.equal(matcher.test(path), false);
});

test('session refresh preserves original request cookies and propagates exact refreshed options to redirects', async () => {
  state.refreshed = [{name: 'refreshed-session', value: 'synthetic-refreshed-value', options: {httpOnly: true, secure: true, sameSite: 'lax', path: '/'}}];
  const input = request('/congestion-control-real-world/chat?jobId=original-job'); const response = await proxy(input);
  assert.equal(response.status, 307); const location = new URL(response.headers.get('location')); assert.equal(location.pathname, '/login'); assert.equal(location.searchParams.get('next'), '/congestion-control-real-world/chat?jobId=original-job');
  assert.equal(state.originalCookies.find(cookie => cookie.name === 'original-session').value, 'retained'); assert.equal(input.cookies.get('refreshed-session').value, 'synthetic-refreshed-value');
  const cookie = response.cookies.get('refreshed-session'); assert.equal(cookie.value, 'synthetic-refreshed-value'); assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, 'lax');
  assert.equal(state.clients[0].url, 'https://auth.example.test'); assert.equal(state.clients[0].key, 'synthetic-public-key');
});

test('public pages stay public while both private chat modules retain their exact requested path', async () => {
  for (const user of [null, {id: 'email-only', app_metadata: {provider: 'email'}}, {...google(), is_anonymous: true}]) {
    state.user = user;
    for (const path of ['/congestion-control-emulated/chat', '/congestion-control-real-world/chat']) {
      const response = await proxy(request(path + '?question=literal')); const location = new URL(response.headers.get('location')); assert.equal(location.pathname, '/login'); assert.equal(location.searchParams.get('next'), path + '?question=literal');
    }
    for (const path of ['/', '/research-verification/assessments', '/congestion-control-real-world/test-results', '/api/public-results']) assert.equal((await proxy(request(path))).headers.get('location'), null);
  }
});

test('verified Google sessions remove OAuth errors and resume safe login destinations with refreshed cookies', async () => {
  state.user = google(); state.refreshed = [{name: 'session', value: 'synthetic', options: {path: '/'}}];
  let response = await proxy(request('/research-verification/assessments?name=retained&error=denied&error_code=code&error_description=private')); let location = new URL(response.headers.get('location'));
  assert.equal(location.pathname, '/research-verification/assessments'); assert.equal(location.search, '?name=retained'); assert.equal(response.cookies.get('session').value, 'synthetic');
  response = await proxy(request('/login?next=' + encodeURIComponent('/research-verification/assessment/original?job=retained'))); location = new URL(response.headers.get('location'));
  assert.equal(location.pathname, '/research-verification/assessment/original'); assert.equal(location.search, '?job=retained');
  response = await proxy(request('/login?next=' + encodeURIComponent('https://untrusted.example.test'))); assert.equal(new URL(response.headers.get('location')).origin, 'https://jumpserve.quaint-lab.org');
  assert.equal((await proxy(request('/congestion-control-emulated/chat'))).headers.get('location'), null);
});

test('missing Supabase configuration fails before creating a client and server guards verify provider identity', async () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL; await assert.rejects(proxy(request('/')), /Missing NEXT_PUBLIC_SUPABASE_URL/); assert.equal(state.clients.length, 0);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth.example.test'; delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; await assert.rejects(proxy(request('/')), /Missing NEXT_PUBLIC_SUPABASE_URL/);
  assert.equal(await getGoogleUser(), null); await assert.rejects(requireGoogleUser('/profile?section=name'), {code: 'NEXT_REDIRECT', url: '/login?next=%2Fprofile%3Fsection%3Dname'});
  state.user = google(); assert.equal(await getGoogleUser(), state.user); assert.equal(await requireGoogleUser('/profile'), state.user);
});
