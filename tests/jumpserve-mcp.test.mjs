import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { prepareAssessmentBundle } from '../lib/jumpserve-assessment-bundle.ts';
import { CLI_CLIENT_ID, CLI_SCOPE, clientInfo, connectorResource, issueClientId, parseAuthorizationRequest, registeredRedirect, verifierChallenge } from '../lib/jumpserve-mcp-oauth.ts';
import { serveJumpServeTools } from '../lib/jumpserve-mcp-server.ts';
import { prepareVerifierResult } from '../lib/jumpserve-verification.ts';
import { prepareCoachReport } from '../lib/jumpserve-coach.ts';

const origin = 'https://jumpserve.example.test';
const id = '22459c11-9be3-44d2-9b39-a0cb96a0d09f';
const hash = 'b'.repeat(64);
const provenance = { source: 'supabase', version_id: id, sha256: hash };
const coachReport = () => ({
  version: 'jumpserve-coach-report-v1', sources: [{ verification_id: id, assessment_sha256: hash }],
  summary: 'The review found a reporting gap.', limitations: [],
  recommendations: [{ title: 'Explain incomplete trials', finding: 'A timeout was implicit.',
    proposed_change: 'List timeouts with their condition.', regression_check: 'A timed-out fixture names the failed attempt.' }],
});

test('Coach reports require unique sources, exclude raw inputs, and hash reordered sources identically', () => {
  const report = coachReport();
  const second = { verification_id: 'acdfb426-0c96-4a48-b593-5b27f44b5069', assessment_sha256: 'c'.repeat(64) };
  const sources = [...report.sources, second];
  assert.equal(prepareCoachReport({ ...report, sources }).hash, prepareCoachReport({ ...report, sources: sources.toReversed() }).hash);
  assert.throws(() => prepareCoachReport({ ...report, sources: [...sources, second] }), /only once/);
  assert.throws(() => prepareCoachReport({ ...report, sources: [] }), /does not match/);
  assert.deepEqual(prepareCoachReport({ ...report, recommendations: [] }).report.recommendations, []);
  assert.throws(() => prepareCoachReport({ ...report, raw_scorecard: {} }), /does not match/);
  assert.throws(() => prepareCoachReport({ ...report, summary: 'Inspect /Users/owner/private.json' }), /private paths/);
});
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
const scorecard = (raw, changes = {}) => ({
  version: 'jumpserve-verifier-scorecard-v1', paper_id: 'fixture', paper_sha256: hash,
  assessment_sha256: createHash('sha256').update(raw).digest('hex'), answer_key_sha256: 'c'.repeat(64),
  split: 'development', mode: 'fresh', scenario: null, evidence_integrity: { status: 'verified', verified_runs: 0 },
  status: 'scored', claims: [{ key_claim_id: 'C1', assessment_claim_id: 'c1', reported_outcome: 'untested',
    supported_outcome: 'untested', assessment: 'correct', evidence: ['notes/status.txt'], finding: 'The run never began.' }],
  rubric: [{ criterion: 'Verdict', earned: 2, maximum: 2, reason: 'The assessment retained the untested verdict.' }],
  score: { earned: 2, applicable_maximum: 2, rubric_maximum: 2 }, critical_failures: [], blockers: [], ...changes,
});

test('scorecard binding checks the exact original bytes, claim verdicts, and private boundaries', () => {
  const bundle = fixture();
  const raw = JSON.stringify(bundle, null, 2) + '\n';
  const grade = scorecard(raw);
  assert.equal(prepareVerifierResult(raw, grade).generatorHash, prepareAssessmentBundle(bundle).hash);
  assert.throws(() => prepareVerifierResult(raw.trim(), grade), /does not match the assessment SHA-256/);
  assert.throws(() => prepareVerifierResult(raw, { ...grade, paper_sha256: 'd'.repeat(64) }), /different paper/);
  assert.throws(() => prepareVerifierResult(raw, { ...grade, answer_key: {} }), /Scorecard does not match/);
  assert.throws(() => prepareVerifierResult(raw, { ...grade, score: { ...grade.score, earned: 1 } }), /Score totals/);
  assert.throws(() => prepareVerifierResult(raw, { ...grade, claims: [{ ...grade.claims[0], evidence: ['../trace.csv'] }] }), /relative evidence/);
  grade.claims[0].reported_outcome = 'inconclusive';
  assert.throws(() => prepareVerifierResult(raw, grade), /inconsistent/);
});

test('synthetic replay scorecards bind to an analysis artifact without experiment runs', () => {
  const analysis = { version: 'jumpserve-replay-analysis-v1', paper: { sha256: hash }, skill_instructions: provenance,
    scenario: 'synthetic_decision_fixture', claims: [{ id: 'c1', claim: 'A synthetic comparison.',
      criterion: 'Apply the stated rule.', outcome: 'untested', finding: 'The fixture has no run.' }] };
  const raw = JSON.stringify(analysis);
  const grade = scorecard(raw, { mode: 'replay', scenario: analysis.scenario, evidence_integrity: { status: 'fixture_only' } });
  assert.deepEqual(prepareVerifierResult(raw, grade).bundle, analysis);
  assert.throws(() => prepareVerifierResult(raw, { ...grade, scenario: 'other' }), /mode and scenario/);
  assert.throws(() => prepareVerifierResult(raw, { ...grade, evidence_integrity: { status: 'verified' } }), /mode and scenario/);
});

test('skill provenance accepts pinned and local guidance identities without accepting instruction bodies', () => {
  for (const skill_instructions of [provenance, { source: 'bundled', sha256: hash }, { source: 'candidate', sha256: hash }]) {
    const bundle = { ...fixture(), skill_instructions };
    const raw = JSON.stringify(bundle);
    const grade = scorecard(raw, { skill_instructions });
    assert.deepEqual(prepareAssessmentBundle(bundle).bundle.skill_instructions, skill_instructions);
    assert.deepEqual(prepareVerifierResult(raw, grade).scorecard.skill_instructions, skill_instructions);
    assert.deepEqual(prepareCoachReport({ ...coachReport(), skill_instructions }).report.skill_instructions, skill_instructions);
  }
  assert.throws(() => prepareAssessmentBundle({ ...fixture(), skill_instructions: { source: 'supabase', sha256: hash } }), /does not match/);
  assert.throws(() => prepareCoachReport({ ...coachReport(), skill_instructions: { ...provenance, instructions: 'Private text' } }), /does not match/);
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

test('the CLI client requires its upload resource, scope, and loopback callback', () => {
  const config = { issuer: origin, resource: `${origin}/mcp`, metadata: `${origin}/metadata`, cliResource: `${origin}/research-verification/api/assessment-source` };
  const resource = connectorResource(config, CLI_CLIENT_ID);
  const values = new URLSearchParams({ client_id: CLI_CLIENT_ID, redirect_uri: 'http://127.0.0.1:40022/callback',
    state: 'original', resource, scope: CLI_SCOPE, response_type: 'code', code_challenge_method: 'S256',
    code_challenge: verifierChallenge('a'.repeat(43)) });
  assert.equal(parseAuthorizationRequest(values, resource)?.readSources, false);
  assert.equal(connectorResource(config, 'jumpserve-codex'), config.resource);
  for (const [key, value] of [['resource', config.resource], ['resource', null], ['scope', 'assessments:share'],
    ['scope', null], ['redirect_uri', 'http://localhost:40022/callback']]) {
    const changed = new URLSearchParams(values);
    if (value === null) changed.delete(key);
    else changed.set(key, value);
    assert.equal(parseAuthorizationRequest(changed, resource), null);
  }
});

test('a real MCP SDK client discovers and calls the JumpServe tools', async () => {
  let approved = false;
  let previewed;
  let generatorResult;
  let verifierResult;
  let coachResult;
  const activeGuidance = { role: 'generator', version_id: id, version_number: 2, sha256: hash, instructions: 'Include a description of the fixture.\n' };
  const pinnedGuidance = { ...activeGuidance, version_id: 'acdfb426-0c96-4a48-b593-5b27f44b5069', version_number: 1 };
  const transport = new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
    fetch: async (target, options) => {
      const request = new Request(target, options);
      if (request.method === 'GET') return new Response(null, { status: 405 });
      return serveJumpServeTools(request, await request.json(), origin, {
        getInstructions: async (role, versionId) => role === 'generator' ? (versionId ? pinnedGuidance : activeGuidance) : null,
        download: async value => value === id ? { assessment_id: id, byte_count: 12 } : null,
        preview: async (prepared, assessmentId) => { assert.equal(assessmentId, id); previewed = prepared; return { previewId: id, studyId: null }; },
        saveGenerator: async (prepared, assessmentId) => { assert.equal(assessmentId, id); generatorResult = prepared; return id; },
        saveVerifier: async (prepared, assessmentId, version) => { assert.equal(assessmentId, id); assert.equal(version, '1.0.0'); verifierResult = prepared; return id; },
        saveCoach: async prepared => { coachResult = prepared; return id; },
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
    assert.deepEqual(tools.map(tool => tool.name), ['download_assessment_pdf', 'preview_assessment', 'submit_assessment', 'save_generator_result', 'save_verifier_result', 'save_coach_report', 'get_skill_instructions']);
    const guidanceTool = tools.at(-1);
    assert.equal(guidanceTool.annotations.readOnlyHint, true);
    const guidance = args => client.callTool({ name: guidanceTool.name, arguments: args });
    assert.deepEqual((await guidance({ role: 'generator' })).structuredContent, activeGuidance);
    assert.deepEqual((await guidance({ role: 'generator', version_id: pinnedGuidance.version_id })).structuredContent, pinnedGuidance);
    assert.equal((await guidance({ role: 'verifier', version_id: pinnedGuidance.version_id })).isError, true);
    assert.equal((await guidance({ role: 'generator', version_id: 'unpublished' })).isError, true);
    assert.equal((await guidance({ role: 'generator', publish: true })).isError, true);
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
    for (const tool of tools.slice(1, 3)) {
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
    const saved = await client.callTool({ name: 'save_generator_result', arguments: { bundle, assessment_id: id } });
    assert.deepEqual(saved.structuredContent, { generator_result_id: id, status: 'saved_private' });
    const raw = JSON.stringify(bundle, null, 2);
    const grade = scorecard(raw);
    const verified = await client.callTool({ name: 'save_verifier_result', arguments: {
      assessment_id: id, assessment_json: raw, scorecard: grade, verifier_version: '1.0.0',
    } });
    assert.deepEqual(verified.structuredContent, { verification_id: id, status: 'saved_private' });
    assert.equal(verifierResult.generatorHash, generatorResult.hash);
    assert.deepEqual(verifierResult.scorecard, grade);
    const report = coachReport();
    assert.equal((await client.callTool({ name: 'save_coach_report', arguments: { report: { ...report, sources: [] } } })).isError, true);
    assert.equal(coachResult, undefined);
    const coached = await client.callTool({ name: 'save_coach_report', arguments: { report } });
    assert.deepEqual(coached.structuredContent, { coach_report_id: id, status: 'saved_private' });
    assert.deepEqual(coachResult, prepareCoachReport(report));
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

test('the connector reads one published guidance version and validates the returned content hash', async t => {
  const serverImports = registerHooks({ resolve(name, context, next) {
    if (name === 'server-only') return { shortCircuit: true, url: 'data:text/javascript,export {};' };
    if (name === '@/lib/supabase/server') return { shortCircuit: true, url: 'data:text/javascript,export function createStaticClient() {};' };
    return next(name, context);
  } });
  t.after(() => serverImports.deregister());
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.test', SUPABASE_SECRET_KEY: 'fixture-key' };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }

  const instructions = 'Report the exact fixture result café.\n';
  const active = { role: 'verifier', version_id: id, version_number: 3, instructions, sha256: createHash('sha256').update(instructions).digest('hex') };
  let rows = [active];
  const fetch = t.mock.method(globalThis, 'fetch', (url, options) => {
    assert.equal(String(url), env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/rpc/research_skill_get_instructions');
    assert.equal(options.cache, 'no-store');
    assert.equal(new Headers(options.headers).get('apikey'), env.SUPABASE_SECRET_KEY);
    return Promise.resolve(Response.json(rows));
  });
  const { getSkillInstructions } = await import('../lib/jumpserve-mcp-store.ts');
  assert.deepEqual(await getSkillInstructions('verifier'), active);
  assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body), { p_role: 'verifier', p_version_id: null });
  assert.deepEqual(await getSkillInstructions('verifier', id), active);
  assert.deepEqual(JSON.parse(fetch.mock.calls[1].arguments[1].body), { p_role: 'verifier', p_version_id: id });
  const legacy = { ...active };
  delete legacy.version_number;
  rows = [legacy];
  assert.deepEqual(await getSkillInstructions('verifier'), legacy);
  rows = [{ ...active, version_number: 0 }];
  await assert.rejects(getSkillInstructions('verifier'), /could not verify/);
  rows = [{ ...active, instructions: instructions.trim() }];
  await assert.rejects(getSkillInstructions('verifier'), /could not verify/);
  rows = [];
  assert.equal(await getSkillInstructions('verifier', id), null);
});

test('the HTTP route challenges missing tokens and rejects untrusted origins and oversized bodies', async () => {
  const scope = registerHooks({ resolve(name, context, next) {
    if (name === '@/lib/jumpserve-mcp-store') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(
      'export async function connectorActor(){return "fixture-owner"}; export async function connectorMayDownloadSource(){return false}; export function localAssessmentSourceTicket(){throw Error("Must not download")}; export function previewAssessment(){throw Error("Must not preview")}; export function submitAssessment(){throw Error("Must not submit")}; export function saveGeneratorResult(){throw Error("Must not save")}; export function saveVerifierResult(){throw Error("Must not save")}; export function saveCoachReport(){throw Error("Must not save")}; export function getSkillInstructions(role){return {role,instructions:"fixture"};}'
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
    const guidanceBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
      name: 'get_skill_instructions', arguments: { role: 'coach' },
    } });
    assert.equal((await call({ 'content-type': 'application/json' }, guidanceBody)).status, 401);
    const published = await call({ authorization: 'Bearer ' + 'a'.repeat(43), 'content-type': 'application/json',
      accept: 'application/json, text/event-stream' }, guidanceBody);
    assert.equal(published.headers.get('cache-control'), 'no-store');
    assert.equal((await published.json()).result.structuredContent.instructions, 'fixture');
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

test('the CLI results route serves only active Generator and Verifier workflows to a results session', async t => {
  const endpoint = origin + '/research-verification/api/assessment-results';
  const token = 'a'.repeat(43);
  const workflowCalls = [];
  let verifierAvailable = true;
  const stub = registerHooks({ resolve(name, context, next) {
    if (name === 'server-only') return { shortCircuit: true, url: 'data:text/javascript,export {};' };
    if (name === '@/lib/supabase/server') return { shortCircuit: true, url: 'data:text/javascript,export function createStaticClient() {};' };
    return next(name, context);
  } });
  t.after(() => stub.deregister());
  const env = { JUMPSERVE_MCP_ENABLED: 'true', NEXT_PUBLIC_SITE_URL: origin,
    NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.test', SUPABASE_SECRET_KEY: 'fixture-key' };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }

  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const input = JSON.parse(options.body);
    const path = new URL(url).pathname;
    if (path === '/rest/v1/rpc/jumpserve_mcp_actor') {
      assert.equal(input.p_resource, endpoint);
      return Response.json(input.p_access === createHash('sha256').update(token).digest('hex') ? id : null);
    }
    assert.equal(path, '/rest/v1/rpc/research_skill_get_instructions');
    assert.equal(input.p_version_id, null);
    workflowCalls.push(input.p_role);
    if (input.p_role === 'verifier' && !verifierAvailable) return Response.json([], { status: 503 });
    const instructions = `${input.p_role} fixture guidance.\n`;
    return Response.json([{ role: input.p_role, version_id: id, version_number: input.p_role === 'generator' ? 4 : 1,
      instructions, sha256: createHash('sha256').update(instructions).digest('hex') }]);
  });

  const { POST } = await import('../app/(modules)/research-verification/api/assessment-results/route.ts');
  const call = (body, access = token) => POST(new Request(endpoint, { method: 'POST',
    headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await call({ action: 'batch_guidance' }, 'b'.repeat(43))).status, 401);
  assert.equal((await call({ action: 'batch_guidance', version_id: id })).status, 400);
  assert.deepEqual(await (await call({ action: 'check' })).json(), { status: 'ready', batch_guidance: true });
  assert.deepEqual(workflowCalls, []);
  const response = await call({ action: 'batch_guidance' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const { status, guidance } = await response.json();
  assert.equal(status, 'ready');
  assert.deepEqual(workflowCalls.sort(), ['generator', 'verifier']);
  assert.equal(guidance.generator.version_number, 4);
  assert.equal(guidance.verifier.version_number, 1);
  verifierAvailable = false;
  assert.equal((await call({ action: 'batch_guidance' })).status, 503);
});
