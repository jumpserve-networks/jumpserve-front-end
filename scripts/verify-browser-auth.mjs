// Fixed local component campaign. Actual React components + installed Supabase SDK.
// Only Next navigation/link are stubbed. Synthetic credentials stay on loopback.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

assert.equal(process.argv.length, 2, 'Fixed local campaign; no arbitrary targets.');
const require = createRequire(import.meta.url);
const { build } = require('../../jumpserve-infra/node_modules/esbuild');
const directory = '.test-artifacts/browser-auth/' + new Date().toISOString().replaceAll(':', '-');
await mkdir(directory, { recursive: true });
const report = {
  protocol: 'browser-session-recovery-development-v2', started_at: new Date().toISOString(),
  actual_supabase_sdk: true, synthetic_auth_server: true, next_navigation_stubbed: true,
  checks: [], page_errors: [], console_errors: [], script_console_errors: [], blocked_external_requests: [],
  supabase_version: require('@supabase/supabase-js/package.json').version,
  auth_version: require('@supabase/auth-js/package.json').version,
  remote_writes: 0, model_calls: 0, measured_charges_usd: null,
  reviewer: { identity: 'Primary Codex AI implementer', type: 'AI', independent: false },
  limits: ['Component harness, not a legitimate Google OAuth or production end-to-end test.',
    'Native browser transport diagnostics remain recorded; script console errors are release-blocking.',
    'Reused development cases are not independent or held-out validation.'],
};
let mode = 'offline', bundle, browser;
const requests = [];
const actor = '11111111-1111-4111-8111-111111111111';
const user = { id: actor, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid',
  app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: {},
  identities: [], created_at: '2026-01-01T00:00:00.000Z' };
function session(expired = false) {
  const exp = Math.floor(Date.now() / 1000) + (expired ? -3600 : 3600);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: actor, aud: 'authenticated', role: 'authenticated', exp })}.c3ludGhldGlj`,
    refresh_token: 'synthetic-local-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
}
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  requests.push({ path: url.pathname, method: req.method });
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/supabase/auth/v1/token' && mode === 'offline') { req.socket.destroy(); return; }
  if (url.pathname === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle); return; }
  res.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/supabase/auth/v1/token') { res.end(JSON.stringify(session())); return; }
  if (url.pathname === '/api/profile') { res.end(JSON.stringify({ profile: { id: actor, first_name: 'Ada', last_name: 'Fixture', timezone: 'America/New_York' } })); return; }
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (url.pathname !== '/') { res.writeHead(404); res.end('{}'); return; }
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local auth fixture</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
async function check(name, fn) {
  try { const evidence = await fn(); report.checks.push({ name, passed: true, evidence }); console.log('PASS ' + name); }
  catch (error) { report.checks.push({ name, passed: false, error: error.message }); throw error; }
}
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const result = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {AuthButton} from './app/components/auth-button';import {UserPreferencesProvider,useUserPreferences} from './app/components/user-preferences';function Preferences(){const value=useUserPreferences();return <pre id="preferences">{JSON.stringify({profile:value.profile,loading:value.loading,error:value.error})}</pre>;}createRoot(document.getElementById('root')).render(<React.StrictMode><UserPreferencesProvider><h1>Research remains available</h1><AuthButton placement="inline"/><Preferences/></UserPreferencesProvider></React.StrictMode>);`,
      resolveDir: process.cwd(), sourcefile: 'browser-auth-fixture.tsx', loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"development"',
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(origin + '/supabase'),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"explicit-local-anon"',
      'process.env.NEXT_PUBLIC_SITE_URL': JSON.stringify(origin) },
    plugins: [{ name: 'local-next-navigation-only', setup(p) {
      p.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      p.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
        contents: args.path === 'next/link'
          ? "import React from 'react';export default function Link({prefetch:ignored,...props}){return React.createElement('a',props)}"
          : 'export function usePathname(){return location.pathname}', loader: 'js', resolveDir: process.cwd() }));
    } }],
  });
  bundle = result.outputFiles[0].contents;
  report.bundle_sha256 = createHash('sha256').update(bundle).digest('hex');
  browser = await chromium.launch({ headless: true, executablePath: existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined });
  async function open(savedSession = true) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { report.blocked_external_requests.push(url.origin); return route.abort(); }
      return route.continue();
    });
    if (savedSession) await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session(true))).toString('base64url'), url: origin, sameSite: 'Lax' }]);
    const page = await context.newPage(); page.setDefaultTimeout(40000);
    page.on('pageerror', error => report.page_errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') { report.console_errors.push(msg.text()); if (msg.location().url?.includes('/bundle.js')) report.script_console_errors.push(msg.text()); } });
    await page.goto(origin);
    return { page, context };
  }
  const first = await open();
  await check('offline refresh shows retry, retains the saved session and records no unhandled rejection', async () => {
    await first.page.getByRole('button', { name: 'Retry connection', exact: true }).waitFor();
    await first.page.getByRole('alert').filter({ hasText: 'Unable to check your sign-in' }).waitFor();
    await first.page.waitForFunction(() => { const p = JSON.parse(document.querySelector('#preferences').textContent); return !p.loading && p.error.includes('Unable to check your sign-in') && p.profile === null; });
    assert.equal(await first.page.getByRole('heading', { name: 'Research remains available' }).count(), 1);
    assert.equal(await first.page.getByRole('button', { name: 'Login with Google', exact: true }).count(), 0);
    assert.ok((await first.context.cookies()).some(c => c.name.startsWith('sb-127-auth-token')));
    assert.deepEqual(report.page_errors, []);
    await first.page.screenshot({ path: directory + '/offline-mobile.png', fullPage: true });
    return { session_cookie_preserved: true, preferences_error_visible_in_context: true, unhandled_rejections: 0 };
  });
  await check('explicit retry refreshes through the real SDK and restores profile without OAuth', async () => {
    mode = 'normal';
    await first.page.getByRole('button', { name: 'Retry connection', exact: true }).click();
    await first.page.getByRole('button', { name: 'Log out', exact: true }).waitFor();
    await first.page.waitForFunction(() => JSON.parse(document.querySelector('#preferences').textContent).profile?.first_name === 'Ada');
    assert.equal(await first.page.getByRole('alert').count(), 0);
    assert.equal(await first.page.getByRole('link', { name: 'Your profile', exact: true }).innerText(), 'Ada Fixture');
    assert.ok(!requests.some(r => r.path.includes('/authorize')));
    await first.page.screenshot({ path: directory + '/recovered-mobile.png', fullPage: true });
    return { sdk_refresh_success: true, profile_restored: true, oauth_requests: 0 };
  });
  await first.context.close();
  mode = 'offline';
  const second = await open();
  await check('browser online event automatically recovers a failed startup', async () => {
    await second.page.getByRole('button', { name: 'Retry connection', exact: true }).waitFor();
    mode = 'normal';
    await second.page.evaluate(() => dispatchEvent(new Event('online')));
    await second.page.getByRole('button', { name: 'Log out', exact: true }).waitFor();
    await second.page.waitForFunction(() => JSON.parse(document.querySelector('#preferences').textContent).profile?.first_name === 'Ada');
    return { online_event_recovery: true };
  });
  await second.context.close();
  const before = requests.filter(r => r.path.endsWith('/token')).length;
  const third = await open(false);
  await check('genuine missing session shows sign-in with no token refresh', async () => {
    await third.page.getByRole('button', { name: 'Login with Google', exact: true }).waitFor();
    await third.page.waitForFunction(() => { const p = JSON.parse(document.querySelector('#preferences').textContent); return !p.loading && p.profile === null && p.error === ''; });
    assert.equal(requests.filter(r => r.path.endsWith('/token')).length, before);
    assert.equal(await third.page.getByRole('alert').count(), 0);
    return { signed_out: true, token_requests: 0 };
  });
  await third.context.close();
  assert.deepEqual(report.page_errors, []);
  assert.deepEqual(report.script_console_errors, []);
  assert.deepEqual(report.blocked_external_requests, []);
  report.passed = true;
} catch (error) { report.passed = false; report.error = error.stack; process.exitCode = 1; }
finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  report.ended_at = new Date().toISOString();
  report.requests = requests;
  await writeFile(directory + '/report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ directory, passed: report.passed, checks: report.checks.length, error: report.error }));
}
