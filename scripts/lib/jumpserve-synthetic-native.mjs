import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, lstatSync } from 'node:fs';
import { open, readFile, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { extractPaperPDF } from '../../lib/paper-intake-pdf.ts';
import { VERIFIER_SCORECARD_SCHEMA } from '../../lib/jumpserve-verification.ts';
import { BATCH_SKILLS, generatorPrompt, verifierPrompt } from './jumpserve-synthetic-batch.mjs';

const profile = 'jumpserve_batch';
const environment = Object.fromEntries(['HOME', 'CODEX_HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'PATH', 'SHELL', 'TMPDIR']
  .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
const codexDirectory = environment.CODEX_HOME ?? join(homedir(), '.codex');

export function inspectNativeBatch() {
  if (process.platform !== 'darwin') throw new Error('The native batch profile requires macOS.');
  const local = args => spawnSync(args[0], args.slice(1), { env: environment, encoding: 'utf8', timeout: 15_000 });
  const version = local(['codex', '--version']);
  const login = local(['codex', 'login', 'status']);
  const python = local(['/usr/bin/which', 'python3']);
  if (version.status !== 0 || python.status !== 0) throw new Error('The native batch requires Codex CLI and Python 3.');
  return { codex: version.stdout.trim(), python: python.stdout.trim(),
    chatgpt_signed_in: login.status === 0 && /Logged in using ChatGPT/.test(`${login.stdout}\n${login.stderr}`) };
}

export function nativeProfileArgs({ reads, output, python, allowLoopback }) {
  const filesystem = new Map([[':root', 'deny'], [':minimal', 'read'], ['/private/tmp', 'deny']]);
  if (environment.TMPDIR?.startsWith('/var/folders/')) filesystem.set(environment.TMPDIR.replace(/^\/var\//, '/private/var/').replace(/\/$/, ''), 'deny');
  for (const path of ['/Library/Frameworks/Python.framework', '/opt/homebrew/bin', '/opt/homebrew/opt',
    '/opt/homebrew/Cellar', '/opt/homebrew/lib']) {
    if (existsSync(path)) filesystem.set(path, 'read');
  }
  filesystem.set(python, 'read');
  for (const name of ['AGENTS.md', 'AGENTS.override.md']) {
    const instructions = join(codexDirectory, name);
    if (!existsSync(instructions) || lstatSync(instructions).isFile()) filesystem.set(instructions, 'read');
  }
  for (const path of reads) filesystem.set(path, 'read');
  if (output) filesystem.set(output, 'write');
  const allowed = [...filesystem].map(([path, mode]) => `${JSON.stringify(path)}=${JSON.stringify(mode)}`).join(',');
  return ['-c', `default_permissions=${JSON.stringify(profile)}`,
    '-c', `permissions.${profile}.filesystem={${allowed}}`,
    ...(allowLoopback ? ['-c', 'features.network_proxy=true', '-c',
      `permissions.${profile}.network={enabled=true,allow_local_binding=true,domains={"127.0.0.1"="allow","localhost"="allow","::1"="allow"}}`] :
      ['-c', `permissions.${profile}.network.enabled=false`])];
}

function killGroup(child) {
  if (!child.pid) return;
  try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}

function responseSchema(schema) {
  if (schema.properties) {
    const properties = Object.fromEntries(Object.entries(schema.properties).map(([name, rule]) => [name, responseSchema(rule)]));
    return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
  }
  if (schema.items) return { type: 'array', items: responseSchema(schema.items) };
  if (schema.anyOf) return { anyOf: schema.anyOf.map(responseSchema) };
  if (schema.const !== undefined) return { type: schema.type ?? typeof schema.const, enum: [schema.const] };
  if (schema.enum) return { type: schema.type ?? typeof schema.enum[0], enum: schema.enum };
  return { type: schema.type };
}

function freshScorecardSchema(guidance) {
  const provenance = Object.fromEntries(Object.entries(guidance).map(([name, value]) => [name, { type: 'string', const: value }]));
  return responseSchema({ properties: {
    ...VERIFIER_SCORECARD_SCHEMA.properties,
    evidence_integrity: { properties: { status: { type: 'string', const: 'verified' }, verified_runs: { type: 'integer' } } },
    skill_instructions: { properties: provenance },
  } });
}

async function codexSession({ role, cwd, config, prompt, scorecard, schemaPath, timeoutMs, model }) {
  const log = await open(join(dirname(cwd), `${role}.log`), 'wx', 0o600);
  let timeout;
  let child;
  let interruption;
  const stop = reason => { interruption = reason; if (child) killGroup(child); };
  const interrupt = () => stop('interrupted');
  try {
    child = spawn('codex', ['--ask-for-approval', 'never', '-c', 'project_doc_max_bytes=0', ...config,
      'exec', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check', '--color', 'never',
      ...(model ? ['--model', model] : []), ...(scorecard ? ['--output-last-message', scorecard, '--output-schema', schemaPath] : []), '-'],
    { cwd, env: environment, detached: true, stdio: ['pipe', log.fd, log.fd] });
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    timeout = setTimeout(() => stop('timed out'), timeoutMs);
    child.stdin.on('error', () => {}); // The CLI can exit before it consumes the full prompt.
    child.stdin.end(prompt);
    const [code, signal] = await once(child, 'exit');
    if (interruption || code !== 0) throw new Error(`${role} ${interruption ?? `exited with ${code ?? signal}`}. See ${role}.log.`);
  } finally {
    clearTimeout(timeout);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    if (child) killGroup(child);
    await log.close();
  }
}

export function createNativeWorkers({ snapshot, workflowFiles, python, timeoutMs, model }) {
  const generatorSkill = join(snapshot, BATCH_SKILLS.generator);
  const verifierSkill = join(snapshot, BATCH_SKILLS.verifier);
  const reviewScript = join(verifierSkill, 'scripts', 'prepare_review.py');
  const config = (reads, output, allowLoopback) => nativeProfileArgs({ reads, output, allowLoopback, python });
  const session = options => codexSession({ ...options, timeoutMs, model });

  return {
    generate: async ({ paper, output, paperSha256, guidance }) => {
      const bytes = new Uint8Array(await readFile(paper));
      const extracted = await extractPaperPDF(bytes, { sha256: paperSha256, byte_count: bytes.length });
      const paperText = join(dirname(paper), 'paper.txt');
      await writeFile(paperText, extracted.pages.map(page => `## PDF page ${page.page}\n\n${page.text}`).join('\n\n'),
        { flag: 'wx', mode: 0o600 });
      const cwd = await realpath(output);
      await session({ role: 'generator', cwd, config: config([paper, paperText, generatorSkill], cwd, true),
        prompt: generatorPrompt({ skillDirectory: generatorSkill, workflow: join(generatorSkill, workflowFiles.generator),
          paper, paperSha256, guidance, testbed: `Use the macOS loopback testbed. Python 3: ${python}\nPage-separated PDF text: ${paperText}` }),
      });
    },
    preflight: ({ paper, key, artifactDirectory, output }) => {
      const checked = spawnSync('codex', ['sandbox', '-P', profile, ...config([paper, key, artifactDirectory,
        output, generatorSkill, verifierSkill], null, false), '--', python, '-I', '-B', reviewScript,
      join(artifactDirectory, 'jumpserve-assessment.json'), key, '--paper', paper], { cwd: output, env: environment,
        timeout: Math.min(60_000, timeoutMs), encoding: 'utf8', maxBuffer: 256_000 });
      if (checked.status !== 0) throw new Error(`Native evidence preflight failed. ${checked.stderr?.trim() || checked.error?.code || checked.status}`);
      return JSON.parse(checked.stdout);
    },
    verify: async ({ caseDirectory, paper, key, artifactDirectory, output, guidance, rubric }) => {
      const schemaPath = join(output, 'scorecard.schema.json');
      await writeFile(schemaPath, JSON.stringify(freshScorecardSchema(guidance)) + '\n', { flag: 'wx', mode: 0o600 });
      await session({ role: 'verifier', cwd: output,
        config: config([paper, key, artifactDirectory, output, generatorSkill, verifierSkill], null, false),
        scorecard: join(output, 'scorecard.json'), schemaPath,
        prompt: verifierPrompt({ skillDirectory: verifierSkill, workflow: join(verifierSkill, workflowFiles.verifier),
          caseDirectory, paper, key, assessment: join(artifactDirectory, 'jumpserve-assessment.json'), guidance, rubric }),
      });
    },
  };
}
