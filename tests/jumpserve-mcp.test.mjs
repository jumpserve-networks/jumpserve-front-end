import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { prepareAssessmentBundle } from '../lib/jumpserve-assessment-bundle.ts';
import { parseAuthorizationRequest, verifierChallenge } from '../lib/jumpserve-mcp-oauth.ts';
import { serveJumpServeTools } from '../lib/jumpserve-mcp-server.ts';

const origin = 'https://jumpserve.example.test';
const id = '22459c11-9be3-44d2-9b39-a0cb96a0d09f';
const hash = 'b'.repeat(64);
const fixture = () => ({
  version: 'jumpserve-assessment-v1',
  paper: { title: 'Synthetic paper', authors: ['Example Author'], domain: 'Systems', sha256: hash, byte_count: 523 },
  summary: 'Prepare the local experiment.',
  claims: [{ id: 'c1', page: 5, claim: 'Measure a counter.', criterion: 'Compare matched counter values.', outcome: 'untested', finding: 'The run is pending.' }],
  methods: [{ title: 'Counter test', procedure: 'Record the counter in matched settings.' }],
  runs: [], limitations: ['This is a synthetic fixture.'],
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

test('OAuth requests require a registered loopback callback, PKCE and the JumpServe resource', () => {
  const resource = origin + '/mcp';
  for (const [name, callback] of [['jumpserve-codex', 'http://127.0.0.1:17651/callback'], ['jumpserve-claude-code', 'http://localhost:17652/callback']]) {
    const values = new URLSearchParams({
      client_id: name, redirect_uri: callback, state: 'original', resource, scope: 'assessments:share',
      response_type: 'code', code_challenge_method: 'S256', code_challenge: verifierChallenge('a'.repeat(43)),
    });
    assert.equal(parseAuthorizationRequest(values, resource)?.redirectUri, callback);
    assert.equal(parseAuthorizationRequest(values, origin + '/different'), null);
    for (const url of [callback + '/extra', 'https://attacker.example.test/callback', 'http://localhost:1/callback']) {
      const copy = new URLSearchParams(values); copy.set('redirect_uri', url);
      assert.equal(parseAuthorizationRequest(copy, resource), null);
    }
    const repeated = new URLSearchParams(values); repeated.append('state', 'second');
    assert.equal(parseAuthorizationRequest(repeated, resource), null);
  }
});

test('a real MCP SDK client discovers both tools and completes preview and submit', async () => {
  let approved = false;
  let previewed;
  const transport = new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
    fetch: async (target, options) => {
      const request = new Request(target, options);
      if (request.method === 'GET') return new Response(null, { status: 405 });
      return serveJumpServeTools(request, await request.json(), origin, {
        preview: async prepared => { previewed = prepared; return { previewId: id, studyId: null }; },
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
    assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['preview_assessment', 'submit_assessment']);
    const preview = await client.callTool({ name: 'preview_assessment', arguments: { bundle: fixture() } });
    assert.equal(preview.structuredContent.review_url, origin + '/research-verification/share/' + id);
    assert.equal(previewed.hash, prepareAssessmentBundle(fixture()).hash);
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
      'export async function connectorActor(){return "fixture-owner"}; export function previewAssessment(){throw Error("Must not preview")}; export function submitAssessment(){throw Error("Must not submit")};'
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
  } finally {
    scope.deregister();
    for (const key of ['JUMPSERVE_MCP_ENABLED', 'NEXT_PUBLIC_SITE_URL']) {
      if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    }
  }
});
