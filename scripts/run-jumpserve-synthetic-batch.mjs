import { mkdir, mkdtemp, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { inventory, runSyntheticBatch, stageBatchGuidance } from './lib/jumpserve-synthetic-batch.mjs';
import { BATCH_SKILLS } from './lib/jumpserve-synthetic-worker-inputs.mjs';
import { createEc2Workers, inspectEc2Batch } from './lib/jumpserve-synthetic-ec2.mjs';
import { createBatchProgressReporter } from './lib/jumpserve-synthetic-progress.mjs';
import { createTerminalPublisher } from './lib/jumpserve-synthetic-terminal.mjs';
import { privateResultsClient } from './jumpserve-assessment.mjs';
import { parseTrainingBatchId } from '../lib/training-batch.ts';
import { isVerifierVersion } from '../lib/jumpserve-verification.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const stopSteps = { generating: 'generation', saving_generator: 'the Generator save',
  verifying: 'verification', saving_verifier: 'the Verifier save' };

async function main() {
  const { values } = parseArgs({ options: {
    output: { type: 'string' }, 'worker-auth-volume': { type: 'string', multiple: true }, 'worker-zone': { type: 'string' },
    'worker-subnet': { type: 'string' }, 'worker-security-group': { type: 'string' }, parallel: { type: 'boolean' },
  } });
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error('Batch interrupted.'));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const { signal } = controller;
  const volumes = values['worker-auth-volume'] ?? [];
  const useSessionPool = values.parallel === true;
  const workerZone = values['worker-zone'];
  const workerSubnet = values['worker-subnet'];
  const workerSecurityGroup = values['worker-security-group'];
  if (!values.output || parseTrainingBatchId(basename(values.output)) === null ||
      !/^us-east-1[a-z]$/.test(workerZone ?? '')) {
    throw new Error('The coordinator requires a numbered output directory and a worker Availability Zone.');
  }
  const cases = await inventory(join(root, 'pdfs/synthetic_papers'), join(root, 'answer-keys'));
  const workerCount = Math.min(volumes.length, cases.length);
  if (!volumes.length || (!useSessionPool && volumes.length !== 1) ||
      volumes.some(volume => !/^vol-[a-f0-9]{17}$/.test(volume)) || new Set(volumes).size !== volumes.length) {
    throw new Error(useSessionPool ? 'Configure distinct, signed-in worker volumes for the session pool.'
      : 'Configure the existing signed-in worker volume.');
  }
  if ((useSessionPool || workerSubnet || workerSecurityGroup) &&
      (!/^subnet-[a-f0-9]{17}$/.test(workerSubnet ?? '') || !/^sg-[a-f0-9]{17}$/.test(workerSecurityGroup ?? ''))) {
    throw new Error('Configure the dedicated training worker subnet and security group for parallel batches.');
  }
  const settings = { profile: 'jumpserve-experiment', region: 'us-east-1', instanceProfile: 'JumpServeExperimentWorkload-SSM',
    instanceType: 't3.medium', workerZone, workerSubnet, workerSecurityGroup };
  signal.throwIfAborted();
  const ec2 = inspectEc2Batch(settings);
  const chosen = resolve(values.output);
  await mkdir(dirname(chosen), { recursive: true, mode: 0o700 });
  const output = join(await realpath(dirname(chosen)), basename(chosen));
  const results = privateResultsClient();
  const published = await results.check() ? await results.batchGuidance() : undefined;
  const snapshot = await mkdtemp(join(dirname(output), '.skills-'));
  const { guidance, workflowFiles } = await stageBatchGuidance({
    skillsDirectory: join(root, 'skills'), snapshot, published,
  });
  const verifierSkill = await readFile(join(snapshot, BATCH_SKILLS.verifier, 'SKILL.md'), 'utf8');
  const verifierVersion = /^\s+version: ["']?([A-Za-z0-9._+-]+)["']?\s*$/m.exec(verifierSkill.split('---', 2)[1] ?? '')?.[1];
  if (!isVerifierVersion(verifierVersion)) throw new Error('Could not verify the snapshotted Verifier skill version.');

  console.log(`Batch results: ${output}`);
  const timeoutMinutes = 30;
  const runtime = { ...ec2, model: null, codex_auth: 'worker-chatgpt', timeout_minutes: timeoutMinutes,
    parallel_papers: workerCount,
    skill_snapshot: snapshot, verifier_skill_version: verifierVersion, results_origin: results.origin };
  const openTerminal = createTerminalPublisher({ batchId: parseTrainingBatchId(basename(output)) });
  const workerPool = volumes.slice(0, workerCount).map(workerAuthVolume => createEc2Workers({
    snapshot, workflowFiles, timeoutMs: timeoutMinutes * 60_000, settings: { ...settings, workerAuthVolume }, openTerminal,
  }));
  const progress = createBatchProgressReporter(guidance, process.stdout, undefined, { parallel: workerCount > 1 });
  const state = await runSyntheticBatch({ output, cases, guidance, runtime, workerPool, signal,
    persistence: {
      generator: results.generator,
      verifier: (id, artifact, grade) => results.verifier(id, artifact, grade, verifierVersion),
    },
    progress: progress.update,
  }).finally(progress.finish);
  if (state.status === 'interrupted') {
    console.error('Batch interrupted.');
    process.exitCode = 1;
  } else if (state.status === 'stopped') {
    console.error(`Stopped at ${state.stop.paper_id} during ${stopSteps[state.stop.phase]}. ${state.stop.reason}`);
    process.exitCode = 1;
  } else {
    const fullCredit = state.cases.filter(item => item.status === 'passed').length;
    console.log(`\nCompleted all ${cases.length} papers. ${fullCredit} of ${cases.length} earned full credit.`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
