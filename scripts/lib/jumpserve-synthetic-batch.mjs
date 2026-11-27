import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { cp, mkdir, open, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareAssessmentBundle } from '../../lib/jumpserve-assessment-bundle.ts';
import { MAX_REVIEWED_ASSESSMENT_BYTES, prepareVerifierResult, VerifierScorecardFormatError } from '../../lib/jumpserve-verification.ts';
import { isResearchId } from '../../lib/research-experiment-queue.ts';
import { BATCH_SKILLS, batchCasePaths, requireReviewPreflight } from './jumpserve-synthetic-worker-inputs.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const identifier = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const digest = /^[a-f0-9]{64}$/;
const recoverableFormats = new Set(['/evidence_integrity', '/']
  .map(path => `Scorecard does not match jumpserve-verifier-scorecard-v1 at ${path}.`));

export async function stageBatchGuidance({ skillsDirectory, snapshot, published, previous }) {
  const guidance = {};
  const workflowFiles = {};
  for (const [role, directory] of Object.entries(BATCH_SKILLS)) {
    const staged = join(snapshot, directory);
    const revision = previous ? previous[role] : published?.[role];
    const isPublished = published !== undefined || revision?.source === 'supabase';
    const bundledFile = 'references/workflow.md';
    let workflowFile = isPublished ? 'published-workflow.md' : bundledFile;
    if (!previous) {
      await cp(join(skillsDirectory, directory), staged, { recursive: true, errorOnExist: true, force: false });
      if (isPublished) {
        if (revision?.role !== role || typeof revision.instructions !== 'string' || !revision.instructions.trim() ||
            Buffer.byteLength(revision.instructions) > 24_000) {
          throw new Error(`Invalid published ${role} workflow.`);
        }
        await writeFile(join(staged, workflowFile), revision.instructions, { flag: 'wx', mode: 0o600 });
      }
    }
    const bytes = await readFile(join(staged, workflowFile)).catch(error => {
      // Early published snapshots used the bundled path for the pinned bytes.
      if (!previous || !isPublished || error.code !== 'ENOENT') throw error;
      workflowFile = bundledFile;
      return readFile(join(staged, workflowFile));
    });
    const checksum = sha256(bytes);
    if (isPublished) {
      if (revision.sha256 !== checksum || !isResearchId(revision.version_id) ||
          !Number.isSafeInteger(revision.version_number) || revision.version_number < 1) {
        throw new Error(`Could not verify the pinned ${role} workflow.`);
      }
      guidance[role] = { source: 'supabase', version_id: revision.version_id, sha256: checksum, version_number: revision.version_number };
    } else {
      guidance[role] = { source: 'bundled', sha256: checksum };
    }
    workflowFiles[role] = workflowFile;
  }
  return { guidance, workflowFiles };
}

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
  if (!actual || actual.source !== pinned.source || actual.sha256 !== pinned.sha256 || actual.version_id !== pinned.version_id) {
    throw new Error('Output does not identify the pinned skill guidance.');
  }
}

function artifactGuidance({ source, version_id, sha256 }) {
  return source === 'supabase' ? { source, version_id, sha256 } : { source, sha256 };
}

function reviewInputs(caseDirectory, guidance, rubric) {
  return { ...batchCasePaths(caseDirectory), guidance, rubric };
}

async function checkedArtifact(testCase, review, guidance) {
  const artifact = await readArtifact(join(review.artifactDirectory, 'jumpserve-assessment.json'), MAX_REVIEWED_ASSESSMENT_BYTES);
  const { bundle } = prepareAssessmentBundle(JSON.parse(artifact));
  if (bundle.paper.sha256 !== testCase.paperSha256) throw new Error('Generator artifact is for a different PDF.');
  requireGuidance(bundle.skill_instructions, guidance);
  return artifact;
}

async function checkedPreflight(testCase, artifact, review, preflight) {
  const expected = { paper_id: testCase.paperId, paper_sha256: testCase.paperSha256,
    answer_key_sha256: testCase.keySha256, assessment_sha256: sha256(artifact) };
  return requireReviewPreflight(await preflight(review, expected), expected);
}

async function readGrade(review, preflight) {
  const raw = await readArtifact(join(review.output, 'scorecard.json'), 90_000);
  let grade;
  try {
    grade = JSON.parse(raw);
  } catch (error) {
    throw new VerifierScorecardFormatError('Could not parse the Verifier scorecard JSON.', { cause: error });
  }
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

function evaluateScorecard(testCase, artifact, grade, preflight, pinned) {
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
  if (!score) return { score, problem: 'Verifier did not award a score.' };
  if (scorecard.status !== 'scored' || scorecard.evidence_integrity.status !== 'verified' ||
      scorecard.blockers.length || scorecard.critical_failures.length) {
    return { score, problem: 'Verifier could not complete scoring with verified evidence.' };
  }
  if (score.rubric_maximum !== testCase.rubricMaximum || scorecard.rubric.length !== testCase.rubric.length ||
      !testCase.rubric.every(([id, points]) => scorecard.rubric.some(item => item.criterion === id && item.maximum === points))) {
    return { score, problem: 'Scorecard does not match the pinned rubric.' };
  }
  const fullCredit = score.earned === score.applicable_maximum && score.earned === score.rubric_maximum &&
    scorecard.rubric.every(item => item.earned === item.maximum) &&
    scorecard.claims.every(claim => claim.assessment === 'correct');
  return { score, status: fullCredit ? 'passed' : 'completed' };
}

async function runBatch({ output, cases, guidance, runtime, generate, preflight, verify, reviewOnInstance,
  workerPool = [{ generate, preflight, verify, reviewOnInstance }], persistence, recoverFormat = false,
  signal: externalSignal, progress = () => {},
  now = () => performance.now() }) {
  if (!workerPool.length) throw new Error('A synthetic batch requires at least one worker.');
  const parallel = workerPool.length > 1;
  if (parallel && recoverFormat) throw new Error('Format recovery requires the original sequential batch.');
  const controller = new AbortController();
  const signal = externalSignal ? AbortSignal.any([externalSignal, controller.signal]) : controller.signal;
  const workerCancellation = parallel || externalSignal ? { signal } : {};
  let stop;
  const statePath = join(output, 'batch.json');
  const generatorGuidance = artifactGuidance(guidance.generator);
  const verifierGuidance = artifactGuidance(guidance.verifier);
  const plan = cases.map(item => ({ paper_id: item.paperId, pdf: item.paperName, paper_sha256: item.paperSha256,
    answer_key_sha256: item.keySha256, split: item.split, rubric_maximum: item.rubricMaximum }));
  const state = recoverFormat ? JSON.parse(await readArtifact(statePath, 256_000)) :
    { mode: 'fresh', status: 'running', started_at: new Date().toISOString(), guidance, runtime,
      cases: plan.map(item => ({ ...item, status: 'pending', steps: {} })) };
  let journalWrites = Promise.resolve();
  const persist = () => {
    const snapshot = JSON.stringify(state, null, 2) + '\n';
    const temporary = `${statePath}.tmp`;
    const write = journalWrites.then(async () => {
      await writeFile(temporary, snapshot, { mode: 0o600 });
      await rename(temporary, statePath);
    });
    journalWrites = write.catch(() => {});
    return write;
  };
  const reportProgress = (item, phase) => progress(item.paper_id, phase, item.pdf, item.database?.assessment_id);
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
        !plan.every((item, offset) => {
          const previous = state.cases[offset];
          const validStatuses = offset < index ? ['passed', 'completed'] : [offset === index ? 'stopped' : 'pending'];
          return validStatuses.includes(previous.status) && Object.entries(item).every(([key, value]) => previous[key] === value);
        })) {
      throw new Error('Only a stopped scorecard with the known preflight-field error and the original batch inputs can be recovered.');
    }
    const testCase = cases[index];
    const review = reviewInputs(join(output, testCase.paperId), verifierGuidance, testCase.rubric);
    const artifact = await checkedArtifact(testCase, review, generatorGuidance);
    const checked = await checkedPreflight(testCase, artifact, review, workerPool[0].preflight);
    const { grade, corrected } = await readGrade(review, checked);
    const { score, status, problem } = evaluateScorecard(testCase, artifact, grade, checked, verifierGuidance);
    if (!corrected) throw new Error('The saved scorecard did not contain the expected format error.');
    if (problem) throw new Error(problem);
    await saveGenerator(state.cases[index], review.paper, artifact);
    await saveVerifier(state.cases[index], artifact, grade);
    await saveCorrectedGrade(review, grade);
    state.format_recoveries = [...(state.format_recoveries ?? (state.format_recovery ? [state.format_recovery] : [])),
      { stop: state.stop, stopped_at: state.finished_at, recovered_at: new Date().toISOString() }];
    delete state.format_recovery;
    delete state.stop;
    delete state.finished_at;
    state.status = 'running';
    Object.assign(state.cases[index], { status, score });
    firstIndex = index + 1;
    reportProgress(state.cases[index], `${status} (revalidated saved scorecard)`);
  } else {
    // An existing output directory belongs to the previous attempt, including a recorded stop.
    await mkdir(output, { mode: 0o700 });
  }
  await persist();
  async function runPaper(index, { generate, preflight, verify, reviewOnInstance }) {
    const testCase = cases[index];
    const item = state.cases[index];
    const paperDirectory = join(output, testCase.paperId);
    const review = reviewInputs(paperDirectory, verifierGuidance, testCase.rubric);
    let phase = 'generating';
    let step;
    function startStep(role) {
      step = { role, startedAt: now() };
      item.steps ??= {};
      item.steps[role] = { status: 'running', durationMs: null };
    }
    function finishStep(status) {
      if (!step) return;
      item.steps[step.role] = { status, durationMs: Math.round(now() - step.startedAt) };
      step = undefined;
    }
    try {
      signal.throwIfAborted();
      item.status = phase;
      startStep('generator');
      if (persistence) item.database ??= { assessment_id: randomUUID() };
      await persist();
      reportProgress(item, phase);
      await mkdir(paperDirectory, { mode: 0o700 });
      await mkdir(review.artifactDirectory, { mode: 0o700 });
      await stageInput(testCase.paperPath, testCase.paperSha256, review.paper);
      signal.throwIfAborted();
      await generate({ assessmentId: item.database?.assessment_id, paper: review.paper, output: review.artifactDirectory,
        paperSha256: testCase.paperSha256, guidance: generatorGuidance, ...workerCancellation });
      const artifact = await checkedArtifact(testCase, review, generatorGuidance);
      phase = 'saving_generator';
      await saveGenerator(item, review.paper, artifact);
      finishStep('completed');

      signal.throwIfAborted();
      phase = 'verifying';
      item.status = phase;
      startStep('verifier');
      await persist();
      reportProgress(item, phase);
      await mkdir(review.output, { mode: 0o700 });
      await stageInput(testCase.keyPath, testCase.keySha256, review.key);
      signal.throwIfAborted();
      const checked = await checkedPreflight(testCase, artifact, review, reviewOnInstance
        ? (input, expected) => reviewOnInstance({ ...input, expected, assessmentId: item.database?.assessment_id, ...workerCancellation })
        : preflight);
      if (!reviewOnInstance) {
        signal.throwIfAborted();
        await verify({ ...review, ...workerCancellation });
      }
      let result;
      try {
        const { grade, corrected } = await readGrade(review, checked);
        result = { grade, corrected, ...evaluateScorecard(testCase, artifact, grade, checked, verifierGuidance) };
      } catch (error) {
        if (!(error instanceof VerifierScorecardFormatError)) throw error;
        item.status = 'verification_error';
        item.verification_error = error.message;
        finishStep('stopped');
        await persist();
        reportProgress(item, 'verification error');
        return;
      }
      const { grade, corrected, score, status, problem } = result;
      if (corrected) await saveCorrectedGrade(review, grade);
      item.score = score;
      phase = 'saving_verifier';
      await persist();
      await saveVerifier(item, artifact, grade);
      finishStep('completed');
      phase = 'verifying';
      if (problem) throw new Error(problem);
      item.status = status;
      await persist();
      reportProgress(item, status);
    } catch (error) {
      if (signal.aborted && error === signal.reason) {
        item.status = 'interrupted';
      } else {
        item.status = 'stopped';
        if (!stop) {
          stop = { paper_id: item.paper_id, phase, reason: error instanceof Error ? error.message : String(error) };
          controller.abort(new Error('Another paper stopped the batch.'));
        }
      }
      finishStep(item.status);
      if (parallel) reportProgress(item, item.status);
      await persist();
    }
  }

  let nextIndex = firstIndex;
  async function runWorker(worker) {
    while (!signal.aborted && nextIndex < cases.length) {
      const index = nextIndex++;
      await runPaper(index, worker);
    }
  }

  if (parallel) {
    const outcomes = await Promise.allSettled(workerPool.map(runWorker));
    const rejected = outcomes.find(outcome => outcome.status === 'rejected');
    if (rejected) throw rejected.reason;
  } else {
    await runWorker(workerPool[0]);
  }
  const completionStatus = state.cases.every(item => item.status === 'passed') ? 'passed' : 'completed';
  state.status = stop ? 'stopped' : signal.aborted ? 'interrupted' : completionStatus;
  if (stop) state.stop = stop;
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
