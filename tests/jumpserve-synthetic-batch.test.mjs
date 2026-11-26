import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { inventory, runSyntheticBatch, sha256, stageBatchGuidance } from '../scripts/lib/jumpserve-synthetic-batch.mjs';
import { BATCH_SKILLS, verifierPrompt } from '../scripts/lib/jumpserve-synthetic-worker-inputs.mjs';
import { createBatchProgressReporter } from '../scripts/lib/jumpserve-synthetic-progress.mjs';
import { createEc2Workers } from '../scripts/lib/jumpserve-synthetic-ec2.mjs';
import { createContainerWorkers } from '../scripts/lib/jumpserve-synthetic-containers.mjs';

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

test('instance review gets the saved Generator inputs and finishes before the score gate', async t => {
  const lab = await fixture(t);
  const assessmentIds = [];
  const generatorId = '09859c11-9be3-44d2-9b39-a0cb96a0d09f';
  const verificationId = '22459c11-9be3-44d2-9b39-a0cb96a0d09f';
  const result = await runSyntheticBatch({ ...lab,
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
  assert.deepEqual(result.cases.map(item => item.status), ['stopped', 'pending', 'pending']);
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
assert.equal(readFileSync(0, 'utf8').trim(), auth === 'chatgpt' ? '' : 'fixture-model-key');
assert.equal(process.env.JUMPSERVE_BATCH_CODEX_API_KEY, undefined);
assert.equal(process.env.CODEX_ACCESS_TOKEN, undefined);
assert.ok(!existsSync(join(payload, 'session.json')));
if (auth === 'chatgpt') {
  const session = JSON.parse(readFileSync(join(stage, 'session.json'), 'utf8'));
  assert.equal(session.command[0], 'codex');
  assert.ok(session.command.includes(role === 'generator' ? '--yolo' : 'read-only'));
  assert.match(session.prompt, /Follow the JumpServe/);
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
