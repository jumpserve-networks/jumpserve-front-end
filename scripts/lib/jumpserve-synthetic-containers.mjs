import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { BATCH_SKILLS, batchCasePaths, generatorPrompt, verifierPrompt } from './jumpserve-synthetic-worker-inputs.mjs';
import { codexActivity } from './jumpserve-synthetic-activity.mjs';

const maxOutput = 8 * 1024 * 1024;
const executorPort = 8745;
const executorUrl = `ws://127.0.0.1:${executorPort}`;
const isolatedCodexVersion = 'codex-cli 0.171.0';
const generatorSkill = `/skills/${BATCH_SKILLS.generator}`;
const verifierSkill = `/skills/${BATCH_SKILLS.verifier}`;
const review = batchCasePaths('/case');
const reviewedAssessment = join(review.artifactDirectory, 'jumpserve-assessment.json');
const containerAuthHome = '/codex-credentials';

function errorCode(run) {
  return run.error?.code ?? run.signal ?? run.status;
}

export function inspectBatchImage(image) {
  const run = spawnSync('docker', ['image', 'inspect', '--format', '{{json .}}', image], { encoding: 'utf8', timeout: 15_000 });
  if (run.status !== 0) throw new Error(`Cannot inspect the local batch image. ${run.stderr?.trim() || errorCode(run)}`);
  const { Id, Config } = JSON.parse(run.stdout);
  const uid = process.getuid();
  const gid = process.getgid();
  if (!/^sha256:[a-f0-9]{64}$/.test(Id) || Config.User !== 'node' || uid === 0 ||
      Config.Labels?.['org.jumpserve.batch.uid'] !== String(uid) || Config.Labels?.['org.jumpserve.batch.gid'] !== String(gid)) {
    throw new Error('Build the batch image with this host account’s UID and GID.');
  }
  return Id;
}

function mount(source, destination, readOnly = true) {
  if (source.includes(',')) throw new Error('Docker batch paths must be free of commas.');
  return ['--mount', `type=bind,source=${source},destination=${destination}${readOnly ? ',readonly' : ''}`];
}

function containerArgs(name, network, workdir, { detached = false, nestedSandbox = false } = {}) {
  return ['run', '--rm', '--init', detached ? '--detach' : '--interactive', '--name', name, '--pull', 'never', '--read-only',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '256', '--memory', '3g',
    // The Verifier's nested, read-only bubblewrap sandbox needs user namespaces.
    ...(nestedSandbox ? ['--security-opt', 'seccomp=unconfined'] : []),
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=512m',
    '--tmpfs', `/home/node:rw,nosuid,nodev,size=512m,uid=${process.getuid()},gid=${process.getgid()}`,
    '--network', network, '--workdir', workdir];
}

function docker(args, options) {
  return spawnSync('docker', args, { encoding: 'utf8', maxBuffer: maxOutput, ...options });
}

function observeDocker(args, { env, input, timeout }, onActivity) {
  return new Promise(resolve => {
    const child = spawn('docker', args, { env, signal: AbortSignal.timeout(timeout), killSignal: 'SIGKILL' });
    let error;
    const collect = stream => {
      const chunks = [];
      let bytes = 0;
      stream.on('data', chunk => {
        if (bytes < maxOutput) chunks.push(chunk.subarray(0, maxOutput - bytes));
        if (bytes <= maxOutput && bytes + chunk.length > maxOutput) {
          chunks.push(Buffer.from('\n[Codex log capture limit reached.]\n'));
        }
        bytes += chunk.length;
      });
      return chunks;
    };
    const stdout = collect(child.stdout);
    const stderr = collect(child.stderr);
    createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', line => {
      const event = codexActivity(line);
      if (event) onActivity(event);
    });
    child.on('error', failure => { error ??= failure; });
    child.stdin.on('error', () => {});
    child.once('close', (status, signal) => resolve({
      status, signal, error, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString(),
    }));
    child.stdin.end(input);
  });
}

function removeContainer(name) {
  docker(['rm', '-f', name], { timeout: 15_000, stdio: 'ignore' });
}

async function waitForExecutor(name) {
  const probe = `const socket = new WebSocket(${JSON.stringify(executorUrl)});
    socket.addEventListener('open', () => process.exit(0));
    socket.addEventListener('error', () => process.exit(1));
    setTimeout(() => process.exit(1), 1000);`;
  const deadline = Date.now() + 15_000;
  do {
    const ready = docker(['exec', name, 'node', '-e', probe], { timeout: 3_000, stdio: 'ignore' });
    if (ready.status === 0) return;
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error('The isolated Codex executor did not become ready.');
}

export function containerCodexSession(role, input, workflowFiles, model) {
  const command = ['codex', '--ask-for-approval', 'never', 'exec', '--ephemeral', '--ignore-user-config', '--ignore-rules',
    '--skip-git-repo-check', '--color', 'never', '-c', 'shell_environment_policy.inherit="none"',
    '-c', 'shell_environment_policy.set={HOME="/home/node",PATH="/usr/local/bin:/usr/bin:/bin"}',
    ...(model ? ['--model', model] : [])];
  if (role === 'generator') return { command: [...command, '--yolo'],
    prompt: generatorPrompt({ skillDirectory: generatorSkill, workflow: `${generatorSkill}/${workflowFiles.generator}`,
      paper: '/paper.pdf', paperSha256: input.paperSha256, guidance: input.guidance,
      testbed: 'Keep test traffic inside the isolated container testbed. Public reference data may be read when the paper specifies it.' }) };
  return { command: [...command, '--sandbox', 'read-only'],
    prompt: verifierPrompt({ skillDirectory: verifierSkill, workflow: `${verifierSkill}/${workflowFiles.verifier}`,
      caseDirectory: review.caseDirectory, paper: review.paper, key: review.key, assessment: reviewedAssessment,
      guidance: input.guidance, rubric: input.rubric }) };
}

export function inspectControllerCodex(env) {
  const version = spawnSync('codex', ['--version'], { env, encoding: 'utf8', timeout: 15_000 });
  if (version.status !== 0 || version.stdout.trim() !== isolatedCodexVersion) {
    throw new Error(`The EC2 ChatGPT runtime requires ${isolatedCodexVersion} on the controller.`);
  }
  const login = spawnSync('codex', ['login', 'status'], { env, encoding: 'utf8', timeout: 15_000 });
  return login.status === 0 && /Logged in using ChatGPT/.test(login.stdout + login.stderr);
}

export function createContainerWorkers({ image, snapshot, workflowFiles, timeoutMs, apiKey, chatgptAuthDirectory, model, onActivity }) {
  const generatorMount = mount(join(snapshot, BATCH_SKILLS.generator), generatorSkill);
  const skills = [
    ...generatorMount,
    ...mount(join(snapshot, BATCH_SKILLS.verifier), verifierSkill),
  ];

  function inputsFor({ role, paper, key, artifactDirectory, output }, workdir) {
    return role === 'generator' ? [...mount(paper, '/paper.pdf'), ...generatorMount, ...mount(output, workdir, false)]
      : [...mount(paper, review.paper), ...skills, ...mount(key, review.key), ...mount(artifactDirectory, review.artifactDirectory)];
  }

  async function startExecutor(name, input, workdir, publish = false) {
    const nestedSandbox = input.role === 'verifier';
    const portMapping = `127.0.0.1::${executorPort}`;
    const started = docker([...containerArgs(name, 'bridge', workdir, { detached: true, nestedSandbox }),
      ...inputsFor(input, workdir), ...(publish ? ['--publish', portMapping, ...(nestedSandbox ? ['--tmpfs', workdir] : [])] : []),
      image, 'codex', 'exec-server', '--listen', publish ? `ws://0.0.0.0:${executorPort}` : executorUrl], { timeout: 15_000 });
    if (started.status !== 0) throw new Error(`Could not start the isolated Codex executor (${errorCode(started)}).`);
    const version = docker(['exec', name, 'codex', '--version'], { timeout: 15_000 });
    if (version.status !== 0 || version.stdout.trim() !== isolatedCodexVersion) {
      throw new Error(`The isolated executor requires ${isolatedCodexVersion}. Rebuild the batch image.`);
    }
    await waitForExecutor(name);
    if (publish) {
      const port = docker(['port', name, `${executorPort}/tcp`], { timeout: 15_000 });
      const mapped = port.status === 0 && /^127\.0\.0\.1:(\d+)$/.exec(port.stdout.trim());
      if (!mapped) throw new Error('The EC2 executor requires a loopback-only port mapping.');
      return Number(mapped[1]);
    }
  }

  async function run(input) {
    const { role, output, command, prompt } = input;
    const name = `jumpserve-batch-${randomUUID()}`;
    const isGenerator = role === 'generator';
    const workdir = isGenerator ? '/work' : '/tmp';
    let result;
    let finalMessage;
    if (role === 'preflight') {
      result = docker([...containerArgs(name, 'none', workdir), ...inputsFor(input, workdir), image, ...command],
        { timeout: Math.min(timeoutMs, 60_000) });
      if (result.error || result.signal) removeContainer(name);
    } else {
      const useChatgpt = chatgptAuthDirectory !== undefined;
      if (useChatgpt === Boolean(apiKey)) throw new Error('Choose one model credential for the Codex client.');
      let credentials = ['--env', 'CODEX_API_KEY'];
      let authConfig = [];
      const env = { ...process.env };
      if (useChatgpt) {
        const directory = await realpath(chatgptAuthDirectory);
        const [home, auth] = await Promise.all([lstat(directory), lstat(join(directory, 'auth.json'))]);
        const privateFile = stat => stat.uid === process.getuid() && (stat.mode & 0o077) === 0;
        if (directory !== chatgptAuthDirectory || !home.isDirectory() || !auth.isFile() || !privateFile(home) || !privateFile(auth)) {
          throw new Error('The mounted Codex sign-in requires a private directory and regular auth.json owned by the worker.');
        }
        credentials = [...mount(directory, containerAuthHome, false), '--env', `CODEX_HOME=${containerAuthHome}`];
        authConfig = ['-c', 'forced_login_method="chatgpt"', '-c', 'cli_auth_credentials_store="file"',
          '--disable', 'apps', '--disable', 'plugins', '--disable', 'hooks'];
        for (const name of ['CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'OPENAI_API_KEY', 'JUMPSERVE_BATCH_CODEX_API_KEY']) delete env[name];
      } else {
        env.CODEX_API_KEY = apiKey;
      }
      const executor = `${name}-executor`;
      let messageDirectory;
      try {
        await startExecutor(executor, input, workdir);

        // Share only networking. The executor alone gets case mounts. The client alone gets model auth.
        // At the pinned Codex version this URL also removes the local execution environment.
        const observed = useChatgpt && onActivity;
        if (observed && !isGenerator) messageDirectory = await mkdtemp(join(dirname(output), '.codex-message-'));
        const args = [...containerArgs(name, `container:${executor}`, '/tmp'), ...credentials,
          // Codex resolves the working directory locally before passing it to the remote environment.
          ...(isGenerator ? ['--tmpfs', '/work:rw,nosuid,nodev,noexec,size=1m'] : []),
          ...(messageDirectory ? mount(messageDirectory, '/last-message', false) : []),
          '--env', `CODEX_EXEC_SERVER_URL=${executorUrl}`, image, ...command, ...authConfig, '--cd', workdir,
          ...(observed ? ['--json'] : []),
          ...(messageDirectory ? ['--output-last-message', '/last-message/response'] : []), '-'];
        const options = { env, input: prompt, timeout: timeoutMs };
        if (observed) {
          onActivity({ kind: 'codex_started' });
          result = await observeDocker(args, options, onActivity);
        } else {
          result = docker(args, options);
        }
        if (messageDirectory && result.status === 0 && !result.error) {
          try { finalMessage = await readFile(join(messageDirectory, 'response'), 'utf8'); }
          catch (error) { result.error = error; }
        }
      } finally {
        // A dead Docker client can leave either container running after a timeout.
        removeContainer(name);
        removeContainer(executor);
        if (messageDirectory) await rm(messageDirectory, { force: true, recursive: true });
      }
    }
    const logPath = join(dirname(output), `${role}.log`);
    const log = [result.stdout, result.stderr].filter(Boolean).join('\n');
    await writeFile(logPath, apiKey ? log.replaceAll(apiKey, '[redacted]') : log, { flag: 'wx', mode: 0o600 });
    if (result.status !== 0 || result.error) throw new Error(`${role} exited with ${errorCode(result)}. See ${role}.log.`);
    return finalMessage ?? result.stdout;
  }

  return {
    serve: async (input, workdir) => {
      const name = `jumpserve-batch-${randomUUID()}-executor`;
      try {
        return { name, port: await startExecutor(name, input, workdir, true) };
      } catch (error) {
        removeContainer(name);
        throw error;
      }
    },
    generate: input => run({ ...input, role: 'generator', ...containerCodexSession('generator', input, workflowFiles, model) }),
    preflight: async input => JSON.parse(await run({ ...input, role: 'preflight', command: ['python3', '-B',
      `${verifierSkill}/scripts/prepare_review.py`, reviewedAssessment, review.key, '--paper', review.paper] })),
    verify: async input => {
      const scorecard = await run({ ...input, role: 'verifier', ...containerCodexSession('verifier', input, workflowFiles, model) });
      await writeFile(join(input.output, 'scorecard.json'), scorecard, { flag: 'wx', mode: 0o600 });
    },
  };
}
