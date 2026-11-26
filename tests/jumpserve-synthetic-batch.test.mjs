import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { BATCH_SKILLS, inventory, runSyntheticBatch, sha256, stageBatchGuidance, verifierPrompt } from '../scripts/lib/jumpserve-synthetic-batch.mjs';
import { createBatchProgressReporter } from '../scripts/lib/jumpserve-synthetic-progress.mjs';

const numberedGuidance = {
  generator: { source: 'bundled', sha256: 'c64477caf8d2f36e0a65ff7c445b8f146d01f128ab96672473d47cdd34a53f16' },
  verifier: { source: 'bundled', sha256: '8c41fd9eeaa0425bd7d88bfb25c3dc516bc775f4555407e497ec5aa1a862231c' },
};

function correctClaim(evidence = []) {
  return { key_claim_id: 'C1', assessment_claim_id: 'c1', reported_outcome: 'untested', supported_outcome: 'untested',
    assessment: 'correct', evidence, finding: 'The recorded outcome agrees.' };
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'jumpserve-batch-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const papers = join(root, 'pdfs');
  const keys = join(root, 'keys');
  for (const path of [papers, join(keys, 'development')]) await mkdir(path, { recursive: true });
  for (const id of ['A', 'B', 'C']) {
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
      assert.deepEqual(Object.keys(input).sort(), ['guidance', 'output', 'paper', 'paperSha256']);
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

test('a one-point loss halts the batch before the third Generator and persists that stop', async t => {
  const lab = await fixture(t);
  const options = { ...lab, verify: input => lab.score(input, input.key.includes(`${join('B', 'answer-key.json')}`) ? 1 : 2) };
  const result = await runSyntheticBatch(options);
  assert.equal(result.status, 'stopped');
  assert.equal(result.stop.paper_id, 'B');
  assert.deepEqual(result.cases.map(item => item.status), ['passed', 'stopped', 'pending']);
  assert.equal(result.cases[1].score.earned, 1);
  assert.deepEqual(lab.calls, ['generate A', 'preflight A', 'verify A', 'generate B', 'preflight B', 'verify B']);
  assert.deepEqual(JSON.parse(await readFile(join(lab.output, 'batch.json'))), result);
  await assert.rejects(runSyntheticBatch(options), { code: 'EEXIST' });
  assert.equal(lab.calls.length, 6);
});

test('a substituted rubric criterion cannot pass even when the totals are perfect', async t => {
  const lab = await fixture(t);
  const result = await runSyntheticBatch({ ...lab, verify: input => lab.score(input, 2,
    { rubric: [{ criterion: 'different', earned: 2, maximum: 2, reason: 'Fixture replacement.' }] }) });
  assert.equal(result.status, 'stopped');
  assert.equal(result.stop.paper_id, 'A');
  assert.deepEqual(lab.calls, ['generate A', 'preflight A', 'verify A']);
});

test('the batch persists both result IDs before stopping on a below-perfect grade', async t => {
  const lab = await fixture(t);
  const generatorId = '09859c11-9be3-44d2-9b39-a0cb96a0d09f';
  const verificationId = '22459c11-9be3-44d2-9b39-a0cb96a0d09f';
  const journal = () => readFile(join(lab.output, 'batch.json'), 'utf8').then(JSON.parse);
  const progress = [];
  const result = await runSyntheticBatch({ ...lab, progress: (...args) => progress.push(args), verify: input => lab.score(input, 1), persistence: {
    generator: async (assessmentId, paper, bundle) => {
      assert.equal((await journal()).cases[0].database.assessment_id, assessmentId);
      assert.equal(bundle.paper.sha256, sha256(await readFile(paper)));
      lab.calls.push('save generator');
      return generatorId;
    },
    verifier: async (assessmentId, artifact, grade) => {
      assert.deepEqual((await journal()).cases[0].database, { assessment_id: assessmentId, generator_result_id: generatorId });
      assert.equal(grade.assessment_sha256, sha256(artifact));
      assert.equal(grade.score.earned, 1);
      lab.calls.push('save verifier');
      return verificationId;
    },
  } });
  assert.deepEqual(lab.calls, ['generate A', 'save generator', 'preflight A', 'verify A', 'save verifier']);
  assert.deepEqual(result.cases.map(item => item.status), ['stopped', 'pending', 'pending']);
  const assessmentId = result.cases[0].database.assessment_id;
  assert.match(assessmentId, /^[a-f0-9-]{36}$/);
  assert.deepEqual(progress, [['A', 'generating', 'A.pdf', assessmentId], ['A', 'verifying', 'A.pdf', assessmentId]]);
  assert.equal(result.cases[0].database.verification_id, verificationId);
  assert.deepEqual(await journal(), result);
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

test('format-only recovery validates the original grade and never regrades or passes over a loss', async t => {
  for (const earned of [2, 1]) {
    const lab = await fixture(t);
    await runSyntheticBatch({ ...lab, verify: input => lab.score(input, earned,
      { evidence_integrity: { status: 'verified', pdf_bytes_checked: false } }) });
    // Emulate the raw output from a run using the strict, earlier reader.
    const savedPath = join(lab.output, 'A', 'verifier', 'scorecard.json');
    const saved = JSON.parse(await readFile(savedPath, 'utf8'));
    saved.evidence_integrity.pdf_bytes_checked = true;
    await writeFile(savedPath, JSON.stringify(saved));
    const recovery = { ...lab, recoverFormat: true, verify: input => lab.score(input, 1) };
    if (earned === 2) {
      const result = await runSyntheticBatch(recovery);
      assert.deepEqual(result.cases.map(item => item.status), ['passed', 'stopped', 'pending']);
      assert.equal(result.format_recoveries[0].stop.paper_id, 'A');
      const validated = JSON.parse(await readFile(join(lab.output, 'A', 'verifier', 'scorecard.validated.json'), 'utf8'));
      assert.deepEqual(validated.score, saved.score);
      assert.deepEqual(lab.calls, ['generate A', 'preflight A', 'verify A', 'preflight A', 'generate B', 'preflight B', 'verify B']);
    } else {
      await assert.rejects(runSyntheticBatch(recovery), /did not validate as perfect/);
      assert.deepEqual(lab.calls, ['generate A', 'preflight A', 'verify A', 'preflight A']);
    }
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
  assert.equal(rejected.status, 'stopped');
  assert.equal(rejected.stop.paper_id, 'A');
});
