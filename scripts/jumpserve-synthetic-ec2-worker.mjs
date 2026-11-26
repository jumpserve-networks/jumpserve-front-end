import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createContainerWorkers, inspectBatchImage } from './lib/jumpserve-synthetic-containers.mjs';
import { batchCasePaths, requireReviewPreflight } from './lib/jumpserve-synthetic-worker-inputs.mjs';

const authVolume = '/mnt/jumpserve-codex';

async function main() {
  const [mode, workdir] = process.argv.slice(2);
  const serve = mode === '--serve';
  const chatgpt = mode === '--chatgpt-volume';
  if (mode && !chatgpt && (!serve || !/^\/(?:private\/)?tmp\/jumpserve-codex-[a-z0-9_]+$/.test(workdir ?? ''))) {
    throw new Error('Invalid EC2 executor working directory.');
  }
  if (chatgpt && spawnSync('mountpoint', ['--quiet', authVolume], { timeout: 5_000 }).status !== 0) {
    throw new Error('Mount the dedicated Codex credential volume before starting the EC2 stage.');
  }
  const apiKey = mode ? undefined : readFileSync(0, 'utf8').trim();
  if (!mode && !apiKey) throw new Error('The stage requires a scoped Codex API key.');
  const job = JSON.parse(await readFile('job.json', 'utf8'));
  const review = batchCasePaths(join(process.cwd(), 'case'));
  const workers = createContainerWorkers({ image: inspectBatchImage('jumpserve-batch'), snapshot: join(process.cwd(), 'skills'),
    workflowFiles: job.workflowFiles, timeoutMs: job.timeoutMs, apiKey,
    chatgptAuthDirectory: chatgpt ? join(authVolume, 'session') : undefined, model: job.model });

  let input;
  if (job.role === 'generator') {
    const paperSha256 = createHash('sha256').update(await readFile(review.paper)).digest('hex');
    if (paperSha256 !== job.paperSha256) throw new Error('The EC2 Generator PDF does not match the staged paper.');
    input = { paper: review.paper, output: review.artifactDirectory, paperSha256, guidance: job.guidance };
  } else if (job.role === 'verifier') {
    input = { ...review, guidance: job.guidance, rubric: job.rubric };
    const checked = requireReviewPreflight(await workers.preflight(input), job.expected);
    await writeFile(join(review.caseDirectory, 'preflight.json'), JSON.stringify(checked), { flag: 'wx', mode: 0o600 });
  } else {
    throw new Error('Unknown EC2 batch worker role.');
  }
  if (serve) {
    console.log(JSON.stringify(await workers.serve({ ...input, role: job.role }, workdir)));
  } else if (job.role === 'generator') {
    await workers.generate(input);
  } else {
    await workers.verify(input);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'The EC2 stage failed.');
  process.exitCode = 1;
});
