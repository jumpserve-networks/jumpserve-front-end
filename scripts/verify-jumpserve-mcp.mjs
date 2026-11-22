// Local Next.js and browser verification using a synthetic Google session and
// PostgREST transport. The infrastructure verifier separately exercises real SQL.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    breakdown: [
      { section: 'data', id: 'measure', title: 'Record measurements', description: 'Count events on the loopback fixture.', pages: [1, 2] },
      { section: 'data', id: 'count', parent_id: 'measure', title: 'Record counter values', description: 'Read one counter per condition.', pages: [2] },
      { section: 'data', id: 'unit', parent_id: 'count', title: 'Record the unit', description: 'Use the event count.', pages: [3] },
      { section: 'data', id: 'match', parent_id: 'measure', title: 'Match observations', description: 'Associate each value with its test condition.', pages: [2, 3] },
      { section: 'access', description: 'Use a local shell.', pages: [1] },
    ],
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
  const data = page.getByRole('region', { name: '3. Data', exact: true });
  await data.getByText('Count events on the loopback fixture.').waitFor();
  await data.getByText('PDF pages 1, 2', { exact: true }).waitFor();
  const measurements = data.getByRole('heading', { name: 'Record measurements' }).locator('xpath=ancestor::li[1]');
  for (const number of ['3.1', '3.1.1', '3.1.1.1', '3.1.2']) {
    await measurements.getByText(number, { exact: true }).waitFor();
  }
  const units = measurements.getByRole('heading', { name: 'Record the unit' }).locator('xpath=ancestor::li[1]');
  await units.getByText('PDF page 3', { exact: true }).waitFor();
  const access = page.getByRole('region', { name: '1. Access', exact: true });
  await access.getByText('1.1', { exact: true }).waitFor();
  await access.getByText('Use a local shell.').waitFor();
  const steps = page.getByRole('navigation', { name: 'Assessment steps' });
  await steps.getByRole('button', { name: 'Step 3: Experiment Steps' }).click();
  await page.waitForURL(url + '?step=implementation');
  await page.getByText('Compare two matched counter values.').waitFor();
  await steps.getByRole('button', { name: 'Step 4: Experiment Setup' }).click();
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
  await page.getByRole('heading', { name: 'Experiment Setup', exact: true }).waitFor();
  await page.goBack();
  await page.getByRole('heading', { name: 'Experiment Steps', exact: true }).waitFor();
}
const codes = new Map();
const tokens = new Map();
const previews = new Map();
const papers = new Map();
const sources = new Map();
let failNextSubmission = false;
const fixture = createServer(async (req, res) => {
  const url = new URL(req.url, api);
  const send = (status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin });
    res.end(JSON.stringify(value));
  };
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const service = req.headers.apikey === 'fixture-service';
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'PUT, GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? '' });
    return res.end();
  }
  if (url.pathname === '/storage/v1/object/copy' && req.method === 'POST' && service) {
    const { bucketId, sourceKey, destinationKey } = JSON.parse(body);
    const source = `${bucketId}/${sourceKey}`, destination = `${bucketId}/${destinationKey}`;
    if (!papers.has(source) || papers.has(destination)) return send(409, { message: 'Fixture copy unavailable' });
    papers.set(destination, papers.get(source));
    return send(200, { Key: destination });
  }
  const storage = url.pathname.match(/^\/storage\/v1\/object\/(?:(upload\/sign|sign)\/)?(research-paper-uploads\/(?:jumpserve-mcp\/[a-f0-9-]+|local-assessment-sources\/[a-f0-9-]+\/[a-f0-9]{64})\.pdf)$/);
  if (storage) {
    const [, kind, key] = storage;
    const signed = (prefix, id) => `/object/${prefix}/${key}?token=${id}`;
    if (kind === 'upload/sign' && req.method === 'POST' && service) {
      assert.notEqual(req.headers['x-upsert'], 'true');
      return send(200, { url: signed('upload/sign', 'write-only-fixture') });
    }
    if (kind === 'upload/sign' && req.method === 'PUT' && url.searchParams.get('token') === 'write-only-fixture') {
      if (papers.has(key)) return send(409, { message: 'Fixture object exists' });
      const type = req.headers['content-type'];
      let bytes = body;
      if (type.startsWith('multipart/form-data;')) {
        const form = await new Response(body, { headers: { 'Content-Type': type } }).formData();
        const file = form.get('');
        assert.equal(file.type, 'application/pdf');
        bytes = Buffer.from(await file.arrayBuffer());
      } else {
        assert.equal(type, 'application/pdf');
      }
      papers.set(key, bytes);
      return send(200, {});
    }
    if (kind === 'sign' && req.method === 'POST' && service && papers.has(key)) {
      assert.ok([60, 180].includes(JSON.parse(body).expiresIn));
      return send(200, { signedURL: signed('sign', 'read-only-fixture') });
    }
    if (req.method === 'HEAD' && service) {
      return send(papers.has(key) ? 200 : 404, null);
    }
    if (req.method === 'GET' && papers.has(key) && (service || kind === 'sign' && url.searchParams.get('token') === 'read-only-fixture')) {
      const filename = url.searchParams.get('download') ?? 'source-paper.pdf';
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
      return res.end(papers.get(key));
    }
    return send(403, {});
  }
  const input = body.length ? JSON.parse(body.toString()) : null;
  if (url.pathname === '/auth/v1/user') {
    const actor = [owner, other].find(id => req.headers.authorization === 'Bearer ' + token(id));
    return send(actor ? 200 : 401, actor ? authUser(actor) : { message: 'Sign-in required' });
  }
  const path = url.pathname.replace('/rest/v1/', '');
  if (path === 'profiles') return send(200, []);
  if (path === 'rpc/research_skill_shared') {
    const record = previews.get(input.p_study);
    return send(200, record?.study_id && !record.deleted ? record.bundle : null);
  }
  if (!service) return send(403, { message: 'Fixture service only' });
  if (path === 'rpc/research_skill_expired_pdfs') return send(200, []);
  if (path === 'jumpserve_mcp_codes') {
    if (req.method === 'POST') codes.set(input.code_hash, input);
    return send(200, null);
  }
  if (path === 'rpc/jumpserve_mcp_exchange_scoped') {
    const code = codes.get(input.p_proof_hash);
    const valid = code && code.client_id === input.p_client && code.redirect_uri === input.p_redirect &&
      code.challenge === input.p_challenge && code.resource === input.p_resource;
    if (valid && (input.p_read_sources !== true || code.read_sources)) {
      codes.delete(input.p_proof_hash);
      const readSources = code.read_sources && input.p_read_sources !== false;
      tokens.set(input.p_access, { owner: code.owner_id, readSources });
      return send(200, readSources ? 'source' : 'share');
    }
    return send(200, null);
  }
  if (path === 'rpc/jumpserve_mcp_actor') return send(200, tokens.get(input.p_access)?.owner ?? null);
  if (path === 'rpc/jumpserve_mcp_can_read_sources') return send(200, tokens.get(input.p_access)?.readSources === true);
  if (path === 'research_skill_sources') {
    if (req.method === 'POST') {
      if (!sources.has(input.id)) sources.set(input.id, input);
      return send(201, null);
    }
    const source = sources.get(url.searchParams.get('id')?.slice(3));
    return send(200, source && url.searchParams.get('owner_id') === 'eq.' + source.owner_id ? [source] : []);
  }
  if (path === 'rpc/research_skill_preview' || path === 'rpc/research_skill_preview_for_source') {
    const assessmentId = input.p_assessment_id;
    if (assessmentId) {
      const source = sources.get(assessmentId);
      const paper = input.p_bundle.paper;
      if (source?.owner_id !== input.p_owner || source.sha256 !== paper.sha256 || source.byte_count !== paper.byte_count || !paper.pdf_copy) {
        return send(400, { code: '22023' });
      }
    }
    let row = assessmentId ? previews.get(assessmentId) : [...previews.values()]
      .find(record => !record.source_id && record.owner_id === input.p_owner && record.bundle_sha256 === input.p_hash);
    if (row && row.bundle_sha256 !== input.p_hash) return send(409, { code: '23505' });
    if (!row) {
      row = { id: assessmentId ?? randomUUID(), source_id: assessmentId, owner_id: input.p_owner, bundle_sha256: input.p_hash, bundle: input.p_bundle,
        approved_at: null, pdf_verified_at: null, study_id: null, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() };
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
      if (input.pdf_verified_at) {
        if (record.pdf_verified_at) return send(200, []);
        record.pdf_verified_at = input.pdf_verified_at;
      } else {
        if (record.bundle.paper.pdf_copy && !record.pdf_verified_at) return send(400, { code: '23514' });
        record.approved_at = input.approved_at;
      }
      return send(200, [{ id: record.id }]);
    }
    if (url.searchParams.get('select') === 'pdf_verified_at') return send(200, [{ pdf_verified_at: record.pdf_verified_at }]);
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
  const fullScope = 'assessments:share assessments:read-source';
  const codex = await register(redirect, { client_name: 'Codex', scope: fullScope });
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
  await page.getByText('Copy failed. Select the text and copy it manually.').waitFor();
  console.log('PASS setup buttons copy the displayed command and report denied clipboard access');

  await context.addCookies([cookie(owner)]);
  const verifier = 'v'.repeat(43);
  await page.route(redirect + '?*', route => route.fulfill({ body: 'Callback captured' }));
  const consent = new URL(auth.authorization_endpoint);
  consent.search = new URLSearchParams({
    client_id: clientId, redirect_uri: redirect, response_type: 'code', code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), state: 'fixture-state', resource, scope: fullScope,
  }).toString();
  await page.goto(consent.href);
  await page.getByText(/It can also download private research PDFs/).waitFor();
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
  assert.equal(credentials.scope, fullScope);
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

  const pdf = Buffer.from('\n%PDF-1.4\n% Synthetic transport fixture\n%%EOF\n');
  const pdfBundle = { ...bundle, paper: { ...bundle.paper, sha256: sha256(pdf), byte_count: pdf.length, pdf_copy: true } };
  const stagePdf = (value = pdfBundle) => client.callTool({ name: 'preview_assessment', arguments: { bundle: value } });
  const ticket = (await stagePdf()).structuredContent;
  assert.equal(ticket.status, 'pdf_upload_required');
  const privatePdf = origin + '/research-verification/share/' + ticket.preview_id;
  const publicPdf = origin + '/research-verification/assessment/' + ticket.preview_id;
  await page.goto(privatePdf);
  await page.getByText('The assessment skill is waiting to verify the source PDF upload.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Approve public sharing' }).count(), 0);
  assert.equal((await viewer.request.get(publicPdf + '/paper')).status(), 404);
  assert.equal((await stagePdf()).structuredContent.preview_id, ticket.preview_id);
  const pdfPath = join(workspace, 'source.pdf'), bundlePath = join(workspace, 'assessment.json');
  await writeFile(pdfPath, pdf);
  await writeFile(bundlePath, JSON.stringify(pdfBundle));
  const upload = spawn('python3', ['-B', resolve('skills/jumpserve-paper-assessment/scripts/upload_paper.py'), '--pdf', pdfPath, '--bundle', bundlePath], { stdio: ['pipe', 'inherit', 'inherit'] });
  upload.stdin.end(JSON.stringify(ticket));
  assert.deepEqual(await once(upload, 'exit'), [0, null]);
  const verified = (await stagePdf()).structuredContent;
  assert.deepEqual(verified, { status: 'review_required', preview_id: ticket.preview_id, review_url: privatePdf });
  assert.ok(previews.get(ticket.preview_id).pdf_verified_at);
  const unauthorized = await viewer.request.get(privatePdf + '/paper', { maxRedirects: 0 });
  assert.equal(unauthorized.status(), 307);
  assert.match(unauthorized.headers().location, /^\/login\?/);
  const nonOwner = await browser.newContext();
  await nonOwner.addCookies([cookie(other)]);
  assert.equal((await nonOwner.request.get(privatePdf + '/paper')).status(), 404);
  await nonOwner.close();
  await page.goto(privatePdf);
  await page.getByText('Public sharing includes the attached source PDF.').waitFor();
  assert.equal(await page.getByRole('link', { name: 'Download source PDF' }).getAttribute('href'), new URL(privatePdf).pathname + '/paper');
  const ownerDownload = await context.request.get(privatePdf + '/paper', { maxRedirects: 0 });
  assert.equal(ownerDownload.status(), 303);
  assert.equal(ownerDownload.headers()['cache-control'], 'private, no-store');
  assert.deepEqual(await (await context.request.get(privatePdf + '/paper')).body(), pdf);
  assert.equal((await viewer.request.get(publicPdf + '/paper')).status(), 404);
  await page.getByRole('button', { name: 'Approve public sharing' }).click();
  await page.waitForURL(publicPdf);
  await publicPage.goto(publicPdf + '?step=results');
  assert.equal(await publicPage.getByRole('link', { name: 'Download source PDF' }).getAttribute('href'), new URL(publicPdf).pathname + '/paper');
  assert.deepEqual(await (await viewer.request.get(publicPdf + '/paper')).body(), pdf);
  previews.get(ticket.preview_id).deleted = true;
  assert.equal((await viewer.request.get(publicPdf + '/paper')).status(), 404);

  const otherBundle = { ...pdfBundle, summary: 'Verify mismatched upload rejection.' };
  const wrong = (await stagePdf(otherBundle)).structuredContent;
  const changed = Buffer.from(pdf);
  changed[10] ^= 1;
  assert.equal((await fetch(wrong.upload_url, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: changed })).status, 200);
  const rejected = await stagePdf(otherBundle);
  assert.equal(rejected.isError, true);
  assert.match(rejected.content[0].text, /differs from the assessed PDF/);
  assert.equal(previews.get(wrong.preview_id).pdf_verified_at, null);
  console.log('PASS verified PDF upload, owner-only preview, public download, deletion and mismatched byte rejection');

  const uploadPage = origin + '/research-verification/new-assessment';
  const sourcePdf = Buffer.from('%PDF-1.4\n% Step 1 browser fixture\n%%EOF\n');
  const sourceSha = sha256(sourcePdf);
  await page.goto(uploadPage);
  const fileInput = page.getByLabel('Research paper PDF');
  await fileInput.setInputFiles({ name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') });
  await page.getByRole('button', { name: 'Upload PDF' }).click();
  await page.getByText(/no PDF signature/i).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Copy assessment prompt' }).count(), 0);
  await fileInput.setInputFiles({ name: 'paper.pdf', mimeType: 'application/octet-stream', buffer: sourcePdf });
  await page.getByRole('button', { name: 'Upload PDF' }).click();
  await page.waitForURL(url => /^[a-f0-9-]{36}$/.test(url.searchParams.get('assessment') ?? ''));
  const assessmentId = new URL(page.url()).searchParams.get('assessment');
  const sourceDownload = origin + '/research-verification/api/assessment-source?assessment_id=' + assessmentId;
  const prompt = page.locator('[aria-label="assessment prompt"]');
  await prompt.waitFor();
  assert.match(await prompt.textContent(), /download_assessment_pdf/);
  assert.match(await prompt.textContent(), new RegExp(`paper-${assessmentId}\\.pdf`));
  assert.doesNotMatch(await prompt.textContent(), new RegExp(sourceSha));
  await page.evaluate(() => {
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { copied = text; }, readText: async () => copied,
    } });
  });
  await page.getByText('Start Codex CLI with approval prompts', { exact: true }).click();
  const approvalCommand = page.getByLabel('Codex human approval command', { exact: true });
  assert.equal(await approvalCommand.textContent(), `codex --sandbox workspace-write --ask-for-approval on-request -c 'approvals_reviewer="user"'`);
  await page.getByRole('button', { name: 'Copy Codex human approval command' }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await approvalCommand.textContent());
  await page.getByRole('button', { name: 'Copy assessment prompt' }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await prompt.textContent());
  await page.reload();
  await prompt.waitFor();
  const downloaded = await context.request.get(sourceDownload);
  assert.deepEqual(await downloaded.body(), sourcePdf);
  assert.equal(downloaded.headers()['content-disposition'], `attachment; filename="paper-${assessmentId}.pdf"`);
  assert.equal((await viewer.request.get(sourceDownload, { maxRedirects: 0 })).status(), 307);
  const stranger = await browser.newContext();
  await stranger.addCookies([cookie(other)]);
  assert.equal((await stranger.request.get(sourceDownload)).status(), 404);
  await stranger.close();
  const sourceBundle = { ...pdfBundle, paper: { ...pdfBundle.paper, sha256: sourceSha, byte_count: sourcePdf.length } };
  const downloadCall = { name: 'download_assessment_pdf', arguments: { assessment_id: assessmentId } };
  const downloadTicket = (await client.callTool(downloadCall)).structuredContent;
  assert.equal(downloadTicket.expires_in, 180);
  assert.equal(downloadTicket.sha256, sourceSha);
  assert.equal(downloadTicket.byte_count, sourcePdf.length);
  assert.equal(downloadTicket.assessment_id, assessmentId);
  const localPdf = join(workspace, downloadTicket.filename);
  const downloadWithHelper = (ticket, out, ...options) => {
    const helper = spawn('python3', ['-B', resolve('skills/jumpserve-paper-assessment/scripts/download_paper.py'),
      '--assessment-id', assessmentId, '--out', out, ...options], { stdio: ['pipe', 'inherit', 'pipe'] });
    let error = '';
    helper.stderr.setEncoding('utf8').on('data', data => { error += data; });
    helper.stdin.end(JSON.stringify(ticket));
    return once(helper, 'close').then(([code]) => ({ code, error }));
  };
  assert.deepEqual(await downloadWithHelper(downloadTicket, localPdf), { code: 0, error: '' });
  assert.deepEqual(await readFile(localPdf), sourcePdf);
  assert.deepEqual(await readFile(localPdf), await (await context.request.get(sourceDownload)).body());
  const userPdf = join(workspace, 'browser-download.pdf');
  const verifiedPdf = join(workspace, 'offline', downloadTicket.filename);
  await mkdir(join(workspace, 'offline'));
  await writeFile(userPdf, await downloaded.body());
  const { assessment_id, filename, sha256: digest, byte_count } = downloadTicket;
  const identity = { assessment_id, filename, sha256: digest, byte_count };
  assert.deepEqual(await downloadWithHelper(identity, verifiedPdf, '--from-file', userPdf), { code: 0, error: '' });
  assert.deepEqual(await readFile(verifiedPdf), sourcePdf);
  const altered = Buffer.from(sourcePdf);
  altered[10] ^= 1;
  await writeFile(userPdf, altered);
  const refused = await downloadWithHelper(identity, verifiedPdf, '--from-file', userPdf);
  assert.equal(refused.code, 1);
  assert.match(refused.error, /PDF bytes do not match/);
  assert.deepEqual(await readFile(verifiedPdf), sourcePdf);
  console.log('PASS offline verification of the browser-downloaded source using MCP metadata');
  const directDownload = token => fetch(resource, { method: 'POST', headers: { Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: downloadCall }) });
  const shareOnlyToken = 'v'.repeat(43), otherToken = 'w'.repeat(43);
  tokens.set(sha256(shareOnlyToken), { owner, readSources: false });
  tokens.set(sha256(otherToken), { owner: other, readSources: true });
  const denied = await directDownload(shareOnlyToken);
  assert.equal(denied.status, 403);
  assert.match(denied.headers.get('www-authenticate'), /insufficient_scope/);
  const otherDownload = await (await directDownload(otherToken)).json();
  assert.equal(otherDownload.result.isError, true);
  assert.equal(otherDownload.result.structuredContent, undefined);
  const stageSource = bundle => client.callTool({ name: 'preview_assessment', arguments: { bundle, assessment_id: assessmentId } });
  const wrongSource = await stageSource(pdfBundle);
  assert.equal(wrongSource.isError, true);
  assert.match(wrongSource.content[0].text, /supplied PDF is different/);
  const autoAttached = (await stageSource(sourceBundle)).structuredContent;
  assert.equal(autoAttached.status, 'review_required');
  assert.equal(autoAttached.preview_id, assessmentId);
  assert.deepEqual((await stageSource(sourceBundle)).structuredContent, autoAttached);
  assert.ok(previews.get(autoAttached.preview_id).pdf_verified_at);
  assert.equal((await viewer.request.get(`${origin}/research-verification/assessment/${autoAttached.preview_id}/paper`)).status(), 404);
  assert.deepEqual(await (await context.request.get(autoAttached.review_url + '/paper')).body(), sourcePdf);
  await page.getByRole('link', { name: 'Upload another paper' }).click();
  await page.waitForURL(uploadPage);
  await fileInput.waitFor();
  await page.goto(autoAttached.review_url);
  await page.getByRole('button', { name: 'Approve public sharing' }).click();
  await page.waitForURL(`${origin}/research-verification/assessment/${assessmentId}`);
  assert.deepEqual(await (await viewer.request.get(`${page.url()}/paper`)).body(), sourcePdf);
  console.log('PASS one assessment ID across the upload, local prompt, private preview and shared assessment');
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
