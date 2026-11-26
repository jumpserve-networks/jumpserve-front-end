import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { inventory, runSyntheticBatch, sha256 } from './lib/jumpserve-synthetic-batch.mjs';
import { createContainerWorkers, inspectBatchImage } from './lib/jumpserve-synthetic-containers.mjs';
import { createNativeWorkers, inspectNativeBatch } from './lib/jumpserve-synthetic-native.mjs';
import { privateResultsClient } from './jumpserve-assessment.mjs';
import { isVerifierVersion } from '../lib/jumpserve-verification.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const skills = { generator: 'jumpserve-paper-assessment', verifier: 'jumpserve-assessment-verifier' };

async function main() {
  const { values } = parseArgs({ options: {
    inventory: { type: 'boolean' }, 'check-runtime': { type: 'boolean' }, native: { type: 'boolean' },
    'recover-format': { type: 'boolean' }, output: { type: 'string' },
    'coach-report': { type: 'string' },
    image: { type: 'string', default: 'jumpserve-synthetic-batch:local' },
    'timeout-minutes': { type: 'string', default: '30' }, model: { type: 'string' }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('npm run eval:synthetic-batch -- [--inventory | --check-runtime | --coach-report <report.json>] [--native] [--output <dir>] [--image <local-image>] [--timeout-minutes <minutes>] [--model <model>] [--recover-format]');
    return;
  }
  if (values['coach-report']) {
    if (values.inventory || values['check-runtime'] || values['recover-format']) throw new Error('Run Coach report saving as a separate operation.');
    const report = JSON.parse(await readFile(values['coach-report'], 'utf8'));
    const coachReportId = await privateResultsClient().coach(report);
    console.log(JSON.stringify({ status: 'saved_private', coach_report_id: coachReportId }));
    return;
  }
  const cases = await inventory(join(root, 'pdfs/synthetic_papers'), join(root, 'answer-keys'));
  if (values.inventory) {
    for (const item of cases) console.log(`${item.paperId} ${item.split} ${item.paperSha256} ${item.paperName}`);
    console.log(`${cases.length} PDFs matched exactly one answer key.`);
    return;
  }

  if (values['recover-format'] && (!values.output || !values.native || values['check-runtime'])) {
    throw new Error('Format recovery requires --native and the existing --output directory.');
  }
  const native = values.native ? inspectNativeBatch() : null;
  const image = native ? null : inspectBatchImage(values.image);
  const apiKey = native ? undefined : process.env.JUMPSERVE_BATCH_CODEX_API_KEY;
  const ready = native ? native.chatgpt_signed_in : Boolean(apiKey?.trim());
  if (values['check-runtime']) {
    console.log(JSON.stringify({ papers: cases.length, ...(native ?? { image, credential_configured: ready }) }, null, 2));
    if (!ready) process.exitCode = 1;
    return;
  }
  if (!ready) throw new Error(native ? 'Sign in to the local Codex CLI with ChatGPT before starting the native batch.' :
    'Set JUMPSERVE_BATCH_CODEX_API_KEY to the scoped Codex API key for the isolated batch.');
  const artifacts = join(root, '.test-artifacts/jumpserve-synthetic-batch');
  const chosen = resolve(values.output ?? join(artifacts, `batch-${randomUUID()}`));
  await mkdir(dirname(chosen), { recursive: true, mode: 0o700 });
  const output = join(await realpath(dirname(chosen)), basename(chosen));
  const previous = values['recover-format'] ? JSON.parse(await readFile(join(output, 'batch.json'), 'utf8')) : null;
  if (previous && (previous.runtime?.engine !== 'macos' || previous.runtime.codex !== native.codex ||
      typeof previous.runtime.skill_snapshot !== 'string' || dirname(previous.runtime.skill_snapshot) !== dirname(output))) {
    throw new Error('Format recovery requires the original native runtime and local skill snapshot.');
  }
  const minutes = previous?.runtime.timeout_minutes ?? Number(values['timeout-minutes']);
  if (!Number.isSafeInteger(minutes) || minutes <= 0 || minutes > 1440) throw new Error('Specify a timeout of 1 to 1440 minutes per stage.');
  const model = previous ? previous.runtime.model : values.model;
  const results = privateResultsClient();
  if (previous?.runtime.results_origin && previous.runtime.results_origin !== results.origin) {
    throw new Error('Use the original JumpServe origin to save this batch.');
  }
  await results.check();
  const snapshot = previous?.runtime.skill_snapshot ?? await mkdtemp(join(dirname(output), '.skills-'));
  const guidance = {};
  for (const [role, directory] of Object.entries(skills)) {
    const staged = join(snapshot, directory);
    if (!previous) await cp(join(root, 'skills', directory), staged, { recursive: true, errorOnExist: true, force: false });
    guidance[role] = { source: 'bundled', sha256: sha256(await readFile(join(staged, 'references/workflow.md'))) };
  }
  const verifierSkill = await readFile(join(snapshot, skills.verifier, 'SKILL.md'), 'utf8');
  const verifierVersion = /^\s+version: ["']?([A-Za-z0-9._+-]+)["']?\s*$/m.exec(verifierSkill.split('---', 2)[1] ?? '')?.[1];
  if (!isVerifierVersion(verifierVersion) || (previous?.runtime.verifier_skill_version && previous.runtime.verifier_skill_version !== verifierVersion)) {
    throw new Error('Could not verify the snapshotted Verifier skill version.');
  }

  console.log(`Batch results: ${output}`);
  const options = { snapshot, timeoutMs: minutes * 60_000, model };
  const runtime = previous?.runtime ?? { ...(native ? { engine: 'macos', codex: native.codex } : { engine: 'docker', image }),
    model: model ?? null, timeout_minutes: minutes, skill_snapshot: snapshot,
    verifier_skill_version: verifierVersion, results_origin: results.origin };
  const workers = native ? createNativeWorkers({ ...options, python: native.python }) : createContainerWorkers({ ...options, image, apiKey });
  const state = await runSyntheticBatch({ output, cases, guidance, runtime, recoverFormat: values['recover-format'],
    ...workers,
    persistence: {
      generator: results.generator,
      verifier: (id, artifact, grade) => results.verifier(id, artifact, grade, verifierVersion),
    },
    progress: (paper, phase) => console.log(`${paper} ${phase}`),
  });
  if (state.status !== 'passed') {
    console.error(`Stopped at ${state.stop.paper_id} during ${state.stop.phase}. ${state.stop.reason}`);
    process.exitCode = 1;
  } else {
    console.log(`All ${cases.length} papers earned full credit.`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
