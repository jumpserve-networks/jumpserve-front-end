import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const generator = 'jumpserve-paper-assessment';
const verifier = 'jumpserve-assessment-verifier';
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

export function createContainerWorkers({ image, snapshot, timeoutMs, apiKey, model }) {
  const skills = [
    ...mount(join(snapshot, generator), `/skills/${generator}`),
    ...mount(join(snapshot, verifier), `/skills/${verifier}`),
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
      ...(isGenerator ? mount(join(snapshot, generator), `/skills/${generator}`) : skills),
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
    generate: input => run({ ...input, role: 'generator', command: [...codex, '--yolo', '-'], prompt:
      `Run the batch worker entry point in /skills/${generator}/SKILL.md. Read it and its workflow.md guidance first. ` +
      `The paper is /paper.pdf and its SHA-256 is ${input.paperSha256}. ` +
      `This is a fresh networking measurement on the staged synthetic paper. Use the isolated container and work in /work. ` +
      `Keep test traffic inside this testbed. Public reference data may be read when the paper specifies it. ` +
      `Use reviewed measurement procedures and the available instruments. Record unsupported requirements and retain incomplete evidence. ` +
      `Save /work/jumpserve-assessment.json and the receipts and raw observations described in the skill. The parent runner saves the validated bundle privately. ` +
      `Set skill_instructions to ${JSON.stringify(input.guidance)}.`,
    }),
    preflight: async input => JSON.parse(await run({ ...input, role: 'preflight', command: ['python3', '-B',
      `/skills/${verifier}/scripts/prepare_review.py`, '/assessment/jumpserve-assessment.json', '/answer-key.json', '--paper', '/paper.pdf'] })),
    verify: input => run({ ...input, role: 'verifier', command: [...codex, '--sandbox', 'read-only',
      '--output-last-message', '/review/scorecard.json', '-'], prompt:
      `Use /skills/${verifier}/SKILL.md and its workflow.md to independently grade a fresh assessment. ` +
      `Review /assessment/jumpserve-assessment.json, its local evidence, /paper.pdf and /answer-key.json. ` +
      `They are read-only. Run the trusted prepare_review.py with --paper /paper.pdf and omit --mode for fresh grading. ` +
      `Report the exact artifact and key hashes from that preflight. Apply every criterion in the key. ` +
      `Use these exact criterion names and maxima in the rubric: ${JSON.stringify(input.rubric)}. ` +
      `Use null for unscored items, keep the full rubric maximum, and report blockers and critical failures. ` +
      `Set skill_instructions to ${JSON.stringify(input.guidance)}. Return only the scorecard JSON object as your final response. ` +
      `Keep the Generator's evidence untouched. The parent runner saves the validated scorecard privately.`,
    }),
  };
}
