import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareAssessmentBundle } from '../../lib/jumpserve-assessment-bundle.ts';
import { MAX_REVIEWED_ASSESSMENT_BYTES, prepareVerifierResult } from '../../lib/jumpserve-verification.ts';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const digest = /^[a-f0-9]{64}$/;
const recoverableFormats = new Set(['/evidence_integrity', '/']
  .map(path => `Scorecard does not match jumpserve-verifier-scorecard-v1 at ${path}.`));

function fullRubric(key) {
  if (Array.isArray(key.rubric?.assertions)) return key.rubric.assertions.map(({ id, points }) => [id, points]);
  const rule = key.rubric?.original_rules;
  if (!rule) throw new Error('Answer key has no rubric.');
  if (rule.categories) return Object.entries(rule.categories);
  return Object.entries(rule).filter(([id]) => !['maximum', 'maximum_score', 'total_points'].includes(id))
    .flatMap(([id, value]) => Number.isSafeInteger(value) ? [[id, value]] :
      (/_\d+$/.test(id) ? [[id, Number(id.split('_').at(-1))]] : []));
}

export async function inventory(papersDirectory, keysDirectory) {
  const keys = new Map();
  for (const directory of ['development', 'held-out']) {
    const split = directory === 'held-out' ? 'held_out' : directory;
    const entries = await readdir(join(keysDirectory, directory), { withFileTypes: true }).catch(error => {
      if (directory === 'held-out' && error.code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of entries) {
      if (!entry.name.endsWith('.json')) continue;
      if (!entry.isFile()) throw new Error(`Answer key must be a regular file (${entry.name}).`);
      const path = join(keysDirectory, directory, entry.name);
      const raw = await readFile(path);
      const key = JSON.parse(raw);
      const claimIds = (key.claims ?? [key.claim]).map(claim => claim?.id);
      if (key.schema_version !== 1 || key.split !== split || !identifier.test(key.paper_id ?? '') ||
          !digest.test(key.paper?.sha256 ?? '') || !claimIds.length ||
          claimIds.some(id => typeof id !== 'string' || !identifier.test(id)) || new Set(claimIds).size !== claimIds.length) {
        throw new Error(`Invalid benchmark key metadata (${entry.name}).`);
      }
      if (keys.has(key.paper.sha256)) throw new Error(`Multiple keys match a paper (${entry.name}).`);
      const rubric = fullRubric(key);
      const rubricMaximum = rubric.reduce((total, [, points]) => total + points, 0);
      if (!rubric.length || new Set(rubric.map(([id]) => id)).size !== rubric.length ||
          rubric.some(([id, points]) => typeof id !== 'string' || !identifier.test(id) || !Number.isSafeInteger(points) || points <= 0) ||
          (key.rubric.maximum !== undefined && key.rubric.maximum !== rubricMaximum)) {
        throw new Error(`Invalid full rubric (${entry.name}).`);
      }
      keys.set(key.paper.sha256, { paperId: key.paper_id, split, keyPath: path, keySha256: sha256(raw),
        claimIds, rubricMaximum, rubric });
    }
  }

  const ids = new Set();
  const cases = [];
  const papers = await readdir(papersDirectory, { withFileTypes: true });
  for (const entry of papers.filter(item => item.name.endsWith('.pdf')).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (!entry.isFile()) throw new Error(`PDF must be a regular file (${entry.name}).`);
    const paperPath = join(papersDirectory, entry.name);
    const paperSha256 = sha256(await readFile(paperPath));
    const key = keys.get(paperSha256);
    if (!key) throw new Error(`No answer key matches ${entry.name} by SHA-256.`);
    if (ids.has(key.paperId)) throw new Error(`Duplicate paper ID (${key.paperId}).`);
    ids.add(key.paperId);
    cases.push({ ...key, paperName: entry.name, paperPath, paperSha256 });
  }
  if (!cases.length) throw new Error('No synthetic PDFs found.');
  return cases;
}

async function readArtifact(file, limit) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error('Expected a bounded regular output file.');
    const bytes = await handle.readFile();
    if (bytes.length > limit) throw new Error('Output exceeded its size limit.');
    return bytes.toString('utf8');
  } finally {
    await handle.close();
  }
}

async function stageInput(input, expectedHash, path) {
  const bytes = await readFile(input);
  if (sha256(bytes) !== expectedHash) throw new Error('A batch input changed after inventory.');
  await writeFile(path, bytes, { flag: 'wx', mode: 0o644 });
}

function requireGuidance(actual, pinned) {
  if (!actual || actual.source !== pinned.source || actual.sha256 !== pinned.sha256) {
    throw new Error('Output does not identify the pinned skill guidance.');
  }
}

function reviewInputs(paperDirectory, guidance, rubric) {
  return { paper: join(paperDirectory, 'paper.pdf'), key: join(paperDirectory, 'answer-key.json'),
    artifactDirectory: join(paperDirectory, 'generator'), output: join(paperDirectory, 'verifier'), guidance, rubric };
}

async function checkedArtifact(testCase, review, guidance) {
  const artifact = await readArtifact(join(review.artifactDirectory, 'jumpserve-assessment.json'), MAX_REVIEWED_ASSESSMENT_BYTES);
  const { bundle } = prepareAssessmentBundle(JSON.parse(artifact));
  if (bundle.paper.sha256 !== testCase.paperSha256) throw new Error('Generator artifact is for a different PDF.');
  requireGuidance(bundle.skill_instructions, guidance);
  return artifact;
}

async function checkedPreflight(testCase, artifact, review, preflight) {
  const result = await preflight(review);
  if (result.pdf_bytes_checked !== true || result.paper_id !== testCase.paperId ||
      result.paper_sha256 !== testCase.paperSha256 || result.answer_key_sha256 !== testCase.keySha256 ||
      result.assessment_sha256 !== sha256(artifact) || result.mode !== 'fresh' ||
      result.evidence_integrity.status !== 'verified') throw new Error('Independent evidence preflight did not verify the exact inputs.');
  return result;
}

async function readGrade(review, preflight) {
  const grade = JSON.parse(await readArtifact(join(review.output, 'scorecard.json'), 90_000));
  let corrected = false;
  if (preflight.pdf_bytes_checked === true) {
    // These flags duplicate the successful trusted preflight and are kept in the raw output.
    if (grade?.evidence_integrity?.pdf_bytes_checked === true) {
      delete grade.evidence_integrity.pdf_bytes_checked;
      corrected = true;
    }
    if (grade?.preflight?.exit_code === 0 && grade.preflight.pdf_bytes_checked === true &&
        Object.keys(grade.preflight).length === 2) {
      delete grade.preflight;
      corrected = true;
    }
  }
  return { grade, corrected };
}

async function saveCorrectedGrade(review, grade) {
  await writeFile(join(review.output, 'scorecard.validated.json'), JSON.stringify(grade, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
}

function perfectScore(testCase, artifact, grade, preflight, pinned) {
  const { scorecard } = prepareVerifierResult(artifact, grade);
  requireGuidance(scorecard.skill_instructions, pinned);
  if (scorecard.paper_id !== testCase.paperId || scorecard.split !== testCase.split ||
      scorecard.answer_key_sha256 !== testCase.keySha256 || scorecard.mode !== 'fresh' ||
      scorecard.assessment_sha256 !== preflight.assessment_sha256 ||
      scorecard.evidence_integrity.status !== preflight.evidence_integrity.status ||
      scorecard.evidence_integrity.verified_runs !== preflight.evidence_integrity.verified_runs ||
      testCase.claimIds.length !== scorecard.claims.length ||
      !testCase.claimIds.every(id => scorecard.claims.some(claim => claim.key_claim_id === id))) {
    throw new Error('Scorecard does not match the pinned paper, key, or evidence preflight.');
  }
  const score = scorecard.score;
  return { score, perfect: scorecard.status === 'scored' && scorecard.evidence_integrity.status === 'verified' &&
    !scorecard.blockers.length && !scorecard.critical_failures.length &&
    score !== null && score.rubric_maximum === testCase.rubricMaximum &&
    score.earned === score.applicable_maximum && score.earned === score.rubric_maximum &&
    scorecard.rubric.length === testCase.rubric.length && testCase.rubric.every(([id, points]) =>
      scorecard.rubric.some(item => item.criterion === id && item.maximum === points && item.earned === points)) &&
    scorecard.claims.every(claim => claim.assessment === 'correct') };
}

async function runBatch({ output, cases, guidance, runtime, generate, preflight, verify, persistence, recoverFormat = false, progress = () => {} }) {
  const statePath = join(output, 'batch.json');
  const plan = cases.map(item => ({ paper_id: item.paperId, pdf: item.paperName, paper_sha256: item.paperSha256,
    answer_key_sha256: item.keySha256, split: item.split, rubric_maximum: item.rubricMaximum, status: 'pending' }));
  const state = recoverFormat ? JSON.parse(await readArtifact(statePath, 256_000)) :
    { mode: 'fresh', status: 'running', started_at: new Date().toISOString(), guidance, runtime, cases: plan };
  const persist = async () => {
    const temporary = `${statePath}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, statePath);
  };
  async function saveGenerator(item, paper, artifact) {
    if (!persistence || item.database?.generator_result_id) return;
    item.database ??= { assessment_id: randomUUID() };
    await persist();
    item.database.generator_result_id = await persistence.generator(item.database.assessment_id, paper, JSON.parse(artifact));
    await persist();
  }
  async function saveVerifier(item, artifact, grade) {
    if (!persistence || item.database?.verification_id) return;
    item.database.verification_id = await persistence.verifier(item.database.assessment_id, artifact, grade);
    await persist();
  }

  let firstIndex = 0;
  if (recoverFormat) {
    const index = state.cases.findIndex(item => item.paper_id === state.stop?.paper_id);
    if (state.mode !== 'fresh' || state.status !== 'stopped' || state.stop?.phase !== 'verifying' ||
        !recoverableFormats.has(state.stop.reason) || index < 0 || state.cases.length !== plan.length ||
        JSON.stringify(state.runtime) !== JSON.stringify(runtime) || JSON.stringify(state.guidance) !== JSON.stringify(guidance) ||
        !plan.every((item, offset) => Object.entries(item).every(([key, value]) => key === 'status'
          ? state.cases[offset].status === (offset < index ? 'passed' : offset === index ? 'stopped' : 'pending')
          : state.cases[offset][key] === value))) {
      throw new Error('Only a stopped scorecard with the known preflight-field error and the original batch inputs can be recovered.');
    }
    const testCase = cases[index];
    const review = reviewInputs(join(output, testCase.paperId), guidance.verifier, testCase.rubric);
    const artifact = await checkedArtifact(testCase, review, guidance.generator);
    const checked = await checkedPreflight(testCase, artifact, review, preflight);
    const { grade, corrected } = await readGrade(review, checked);
    const { score, perfect } = perfectScore(testCase, artifact, grade, checked, guidance.verifier);
    if (!corrected || !perfect) throw new Error('The saved scorecard did not validate as perfect after the format correction.');
    await saveGenerator(state.cases[index], review.paper, artifact);
    await saveVerifier(state.cases[index], artifact, grade);
    await saveCorrectedGrade(review, grade);
    state.format_recoveries = [...(state.format_recoveries ?? (state.format_recovery ? [state.format_recovery] : [])),
      { stop: state.stop, stopped_at: state.finished_at, recovered_at: new Date().toISOString() }];
    delete state.format_recovery;
    delete state.stop;
    delete state.finished_at;
    state.status = 'running';
    Object.assign(state.cases[index], { status: 'passed', score });
    firstIndex = index + 1;
    progress(testCase.paperId, 'passed (revalidated saved scorecard)');
  } else {
    // An existing output directory belongs to the previous attempt, including a recorded stop.
    await mkdir(output, { mode: 0o700 });
  }
  await persist();
  for (let index = firstIndex; index < cases.length; index++) {
    const testCase = cases[index];
    const item = state.cases[index];
    const paperDirectory = join(output, testCase.paperId);
    const review = reviewInputs(paperDirectory, guidance.verifier, testCase.rubric);
    let phase = 'generating';
    try {
      item.status = phase;
      await persist();
      progress(item.paper_id, phase);
      await mkdir(paperDirectory, { mode: 0o700 });
      await mkdir(review.artifactDirectory, { mode: 0o700 });
      await stageInput(testCase.paperPath, testCase.paperSha256, review.paper);
      await generate({ paper: review.paper, output: review.artifactDirectory, paperSha256: testCase.paperSha256, guidance: guidance.generator });
      const artifact = await checkedArtifact(testCase, review, guidance.generator);
      phase = 'saving_generator';
      await saveGenerator(item, review.paper, artifact);

      phase = 'verifying';
      item.status = phase;
      await persist();
      progress(item.paper_id, phase);
      await mkdir(review.output, { mode: 0o700 });
      await stageInput(testCase.keyPath, testCase.keySha256, review.key);
      const checked = await checkedPreflight(testCase, artifact, review, preflight);

      await verify(review);
      const { grade, corrected } = await readGrade(review, checked);
      const { score, perfect } = perfectScore(testCase, artifact, grade, checked, guidance.verifier);
      if (corrected) await saveCorrectedGrade(review, grade);
      item.score = score;
      phase = 'saving_verifier';
      await persist();
      await saveVerifier(item, artifact, grade);
      phase = 'verifying';
      if (!perfect) throw new Error(score
        ? `Verifier gate did not pass (${score.earned}/${score.rubric_maximum}; expected ${testCase.rubricMaximum}/${testCase.rubricMaximum}).`
        : 'Verifier did not award a score.');
      item.status = 'passed';
      await persist();
      progress(item.paper_id, 'passed');
    } catch (error) {
      item.status = 'stopped';
      state.status = 'stopped';
      state.stop = { paper_id: item.paper_id, phase, reason: error instanceof Error ? error.message : String(error) };
      state.finished_at = new Date().toISOString();
      await persist();
      return state;
    }
  }
  state.status = 'passed';
  state.finished_at = new Date().toISOString();
  await persist();
  return state;
}

export async function runSyntheticBatch(options) {
  if (!options.recoverFormat) return runBatch(options);
  const lock = join(options.output, '.format-recovery.lock');
  const handle = await open(lock, 'wx', 0o600);
  try {
    return await runBatch(options);
  } finally {
    await handle.close();
    await unlink(lock);
  }
}
