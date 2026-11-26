import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { inventory, runSyntheticBatch, sha256 } from '../scripts/lib/jumpserve-synthetic-batch.mjs';

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
      claims: [{ key_claim_id: 'C1', assessment_claim_id: 'c1', reported_outcome: 'untested', supported_outcome: 'untested',
        assessment: 'correct', evidence: [], finding: 'The recorded outcome agrees.' }],
      rubric: [{ criterion: 'verdict', earned, maximum: 2, reason: 'Fixture score.' }],
      score: { earned, applicable_maximum: 2, rubric_maximum: 2 }, ...override,
    };
    await writeFile(join(output, 'scorecard.json'), JSON.stringify(grade));
  } };
}

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
  const result = await runSyntheticBatch({ ...lab, verify: input => lab.score(input, 1), persistence: {
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
  assert.equal(result.cases[0].database.verification_id, verificationId);
  assert.deepEqual(await journal(), result);
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
