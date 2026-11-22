// Local Next.js and browser verification using a synthetic Google session and
// PostgREST transport. The infrastructure verifier separately exercises real SQL.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const origin = 'http://127.0.0.1:6129';
const api = 'http://127.0.0.1:4129';
const resource = origin + '/mcp';
const owner = '77d8ef24-7007-4759-8132-09159013199a';
const other = '4ef738ca-5375-4160-9ceb-0379d8b1a51c';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const authUser = id => ({
  id, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test',
  app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: {},
  identities: [], is_anonymous: false, created_at: '2026-01-01T00:00:00Z',
});
const token = id => encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: id, role: 'authenticated', exp: 4102444800 }) + '.local-fixture';
const cookie = id => ({
  name: 'sb-127-auth-token', url: origin, sameSite: 'Lax',
  value: 'base64-' + encode({
    user: authUser(id), access_token: token(id), token_type: 'bearer',
    refresh_token: 'fixture', expires_in: 3600, expires_at: 4102444800,
  }),
});
const script = { path: 'scripts/record.sh', content: '#!/bin/sh\nprintf "%s\\n" 0\n' };
const bundle = {
  version: 'jumpserve-assessment-v1',
  paper: { title: 'Local MCP fixture', authors: ['Test Author'], domain: 'Networking', byte_count: 20, sha256: 'a'.repeat(64) },
  summary: 'Recorded with a synthetic local runner.',
  claims: [{ id: 'c1', page: 1, claim: 'The count is zero.', criterion: 'Use the matched counter.', outcome: 'reproduced', finding: 'Both counters measured zero.' }],
  methods: [{ title: 'Fixture method', procedure: 'Compare the matched values.' }],
  wizard: {
    breakdown: [{ section: 'data', description: 'Count events on the loopback fixture.', pages: [1, 2] }],
    experiments: [{
      title: 'Matched counter test', claim_ids: ['c1'], prerequisites: ['POSIX shell'],
      setup: 'mkdir -p fixture-samples', cleanup: 'rmdir fixture-samples',
      scripts: [script],
      steps: [{ title: 'Record the count', instructions: 'Compare two matched counter values.', commands: `sh ${script.path}` }],
    }],
  },
  runs: [{
    id: 'r1', configuration: 'Loopback fixture', started_at: '2026-11-20T00:00:00Z', artifact_sha256: 'b'.repeat(64),
    measurements: [{ claim_id: 'c1', metric: 'Counter', units: 'count', paper_value: 0, observed_value: 0 }],
  }],
  limitations: ['Synthetic connector verification only.'],
};

async function verifyAssessmentWizard(page, url) {
  await page.goto(url);
  await page.getByRole('heading', { name: bundle.paper.title }).waitFor();
  await page.getByRole('heading', { name: 'Paper Breakdown', exact: true }).waitFor();
  await page.getByText('Count events on the loopback fixture.').waitFor();
  await page.getByText('PDF pages 1, 2', { exact: true }).waitFor();
  const steps = page.getByRole('navigation', { name: 'Assessment steps' });
  await steps.getByRole('button', { name: 'Step 3: Experiment Steps' }).click();
  await page.waitForURL(url + '?step=implementation');
  await page.getByText('Compare two matched counter values.').waitFor();
  await steps.getByRole('button', { name: 'Step 4: Setup' }).click();
  await page.waitForURL(url + '?step=execution');
  await page.getByText('Setup commands', { exact: true }).click();
  await page.getByText('mkdir -p fixture-samples', { exact: true }).waitFor();
  await page.getByText('Step 1 · Record the count', { exact: true }).click();
  await page.getByText(`sh ${script.path}`, { exact: true }).waitFor();
  await page.getByText(script.path, { exact: true }).click();
  const source = page.getByLabel(`Source for ${script.path}`);
  await source.waitFor();
  assert.equal(await source.textContent(), script.content);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: `Download ${script.path}` }).click(),
  ]);
  assert.equal(download.suggestedFilename(), 'record.sh');
  assert.deepEqual(await readFile(await download.path()), Buffer.from(script.content));
  assert.equal(await page.getByRole('table').count(), 0);
  await steps.getByRole('button', { name: 'Step 5: Experiment Results' }).click();
  await page.waitForURL(url + '?step=results');
  await page.getByRole('heading', { name: 'Experiment Results', exact: true }).waitFor();
  await page.getByText('Both counters measured zero.').waitFor();
  await page.getByRole('cell', { name: '0', exact: true }).first().waitFor();
  assert.equal(await page.getByRole('cell', { name: '0', exact: true }).count(), 2);
  assert.equal(await page.getByText('Setup commands', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: `Download ${script.path}` }).count(), 0);
  await page.goBack();
  await page.getByRole('heading', { name: 'Setup', exact: true }).waitFor();
  await page.goBack();
  await page.getByRole('heading', { name: 'Experiment Steps', exact: true }).waitFor();
}
const codes = new Map();
const tokens = new Map();
const previews = new Map();
let failNextSubmission = false;
const fixture = createServer(async (req, res) => {
  const url = new URL(req.url, api);
  const send = (status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin });
    res.end(JSON.stringify(value));
  };
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const input = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
  if (url.pathname === '/auth/v1/user') {
    const actor = [owner, other].find(id => req.headers.authorization === 'Bearer ' + token(id));
    return send(actor ? 200 : 401, actor ? authUser(actor) : { message: 'Sign-in required' });
  }
  const path = url.pathname.replace('/rest/v1/', '');
  if (path === 'profiles') return send(200, []);
  if (path === 'rpc/research_skill_shared') {
    const record = previews.get(input.p_study);
    return send(200, record?.study_id ? record.bundle : null);
  }
  if (req.headers.apikey !== 'fixture-service') return send(403, { message: 'Fixture service only' });
  if (path === 'jumpserve_mcp_codes') {
    if (req.method === 'POST') codes.set(input.code_hash, input);
    return send(200, null);
  }
  if (path === 'rpc/jumpserve_mcp_exchange') {
    const code = codes.get(input.p_proof_hash);
    const valid = code && code.client_id === input.p_client && code.redirect_uri === input.p_redirect &&
      code.challenge === input.p_challenge && code.resource === input.p_resource;
    if (valid) {
      codes.delete(input.p_proof_hash);
      tokens.set(input.p_access, code.owner_id);
    }
    return send(200, !!valid);
  }
  if (path === 'rpc/jumpserve_mcp_actor') return send(200, tokens.get(input.p_access) ?? null);
  if (path === 'rpc/research_skill_preview') {
    let row = [...previews.values()].find(record => record.owner_id === input.p_owner && record.bundle_sha256 === input.p_hash);
    if (!row) {
      row = { id: randomUUID(), owner_id: input.p_owner, bundle_sha256: input.p_hash, bundle: input.p_bundle,
        approved_at: null, study_id: null, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() };
      previews.set(row.id, row);
    }
    return send(200, { preview_id: row.id, study_id: row.study_id });
  }
  if (path === 'research_skill_submissions') {
    const record = previews.get(url.searchParams.get('id')?.slice(3));
    if (!record || url.searchParams.get('owner_id') !== 'eq.' + record.owner_id) return send(200, []);
    if (req.method === 'PATCH') {
      const expiration = url.searchParams.get('expires_at')?.slice(3);
      if (!(record.expires_at > expiration) || record.study_id ||
          url.searchParams.get('bundle_sha256') !== 'eq.' + record.bundle_sha256) return send(200, []);
      record.approved_at = input.approved_at;
      return send(200, [{ id: record.id }]);
    }
    const expiration = url.searchParams.get('or')?.match(/^\(expires_at\.gt\.([^,]+),study_id\.not\.is\.null\)$/)?.[1];
    return send(200, record.expires_at > expiration || record.study_id ? [record] : []);
  }
  if (path === 'rpc/research_skill_submit') {
    const row = previews.get(input.p_preview);
    if (!row || row.owner_id !== input.p_owner) return send(404, { code: 'P0002' });
    if (row.study_id) return send(200, row.study_id);
    if (!row.approved_at || row.expires_at <= new Date().toISOString()) return send(400, { code: '55000' });
    if (failNextSubmission) {
      failNextSubmission = false;
      return send(503, { code: 'fixture_retry' });
    }
    row.study_id = row.id;
    return send(200, row.id);
  }
  return send(404, {});
});

let app, browser, client, workspace;
try {
  await new Promise((resolve, reject) => {
    fixture.once('error', reject);
    fixture.listen(4129, '127.0.0.1', resolve);
  });
  await mkdir('.test-artifacts', { recursive: true });
  workspace = await mkdtemp(resolve('.test-artifacts/jumpserve-mcp-site-'));
  const files = ['app', 'lib', 'public', 'skills', 'proxy.ts', 'next.config.ts', 'package.json', 'postcss.config.mjs', 'tsconfig.json'];
  await Promise.all(files.map(file => cp(file, join(workspace, file), { recursive: true })));
  const next = resolve('node_modules/next/dist/bin/next');
  const options = {
    cwd: workspace, stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: api, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon',
      NEXT_PUBLIC_SITE_URL: origin, JUMPSERVE_MCP_ENABLED: 'true', SUPABASE_SECRET_KEY: 'fixture-service',
      NEXT_PUBLIC_BENCHMARK_API_URL: api, NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL: api, NEXT_PUBLIC_RESEARCH_CATALOG_API_URL: api,
      NEXT_PUBLIC_AGENT_URL: '', PAPER_INTAKE_SECRET_ID: '', NEXT_TELEMETRY_DISABLED: '1' },
  };
  const build = spawn(process.execPath, [next, 'build'], options);
  assert.equal(await new Promise((resolveExit, reject) => {
    build.once('exit', resolveExit);
    build.once('error', reject);
  }), 0, 'Fixture build failed');
  app = spawn(process.execPath, [next, 'start', '--hostname', '127.0.0.1', '--port', '6129'], options);
  for (let attempt = 0; ; attempt++) {
    const ready = await fetch(origin + '/.well-known/oauth-authorization-server').then(r => r.ok, () => false);
    if (ready) break;
    if (attempt === 80 || app.exitCode !== null) throw Error('Local Next.js failed to start.');
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  const challenge = await fetch(resource, { method: 'POST', body: '{}' });
  assert.equal(challenge.status, 401);
  const metadataUrl = challenge.headers.get('www-authenticate').match(/resource_metadata="([^"]+)"/)[1];
  assert.equal(new URL(metadataUrl).origin, origin);
  const metadataResponse = await fetch(metadataUrl);
  assert.equal(metadataResponse.status, 200, "Protected resource metadata");
  const metadata = await metadataResponse.json();
  assert.equal(metadata.resource, resource);
  assert.deepEqual(metadata.authorization_servers, [origin]);
  const authResponse = await fetch(metadata.authorization_servers[0] + '/.well-known/oauth-authorization-server');
  assert.equal(authResponse.status, 200, "Authorization server metadata");
  const auth = await authResponse.json();
  assert.equal(auth.issuer, origin);
  assert.equal(auth.registration_endpoint, origin + '/oauth/jumpserve/register');
  const marketplace = await fetch(origin + '/downloads/jumpserve-claude-marketplace.json');
  assert.equal(marketplace.status, 200);
  const source = (await marketplace.json()).plugins[0].source;
  const plugin = await fetch(origin + new URL(source.url).pathname);
  assert.equal(plugin.status, 200);
  assert.equal(source.sha256, sha256(Buffer.from(await plugin.arrayBuffer())));

  async function register(redirectUri, options = {}) {
    return fetch(auth.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [redirectUri], token_endpoint_auth_method: 'none', ...options }) });
  }
  assert.equal((await register('https://outside.example.test/callback')).status, 400);
  assert.equal((await register('http://localhost:48252/callback', { grant_types: ['client_credentials'] })).status, 400);
  const claude = await register('http://localhost:48252/callback', {
    client_name: 'Claude Code', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
  });
  assert.equal(claude.status, 201);
  const redirect = 'http://127.0.0.1:48251/callback/Abcd1234efgh';
  const codex = await register(redirect, { client_name: 'Codex', scope: 'assessments:share' });
  assert.equal(codex.status, 201);
  const { client_id: clientId, token_endpoint_auth_method: method } = await codex.json();
  assert.equal(method, 'none');

  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await chromium.launch({ executablePath: existsSync(chrome) ? chrome : undefined });
  const context = await browser.newContext();
  await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(origin + '/research-verification/new-assessment');
  await page.evaluate(() => {
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async text => { copied = text; },
        readText: async () => copied,
      },
    });
  });
  const copyCommands = [
    ['Claude Code install', 'claude plugin install jumpserve --marketplace jumpserve-networks/jumpserve-plugins'],
    ['Codex install', 'codex plugin marketplace add jumpserve-networks/jumpserve-plugins && codex plugin add jumpserve@jumpserve'],
  ];
  for (const [index, [label, command]] of copyCommands.entries()) {
    await page.getByRole('button', { name: `Copy ${label} command` }).click();
    await page.getByText('Copied.', { exact: true }).nth(index).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), command);
  }
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
  });
  await page.getByRole('button', { name: 'Copy Codex install command' }).press('Enter');
  await page.getByText('Copy failed. Select the command and copy it manually.').waitFor();
  console.log('PASS setup buttons copy the displayed command and report denied clipboard access');

  await context.addCookies([cookie(owner)]);
  const verifier = 'v'.repeat(43);
  await page.route(redirect + '?*', route => route.fulfill({ body: 'Callback captured' }));
  const consent = new URL(auth.authorization_endpoint);
  consent.search = new URLSearchParams({
    client_id: clientId, redirect_uri: redirect, response_type: 'code', code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), state: 'fixture-state', resource, scope: 'assessments:share',
  }).toString();
  await page.goto(consent.href);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.waitForURL(redirect + '?*');
  const callback = new URL(page.url());
  assert.equal(callback.searchParams.get('state'), 'fixture-state');
  const code = callback.searchParams.get('code');
  assert.equal(codes.get(sha256(code))?.owner_id, owner);
  const grant = verifier => fetch(auth.token_endpoint, { method: 'POST', body: new URLSearchParams({
    grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: redirect, resource,
  }) });
  assert.equal((await grant('x'.repeat(43))).status, 400);
  const issued = await grant(verifier);
  assert.equal(issued.status, 200);
  const credentials = await issued.json();
  assert.equal((await grant(verifier)).status, 400);
  console.log('PASS browser OAuth consent, discovery, PKCE and code replay rejection');

  client = new Client({ name: 'jumpserve-local-verifier', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(resource), {
    requestInit: { headers: { Authorization: 'Bearer ' + credentials.access_token } },
  }));
  const preview = await client.callTool({ name: 'preview_assessment', arguments: { bundle } });
  const { preview_id, review_url } = preview.structuredContent;
  const submission = { name: 'submit_assessment', arguments: { preview_id } };
  assert.equal((await client.callTool(submission)).isError, true);
  const otherContext = await browser.newContext();
  await otherContext.addCookies([cookie(other)]);
  const otherPage = await otherContext.newPage();
  assert.equal((await otherPage.goto(review_url)).status(), 404);
  await otherContext.close();
  await verifyAssessmentWizard(page, review_url);
  assert.equal(previews.get(preview_id).study_id, null);
  const publicUrl = origin + '/research-verification/assessment/' + preview_id;
  await page.getByRole('button', { name: 'Approve public sharing' }).click();
  await page.waitForURL(publicUrl);
  const shared = await client.callTool(submission);
  assert.equal(shared.structuredContent.assessment_url, publicUrl);
  assert.deepEqual(await client.callTool(submission), shared);
  const alreadyShared = await client.callTool({ name: 'preview_assessment', arguments: { bundle } });
  assert.deepEqual(alreadyShared.structuredContent, { assessment_url: publicUrl, status: 'already_shared' });
  previews.get(preview_id).expires_at = '2000-01-01T00:00:00.000Z';
  await page.goto(review_url + '?step=results');
  assert.equal(page.url(), publicUrl + '?step=results');
  const viewer = await browser.newContext();
  const publicPage = await viewer.newPage();
  await verifyAssessmentWizard(publicPage, publicUrl);
  assert.deepEqual(previews.get(preview_id).bundle, bundle);
  console.log('PASS private and public Steps 2–5, one-click sharing, idempotent MCP submission and measurement display');

  const retryBundle = { ...bundle, summary: 'Verify a recoverable sharing failure.' };
  const retryPreview = (await client.callTool({ name: 'preview_assessment', arguments: { bundle: retryBundle } })).structuredContent;
  const retryRow = previews.get(retryPreview.preview_id);
  const expiration = retryRow.expires_at;
  retryRow.expires_at = '2000-01-01T00:00:00.000Z';
  assert.equal((await page.goto(retryPreview.review_url)).status(), 404);
  retryRow.expires_at = expiration;
  await page.goto(retryPreview.review_url);
  failNextSubmission = true;
  await page.getByRole('button', { name: 'Approve public sharing' }).click();
  const retry = page.getByRole('button', { name: 'Share approved assessment' });
  await retry.waitFor();
  assert.ok(retryRow.approved_at);
  assert.equal(retryRow.study_id, null);
  await retry.click();
  await page.waitForURL(origin + '/research-verification/assessment/' + retryPreview.preview_id);
  console.log('PASS expired private previews and retry of an approved submission');
} finally {
  await client?.close();
  await browser?.close();
  if (app && app.exitCode === null && app.signalCode === null) {
    const stopped = once(app, 'exit');
    app.kill();
    await stopped;
  }
  fixture.closeAllConnections();
  await new Promise(resolve => fixture.close(resolve));
  if (workspace) await rm(workspace, { recursive: true, force: true });
}
