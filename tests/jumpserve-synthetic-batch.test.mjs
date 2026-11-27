import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { inventory, runSyntheticBatch, sha256, stageBatchGuidance } from '../scripts/lib/jumpserve-synthetic-batch.mjs';
import { BATCH_SKILLS, verifierPrompt } from '../scripts/lib/jumpserve-synthetic-worker-inputs.mjs';
import { createBatchProgressReporter } from '../scripts/lib/jumpserve-synthetic-progress.mjs';
import { createEc2Workers } from '../scripts/lib/jumpserve-synthetic-ec2.mjs';
import { createContainerWorkers } from '../scripts/lib/jumpserve-synthetic-containers.mjs';
import { CLI_RESULTS_SCOPE, MCP_TOKEN_PATH } from '../lib/jumpserve-mcp-oauth.ts';
import { PRIVATE_EVALUATION_RESULTS_API } from '../lib/local-assessment-source.ts';

const numberedGuidance = {
  generator: { source: 'bundled', sha256: 'c64477caf8d2f36e0a65ff7c445b8f146d01f128ab96672473d47cdd34a53f16' },
  verifier: { source: 'bundled', sha256: '8c41fd9eeaa0425bd7d88bfb25c3dc516bc775f4555407e497ec5aa1a862231c' },
};

function correctClaim(evidence = []) {
  return { key_claim_id: 'C1', assessment_claim_id: 'c1', reported_outcome: 'untested', supported_outcome: 'untested',
    assessment: 'correct', evidence, finding: 'The recorded outcome agrees.' };
}

async function fixture(t, paperIds = ['A', 'B', 'C']) {
  const root = await mkdtemp(join(tmpdir(), 'jumpserve-batch-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const papers = join(root, 'pdfs');
  const keys = join(root, 'keys');
  for (const path of [papers, join(keys, 'development')]) await mkdir(path, { recursive: true });
  for (const id of paperIds) {
    const paper = Buffer.from(`%PDF-1.7\n${id}\n`);
    const paperSha256 = sha256(paper);
    await writeFile(join(papers, `${id}.pdf`), paper);
    await writeFile(join(keys, 'development', `${id}.json`), JSON.stringify({ schema_version: 1, paper_id: id,
      paper: { sha256: paperSha256 }, split: 'development', claim: { id: 'C1' },
      rubric: { assertions: [{ id: 'verdict', points: 2 }] } }));
  }
  const guidance = { generator: { source: 'bundled', sha256: sha256('generator') },
    verifier: { source: 'bundled', sha256: sha256('verifier') } };
  const calls = [];
  const output = join(root, 'run');
  const cases = await inventory(papers, keys);
  const options = {
    output, cases, guidance, runtime: { fixture: true },
    generate: async input => {
      assert.deepEqual(Object.keys(input).sort(), ['assessmentId', 'guidance', 'output', 'paper', 'paperSha256']);
      const { output, paper, paperSha256, guidance } = input;
      const id = cases.find(item => item.paperSha256 === paperSha256).paperId;
      calls.push(`generate ${id}`);
      assert.equal(sha256(await readFile(paper)), paperSha256);
      await writeFile(join(output, 'jumpserve-assessment.json'), JSON.stringify({
        version: 'jumpserve-assessment-v1', skill_instructions: guidance,
        paper: { sha256: paperSha256, byte_count: 11, title: `Fixture ${id}`, authors: ['Test author'], domain: 'Networking' },
        summary: 'Synthetic batch verification.',
        claims: [{ id: 'c1', page: 1, claim: 'A measurement can be made.', criterion: 'Check the saved observations.',
          outcome: 'untested', finding: 'The fixture has no run.' }],
        methods: [{ title: 'Record evidence', procedure: 'Check the synthetic output.' }], runs: [],
        limitations: ['Synthetic fixture.'],
      }));
    },
    preflight: async ({ artifactDirectory, key, paper }) => {
      const keyBytes = await readFile(key);
      const { paper_id, paper: { sha256: paperSha256 } } = JSON.parse(keyBytes);
      assert.equal(sha256(await readFile(paper)), paperSha256);
      calls.push(`preflight ${paper_id}`);
      assert.notEqual(dirname(key), artifactDirectory);
      return { paper_id, paper_sha256: paperSha256, pdf_bytes_checked: true, mode: 'fresh',
        answer_key_sha256: sha256(keyBytes), assessment_sha256: sha256(await readFile(join(artifactDirectory, 'jumpserve-assessment.json'))),
        evidence_integrity: { status: 'verified' } };
    },
  };
  return { ...options, calls, async score({ artifactDirectory, key, output, guidance }, earned, override = {}) {
    const keyBytes = await readFile(key);
    const { paper_id, paper: { sha256: paperSha256 } } = JSON.parse(keyBytes);
    calls.push(`verify ${paper_id}`);
    const grade = {
      version: 'jumpserve-verifier-scorecard-v1', skill_instructions: guidance, paper_id, paper_sha256: paperSha256,
      assessment_sha256: sha256(await readFile(join(artifactDirectory, 'jumpserve-assessment.json'))),
      answer_key_sha256: sha256(keyBytes), split: 'development', mode: 'fresh', scenario: null,
      evidence_integrity: { status: 'verified' }, status: 'scored', blockers: [], critical_failures: [],
      claims: [correctClaim()],
      rubric: [{ criterion: 'verdict', earned, maximum: 2, reason: 'Fixture score.' }],
      score: { earned, applicable_maximum: 2, rubric_maximum: 2 }, ...override,
    };
    await writeFile(join(output, 'scorecard.json'), JSON.stringify(grade));
  } };
}

test('batch progress separates assessment blocks and prints elapsed times in redirected output', () => {
  let time = 0;
  let output = '';
  const reporter = createBatchProgressReporter(numberedGuidance, { write: text => { output += text; } }, () => time);
  reporter.update('A', 'generating', 'A.pdf', 'assessment-a');
  time += 903_500;
  reporter.update('A', 'verifying', 'A.pdf', 'assessment-a');
  time += 121_000;
  reporter.update('A', 'passed', 'A.pdf', 'assessment-a');
  reporter.update('B', 'generating', 'B.pdf', 'assessment-b');
  time += 750_000;
  reporter.update('B', 'verifying', 'B.pdf', 'assessment-b');
  time += 4_000;
  reporter.finish();
  reporter.finish();

  assert.equal(output, '\nAssessment ID: assessment-a\nFile Name: A.pdf\nGenerating (v3): 15 minutes 3 seconds\nVerifying (v1): 2 minutes 1 second\nPassed\n' +
    '\nAssessment ID: assessment-b\nFile Name: B.pdf\nGenerating (v3): 12 minutes 30 seconds\nVerifying (v1): 4 seconds\n');
});

test('an unmatched workflow checksum is labeled bundled', () => {
  const writes = [];
  const guidance = { ...numberedGuidance, generator: numberedGuidance.verifier };
  const reporter = createBatchProgressReporter(guidance, { write: text => writes.push(text) }, () => 0);
  reporter.update('A', 'generating', 'A.pdf', 'assessment-a');
  reporter.update('A', 'verifying', 'A.pdf', 'assessment-a');
  reporter.finish();
  assert.deepEqual(writes.slice(1), ['Generating (bundled): 0 seconds\n', 'Verifying (v1): 0 seconds\n']);
});

test('the batch pins published guidance without changing the skills and recovers either snapshot layout', async t => {
  const lab = await fixture(t);
  const skillsDirectory = join(dirname(lab.output), 'skills');
  const snapshot = join(dirname(lab.output), 'snapshot');
  const published = {
    generator: { role: 'generator', version_id: '39933d0c-cec0-42e2-90b6-72a9261b9f72', version_number: 12 },
    verifier: { role: 'verifier', version_id: '4ed9f6de-7a79-4d5d-9b9c-85c5bf2e8573', version_number: 7 },
  };
  for (const [role, name] of Object.entries(BATCH_SKILLS)) {
    const directory = join(skillsDirectory, name, 'references');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, '..', 'SKILL.md'), `# Shared ${role} skill\n`);
    await writeFile(join(directory, 'workflow.md'), `Bundled ${role} guidance.\n`);
    const instructions = `Published ${role} guidance café.\n`;
    Object.assign(published[role], { instructions, sha256: sha256(instructions) });
  }

  const staged = await stageBatchGuidance({ skillsDirectory, snapshot, published });
  const { guidance, workflowFiles } = staged;
  const expectedProvenance = role => ({ source: 'supabase', version_id: published[role].version_id, sha256: published[role].sha256 });
  for (const [role, name] of Object.entries(BATCH_SKILLS)) {
    assert.deepEqual(guidance[role], { ...expectedProvenance(role), version_number: published[role].version_number });
    assert.equal(await readFile(join(snapshot, name, workflowFiles[role]), 'utf8'), published[role].instructions);
    for (const file of ['SKILL.md', 'references/workflow.md']) {
      assert.deepEqual(await readFile(join(snapshot, name, file)), await readFile(join(skillsDirectory, name, file)));
    }
  }
  assert.deepEqual(await stageBatchGuidance({ snapshot, previous: guidance }), staged);

  const writes = [];
  const reporter = createBatchProgressReporter(guidance, { write: text => writes.push(text) }, () => 0);
  const result = await runSyntheticBatch({ ...lab, guidance, progress: reporter.update,
    generate: input => {
      assert.deepEqual(input.guidance, expectedProvenance('generator'));
      return lab.generate(input);
    },
    verify: input => {
      assert.deepEqual(input.guidance, expectedProvenance('verifier'));
      return lab.score(input, 2);
    },
  });
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.guidance, guidance);
  assert.deepEqual(writes.slice(1, 4), ['Generating (v12): 0 seconds\n', 'Verifying (v7): 0 seconds\n', 'Passed\n']);

  const invalid = await runSyntheticBatch({ ...lab, output: `${lab.output}-invalid-version`, guidance,
    verify: input => lab.score(input, 2, { skill_instructions: { ...input.guidance, version_id: published.generator.version_id } }),
  });
  assert.match(invalid.stop.reason, /does not identify the pinned skill guidance/);

  const stagedGenerator = join(snapshot, BATCH_SKILLS.generator);
  await writeFile(join(stagedGenerator, workflowFiles.generator), 'Modified snapshot.');
  await assert.rejects(stageBatchGuidance({ snapshot, previous: guidance }), /Could not verify the pinned generator workflow/);
  await rm(join(stagedGenerator, workflowFiles.generator));
  await writeFile(join(stagedGenerator, 'references/workflow.md'), published.generator.instructions);
  assert.deepEqual(await stageBatchGuidance({ snapshot, previous: guidance }),
    { guidance, workflowFiles: { ...workflowFiles, generator: 'references/workflow.md' } });
});

test('batch progress animates the active terminal step and clears the spinner when it ends', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const writes = [];
  let time = 0;
  const reporter = createBatchProgressReporter(numberedGuidance, { isTTY: true, clearLine: () => {}, cursorTo: () => {},
    write: text => writes.push(text) }, () => time);
  reporter.update('A', 'generating', 'A.pdf', 'assessment-a');
  assert.equal(writes.at(-1), 'Generating (v3): |');
  time += 61_000;
  reporter.update('A', 'verifying', 'A.pdf', 'assessment-a');
  assert.deepEqual(writes.slice(-2), ['Generating (v3): 1 minute 1 second\n', 'Verifying (v1): |']);
  t.mock.timers.tick(100);
  assert.equal(writes.at(-1), 'Verifying (v1): /');
  time += 1_000;
  reporter.finish();
  const finished = writes.length;
  assert.equal(writes.at(-1), 'Verifying (v1): 1 second\n');
  t.mock.timers.tick(500);
  assert.equal(writes.length, finished);
});

test('a one-point loss is recorded and the next paper still runs', async t => {
  const lab = await fixture(t);
  const options = { ...lab, verify: input => lab.score(input, input.key.includes(`${join('B', 'answer-key.json')}`) ? 1 : 2) };
  const result = await runSyntheticBatch(options);
  assert.equal(result.status, 'completed');
  assert.equal(result.stop, undefined);
  assert.deepEqual(result.cases.map(item => item.status), ['passed', 'completed', 'passed']);
  assert.equal(result.cases[1].score.earned, 1);
  assert.deepEqual(lab.calls, [
    'generate A', 'preflight A', 'verify A', 'generate B', 'preflight B', 'verify B', 'generate C', 'preflight C', 'verify C',
  ]);
  assert.deepEqual(JSON.parse(await readFile(join(lab.output, 'batch.json'))), result);
  await assert.rejects(runSyntheticBatch(options), { code: 'EEXIST' });
  assert.equal(lab.calls.length, 9);
});

test('eight workers reuse their sessions for queued papers after saving each Verifier result', { timeout: 5_000 }, async t => {
  const paperIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const lab = await fixture(t, paperIds);
  const poolSize = 8;
  const initialWorkersReady = Promise.withResolvers();
  const queuedPaperStarted = Promise.withResolvers();
  const launched = new Set();
  const ids = new Map();
  const reviewed = new Set();
  const workerPool = Array.from({ length: poolSize }, () => {
    let previousAssessmentId;
    return {
      async generate({ signal, ...input }) {
        signal.throwIfAborted();
        if (previousAssessmentId) assert.ok(reviewed.has(previousAssessmentId));
        previousAssessmentId = input.assessmentId;
        const { paperId } = lab.cases.find(item => item.paperSha256 === input.paperSha256);
        assert.ok(!launched.has(paperId));
        launched.add(paperId);
        if (launched.size === poolSize) {
          assert.deepEqual([...launched].sort(), paperIds.slice(0, poolSize));
          initialWorkersReady.resolve();
        }
        if (paperId === paperIds[poolSize]) queuedPaperStarted.resolve();
        await initialWorkersReady.promise;
        if (paperId === 'C') await queuedPaperStarted.promise;
        signal.throwIfAborted();
        await lab.generate(input);
      },
      async reviewOnInstance({ assessmentId, ...input }) {
        assert.equal(assessmentId, previousAssessmentId);
        const checked = await lab.preflight(input);
        assert.equal(ids.get(checked.paper_sha256), assessmentId);
        await lab.score(input, checked.paper_id === 'B' ? 1 : 2);
        return checked;
      },
    };
  });
  const result = await runSyntheticBatch({ ...lab, workerPool,
    persistence: {
      async generator(id, _paper, bundle) {
        ids.set(bundle.paper.sha256, id);
        return id;
      },
      async verifier(id, _artifact, grade) {
        assert.equal(ids.get(grade.paper_sha256), id);
        reviewed.add(id);
        return id;
      },
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(reviewed.size, paperIds.length);
  assert.equal(new Set(result.cases.map(item => item.database.assessment_id)).size, paperIds.length);
  assert.deepEqual(result.cases.map(item => item.status), paperIds.map(id => id === 'B' ? 'completed' : 'passed'));
  assert.deepEqual(JSON.parse(await readFile(join(lab.output, 'batch.json'))), result);
});

test('a malformed scorecard leaves the other Verifier running and frees the session for the queue', { timeout: 5_000 }, async t => {
  const lab = await fixture(t);
  const otherVerifierStarted = Promise.withResolvers();
  const queuedPaperStarted = Promise.withResolvers();
  const generated = [];
  const verified = [];
  const worker = {
    async generate({ signal, ...input }) {
      signal.throwIfAborted();
      await lab.generate(input);
      if (input.paperSha256 === lab.cases[2].paperSha256) queuedPaperStarted.resolve();
    },
    async reviewOnInstance(input) {
      const checked = await lab.preflight(input);
      if (checked.paper_id === 'A') {
        await otherVerifierStarted.promise;
        await lab.score(input, 2, { evidence_integrity: { status: 'verified', details: 'Original note.' } });
      } else {
        if (checked.paper_id === 'B') {
          otherVerifierStarted.resolve();
          await queuedPaperStarted.promise;
        }
        input.signal.throwIfAborted();
        await lab.score(input, 2);
      }
      return checked;
    },
  };
  const result = await runSyntheticBatch({ ...lab, workerPool: [worker, worker], persistence: {
    generator: async id => { generated.push(id); return id; },
    verifier: async (id, _artifact, grade) => { verified.push(grade.paper_id); return id; },
  } });
  assert.equal(result.status, 'completed');
  assert.equal(result.stop, undefined);
  assert.deepEqual(result.cases.map(item => item.status), ['verification_error', 'passed', 'passed']);
  assert.equal(generated.length, 3);
  assert.deepEqual(verified.sort(), ['B', 'C']);
  const failed = result.cases[0];
  assert.ok(failed.database.generator_result_id);
  assert.equal(failed.database.verification_id, undefined);
  assert.equal(failed.score, undefined);
  assert.equal(failed.steps.verifier.status, 'stopped');
  assert.match(failed.verification_error, /evidence_integrity/);
  const raw = JSON.parse(await readFile(join(lab.output, 'A', 'verifier', 'scorecard.json'), 'utf8'));
  assert.deepEqual(raw.evidence_integrity, { status: 'verified', details: 'Original note.' });
  assert.deepEqual(JSON.parse(await readFile(join(lab.output, 'batch.json'))), result);
});

test('a blocked Verifier saves its scorecard and waits for interrupted workers to clean up', { timeout: 5_000 }, async t => {
  const lab = await fixture(t, ['A', 'B', 'C', 'D']);
  const allStarted = Promise.withResolvers();
  const allAborted = Promise.withResolvers();
  const allowCleanup = Promise.withResolvers();
  let started = 0;
  let aborted = 0;
  const scoresSaved = [];
  const worker = {
    preflight: lab.preflight,
    async generate({ signal, ...input }) {
      if (++started === 3) allStarted.resolve();
      if (input.paperSha256 === lab.cases[0].paperSha256) {
        await allStarted.promise;
        await lab.generate(input);
        return;
      }
      await new Promise(resolve => {
        signal.addEventListener('abort', resolve, { once: true });
      });
      if (++aborted === 2) allAborted.resolve();
      await allowCleanup.promise;
      signal.throwIfAborted();
    },
    verify: input => lab.score(input, 0, {
      status: 'blocked', score: null, blockers: ['Fixture prerequisite missing.'], rubric: [],
    }),
  };
  const running = runSyntheticBatch({ ...lab, workerPool: [worker, worker, worker],
    persistence: {
      generator: async id => id,
      async verifier(id, _artifact, grade) {
        scoresSaved.push(grade.status);
        return id;
      },
    },
  });
  await allAborted.promise;
  try {
    assert.equal(JSON.parse(await readFile(join(lab.output, 'batch.json'))).status, 'running');
  } finally {
    allowCleanup.resolve();
  }
  const state = await running;
  assert.deepEqual(scoresSaved, ['blocked']);
  assert.equal(state.status, 'stopped');
  assert.equal(state.stop.paper_id, 'A');
  assert.deepEqual(state.cases.map(item => item.status), ['stopped', 'interrupted', 'interrupted', 'pending']);
  assert.deepEqual(state.cases[3].steps, {});
  for (const item of state.cases.slice(1, 3)) {
    assert.equal(item.steps.generator.status, 'interrupted');
    assert.ok(item.steps.generator.durationMs >= 0);
    assert.equal(item.steps.verifier, undefined);
  }
  assert.deepEqual(JSON.parse(await readFile(join(lab.output, 'batch.json'))), state);
});

test('concurrent result saves share one JumpServe session renewal', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'jumpserve-parallel-result-session-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const origin = 'https://fixture.example';
  const sessions = join(directory, '.jumpserve', 'sessions');
  const session = join(sessions, sha256(origin + PRIVATE_EVALUATION_RESULTS_API) + '.json');
  await mkdir(sessions, { recursive: true });
  await writeFile(session, JSON.stringify({
    origin, access_token: 'a'.repeat(43), refresh_token: 'b'.repeat(43), expires_at: Date.now() - 1,
  }));
  const cliUrl = new URL('../scripts/jumpserve-assessment.mjs', import.meta.url);
  const hook = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'node:os' && context.parentURL === cliUrl.href) return {
      shortCircuit: true,
      url: 'data:text/javascript,' + encodeURIComponent(`export const homedir = () => ${JSON.stringify(directory)};`),
    };
    return next(specifier, context);
  } });
  let privateResultsClient;
  try {
    ({ privateResultsClient } = await import(cliUrl.href));
  } finally {
    hook.deregister();
  }
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.pathname === MCP_TOKEN_PATH) {
      assert.equal(options.body.get('grant_type'), 'refresh_token');
      return Response.json({ access_token: 'c'.repeat(43), refresh_token: 'd'.repeat(43),
        scope: CLI_RESULTS_SCOPE, token_type: 'Bearer', expires_in: 3600 });
    }
    assert.equal(url.pathname, PRIVATE_EVALUATION_RESULTS_API);
    assert.equal(options.headers.Authorization, 'Bearer ' + 'c'.repeat(43));
    assert.equal(JSON.parse(options.body).action, 'coach');
    return Response.json({ status: 'saved_private', coach_report_id: '24b0c228-7779-4ce8-af2e-379a6dd540fe' });
  });
  const client = privateResultsClient(origin);
  const receipts = await Promise.all([client.coach({ fixture: 1 }), client.coach({ fixture: 2 })]);
  assert.equal(receipts.length, 2);
  assert.equal(fetch.mock.calls.filter(call => call.arguments[0].pathname === MCP_TOKEN_PATH).length, 1);
});

test('a substituted rubric criterion cannot pass even when the totals are perfect', async t => {
  const lab = await fixture(t);
  const result = await runSyntheticBatch({ ...lab, verify: input => lab.score(input, 2,
    { rubric: [{ criterion: 'different', earned: 2, maximum: 2, reason: 'Fixture replacement.' }] }) });
  assert.equal(result.status, 'stopped');
  assert.equal(result.stop.paper_id, 'A');
  assert.deepEqual(lab.calls, ['generate A', 'preflight A', 'verify A']);
});

test('the batch persists both result IDs and step durations for a below-perfect grade', async t => {
  const lab = await fixture(t);
  const generatorId = '09859c11-9be3-44d2-9b39-a0cb96a0d09f';
  const verificationId = '22459c11-9be3-44d2-9b39-a0cb96a0d09f';
  const journal = () => readFile(join(lab.output, 'batch.json'), 'utf8').then(JSON.parse);
  const progress = [];
  let elapsed = 0;
  const result = await runSyntheticBatch({ ...lab, cases: lab.cases.slice(0, 1), progress: (...args) => progress.push(args), now: () => elapsed,
    async generate(input) {
      await lab.generate(input);
      elapsed += 2_000;
    },
    async verify(input) {
      await lab.score(input, 1);
      elapsed += 3_000;
    }, persistence: {
    generator: async (assessmentId, paper, bundle) => {
      const [item] = (await journal()).cases;
      assert.equal(item.database.assessment_id, assessmentId);
      assert.deepEqual(item.steps.generator, { status: 'running', durationMs: null });
      assert.equal(bundle.paper.sha256, sha256(await readFile(paper)));
      lab.calls.push('save generator');
      elapsed += 10;
      return generatorId;
    },
    verifier: async (assessmentId, artifact, grade) => {
      assert.deepEqual((await journal()).cases[0].database, { assessment_id: assessmentId, generator_result_id: generatorId });
      assert.equal(grade.assessment_sha256, sha256(artifact));
      assert.equal(grade.score.earned, 1);
      lab.calls.push('save verifier');
      elapsed += 20;
      return verificationId;
    },
  } });
  assert.deepEqual(lab.calls, ['generate A', 'save generator', 'preflight A', 'verify A', 'save verifier']);
  assert.deepEqual(result.cases.map(item => item.status), ['completed']);
  const assessmentId = result.cases[0].database.assessment_id;
  assert.match(assessmentId, /^[a-f0-9-]{36}$/);
  assert.deepEqual(progress, [
    ['A', 'generating', 'A.pdf', assessmentId], ['A', 'verifying', 'A.pdf', assessmentId], ['A', 'completed', 'A.pdf', assessmentId],
  ]);
  assert.equal(result.cases[0].database.verification_id, verificationId);
  assert.deepEqual(result.cases[0].steps, {
    generator: { status: 'completed', durationMs: 2_010 }, verifier: { status: 'completed', durationMs: 3_020 },
  });
  assert.deepEqual(await journal(), result);
});

test('instance review gets the saved Generator inputs and retains a below-perfect result', async t => {
  const lab = await fixture(t);
  const assessmentIds = [];
  const generatorId = '09859c11-9be3-44d2-9b39-a0cb96a0d09f';
  const verificationId = '22459c11-9be3-44d2-9b39-a0cb96a0d09f';
  const result = await runSyntheticBatch({ ...lab, cases: lab.cases.slice(0, 1),
    generate(input) {
      assessmentIds.push(input.assessmentId);
      assert.equal(input.key, undefined);
      return lab.generate(input);
    },
    preflight: () => assert.fail('The local Verifier preflight ran.'),
    verify: () => assert.fail('The local Verifier ran.'),
    async reviewOnInstance(input) {
      assert.equal(input.assessmentId, assessmentIds[0]);
      assert.equal(lab.calls.at(-1), 'save generator');
      const checked = await lab.preflight(input);
      for (const [field, value] of Object.entries(input.expected)) assert.equal(checked[field], value);
      await lab.score(input, 1);
      return checked;
    },
    persistence: {
      generator: async () => { lab.calls.push('save generator'); return generatorId; },
      verifier: async () => { lab.calls.push('save verifier'); return verificationId; },
    },
  });
  assert.deepEqual(lab.calls, ['generate A', 'save generator', 'preflight A', 'verify A', 'save verifier']);
  assert.deepEqual(result.cases.map(item => item.status), ['completed']);
  assert.equal(result.cases[0].database.verification_id, verificationId);
});

test('EC2 workers stage separate leases with only the inputs each role needs', async t => {
  const lab = await fixture(t);
  const root = dirname(lab.output);
  const bin = join(root, 'bin');
  const snapshot = join(root, 'skills');
  const caseDirectory = join(root, 'case');
  const artifactDirectory = join(caseDirectory, 'generator');
  const output = join(caseDirectory, 'verifier');
  const paper = lab.cases[0].paperPath;
  const key = lab.cases[0].keyPath;
  await mkdir(bin);
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(output);
  for (const skill of Object.values(BATCH_SKILLS)) {
    await mkdir(join(snapshot, skill), { recursive: true });
    await writeFile(join(snapshot, skill, 'SKILL.md'), '# Fixture skill\n');
  }
  await writeFile(join(bin, 'python3'), `#!${process.execPath}
const assert = require('node:assert/strict');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const arg = name => process.argv[process.argv.indexOf(name) + 1];
const role = arg('--role');
const stage = arg('--stage');
const auth = arg('--codex-auth');
const payload = join(stage, 'payload');
const job = JSON.parse(readFileSync(join(payload, 'job.json'), 'utf8'));
assert.equal(process.argv[4], 'run');
assert.equal(role, job.role);
assert.equal(arg('--ttl-minutes'), '50');
assert.equal(arg('--assessment-id'), '6386345c-e930-4232-b510-c68da072ffd0');
assert.equal(readFileSync(0, 'utf8').trim(), auth === 'api-key' ? 'fixture-model-key' : '');
assert.equal(process.env.JUMPSERVE_BATCH_CODEX_API_KEY, undefined);
assert.equal(process.env.CODEX_ACCESS_TOKEN, undefined);
assert.ok(!existsSync(join(payload, 'session.json')));
if (auth === 'chatgpt') {
  const session = JSON.parse(readFileSync(join(stage, 'session.json'), 'utf8'));
  assert.equal(session.command[0], 'codex');
  assert.ok(session.command.includes(role === 'generator' ? '--yolo' : 'read-only'));
  assert.match(session.prompt, /Follow the JumpServe/);
}
if (auth === 'worker-chatgpt') {
  const volumes = { 'A': 'vol-00000000000000001', 'B': 'vol-00000000000000002' };
  assert.equal(arg('--worker-auth-volume'), volumes[require('node:path').basename(require('node:path').dirname(stage))]);
  assert.equal(arg('--worker-zone'), 'us-east-1a');
  assert.equal(arg('--worker-subnet'), 'subnet-00000000000000001');
  assert.equal(arg('--worker-security-group'), 'sg-00000000000000001');
}
assert.ok(existsSync(join(payload, 'case/paper.pdf')));
assert.equal(existsSync(join(payload, 'case/answer-key.json')), role === 'verifier');
assert.equal(existsSync(join(payload, 'skills/jumpserve-assessment-verifier')), role === 'verifier');
assert.equal(existsSync(join(payload, 'case/generator/retained.json')), role === 'verifier');
mkdirSync(join(stage, 'retrieved/case', role), { recursive: true });
writeFileSync(join(stage, 'retrieved/case', role, 'retained.json'), JSON.stringify({ role }));
if (role === 'verifier') writeFileSync(join(stage, 'retrieved/case/preflight.json'), JSON.stringify(job.expected));
mkdirSync(join(stage, 'aws-lease'));
writeFileSync(join(stage, 'aws-lease/state.json'), JSON.stringify({ role, cleaned: true }));
`, { mode: 0o700 });
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}:${originalPath}`;
  t.after(() => { process.env.PATH = originalPath; });
  const workers = createEc2Workers({ settings: { profile: 'fixture', region: 'us-east-1',
    instanceProfile: 'JumpServeExperimentWorkload-SSM', instanceType: 't3.medium' }, snapshot, workflowFiles: {},
  timeoutMs: 30 * 60_000, apiKey: 'fixture-model-key' });
  const assessmentId = '6386345c-e930-4232-b510-c68da072ffd0';
  await workers.generate({ assessmentId, paper, output: artifactDirectory, paperSha256: lab.cases[0].paperSha256,
    guidance: lab.guidance.generator });
  const expected = { assessment_sha256: 'a'.repeat(64) };
  assert.deepEqual(await workers.reviewOnInstance({ assessmentId, caseDirectory, paper, key, artifactDirectory, output,
    guidance: lab.guidance.verifier, rubric: lab.cases[0].rubric, expected }), expected);
  for (const role of ['generator', 'verifier']) {
    const stage = join(caseDirectory, `ec2-${role}`);
    assert.deepEqual(JSON.parse(await readFile(join(stage, 'aws-lease/state.json'), 'utf8')), { role, cleaned: true });
    assert.deepEqual(JSON.parse(await readFile(join(caseDirectory, role, 'retained.json'), 'utf8')), { role });
    assert.deepEqual(JSON.parse(await readFile(join(stage, 'retrieved/case', role, 'retained.json'), 'utf8')), { role });
    await assert.rejects(readFile(join(stage, 'payload/job.json')), { code: 'ENOENT' });
  }

  const chatgptDirectory = join(root, 'chatgpt-case');
  const chatgptArtifacts = join(chatgptDirectory, 'generator');
  const chatgptOutput = join(chatgptDirectory, 'verifier');
  await mkdir(chatgptArtifacts, { recursive: true });
  await mkdir(chatgptOutput);
  const chatgpt = createEc2Workers({ settings: { profile: 'fixture', region: 'us-east-1',
    instanceProfile: 'JumpServeExperimentWorkload-SSM', instanceType: 't3.medium' }, snapshot,
    workflowFiles: { generator: 'workflow.md', verifier: 'workflow.md' }, timeoutMs: 30 * 60_000 });
  await chatgpt.generate({ assessmentId, paper, output: chatgptArtifacts, paperSha256: lab.cases[0].paperSha256,
    guidance: lab.guidance.generator });
  assert.deepEqual(await chatgpt.reviewOnInstance({ assessmentId, caseDirectory: chatgptDirectory, paper, key,
    artifactDirectory: chatgptArtifacts, output: chatgptOutput, guidance: lab.guidance.verifier,
    rubric: lab.cases[0].rubric, expected }), expected);
  await assert.rejects(readFile(join(chatgptDirectory, 'ec2-generator/session.json')), { code: 'ENOENT' });

  const volumes = { A: 'vol-00000000000000001', B: 'vol-00000000000000002' };
  await Promise.all(Object.entries(volumes).map(async ([id, workerAuthVolume]) => {
    const worker = createEc2Workers({ settings: { profile: 'fixture', region: 'us-east-1',
      instanceProfile: 'JumpServeExperimentWorkload-SSM', instanceType: 't3.medium', workerZone: 'us-east-1a', workerAuthVolume,
      workerSubnet: 'subnet-00000000000000001', workerSecurityGroup: 'sg-00000000000000001' }, snapshot, workflowFiles: {},
    timeoutMs: 30 * 60_000 });
    const generator = join(root, id, 'generator');
    const verifier = join(root, id, 'verifier');
    await mkdir(generator, { recursive: true });
    await mkdir(verifier);
    await worker.generate({ assessmentId, paper, output: generator, paperSha256: lab.cases[0].paperSha256,
      guidance: lab.guidance.generator });
    await worker.reviewOnInstance({ assessmentId, paper, key, artifactDirectory: generator, output: verifier,
      guidance: lab.guidance.verifier, rubric: lab.cases[0].rubric, expected });
  }));

  const collisionDirectory = join(root, 'collision-case');
  const occupied = join(collisionDirectory, 'generator');
  await mkdir(occupied, { recursive: true });
  await writeFile(join(occupied, 'retained.json'), 'original evidence');
  await assert.rejects(chatgpt.generate({ assessmentId, paper, output: occupied, paperSha256: lab.cases[0].paperSha256,
    guidance: lab.guidance.generator }), { code: /^(EEXIST|ENOTEMPTY)$/ });
  assert.equal(await readFile(join(occupied, 'retained.json'), 'utf8'), 'original evidence');
  assert.deepEqual(JSON.parse(await readFile(join(collisionDirectory, 'ec2-generator/retrieved/case/generator/retained.json'), 'utf8')),
    { role: 'generator' });
});

test('Docker workers separate model authentication from case mounts and fail closed on a different Codex version', async t => {
  const lab = await fixture(t);
  const bin = join(dirname(lab.output), 'bin');
  const callsPath = join(bin, 'calls.jsonl');
  const versionPath = join(bin, 'version');
  const fixtureKey = 'fixture-isolated-model-key';
  await mkdir(bin);
  await writeFile(versionPath, 'codex-cli 0.171.0');
  await writeFile(join(bin, 'docker'), String.raw`#!${process.execPath}
const { appendFileSync, readFileSync, writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({ args, key: process.env.CODEX_API_KEY === ${JSON.stringify(fixtureKey)} }) + '\n');
if (args.at(-1) === '--version') console.log(readFileSync(${JSON.stringify(versionPath)}, 'utf8'));
if (args.includes('CODEX_API_KEY')) console.log('{"scorecard":true}');
if (args[0] === 'port') console.log('127.0.0.1:30123');
if (args.includes('--json')) {
  console.log(JSON.stringify({ type: 'turn.started' }));
  const item = { type: 'command_execution', command: "/bin/bash -lc 'python3 private-script.py'", aggregated_output: 'fixture-private-output' };
  console.log(JSON.stringify({ type: 'item.started', item }));
  console.log(JSON.stringify({ type: 'item.completed', item: { ...item, exit_code: 0 } }));
  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'fixture-private-message' } }));
  const mount = args.find(x => x.endsWith(',destination=/last-message'));
  if (mount) writeFileSync(mount.split(',')[1].slice('source='.length) + '/response', '{"scorecard":true}');
}
`, { mode: 0o700 });
  const originalPath = process.env.PATH;
  process.env.PATH = `${bin}:${originalPath}`;
  t.after(() => { process.env.PATH = originalPath; });

  const artifactDirectory = join(lab.output, 'generator');
  const output = join(lab.output, 'verifier');
  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(output);
  const { paperPath: paper, keyPath: key } = lab.cases[0];
  const workers = createContainerWorkers({ image: `sha256:${'a'.repeat(64)}`, snapshot: join(bin, 'skills'),
    workflowFiles: { generator: 'workflow.md', verifier: 'workflow.md' }, timeoutMs: 30_000, apiKey: fixtureKey });
  await workers.generate({ paper, output: artifactDirectory, guidance: {} });
  await workers.verify({ paper, key, artifactDirectory, output, guidance: {}, rubric: [] });
  assert.deepEqual(JSON.parse(await readFile(join(output, 'scorecard.json'), 'utf8')), { scorecard: true });

  const calls = async () => (await readFile(callsPath, 'utf8')).trim().split('\n').map(JSON.parse);
  const successful = await calls();
  const starts = successful.filter(({ args }) => args[0] === 'run');
  assert.equal(starts.length, 4);
  for (const [index, mode] of ['--yolo', '--sandbox'].entries()) {
    const [executor, client] = starts.slice(index * 2, index * 2 + 2);
    const executorName = executor.args[executor.args.indexOf('--name') + 1];
    assert.ok(executor.args.includes('exec-server'));
    assert.ok(executor.args.includes('--mount'));
    assert.equal(executor.key, false);
    assert.ok(!executor.args.includes('--env'));
    assert.ok(!client.args.includes('--mount'));
    assert.ok(client.args.includes(`container:${executorName}`));
    assert.ok(client.args.includes('CODEX_EXEC_SERVER_URL=ws://127.0.0.1:8745'));
    assert.ok(client.args.includes(mode));
    assert.ok(client.key);
  }
  const reviewMounts = starts[2].args.filter(arg => arg.startsWith('type=bind,'));
  assert.ok(reviewMounts.every(arg => arg.endsWith(',readonly')));

  await writeFile(versionPath, 'codex-cli 0.170.0');
  await assert.rejects(workers.generate({ paper, output: artifactDirectory, guidance: {} }), /Rebuild the batch image/);
  const failed = (await calls()).slice(successful.length);
  assert.equal(failed.filter(({ args }) => args[0] === 'run').length, 1);
  assert.ok(failed.every(({ key }) => !key));
  assert.equal(failed.filter(({ args }) => args[0] === 'rm').length, 2);

  await writeFile(versionPath, 'codex-cli 0.171.0');
  const workdir = '/private/tmp/jumpserve-codex-fixture';
  const served = await workers.serve({ role: 'generator', paper, output: artifactDirectory }, workdir);
  assert.equal(served.port, 30123);
  const service = (await calls()).find(({ args }) => args.includes(served.name) && args[0] === 'run');
  assert.ok(service.args.includes('127.0.0.1::8745'));
  assert.ok(service.args.includes(`type=bind,source=${artifactDirectory},destination=${workdir}`));
  assert.ok(!service.args.includes('--env'));
  assert.equal(service.key, false);

  const mountedHome = join(dirname(lab.output), 'credential-home');
  const volumeOutput = join(dirname(lab.output), 'volume-case', 'generator');
  await mkdir(mountedHome, { mode: 0o700 });
  await mkdir(volumeOutput, { recursive: true });
  const chatgptAuthDirectory = await realpath(mountedHome);
  const authFile = join(chatgptAuthDirectory, 'auth.json');
  await writeFile(authFile, '{"auth_mode":"chatgpt"}', { mode: 0o600 });
  const usingVolume = createContainerWorkers({ image: `sha256:${'a'.repeat(64)}`, snapshot: join(bin, 'skills'),
    workflowFiles: { generator: 'workflow.md' }, timeoutMs: 30_000, chatgptAuthDirectory });
  const beforeVolume = (await calls()).length;
  await usingVolume.generate({ paper, output: volumeOutput, guidance: {} });
  const volumeCalls = (await calls()).slice(beforeVolume);
  const [volumeExecutor, volumeClient] = volumeCalls.filter(({ args }) => args[0] === 'run');
  assert.ok(volumeExecutor.args.includes('exec-server'));
  assert.ok(volumeExecutor.args.every(arg => !arg.includes(chatgptAuthDirectory)));
  assert.ok(volumeClient.args.includes(`type=bind,source=${chatgptAuthDirectory},destination=/codex-credentials`));
  assert.ok(volumeClient.args.includes('CODEX_HOME=/codex-credentials'));
  assert.ok(volumeClient.args.includes('forced_login_method="chatgpt"'));
  assert.ok(volumeCalls.every(({ key, args }) => !key && !args.includes('CODEX_API_KEY')));
  await chmod(authFile, 0o644);
  await assert.rejects(usingVolume.generate({ paper, output: volumeOutput, guidance: {} }), /requires a private directory/);
  assert.equal((await calls()).length, beforeVolume + volumeCalls.length);

  await chmod(authFile, 0o600);
  const observedOutput = join(dirname(volumeOutput), 'verifier');
  await mkdir(observedOutput);
  const activity = [];
  const live = createContainerWorkers({ image: `sha256:${'a'.repeat(64)}`, snapshot: join(bin, 'skills'),
    workflowFiles: { generator: 'workflow.md', verifier: 'workflow.md' }, timeoutMs: 30_000, chatgptAuthDirectory,
    onActivity: event => activity.push(event) });
  await live.verify({ paper, key, artifactDirectory: volumeOutput, output: observedOutput, guidance: {}, rubric: [] });
  assert.deepEqual(activity, [
    { kind: 'codex_started' },
    { kind: 'turn_started' },
    { kind: 'command_started', program: 'python3' },
    { kind: 'command_completed', program: 'python3', exitCode: 0 },
  ]);
  assert.deepEqual(JSON.parse(await readFile(join(observedOutput, 'scorecard.json'), 'utf8')), { scorecard: true });
  assert.match(await readFile(join(dirname(observedOutput), 'verifier.log'), 'utf8'), /fixture-private-output/);
  const observedRuns = (await calls()).filter(({ args }) => args[0] === 'run').slice(-2);
  assert.ok(observedRuns[0].args.every(arg => !arg.includes('/last-message')));
  assert.ok(observedRuns[1].args.includes('--output-last-message'));
});

test('case-relative Verifier citations pass validation and save privately from a separate review directory', async t => {
  const lab = await fixture(t);
  const verificationId = '22459c11-9be3-44d2-9b39-a0cb96a0d09f';
  const trace = 'generator/evidence/fixture.csv';
  const citations = ['paper.pdf p. 1', `${trace} row 2`];
  const result = await runSyntheticBatch({ ...lab, cases: lab.cases.slice(0, 1),
    async generate(input) {
      await lab.generate(input);
      const evidence = join(input.output, 'evidence');
      await mkdir(evidence);
      await writeFile(join(evidence, 'fixture.csv'), 'trial,count\n1,42\n');
    },
    async verify(input) {
      assert.notEqual(input.output, input.caseDirectory);
      assert.equal(input.output, join(input.caseDirectory, 'verifier'));
      assert.equal(input.paper, join(input.caseDirectory, 'paper.pdf'));
      const prompt = verifierPrompt({ ...input, skillDirectory: '/skills/verifier', workflow: '/skills/verifier/workflow.md',
        assessment: join(input.artifactDirectory, 'jumpserve-assessment.json') });
      assert.ok(prompt.includes(`Use ${input.caseDirectory} as the base directory for every path in claims[].evidence.`));
      assert.match(prompt, /Use this base regardless of your working directory/);
      assert.match(prompt, /precise page, line, or row selectors/);
      assert.equal(await readFile(join(input.caseDirectory, trace), 'utf8'), 'trial,count\n1,42\n');
      await lab.score(input, 2, { claims: [correctClaim(citations)] });
    },
    persistence: {
      generator: async () => '09859c11-9be3-44d2-9b39-a0cb96a0d09f',
      verifier: async (_assessmentId, artifact, grade) => {
        assert.deepEqual(grade.claims[0].evidence, citations);
        assert.equal(grade.assessment_sha256, sha256(artifact));
        return verificationId;
      },
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.cases[0].database.verification_id, verificationId);

  for (const evidence of [`../${trace} row 2`, `/case/${trace} row 2`]) {
    const rejected = await fixture(t);
    const stopped = await runSyntheticBatch({ ...rejected, cases: rejected.cases.slice(0, 1),
      verify: input => rejected.score(input, 2, { claims: [correctClaim([evidence])] }),
      persistence: { generator: async () => '09859c11-9be3-44d2-9b39-a0cb96a0d09f',
        verifier: () => assert.fail('Invalid evidence reached the private save.') },
    });
    assert.equal(stopped.stop.phase, 'verifying');
    assert.equal(stopped.stop.reason, 'Use relative evidence references in the scorecard.');
    assert.equal(stopped.cases[0].database.verification_id, undefined);
  }
});

test('a failed database save stops the batch and keeps its assessment ID and local artifact', async t => {
  const lab = await fixture(t);
  const result = await runSyntheticBatch({ ...lab, verify: () => assert.fail('Verifier started before the save'),
    persistence: { generator: () => { throw new Error('Storage unavailable'); } } });
  assert.equal(result.stop.phase, 'saving_generator');
  assert.equal(result.stop.reason, 'Storage unavailable');
  assert.match(result.cases[0].database.assessment_id, /^[a-f0-9-]{36}$/);
  assert.equal(JSON.parse(await readFile(join(lab.output, 'A', 'generator', 'jumpserve-assessment.json'), 'utf8')).paper.title, 'Fixture A');
  assert.deepEqual(lab.calls, ['generate A']);
});

test('invalid scorecard and timed-out Generator both halt before the next paper', async t => {
  const lab = await fixture(t);
  const invalid = await runSyntheticBatch({ ...lab, verify: input => lab.score(input, 2, { answer_key_sha256: 'f'.repeat(64) }) });
  assert.equal(invalid.stop.paper_id, 'A');
  assert.match(invalid.stop.reason, /pinned paper, key/);
  const timeout = await runSyntheticBatch({ ...lab, output: `${lab.output}-timeout`,
    generate: () => { throw new Error('generator exited with ETIMEDOUT'); }, verify: () => assert.fail('Verifier started') });
  assert.equal(timeout.stop.phase, 'generating');
  assert.deepEqual(timeout.cases.map(item => item.status), ['stopped', 'pending', 'pending']);
});

test('format-only recovery retains the original grade and runs the remaining papers', async t => {
  for (const earned of [2, 1]) {
    const lab = await fixture(t);
    const controller = new AbortController();
    const legacy = await runSyntheticBatch({ ...lab, signal: controller.signal,
      generate({ signal, ...input }) {
        signal.throwIfAborted();
        return lab.generate(input);
      },
      async verify(input) {
        await lab.score(input, earned, { evidence_integrity: { status: 'verified', pdf_bytes_checked: false } });
        controller.abort(new Error('End the legacy fixture after the first paper.'));
      },
    });
    // Recreate the journal and raw output from a sequential run that stopped on the old format error.
    const first = legacy.cases[0];
    legacy.status = 'stopped';
    legacy.stop = { paper_id: 'A', phase: 'verifying', reason: first.verification_error };
    first.status = 'stopped';
    delete first.verification_error;
    await writeFile(join(lab.output, 'batch.json'), JSON.stringify(legacy));
    const savedPath = join(lab.output, 'A', 'verifier', 'scorecard.json');
    const saved = JSON.parse(await readFile(savedPath, 'utf8'));
    saved.evidence_integrity.pdf_bytes_checked = true;
    await writeFile(savedPath, JSON.stringify(saved));
    const recovery = { ...lab, recoverFormat: true, verify: input => lab.score(input, 1) };
    const result = await runSyntheticBatch(recovery);
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.cases.map(item => item.status), [earned === 2 ? 'passed' : 'completed', 'completed', 'completed']);
    assert.equal(result.format_recoveries[0].stop.paper_id, 'A');
    const validated = JSON.parse(await readFile(join(lab.output, 'A', 'verifier', 'scorecard.validated.json'), 'utf8'));
    assert.deepEqual(validated.score, saved.score);
    assert.deepEqual(lab.calls, [
      'generate A', 'preflight A', 'verify A', 'preflight A', 'generate B', 'preflight B', 'verify B',
      'generate C', 'preflight C', 'verify C',
    ]);
    assert.deepEqual(JSON.parse(await readFile(savedPath, 'utf8')), saved);
  }
});

test('only redundant successful preflight metadata can be omitted from a scorecard', async t => {
  const lab = await fixture(t);
  const result = await runSyntheticBatch({ ...lab, verify: input => lab.score(input, 2,
    { preflight: { exit_code: 0, pdf_bytes_checked: true } }) });
  assert.equal(result.status, 'passed');
  const rejected = await runSyntheticBatch({ ...lab, output: `${lab.output}-extra`, verify: input => lab.score(input, 2,
    { preflight: { exit_code: 0, pdf_bytes_checked: true, extra_failure: 'unrecognized evidence problem' } }) });
  assert.equal(rejected.status, 'completed');
  assert.ok(rejected.cases.every(item => item.status === 'verification_error' && item.score === undefined));
});
