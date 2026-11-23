import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { prepareAssessmentBundle } from '../lib/jumpserve-assessment-bundle.ts';
import { clientInfo, issueClientId, parseAuthorizationRequest, registeredRedirect, verifierChallenge } from '../lib/jumpserve-mcp-oauth.ts';
import { serveJumpServeTools } from '../lib/jumpserve-mcp-server.ts';

const origin = 'https://jumpserve.example.test';
const id = '22459c11-9be3-44d2-9b39-a0cb96a0d09f';
const hash = 'b'.repeat(64);
const script = { path: 'scripts/record.sh', content: '#!/bin/sh\nprintf "%s\\n" 0\n' };
const fixture = () => ({
  version: 'jumpserve-assessment-v1',
  paper: { title: 'Synthetic paper', authors: ['Example Author'], domain: 'Systems', sha256: hash, byte_count: 523 },
  summary: 'Prepare the local experiment.',
  claims: [{ id: 'c1', page: 5, claim: 'Measure a counter.', criterion: 'Compare matched counter values.', outcome: 'untested', finding: 'The run is pending.' }],
  methods: [{ title: 'Counter test', procedure: 'Record the counter in matched settings.' }],
  runs: [], limitations: ['This is a synthetic fixture.'],
});
const wizard = () => ({
  breakdown: [{ section: 'data', description: 'The paper counts matching events.', pages: [5, 6] }],
  experiments: [{
    title: 'Check the counter', claim_ids: ['c1'], prerequisites: ['Local shell'],
    steps: [{ title: 'Record the count', instructions: 'Record the fixture counter.', commands: 'printf 0' }],
  }],
});

test('assessment schema preserves zero and missing values and requires matched evidence for conclusive claims', () => {
  const bundle = fixture();
  bundle.claims[0].outcome = 'reproduced';
  assert.throws(() => prepareAssessmentBundle(bundle), /require a recorded comparison/);
  bundle.runs = [{
    id: 'r1', configuration: 'Fixture environment', started_at: '2026-10-01T10:00:00Z', artifact_sha256: hash,
    measurements: [{ claim_id: 'c1', metric: 'Counter', units: 'count', paper_value: 0, observed_value: 0 }],
  }];
  assert.equal(prepareAssessmentBundle(bundle).bundle.runs[0].measurements[0].observed_value, 0);
  assert.equal(prepareAssessmentBundle(bundle).hash, prepareAssessmentBundle(Object.fromEntries(Object.entries(bundle).reverse())).hash);
  bundle.runs[0].measurements[0].paper_value = null;
  assert.throws(() => prepareAssessmentBundle(bundle), /require a recorded comparison/);
  bundle.claims[0].outcome = 'inconclusive';
  assert.equal(prepareAssessmentBundle(bundle).bundle.runs[0].measurements[0].paper_value, null);
});

test('private fields, common credentials and unsafe paper links are rejected', () => {
  assert.throws(() => prepareAssessmentBundle({ ...fixture(), pdf: 'secret' }), /does not match/);
  const bundle = fixture();
  bundle.summary = 'API_KEY=private-example';
  assert.throws(() => prepareAssessmentBundle(bundle), /credentials/);
  bundle.summary = 'Review this.';
  bundle.paper.url = 'https://127.0.0.1/source';
  assert.throws(() => prepareAssessmentBundle(bundle), /public HTTPS/);
});

test('wizard fields remain part of the approved bundle and require valid source and claim references', () => {
  const original = fixture();
  const bundle = { ...original, wizard: wizard() };
  const prepared = prepareAssessmentBundle(bundle);
  assert.deepEqual(prepared.bundle.wizard, wizard());
  assert.notEqual(prepared.hash, prepareAssessmentBundle(original).hash);

  bundle.wizard.breakdown[0].pages = [0];
  assert.throws(() => prepareAssessmentBundle(bundle), /wizard\/breakdown\/0\/pages/);
  bundle.wizard = wizard();
  bundle.wizard.experiments[0].claim_ids = ['unknown'];
  assert.throws(() => prepareAssessmentBundle(bundle), /must refer to claims in this bundle/);
  bundle.wizard = wizard();
  bundle.wizard.experiments[0].steps[0].commands = 'cat /Users/example/private-data';
  assert.throws(() => prepareAssessmentBundle(bundle), /private paths/);
});

test('explicit run links resolve unique experiments and require claims assigned to the experiment', () => {
  const bundle = { ...fixture(), wizard: wizard() };
  bundle.claims[0].outcome = 'inconclusive';
  bundle.claims.push({ ...bundle.claims[0], id: 'c2' });
  bundle.wizard.experiments[0].id = 'baseline';
  bundle.wizard.experiments.push({ ...bundle.wizard.experiments[0], id: 'follow-up', claim_ids: ['c1', 'c2'] });
  const run = {
    id: 'r1', experiment_id: 'follow-up', configuration: 'Fixture environment', started_at: '2026-10-01T10:00:00Z', artifact_sha256: hash,
    measurements: [{ claim_id: 'c2', metric: 'Counter', units: 'count', paper_value: 0, observed_value: 0 }],
  };
  bundle.runs = [run];
  assert.equal(prepareAssessmentBundle(bundle).bundle.runs[0].experiment_id, 'follow-up');
  run.experiment_id = 'missing';
  assert.throws(() => prepareAssessmentBundle(bundle), /must identify an experiment/);
  run.experiment_id = 'baseline';
  assert.throws(() => prepareAssessmentBundle(bundle), /claim assigned to its experiment/);
  bundle.wizard.experiments[1].id = 'baseline';
  assert.throws(() => prepareAssessmentBundle(bundle), /experiment identifiers must be unique/);
});

test('breakdown substeps retain their own citations and require unique parents in the same section', () => {
  const bundle = { ...fixture(), wizard: wizard() };
  const [original] = bundle.wizard.breakdown;
  const flat = prepareAssessmentBundle(bundle).hash;
  const parent = { ...original, id: 'capture', title: 'Capture measurements' };
  const child = { ...original, id: 'counts', parent_id: 'capture', title: 'Record counts', pages: [6] };
  bundle.wizard.breakdown = [parent, child];
  const prepared = prepareAssessmentBundle(bundle);
  assert.deepEqual(prepared.bundle.wizard.breakdown, [parent, child]);
  assert.notEqual(prepared.hash, flat);
  for (const [first, second] of [
    [{ ...parent, section: 'access' }, child],
    [parent, { ...child, parent_id: 'missing' }],
    [{ ...parent, parent_id: 'counts' }, child],
    [parent, { ...child, id: parent.id }],
  ]) {
    bundle.wizard.breakdown = [first, second];
    assert.throws(() => prepareAssessmentBundle(bundle), /parent references must stay in the same section without cycles/);
  }
  bundle.wizard.breakdown = [parent, { ...child, pages: [0] }];
  assert.throws(() => prepareAssessmentBundle(bundle), /wizard\/breakdown\/1\/pages/);
});

test('script source is part of the exact approval and requires safe relative, unique file paths', () => {
  const bundle = { ...fixture(), wizard: wizard() };
  const originalHash = prepareAssessmentBundle(bundle).hash;
  const experiment = bundle.wizard.experiments[0];
  experiment.scripts = [script];
  const prepared = prepareAssessmentBundle(bundle);
  assert.deepEqual(prepared.bundle.wizard.experiments[0].scripts, [script]);
  assert.notEqual(prepared.hash, originalHash);
  experiment.scripts = [{ ...script, content: script.content + '# retained source\n' }];
  assert.notEqual(prepareAssessmentBundle(bundle).hash, prepared.hash);

  for (const path of ['../record.sh', 'scripts/../record.sh', '/record.sh', 'scripts\\record.sh', 'record.sh\n']) {
    experiment.scripts = [{ ...script, path }];
    assert.throws(() => prepareAssessmentBundle(bundle), /scripts\/0\/path/);
  }
  experiment.scripts = [script, { ...script, content: 'printf 1\n' }];
  assert.throws(() => prepareAssessmentBundle(bundle), /Script paths must be unique/);
  for (const content of ['cat /Users/example/private-data', 'API_KEY=private-example']) {
    experiment.scripts = [{ ...script, content }];
    assert.throws(() => prepareAssessmentBundle(bundle), /credentials.*private paths/);
  }
});

test('OAuth requests require a registered loopback callback, PKCE and the JumpServe resource', () => {
  const resource = origin + '/mcp';
  for (const [name, callback] of [['jumpserve-codex', 'http://127.0.0.1:17651/callback'], ['jumpserve-claude-code', 'http://localhost:17652/callback']]) {
    const values = new URLSearchParams({
      client_id: name, redirect_uri: callback, state: 'original', resource, scope: 'assessments:share',
      response_type: 'code', code_challenge_method: 'S256', code_challenge: verifierChallenge('a'.repeat(43)),
    });
    assert.equal(parseAuthorizationRequest(values, resource)?.redirectUri, callback);
    assert.equal(parseAuthorizationRequest(values, resource)?.readSources, false);
    const expanded = new URLSearchParams(values);
    expanded.set('scope', 'assessments:share assessments:read-source');
    assert.equal(parseAuthorizationRequest(expanded, resource)?.readSources, true);
    assert.equal(parseAuthorizationRequest(values, origin + '/different'), null);
    for (const url of [callback + '/extra', 'https://attacker.example.test/callback', 'http://localhost:1/callback']) {
      const copy = new URLSearchParams(values); copy.set('redirect_uri', url);
      assert.equal(parseAuthorizationRequest(copy, resource), null);
    }
    const repeated = new URLSearchParams(values); repeated.append('state', 'second');
    assert.equal(parseAuthorizationRequest(repeated, resource), null);
  }
});

test('automatic registration binds a client ID to the connector and loopback callback', () => {
  const resource = origin + '/mcp';
  const key = 'local-fixture-key';
  const registered = 'http://127.0.0.1:40021/callback/aBcDeF123456';
  const clientId = issueClientId(registered, resource, key);
  const info = clientInfo(clientId, resource, key);
  assert.ok(info);
  assert.notEqual(issueClientId(registered, resource, key), clientId);
  assert.equal(clientInfo(clientId, resource + '/other', key), null);
  assert.equal(clientInfo(clientId, resource, key + 'x'), null);
  const tampered = clientId.replace(/\.[A-Za-z0-9_-]{43}$/, '.' + 'a'.repeat(43));
  assert.equal(clientInfo(tampered, resource, key), null);
  assert.ok(registeredRedirect(info, 'http://127.0.0.1:40022/callback/aBcDeF123456'));
  for (const redirect of [
    'http://localhost:40021/callback/aBcDeF123456',
    'http://127.0.0.1:40021/callback',
    registered + '?next=elsewhere',
    registered + '\n',
    'http://127.0.0.1:65536/callback/aBcDeF123456',
    'https://other.example.test/callback',
  ]) assert.equal(registeredRedirect(info, redirect), false);
});

test('a real MCP SDK client discovers the PDF and assessment tools', async () => {
  let approved = false;
  let previewed;
  const transport = new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
    fetch: async (target, options) => {
      const request = new Request(target, options);
      if (request.method === 'GET') return new Response(null, { status: 405 });
      return serveJumpServeTools(request, await request.json(), origin, {
        download: async value => value === id ? { assessment_id: id, byte_count: 12 } : null,
        preview: async (prepared, assessmentId) => { assert.equal(assessmentId, id); previewed = prepared; return { previewId: id, studyId: null }; },
        submit: async value => {
          assert.equal(value, id);
          if (!approved) throw new Error('Owner approval is required.');
          return id;
        },
      });
    },
  });
  const client = new Client({ name: 'local-jumpserve-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name), ['download_assessment_pdf', 'preview_assessment', 'submit_assessment']);
    assert.ok(tools[1].inputSchema.required.includes('assessment_id'));
    assert.equal(tools[0].annotations.readOnlyHint, true);
    assert.deepEqual((await client.callTool({ name: tools[0].name, arguments: { assessment_id: id } })).structuredContent,
      { assessment_id: id, byte_count: 12 });
    const completionMessage = [
      'Your research paper assessment is finished!',
      'View the assessment online using the JumpServe app at the following URL:',
      '{assessmentUrlHere}',
    ].join('\n\n');
    const sharingGuide = readFileSync(new URL('../skills/jumpserve-paper-assessment/references/sharing.md', import.meta.url), 'utf8');
    assert.ok(sharingGuide.includes(['```text', completionMessage, '```'].join('\n')));
    assert.match(sharingGuide, /End the reply\s+immediately after the URL\./);
    for (const tool of tools.slice(1)) {
      assert.ok(tool.description.endsWith(`End the reply immediately after the URL.\n\n${completionMessage}`));
    }
    const bundle = { ...fixture(), wizard: wizard() };
    bundle.wizard.experiments[0].scripts = [script];
    const missingId = await client.callTool({ name: 'preview_assessment', arguments: { bundle } });
    assert.equal(missingId.isError, true);
    assert.match(missingId.content[0].text, /Start the assessment in JumpServe Step 1/);
    assert.equal(previewed, undefined);
    const preview = await client.callTool({ name: 'preview_assessment', arguments: { bundle, assessment_id: id } });
    assert.equal(preview.structuredContent.review_url, origin + '/research-verification/assessment/' + id);
    assert.equal(previewed.hash, prepareAssessmentBundle(bundle).hash);
    assert.deepEqual(previewed.bundle, bundle);
    assert.equal((await client.callTool({ name: 'submit_assessment', arguments: { preview_id: id } })).isError, true);
    approved = true;
    const submission = { name: 'submit_assessment', arguments: { preview_id: id } };
    const shared = await client.callTool(submission);
    assert.equal(shared.structuredContent.assessment_url, origin + '/research-verification/assessment/' + id);
    assert.deepEqual(await client.callTool(submission), shared);
  } finally {
    await client.close();
  }
});

test('the HTTP route challenges missing tokens and rejects untrusted origins and oversized bodies', async () => {
  const scope = registerHooks({ resolve(name, context, next) {
    if (name === '@/lib/jumpserve-mcp-store') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(
      'export async function connectorActor(){return "fixture-owner"}; export async function connectorMayDownloadSource(){return false}; export function localAssessmentSourceTicket(){throw Error("Must not download")}; export function previewAssessment(){throw Error("Must not preview")}; export function submitAssessment(){throw Error("Must not submit")};'
    ) };
    return next(name, context);
  } });
  const before = { ...process.env };
  try {
    process.env.JUMPSERVE_MCP_ENABLED = 'true'; process.env.NEXT_PUBLIC_SITE_URL = origin;
    const { POST } = await import('../app/mcp/route.ts');
    const call = (headers, body = '{}') => POST(new Request(origin + '/mcp', { method: 'POST', headers, body }));
    const missing = await call({ 'content-type': 'application/json' });
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get('www-authenticate'), /resource_metadata=.*oauth-protected-resource\/mcp/);
    assert.equal((await call({ origin: 'https://other.example.test' })).status, 403);
    assert.equal((await call({ authorization: 'Bearer ' + 'a'.repeat(43), 'content-type': 'application/json' }, ' '.repeat(600001))).status, 413);
    const shareOnly = await call({ authorization: 'Bearer ' + 'a'.repeat(43), 'content-type': 'application/json' }, JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'download_assessment_pdf', arguments: { assessment_id: id } },
    }));
    assert.equal(shareOnly.status, 403);
    assert.match(shareOnly.headers.get('www-authenticate'), /insufficient_scope.*assessments:read-source/);
  } finally {
    scope.deregister();
    for (const key of ['JUMPSERVE_MCP_ENABLED', 'NEXT_PUBLIC_SITE_URL']) {
      if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    }
  }
});
