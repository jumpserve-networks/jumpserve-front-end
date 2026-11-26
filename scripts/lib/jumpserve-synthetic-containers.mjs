import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { BATCH_SKILLS, generatorPrompt, verifierPrompt } from './jumpserve-synthetic-batch.mjs';

const maxOutput = 8 * 1024 * 1024;

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

export function createContainerWorkers({ image, snapshot, workflowFiles, timeoutMs, apiKey, model }) {
  const generatorSkill = `/skills/${BATCH_SKILLS.generator}`;
  const verifierSkill = `/skills/${BATCH_SKILLS.verifier}`;
  const generatorMount = mount(join(snapshot, BATCH_SKILLS.generator), generatorSkill);
  const skills = [
    ...generatorMount,
    ...mount(join(snapshot, BATCH_SKILLS.verifier), verifierSkill),
  ];

  async function run({ role, paper, key, artifactDirectory, output, command, prompt }) {
    const name = `jumpserve-batch-${randomUUID()}`;
    const isGenerator = role === 'generator';
    const isPreflight = role === 'preflight';
    const args = ['run', '--rm', '--init', '--interactive', '--name', name, '--pull', 'never', '--read-only',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '256', '--memory', '3g',
      // Codex's nested, read-only bubblewrap sandbox needs user namespaces.
      ...(role === 'verifier' ? ['--security-opt', 'seccomp=unconfined'] : []),
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=512m',
      '--tmpfs', `/home/node:rw,nosuid,nodev,size=512m,uid=${process.getuid()},gid=${process.getgid()}`,
      '--network', isPreflight ? 'none' : 'bridge', '--workdir', isGenerator ? '/work' : '/tmp',
      ...mount(paper, '/paper.pdf'),
      ...(isGenerator ? generatorMount : skills),
      ...(isGenerator ? mount(output, '/work', false) : [
        ...mount(key, '/answer-key.json'), ...mount(artifactDirectory, '/assessment'),
        ...(!isPreflight ? mount(output, '/review', false) : []),
      ]),
      ...(!isPreflight ? ['--env', 'CODEX_API_KEY'] : []),
      image, ...command];
    const env = isPreflight ? process.env : { ...process.env, CODEX_API_KEY: apiKey };
    const result = spawnSync('docker', args, { env, input: prompt, encoding: 'utf8', maxBuffer: maxOutput,
      timeout: isPreflight ? Math.min(timeoutMs, 60_000) : timeoutMs });
    if (result.error || result.signal) {
      // A dead Docker client can leave its container running after a timeout.
      spawnSync('docker', ['rm', '-f', name], { timeout: 15_000, stdio: 'ignore' });
    }
    const logPath = join(dirname(output), `${role}.log`);
    const log = [result.stdout, result.stderr].filter(Boolean).join('\n');
    await writeFile(logPath, apiKey ? log.replaceAll(apiKey, '[redacted]') : log, { flag: 'wx', mode: 0o600 });
    if (result.status !== 0) throw new Error(`${role} exited with ${errorCode(result)}. See ${role}.log.`);
    return result.stdout;
  }

  const codex = ['codex', 'exec', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check',
    '--color', 'never', '-c', 'shell_environment_policy.exclude=["CODEX_API_KEY"]', ...(model ? ['--model', model] : [])];
  return {
    generate: input => run({ ...input, role: 'generator', command: [...codex, '--yolo', '-'],
      prompt: generatorPrompt({ skillDirectory: generatorSkill, workflow: `${generatorSkill}/${workflowFiles.generator}`,
        paper: '/paper.pdf', paperSha256: input.paperSha256, guidance: input.guidance,
        testbed: 'Keep test traffic inside the isolated container testbed. Public reference data may be read when the paper specifies it.' }),
    }),
    preflight: async input => JSON.parse(await run({ ...input, role: 'preflight', command: ['python3', '-B',
      `${verifierSkill}/scripts/prepare_review.py`, '/assessment/jumpserve-assessment.json', '/answer-key.json', '--paper', '/paper.pdf'] })),
    verify: input => run({ ...input, role: 'verifier', command: [...codex, '--sandbox', 'read-only',
      '--output-last-message', '/review/scorecard.json', '-'],
      prompt: verifierPrompt({ skillDirectory: verifierSkill, workflow: `${verifierSkill}/${workflowFiles.verifier}`,
        paper: '/paper.pdf', key: '/answer-key.json', assessment: '/assessment/jumpserve-assessment.json',
        guidance: input.guidance, rubric: input.rubric }),
    }),
  };
}
