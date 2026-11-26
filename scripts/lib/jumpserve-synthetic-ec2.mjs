import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BATCH_SKILLS, batchCasePaths } from './jumpserve-synthetic-worker-inputs.mjs';
import { containerCodexSession } from './jumpserve-synthetic-containers.mjs';

const scripts = fileURLToPath(new URL('../', import.meta.url));
const launcher = join(scripts, 'jumpserve-synthetic-ec2.py');

function awsOptions({ profile, region, instanceProfile, instanceType }) {
  return ['--profile', profile, '--region', region, '--instance-profile', instanceProfile, '--instance-type', instanceType];
}

function controllerEnvironment() {
  const env = { ...process.env };
  for (const name of ['JUMPSERVE_BATCH_CODEX_API_KEY', 'CODEX_API_KEY', 'OPENAI_API_KEY', 'CODEX_ACCESS_TOKEN']) delete env[name];
  return env;
}

export function inspectEc2Batch(settings) {
  const check = spawnSync('python3', ['-B', launcher, 'check', ...awsOptions(settings)],
    { encoding: 'utf8', timeout: 50_000, env: controllerEnvironment() });
  if (check.status !== 0) throw new Error(`EC2 runtime check failed. ${check.stderr?.trim() || check.error?.code || check.status}`);
  return JSON.parse(check.stdout);
}

async function executeStage(args, apiKey) {
  const child = spawn('python3', ['-B', launcher, 'run', ...args], { env: controllerEnvironment(),
    detached: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let diagnostic = '';
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    if (!child.pid) return;
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  child.stdin.on('error', () => {});
  child.stderr.setEncoding('utf8').on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-8192); });
  try {
    child.stdin.end(apiKey === undefined ? undefined : `${apiKey}\n`);
    const [status, signal] = await once(child, 'close');
    if (interrupted || status !== 0) {
      throw new Error(`EC2 stage ${interrupted ? 'interrupted' : `exited with ${status ?? signal}`}. ${diagnostic.trim()}`);
    }
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}

export function createEc2Workers({ settings, snapshot, workflowFiles, timeoutMs, model, apiKey }) {
  const workerAuth = settings.workerAuthVolume;
  const authMode = workerAuth ? 'worker-chatgpt' : apiKey === undefined ? 'chatgpt' : 'api-key';
  async function stage(role, input) {
    const caseDirectory = dirname(input.output);
    const stageDirectory = join(caseDirectory, `ec2-${role}`);
    const payload = join(stageDirectory, 'payload');
    const staged = batchCasePaths(join(payload, 'case'));
    const isVerifier = role === 'verifier';
    await mkdir(stageDirectory, { mode: 0o700 });
    await mkdir(isVerifier ? staged.output : staged.artifactDirectory, { recursive: true, mode: 0o700 });
    await mkdir(join(payload, 'lib'), { mode: 0o700 });
    await mkdir(join(payload, 'skills'), { mode: 0o700 });
    try {
      await copyFile(input.paper, staged.paper);
      for (const skill of isVerifier ? Object.values(BATCH_SKILLS) : [BATCH_SKILLS.generator]) {
        await cp(join(snapshot, skill), join(payload, 'skills', skill), { recursive: true, errorOnExist: true, force: false });
      }
      if (isVerifier) {
        await copyFile(input.key, staged.key);
        await cp(input.artifactDirectory, staged.artifactDirectory, { recursive: true, errorOnExist: true, force: false });
      }
      await copyFile(join(scripts, 'jumpserve-synthetic-batch.Dockerfile'), join(payload, 'Dockerfile'));
      await copyFile(join(scripts, 'jumpserve-synthetic-ec2-worker.mjs'), join(payload, 'worker.mjs'));
      for (const file of ['jumpserve-synthetic-containers.mjs', 'jumpserve-synthetic-worker-inputs.mjs']) {
        await copyFile(join(scripts, 'lib', file), join(payload, 'lib', file));
      }
      await writeFile(join(payload, 'job.json'), JSON.stringify({ role, guidance: input.guidance, model, timeoutMs, workflowFiles,
        ...(isVerifier ? { expected: input.expected, rubric: input.rubric } : { paperSha256: input.paperSha256 }) }),
      { flag: 'wx', mode: 0o600 });
      if (authMode === 'chatgpt') {
        const session = containerCodexSession(role, input, workflowFiles, model);
        await writeFile(join(stageDirectory, 'session.json'), JSON.stringify({ ...session, timeoutMs }), { flag: 'wx', mode: 0o600 });
      }

      await executeStage([...awsOptions(settings), '--role', role, '--stage', stageDirectory,
        '--assessment-id', input.assessmentId, '--ttl-minutes', String(Math.ceil(timeoutMs / 60_000) + 20),
        '--codex-auth', authMode, ...(workerAuth ? ['--worker-auth-volume', workerAuth, '--worker-zone', settings.workerZone] : [])], apiKey);
      const returned = join(stageDirectory, 'retrieved', 'case');
      const preflight = isVerifier ? JSON.parse(await readFile(join(returned, 'preflight.json'), 'utf8')) : undefined;
      const temporary = await mkdtemp(join(caseDirectory, `.${role}-received-`));
      try {
        const complete = join(temporary, 'output');
        await cp(join(returned, role), complete, { recursive: true, errorOnExist: true, force: false });
        // The batch creates an empty output directory before provisioning. Publish only a complete copy.
        await rename(complete, input.output);
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
      return preflight;
    } finally {
      await rm(payload, { recursive: true, force: true });
      for (const file of ['.model-key', 'identity', 'identity.pub', 'input.tar.gz', 'session.json', '.controller-scorecard.json']) {
        await rm(join(stageDirectory, file), { force: true });
      }
    }
  }

  return { generate: input => stage('generator', input), reviewOnInstance: input => stage('verifier', input) };
}
