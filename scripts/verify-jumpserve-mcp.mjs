// Local Next.js and browser verification using a synthetic Google session and
// PostgREST transport. The infrastructure verifier separately exercises real SQL.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const origin = 'http://127.0.0.1:6129';
const api = 'http://127.0.0.1:4129';
const resource = origin + '/mcp';
const sourceResource = origin + '/research-verification/api/assessment-source';
const resultsResource = origin + '/research-verification/api/assessment-results';
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
      { section: 'experiment', title: 'Paper counter test', description: 'Use matched counters.', pages: [2] },
    ],
    experiments: [{
      id: 'matched-counters', title: 'Matched counter test', claim_ids: ['c1'], prerequisites: ['POSIX shell'],
      setup: 'mkdir -p fixture-samples', cleanup: 'rmdir fixture-samples',
      scripts: [script],
      steps: [{ title: 'Record the count', instructions: 'Compare two matched counter values.', commands: `sh ${script.path}` }],
    }],
  },
  runs: [{
    id: 'r1', experiment_id: 'matched-counters', configuration: 'Loopback fixture', started_at: '2026-11-20T00:00:00Z', artifact_sha256: 'b'.repeat(64),
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
  const experiment = page.getByRole('region', { name: '2.2 Matched counter test', exact: true });
  const action = experiment.getByRole('heading', { name: '2.2.1 Record the count', exact: true }).locator('xpath=ancestor::li[1]');
  await experiment.waitFor();
  assert.equal(await action.count(), 0);
  await steps.getByRole('button', { name: 'Step 3: Experiment Steps' }).click();
  await page.waitForURL(url + '?step=implementation');
  await action.getByText('Compare two matched counter values.').waitFor();
  assert.equal(await action.getByText('Commands for step 2.2.1', { exact: true }).count(), 0);
  await steps.getByRole('button', { name: 'Step 4: Experiment Setup' }).click();
  await page.waitForURL(url + '?step=execution');
  await page.getByText('Setup commands', { exact: true }).click();
  await page.getByText('mkdir -p fixture-samples', { exact: true }).waitFor();
  await action.getByText('Commands for step 2.2.1', { exact: true }).click();
  await action.getByText(`sh ${script.path}`, { exact: true }).waitFor();
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
  await experiment.getByText('Both counters measured zero.').waitFor();
  await experiment.getByRole('cell', { name: '0', exact: true }).first().waitFor();
  assert.equal(await experiment.getByRole('cell', { name: '0', exact: true }).count(), 2);
  assert.equal(await action.getByText('Commands for step 2.2.1', { exact: true }).count(), 1);
  assert.equal(await experiment.getByText('Setup commands', { exact: true }).count(), 1);
  assert.equal(await experiment.getByRole('button', { name: `Download ${script.path}` }).count(), 1);
  await page.goBack();
  await page.getByRole('heading', { name: 'Experiment Setup', exact: true }).waitFor();
  await page.goBack();
  await page.getByRole('heading', { name: 'Experiment Steps', exact: true }).waitFor();
}
const codes = new Map();
const tokens = new Map();
const previews = new Map();
const generatorResults = new Map();
const verifierResults = new Map();
const coachReports = new Map();
const papers = new Map();
const sources = new Map();
let uploadTickets = 0;
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
      assert.ok(key.startsWith('research-paper-uploads/local-assessment-sources/'));
      assert.notEqual(req.headers['x-upsert'], 'true');
      uploadTickets++;
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
  if (url.pathname === '/research/papers' && url.searchParams.get('mine') === '1') {
    assert.equal(req.headers.authorization, 'Bearer ' + token(owner));
    return send(200, { version: 'research-paper-catalog-v1', access: 'owner-read-only', papers: [], coverage: { papers: 0 }, next_cursor: null });
  }
  const path = url.pathname.replace('/rest/v1/', '');
  if (path === 'profiles') return send(200, []);
  if (path === 'rpc/research_skill_shared') {
    const record = previews.get(input.p_study);
    return send(200, record?.study_id && !record.deleted ? record.bundle : null);
  }
  if (!service) return send(403, { message: 'Fixture service only' });
  if (path === 'jumpserve_mcp_codes') {
    if (req.method === 'POST') codes.set(input.code_hash, input);
    return send(200, null);
  }
  if (path === 'rpc/jumpserve_mcp_exchange_scoped') {
    const refresh = input.p_grant === 'refresh_token';
    const previous = refresh && [...tokens].find(([, value]) => value.refresh_hash === input.p_proof_hash);
    const grant = refresh ? previous?.[1] : codes.get(input.p_proof_hash);
    if (!grant || grant.client_id !== input.p_client || grant.resource !== input.p_resource ||
        (!refresh && (grant.redirect_uri !== input.p_redirect || grant.challenge !== input.p_challenge)) ||
        (input.p_read_sources === true && !grant.read_sources)) return send(200, null);
    if (refresh) tokens.delete(previous[0]);
    else codes.delete(input.p_proof_hash);
    const read_sources = grant.read_sources && input.p_read_sources !== false;
    tokens.set(input.p_access, { owner_id: grant.owner_id, client_id: input.p_client, resource: input.p_resource,
      refresh_hash: input.p_refresh, read_sources });
    return send(200, read_sources ? 'source' : 'share');
  }
  if (path === 'rpc/jumpserve_mcp_actor' || path === 'rpc/jumpserve_mcp_can_read_sources') {
    const session = tokens.get(input.p_access);
    const valid = session?.resource === input.p_resource && !session.expired;
    return send(200, path.endsWith('actor') ? (valid ? session.owner_id : null) : valid && session.read_sources === true);
  }
  if (path === 'research_skill_sources') {
    if (req.method === 'POST') {
      if (!sources.has(input.id)) sources.set(input.id, input);
      return send(201, null);
    }
    const source = sources.get(url.searchParams.get('id')?.slice(3));
    return send(200, source && url.searchParams.get('owner_id') === 'eq.' + source.owner_id ? [source] : []);
  }
  if (path === 'rpc/research_skill_save_from_source') {
    const assessmentId = input.p_assessment_id;
    const source = sources.get(assessmentId);
    const paper = input.p_bundle.paper;
    if (source?.owner_id !== input.p_owner || source.sha256 !== paper.sha256 || source.byte_count !== paper.byte_count || !paper.pdf_copy ||
        !papers.has(`research-paper-uploads/jumpserve-mcp/${assessmentId}.pdf`)) {
      return send(400, { code: '22023' });
    }
    let row = previews.get(assessmentId);
    if (row && row.bundle_sha256 !== input.p_hash) return send(409, { code: '23505' });
    if (!row) {
      const completedAt = new Date().toISOString();
      row = { id: assessmentId, source_id: assessmentId, owner_id: input.p_owner, bundle_sha256: input.p_hash, bundle: input.p_bundle,
        approved_at: null, pdf_verified_at: completedAt, study_id: null, completed_at: completedAt };
      previews.set(row.id, row);
      generatorResults.set(`${row.id}/${row.bundle_sha256}`, randomUUID());
    }
    return send(200, { preview_id: row.id, study_id: row.study_id });
  }
  if (path === 'rpc/research_skill_save_generator_result' || path === 'rpc/research_skill_save_verifier_result') {
    const saved = previews.get(input.p_assessment_id);
    if (!saved || saved.owner_id !== input.p_owner || saved.deleted) return send(404, { code: 'P0002' });
    assert.equal(input.p_bundle.paper.sha256, saved.bundle.paper.sha256);
    if (path.endsWith('save_generator_result')) {
      const key = `${saved.id}/${input.p_hash}`;
      if (!generatorResults.has(key)) generatorResults.set(key, randomUUID());
      return send(200, generatorResults.get(key));
    }
    const generator = generatorResults.get(`${saved.id}/${input.p_generator_hash}`);
    if (!generator) return send(404, { code: 'P0002' });
    assert.equal(input.p_scorecard.paper_sha256, saved.bundle.paper.sha256);
    const key = `${generator}/${input.p_verifier_version}/${input.p_hash}`;
    if (!verifierResults.has(key)) {
      const { status, mode, scenario, split, score, evidence_integrity, claims, rubric, blockers, critical_failures } = input.p_scorecard;
      verifierResults.set(key, { id: randomUUID(), created_at: new Date().toISOString(), verifier_version: input.p_verifier_version,
        status, mode, scenario, split, score, evidence_integrity, claims, rubric, blockers, critical_failures, assessment_sha256: input.p_scorecard.assessment_sha256,
        generator: { bundle_sha256: input.p_generator_hash, result_kind: 'assessment', assessment: { id: saved.id } } });
    }
    return send(200, verifierResults.get(key).id);
  }
  if (path === 'rpc/research_skill_save_coach_report') {
    const { p_owner, p_report, p_hash } = input;
    assert.equal(p_report.version, 'jumpserve-coach-report-v1');
    for (const source of p_report.sources) {
      const review = [...verifierResults.values()].find(row => row.id === source.verification_id);
      const assessment = review && previews.get(review.generator.assessment.id);
      if (!review || review.split !== 'development' || review.assessment_sha256 !== source.assessment_sha256 ||
          assessment?.owner_id !== p_owner || assessment.deleted) return send(404, { code: 'P0002' });
    }
    const key = `${p_owner}/${p_hash}`;
    if (!coachReports.has(key)) coachReports.set(key, randomUUID());
    return send(200, coachReports.get(key));
  }
  if (path === 'research_skill_verifier_results') {
    assert.equal(url.searchParams.get('order'), 'created_at.desc,id.desc');
    assert.equal(url.searchParams.get('limit'), '6');
    assert.match(url.searchParams.get('select'), /generator:research_skill_generator_results!inner\(.*assessment:research_skill_submissions!inner\(id\)\)/);
    assert.doesNotMatch(url.searchParams.get('select'), /answer_key_sha256|assessment_sha256/);
    const assessment = previews.get(url.searchParams.get('generator.assessment.id')?.slice(3));
    if (!assessment || url.searchParams.get('generator.assessment.owner_id') !== 'eq.' + assessment.owner_id) return send(200, []);
    return send(200, [...verifierResults.values()].filter(row => row.generator.assessment.id === assessment.id)
      .map(row => {
        const projected = { ...row };
        delete projected.assessment_sha256;
        return projected;
      }));
  }
  if (path === 'research_skill_submissions') {
    if (url.searchParams.get('select') === 'id' && url.searchParams.get('study_id')?.startsWith('eq.')) {
      const record = previews.get(url.searchParams.get('study_id').slice(3));
      return send(200, record?.study_id && url.searchParams.get('owner_id') === 'eq.' + record.owner_id ? [{ id: record.id }] : []);
    }
    if (url.searchParams.get('select') === 'id,completed_at,title:bundle->paper->>title,authors:bundle->paper->authors') {
      assert.equal(url.searchParams.get('completed_at'), 'not.is.null');
      assert.equal(url.searchParams.get('study_id'), 'is.null');
      const rows = [...previews.values()].filter(row => !row.study_id && row.completed_at && url.searchParams.get('owner_id') === 'eq.' + row.owner_id);
      return send(200, rows.map(row => ({ id: row.id, completed_at: row.completed_at, title: row.bundle.paper.title, authors: row.bundle.paper.authors })));
    }
    const record = previews.get(url.searchParams.get('id')?.slice(3));
    if (!record || url.searchParams.get('owner_id') !== 'eq.' + record.owner_id) return send(200, []);
    if (url.searchParams.get('select') === 'pdf_verified_at') return send(200, [{ pdf_verified_at: record.pdf_verified_at }]);
    return send(200, record.completed_at || record.study_id ? [record] : []);
  }
  if (path === 'rpc/research_skill_submit') {
    const row = previews.get(input.p_preview);
    if (!row || row.owner_id !== input.p_owner) return send(404, { code: 'P0002' });
    if (row.study_id) return send(200, row.study_id);
    if (!row.completed_at || !row.approved_at) return send(400, { code: '55000' });
    if (failNextSubmission) {
      failNextSubmission = false;
      return send(503, { code: 'fixture_retry' });
    }
    row.study_id = row.id;
    return send(200, row.id);
  }
  return send(404, {});
});

async function verifyCliAssessment(workspace, page, mcpToken) {
  const home = join(workspace, 'cli-home');
  const bin = join(home, 'bin');
  const args = ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './scripts/lib/register-typescript.mjs', './scripts/jumpserve-assessment.mjs'];
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, 'codex'), '#!/bin/sh\ncat\n', { mode: 0o700 });
  const env = { ...process.env, HOME: home, JUMPSERVE_URL: origin, PATH: `${bin}:${process.env.PATH}` };
  const cli = (...command) => promisify(execFile)(process.execPath, [...args, ...command], { env, timeout: 12_000 });
  async function authorizeCli(description, ...options) {
    const login = spawn(process.execPath, [...args, 'login', ...options], { env, stdio: ['ignore', 'inherit', 'pipe'] });
    const closed = once(login, 'close');
    try {
      let stderr = '';
      const timeout = AbortSignal.timeout(12_000);
      const link = await new Promise((resolve, reject) => {
        timeout.addEventListener('abort', () => reject(new Error('CLI sign-in URL timed out')));
        login.stderr.setEncoding('utf-8').on('data', chunk => {
          stderr += chunk;
          const url = stderr.split('\n').slice(0, -1).find(line => line.startsWith(`${origin}/oauth/jumpserve/authorize?`));
          if (url) resolve(new URL(url));
        });
        closed.then(([code]) => reject(new Error(`CLI sign-in exited early (${code}): ${stderr}`)), reject);
      });
      const badState = new URL(link.searchParams.get('redirect_uri'));
      badState.searchParams.set('state', 'mismatch');
      assert.equal((await fetch(badState)).status, 400);
      await page.goto(link.href);
      await page.getByText(description).waitFor();
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      assert.equal((await closed)[0], 0, stderr);
    } finally {
      if (login.exitCode === null && login.signalCode === null) login.kill();
    }
  }
  await authorizeCli(/start private assessments from your terminal/);
  const sessions = join(home, '.jumpserve', 'sessions');
  const [entry] = await readdir(sessions);
  const saved = join(sessions, entry);
  assert.equal((await stat(saved)).mode & 0o777, 0o600);
  const session = JSON.parse(await readFile(saved, 'utf8'));
  assert.equal((await fetch(resource, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } })).status, 401);

  const pdf = Buffer.from('%PDF-1.4\n% Step 1 CLI fixture\n%%EOF\n');
  const filename = join(home, 'paper.pdf');
  await writeFile(filename, pdf);
  const assessmentId = randomUUID();
  const source = { assessment_id: assessmentId, sha256: sha256(pdf), byte_count: pdf.length };
  const wrongResource = await fetch(sourceResource, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mcpToken}` },
    body: JSON.stringify({ action: 'reserve', ...source }) });
  assert.equal(wrongResource.status, 401);
  assert.equal(sources.has(assessmentId), false);

  // Force refresh and ensure the replacement retains its upload-only resource.
  tokens.get(sha256(session.access_token)).expired = true;
  const ticketsBefore = uploadTickets;
  const start = () => cli('start', filename, '--assessment-id', assessmentId, '--json');
  const { stdout } = await start();
  const ready = JSON.parse(stdout);
  assert.equal(ready.assessment_id, assessmentId);
  assert.equal(ready.status, 'ready');
  assert.match(ready.prompt, new RegExp(assessmentId));
  assert.deepEqual(papers.get(`research-paper-uploads/local-assessment-sources/${owner}/${source.sha256}.pdf`), pdf);
  assert.notEqual(JSON.parse(await readFile(saved, 'utf8')).access_token, session.access_token);
  assert.equal((await start()).stdout, stdout);
  assert.equal(uploadTickets, ticketsBefore + 1);
  assert.equal(previews.has(assessmentId), false);
  const generator = await cli('run', assessmentId);
  assert.match(generator.stdout, new RegExp(assessmentId));
  assert.ok(generator.stdout.includes(resource));
  const refreshedUploadToken = JSON.parse(await readFile(saved, 'utf8')).access_token;
  await cli('logout');
  await assert.rejects(start(), /Run `npm run assessment -- login`/);
  console.log('PASS CLI consent, upload-only token scope, private PDF retry, refresh and Codex handoff');

  const post = (url, access, input) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json',
    Authorization: `Bearer ${access}` }, body: JSON.stringify(input) });
  assert.equal((await post(resultsResource, refreshedUploadToken, { action: 'check' })).status, 401);
  await authorizeCli(/save Generator assessments, Verifier scorecards, and Coach reports privately/, '--results');
  const resultSession = JSON.parse(await readFile(join(sessions, sha256(resultsResource) + '.json'), 'utf8'));
  assert.equal((await post(resource, resultSession.access_token, {})).status, 401);
  assert.equal((await post(sourceResource, resultSession.access_token, { action: 'reserve', ...source })).status, 401);
  assert.equal((await post(resultsResource, resultSession.access_token, { action: 'submit', assessment_id: assessmentId })).status, 400);

  const assessment = { ...bundle, paper: { ...bundle.paper, title: 'Private terminal result fixture',
    sha256: source.sha256, byte_count: source.byte_count } };
  const artifact = JSON.stringify(assessment, null, 2) + '\n';
  const artifactFile = join(home, 'assessment.json');
  await writeFile(artifactFile, artifact);
  const saveGenerator = () => cli('save-generator', filename, '--assessment-id', assessmentId, '--bundle', artifactFile);
  const first = JSON.parse((await saveGenerator()).stdout);
  assert.equal(first.status, 'saved_private');
  assert.equal(first.assessment_id, assessmentId);
  assert.equal(previews.get(assessmentId).study_id, null);
  assert.equal(previews.get(assessmentId).bundle.paper.pdf_copy, true);
  assert.deepEqual(JSON.parse((await saveGenerator()).stdout), first);
  const rawHash = sha256(artifact);
  const grade = { version: 'jumpserve-verifier-scorecard-v1', paper_id: 'fixture', paper_sha256: source.sha256,
    assessment_sha256: rawHash, answer_key_sha256: 'c'.repeat(64), split: 'development', mode: 'fresh', scenario: null,
    evidence_integrity: { status: 'verified', verified_runs: 1 }, status: 'scored', blockers: [], critical_failures: [],
    claims: [{ key_claim_id: 'C1', assessment_claim_id: 'c1', reported_outcome: 'reproduced', supported_outcome: 'reproduced',
      assessment: 'correct', evidence: ['data/counts.csv'], finding: 'Both counters are zero.' }],
    rubric: [{ criterion: 'verdict', earned: 1, maximum: 2, reason: 'Fixture deduction.' }],
    score: { earned: 1, applicable_maximum: 2, rubric_maximum: 2 } };
  const gradeFile = join(home, 'grade.json');
  await writeFile(gradeFile, JSON.stringify(grade));
  const saveVerifier = () => cli('save-verifier', gradeFile, '--assessment-id', assessmentId, '--bundle', artifactFile, '--verifier-version', '1.0.0');
  const review = JSON.parse((await saveVerifier()).stdout);
  assert.equal(review.status, 'saved_private');
  assert.deepEqual(JSON.parse((await saveVerifier()).stdout), review);
  const reportFile = join(home, 'report.json');
  await writeFile(reportFile, JSON.stringify({ version: 'jumpserve-coach-report-v1',
    sources: [{ verification_id: review.verification_id, assessment_sha256: rawHash }],
    summary: 'The fixture establishes no actionable change.', limitations: [], recommendations: [] }));
  const report = JSON.parse((await cli('save-coach', reportFile)).stdout);
  assert.equal(report.status, 'saved_private');
  assert.deepEqual(JSON.parse((await cli('save-coach', reportFile)).stdout), report);
  assert.equal(previews.get(assessmentId).study_id, null);
  console.log('PASS results-only CLI saves exact Generator, below-perfect Verifier, and empty-recommendation Coach records idempotently');
}

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
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 720 });
  const pluginSetups = [
    ['Claude', 'Claude Code', 'claude plugin install jumpserve --marketplace jumpserve-networks/jumpserve-plugins', '/mcp'],
    ['Codex', 'Codex', 'codex plugin marketplace add jumpserve-networks/jumpserve-plugins && codex plugin add jumpserve@jumpserve', 'codex mcp login jumpserve'],
  ];
  assert.equal(await page.getByRole('dialog').count(), 0);
  for (const [buttonClient, clientName, command, login] of pluginSetups) {
    const buttonLabel = `Add Plugin to ${buttonClient}`;
    const trigger = page.getByRole('button', { name: buttonLabel, exact: true });
    await trigger.press('Enter');
    const dialog = page.getByRole('dialog', { name: `Set up JumpServe in ${clientName}`, exact: true });
    await dialog.waitFor();
    const label = `${clientName} install command`;
    assert.equal(await dialog.getByLabel(label, { exact: true }).textContent(), command);
    await dialog.getByText(login, { exact: true }).waitFor();
    assert.equal(await dialog.getByRole('link', { name: 'View the public marketplace and install instructions' }).getAttribute('href'),
      'https://github.com/jumpserve-networks/jumpserve-plugins');
    assert.equal(await dialog.getByRole('link', { name: 'Manage JumpServe connections' }).getAttribute('href'), origin + '/oauth/jumpserve/connections');
    assert.ok(await dialog.evaluate(element => {
      const { left, right } = element.getBoundingClientRect();
      return left >= 0 && right <= window.innerWidth;
    }));
    const copy = dialog.getByRole('button', { name: `Copy ${label}` });
    await copy.click();
    await dialog.getByText('Copied.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), command);
    if (buttonClient === 'Codex') {
      await page.evaluate(() => {
        navigator.clipboard.writeText = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
      });
      await copy.press('Enter');
      await dialog.getByText('Copy failed. Select the text and copy it manually.').waitFor();
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    } else {
      await page.keyboard.press('Escape');
    }
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(label => document.activeElement?.textContent === label, buttonLabel);
  }
  await page.setViewportSize(viewport);
  console.log('PASS plugin setup modals show the client-specific commands, report clipboard errors and restore keyboard focus');

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
  await verifyCliAssessment(workspace, page, credentials.access_token);

  client = new Client({ name: 'jumpserve-local-verifier', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(resource), {
    requestInit: { headers: { Authorization: 'Bearer ' + credentials.access_token } },
  }));
  const noSource = await client.callTool({ name: 'preview_assessment', arguments: { bundle } });
  assert.equal(noSource.isError, true);
  assert.match(noSource.content[0].text, /JumpServe Step 1/);
  const fixturePdf = Buffer.from('%PDF-1.4\n% MCP fixture\n%%EOF\n');
  const linkedBundle = { ...bundle, paper: { ...bundle.paper, sha256: sha256(fixturePdf), byte_count: fixturePdf.length, pdf_copy: true } };
  const registerFixtureSource = (pdf, available = true) => {
    const id = randomUUID();
    const digest = sha256(pdf);
    sources.set(id, { id, owner_id: owner, sha256: digest, byte_count: pdf.length });
    if (available) papers.set(`research-paper-uploads/local-assessment-sources/${owner}/${digest}.pdf`, pdf);
    return id;
  };
  const save = (assessmentId, value) => client.callTool({ name: 'preview_assessment', arguments: { bundle: value, assessment_id: assessmentId } });
  const fixtureId = registerFixtureSource(fixturePdf);
  const preview = await save(fixtureId, linkedBundle);
  const { preview_id, review_url } = preview.structuredContent;
  assert.equal(preview_id, fixtureId);
  const verifierUrl = review_url + '?step=verifier-results';
  await page.goto(review_url);
  await page.getByRole('button', { name: 'Step 6: Run the Verifier' }).click();
  await page.waitForURL(review_url + '?step=verifier');
  const verifierPrompt = page.getByLabel('Verifier prompt', { exact: true });
  assert.match(await verifierPrompt.textContent(), /jumpserve-assessment-verifier/);
  assert.ok((await verifierPrompt.textContent()).includes(fixtureId));
  await page.getByRole('link', { name: 'Step 7 · Verifier Results' }).click();
  await page.waitForURL(verifierUrl);
  await page.getByText('No Verifier scorecards have been saved for this assessment.').waitFor();
  const revision = { ...linkedBundle, summary: 'Another private Generator version of this source.' };
  const assessmentJson = JSON.stringify(revision, null, 2) + '\n';
  const grade = { version: 'jumpserve-verifier-scorecard-v1', paper_id: 'fixture', paper_sha256: revision.paper.sha256,
    assessment_sha256: sha256(assessmentJson), answer_key_sha256: 'c'.repeat(64),
    split: 'development', mode: 'fresh', scenario: null, evidence_integrity: { status: 'verified', verified_runs: 1 },
    status: 'scored', claims: [{ key_claim_id: 'C1', assessment_claim_id: 'c1', reported_outcome: 'reproduced',
      supported_outcome: 'reproduced', assessment: 'correct', evidence: ['data/counts.csv'], finding: 'The independent review confirmed both zero counts.' }],
    rubric: [{ criterion: 'Verdict', earned: 2, maximum: 2, reason: 'The evidence supports the verdict.' }],
    score: { earned: 2, applicable_maximum: 2, rubric_maximum: 2 }, critical_failures: [], blockers: [] };
  const reviewSave = { name: 'save_verifier_result', arguments: {
    assessment_id: fixtureId, assessment_json: assessmentJson, scorecard: grade, verifier_version: '1.0.0',
  } };
  assert.match((await client.callTool(reviewSave)).content[0].text, /exact reviewed Generator result is unavailable/);
  const generatorSave = { name: 'save_generator_result', arguments: { assessment_id: fixtureId, bundle: revision } };
  const savedGenerator = (await client.callTool(generatorSave)).structuredContent;
  assert.ok(savedGenerator.generator_result_id);
  assert.deepEqual((await client.callTool(generatorSave)).structuredContent, savedGenerator);
  const savedReview = (await client.callTool(reviewSave)).structuredContent;
  assert.ok(savedReview.verification_id);
  assert.deepEqual((await client.callTool(reviewSave)).structuredContent, savedReview);
  assert.deepEqual(previews.get(fixtureId).bundle, linkedBundle);
  const report = { version: 'jumpserve-coach-report-v1',
    sources: [{ verification_id: savedReview.verification_id, assessment_sha256: grade.assessment_sha256 }],
    summary: 'Retain the reported verdict and explain coverage.', limitations: ['One development paper.'],
    recommendations: [{ title: 'Report coverage', finding: 'A condition lacks an attempt count.',
      proposed_change: 'Report an attempt count for each condition.', regression_check: 'A short round has an explicit attempt count.' }] };
  const coachSave = { name: 'save_coach_report', arguments: { report } };
  const existingCoachReports = coachReports.size;
  const savedCoach = (await client.callTool(coachSave)).structuredContent;
  assert.match(savedCoach.coach_report_id, /^[a-f0-9-]{36}$/);
  assert.equal(savedCoach.status, 'saved_private');
  assert.deepEqual((await client.callTool(coachSave)).structuredContent, savedCoach);
  const mismatch = { ...report, sources: [{ ...report.sources[0], assessment_sha256: 'a'.repeat(64) }] };
  assert.match((await client.callTool({ ...coachSave, arguments: { report: mismatch } })).content[0].text, /matching development/);
  assert.equal(coachReports.size, existingCoachReports + 1);
  console.log('PASS private Coach report save, exact-source validation and idempotent MCP retry');
  await page.getByRole('link', { name: 'Refresh results' }).click();
  await page.getByText('2 / 2 applicable points', { exact: true }).waitFor();
  await page.getByText(savedReview.verification_id, { exact: true }).waitFor();
  await page.getByText('Claim findings (1)', { exact: true }).click();
  await page.getByText(grade.claims[0].finding, { exact: true }).waitFor();
  await page.getByText('data/counts.csv', { exact: true }).waitFor();
  await page.getByText('Scoring rubric (1)', { exact: true }).click();
  await page.getByText(grade.rubric[0].reason, { exact: true }).waitFor();
  assert.doesNotMatch(await page.content(), new RegExp(grade.answer_key_sha256));
  console.log('PASS exact assessment binding and private Generator and Verifier save retries through MCP');
  const publicUrl = origin + '/research-verification/assessment/' + preview_id;
  assert.equal(review_url, publicUrl);
  const oldReview = origin + '/research-verification/share/' + preview_id;
  const submission = { name: 'submit_assessment', arguments: { preview_id } };
  assert.equal((await client.callTool(submission)).isError, true);
  const viewer = await browser.newContext();
  const signedOutReview = await viewer.request.get(review_url);
  assert.ok(!(await signedOutReview.text()).includes(bundle.paper.title));
  const otherContext = await browser.newContext();
  await otherContext.addCookies([cookie(other)]);
  const otherReview = await otherContext.request.get(review_url);
  assert.ok(!(await otherReview.text()).includes(bundle.paper.title));
  const oldLink = await context.request.get(oldReview + '?step=results', { maxRedirects: 0 });
  assert.equal(oldLink.status(), 308);
  assert.equal(new URL(oldLink.headers().location, origin).href, review_url + '?step=results');
  const ownerReview = await context.request.get(review_url);
  assert.match(ownerReview.headers()['cache-control'], /\bno-store\b/);
  assert.equal(ownerReview.headers()['referrer-policy'], 'no-referrer');
  assert.match(await ownerReview.text(), /<meta name="robots" content="noindex, nofollow"\s*\/?\s*>/);
  await verifyAssessmentWizard(page, review_url);
  assert.equal(previews.get(preview_id).study_id, null);
  assert.equal(await page.getByText('Private', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /share publicly|finish sharing publicly/i }).count(), 0);
  // Seed a previously recorded owner approval in the isolated database fixture.
  previews.get(preview_id).approved_at = new Date().toISOString();
  const shared = await client.callTool(submission);
  assert.equal(shared.structuredContent.assessment_url, publicUrl);
  assert.equal(previews.get(preview_id).study_id, preview_id);
  assert.deepEqual(await client.callTool(submission), shared);
  const alreadyShared = await save(fixtureId, linkedBundle);
  assert.deepEqual(alreadyShared.structuredContent, { assessment_url: publicUrl, status: 'already_shared' });
  previews.get(preview_id).expires_at = '2000-01-01T00:00:00.000Z';
  await page.goto(oldReview + '?step=results');
  assert.equal(page.url(), publicUrl + '?step=results');
  const publicPage = await viewer.newPage();
  await verifyAssessmentWizard(publicPage, publicUrl);
  assert.deepEqual(previews.get(preview_id).bundle, linkedBundle);
  const ownedPublicReview = await page.goto(verifierUrl);
  assert.match(ownedPublicReview.headers()['cache-control'], /\bno-store\b/);
  await page.getByText('2 / 2 applicable points', { exact: true }).waitFor();
  for (const visitor of [viewer, otherContext]) {
    const response = await visitor.request.get(verifierUrl);
    const html = await response.text();
    assert.ok(html.includes(bundle.paper.title));
    assert.ok(!html.includes(grade.claims[0].finding));
    assert.ok(!html.includes(grade.rubric[0].reason));
  }
  await otherContext.close();
  console.log('PASS Verifier prompt, empty and saved scorecards, and owner-only results on shared assessments');
  console.log('PASS private and public Steps 2–5, hidden sharing controls, approved MCP submission and measurement display');

  const retryBundle = { ...linkedBundle, summary: 'Verify a recoverable sharing failure.' };
  const retryPreview = (await save(registerFixtureSource(fixturePdf), retryBundle)).structuredContent;
  const retryRow = previews.get(retryPreview.preview_id);
  retryRow.expires_at = '2000-01-01T00:00:00.000Z';
  retryRow.approved_at = new Date().toISOString();
  assert.equal((await page.goto(retryPreview.review_url)).status(), 200);
  const retrySubmission = { name: 'submit_assessment', arguments: { preview_id: retryPreview.preview_id } };
  failNextSubmission = true;
  assert.equal((await client.callTool(retrySubmission)).isError, true);
  assert.equal(retryRow.study_id, null);
  assert.equal(retryRow.expires_at, '2000-01-01T00:00:00.000Z');
  const retried = await client.callTool(retrySubmission);
  assert.equal(retried.structuredContent.assessment_url, retryPreview.review_url);
  assert.equal(retryRow.study_id, retryPreview.preview_id);
  console.log('PASS a recorded approval can be retried after a submission failure and the old deadline');

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
  assert.equal(await prompt.textContent(), `Use the JumpServe Generator skill (jumpserve-paper-assessment) for ${assessmentId}. Recreate the paper's testbed and run experiments to test its claims with fresh measurements. Use published figures and tables only as reference values.`);
  await page.evaluate(() => {
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { copied = text; }, readText: async () => copied,
    } });
  });
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
  const sourceBundle = { ...linkedBundle, paper: { ...linkedBundle.paper, sha256: sourceSha, byte_count: sourcePdf.length } };
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
  tokens.set(sha256(shareOnlyToken), { owner_id: owner, resource, read_sources: false });
  tokens.set(sha256(otherToken), { owner_id: other, resource, read_sources: true });
  const denied = await directDownload(shareOnlyToken);
  assert.equal(denied.status, 403);
  assert.match(denied.headers.get('www-authenticate'), /insufficient_scope/);
  const otherDownload = await (await directDownload(otherToken)).json();
  assert.equal(otherDownload.result.isError, true);
  assert.equal(otherDownload.result.structuredContent, undefined);
  const stageSource = value => save(assessmentId, value);
  const wrongSource = await stageSource(linkedBundle);
  assert.equal(wrongSource.isError, true);
  assert.match(wrongSource.content[0].text, /assessed PDF is different/);
  const unuploadedPdf = Buffer.from('%PDF-1.4\n% Unfinished Step 1 fixture\n%%EOF\n');
  const unuploadedId = registerFixtureSource(unuploadedPdf, false);
  const unfinished = await save(unuploadedId, { ...linkedBundle, paper: {
    ...linkedBundle.paper, sha256: sha256(unuploadedPdf), byte_count: unuploadedPdf.length,
  } });
  assert.equal(unfinished.isError, true);
  assert.match(unfinished.content[0].text, /Finish uploading the matching PDF in JumpServe Step 1/);
  assert.equal(previews.has(unuploadedId), false);
  const ticketsAfterStepOne = uploadTickets;
  const autoAttached = (await stageSource(sourceBundle)).structuredContent;
  assert.equal(autoAttached.status, 'review_required');
  assert.equal(autoAttached.preview_id, assessmentId);
  assert.deepEqual((await stageSource(sourceBundle)).structuredContent, autoAttached);
  const attachmentKey = `research-paper-uploads/jumpserve-mcp/${assessmentId}.pdf`;
  assert.equal(papers.delete(attachmentKey), true);
  assert.deepEqual((await stageSource(sourceBundle)).structuredContent, autoAttached);
  assert.deepEqual(papers.get(attachmentKey), sourcePdf);
  assert.equal(uploadTickets, ticketsAfterStepOne);
  assert.ok(previews.get(autoAttached.preview_id).pdf_verified_at);
  previews.get(assessmentId).expires_at = new Date(Date.now() - 60_000).toISOString();
  const myPrivate = origin + '/research-verification/api/private-assessments';
  const catalogueRequest = actor => context.request.get(myPrivate, { headers: { Authorization: `Bearer ${token(actor)}` } });
  assert.equal((await viewer.request.get(myPrivate)).status(), 401);
  const mine = await catalogueRequest(owner);
  assert.equal(mine.status(), 200);
  assert.equal(mine.headers()['cache-control'], 'private, no-store');
  const mineRows = (await mine.json()).papers;
  assert.ok(mineRows.some(paper => paper.id === assessmentId));
  assert.ok(!mineRows.some(paper => paper.id === unuploadedId));
  for (const paper of mineRows) assert.deepEqual(Object.keys(paper).sort(), ['authors', 'created_at', 'id', 'initiated_by', 'title', 'workflow_status']);
  assert.deepEqual((await (await catalogueRequest(other)).json()).papers, []);
  const privatePaper = autoAttached.review_url + '/paper';
  assert.equal((await viewer.request.get(privatePaper)).status(), 404);
  const oldPaper = origin + '/research-verification/share/' + assessmentId + '/paper';
  const oldDownload = await context.request.get(oldPaper, { maxRedirects: 0 });
  assert.equal(oldDownload.status(), 308);
  assert.equal(new URL(oldDownload.headers().location, origin).href, privatePaper);
  const nonOwner = await browser.newContext();
  await nonOwner.addCookies([cookie(other)]);
  assert.equal((await nonOwner.request.get(privatePaper)).status(), 404);
  await nonOwner.close();
  const privateDownload = await context.request.get(privatePaper, { maxRedirects: 0 });
  assert.equal(privateDownload.status(), 303);
  assert.equal(privateDownload.headers()['cache-control'], 'private, no-store');
  assert.deepEqual(await (await context.request.get(privatePaper)).body(), sourcePdf);
  await page.getByRole('link', { name: 'Upload another paper' }).click();
  await page.waitForURL(uploadPage);
  await fileInput.waitFor();
  await page.goto(origin + '/research-verification/assessments?mine=1');
  await page.getByRole('link', { name: sourceBundle.paper.title, exact: true }).click();
  await page.waitForURL(autoAttached.review_url);
  await page.getByRole('link', { name: 'Download source PDF', exact: true }).waitFor();
  assert.equal(await page.getByText('Public sharing includes the attached source PDF.', { exact: true }).count(), 0);
  previews.get(assessmentId).approved_at = new Date().toISOString();
  const sourceSubmission = await client.callTool({ name: 'submit_assessment', arguments: { preview_id: assessmentId } });
  assert.equal(sourceSubmission.structuredContent.assessment_url, autoAttached.review_url);
  const publicPaper = sourceSubmission.structuredContent.assessment_url + '/paper';
  const publicDownload = await viewer.request.get(publicPaper, { maxRedirects: 0 });
  assert.equal(publicDownload.status(), 303);
  assert.ok(new URL(publicDownload.headers().location).pathname.endsWith(`/jumpserve-mcp/${assessmentId}.pdf`));
  assert.deepEqual(await (await viewer.request.get(publicPaper)).body(), sourcePdf);
  assert.ok(!(await (await catalogueRequest(owner)).json()).papers.some(paper => paper.id === assessmentId));
  previews.get(assessmentId).deleted = true;
  assert.equal((await viewer.request.get(publicPaper)).status(), 404);
  assert.equal((await context.request.get(publicPaper)).status(), 404);
  console.log('PASS owner-only catalogue retains completed private assessments and omits them after sharing');
  console.log('PASS one assessment ID and one PDF upload across Step 1, private saving and public sharing');
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
