import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { openAsBlob } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { CLI_CLIENT_ID, CLI_RESULTS_CLIENT_ID, CLI_RESULTS_SCOPE, CLI_SCOPE, isOpaqueCredential, MCP_AUTHORIZE_PATH, MCP_TOKEN_PATH, verifierChallenge } from '../lib/jumpserve-mcp-oauth.ts';
import { LOCAL_ASSESSMENT_SOURCE_API, localAssessmentPrompt, localAssessmentSourcePage, PAPER_UPLOAD_BUCKET, PRIVATE_EVALUATION_RESULTS_API } from '../lib/local-assessment-source.ts';
import { paperUploadMetadata } from '../lib/research-paper-upload.ts';
import { isResearchId } from '../lib/research-experiment-queue.ts';
import { PRODUCTION_SITE_ORIGIN } from '../lib/site-url.ts';
import { isVerifierVersion } from '../lib/jumpserve-verification.ts';

const root = join(homedir(), '.jumpserve');
const uploadAccess = { client: CLI_CLIENT_ID, scope: CLI_SCOPE, resource: LOCAL_ASSESSMENT_SOURCE_API, flag: '' };
const resultAccess = { client: CLI_RESULTS_CLIENT_ID, scope: CLI_RESULTS_SCOPE, resource: PRIVATE_EVALUATION_RESULTS_API, flag: ' --results' };
const loginHelp = access => `Run \`npm run assessment -- login${access.flag}\` for this JumpServe origin.`;
const usage = `npm run assessment -- login [--results] [--callback-port <port>] [--url <origin>]
npm run assessment -- start <paper.pdf> [--assessment-id <id>] [--json | --run [--yolo]] [--url <origin>]
npm run assessment -- run <assessment-id> [--yolo] [--url <origin>]
npm run assessment -- save-generator <paper.pdf> --assessment-id <id> --bundle <assessment.json> [--url <origin>]
npm run assessment -- save-verifier <scorecard.json> --assessment-id <id> --bundle <assessment.json> --verifier-version <version> [--url <origin>]
npm run assessment -- save-coach <report.json> [--url <origin>]
npm run assessment -- logout [--results] [--url <origin>]`;

function trustedUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || url.hash || (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) {
    throw new Error('Use HTTPS or a local loopback HTTP URL.');
  }
  return url;
}

function originUrl(value) {
  const url = trustedUrl(value);
  if (url.pathname !== '/' || url.search) throw new Error('Specify a JumpServe origin without a path or query.');
  return url.origin;
}

function request(url, init) {
  return fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(30_000) });
}

function sessionPath(origin, access) {
  const identity = access === uploadAccess ? origin : `${origin}${access.resource}`;
  return join(root, 'sessions', createHash('sha256').update(identity).digest('hex') + '.json');
}

async function saveSession(path, session) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}`;
  try {
    await writeFile(temp, JSON.stringify(session), { flag: 'wx', mode: 0o600 });
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}

async function readSession(path, origin, access) {
  try {
    const session = JSON.parse(await readFile(path, 'utf8'));
    if (session?.origin === origin && isOpaqueCredential(session.access_token) &&
        isOpaqueCredential(session.refresh_token) && Number.isSafeInteger(session.expires_at)) return session;
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  throw new Error(loginHelp(access));
}

async function exchange(origin, access, fields) {
  const response = await request(new URL(MCP_TOKEN_PATH, origin), {
    method: 'POST', body: new URLSearchParams({ ...fields, client_id: access.client, scope: access.scope,
      resource: new URL(access.resource, origin).href }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !isOpaqueCredential(data?.access_token) || !isOpaqueCredential(data?.refresh_token) ||
      data.scope !== access.scope || data.token_type !== 'Bearer' || data.expires_in !== 3600) {
    if (data?.error === 'invalid_grant') throw new Error(`Your JumpServe CLI sign-in is invalid or expired. ${loginHelp(access)}`);
    throw new Error(`JumpServe could not authorize this CLI session (HTTP ${response.status}).`);
  }
  return { origin, access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 };
}

async function login(origin, access, port) {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const server = createServer();
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  const callback = new URL(`http://127.0.0.1:${server.address().port}/callback`);
  const authorize = new URL(MCP_AUTHORIZE_PATH, origin);
  authorize.search = new URLSearchParams({ client_id: access.client, redirect_uri: callback.href,
    response_type: 'code', state, code_challenge: verifierChallenge(verifier), code_challenge_method: 'S256',
    resource: new URL(access.resource, origin).href, scope: access.scope }).toString();
  let timer;
  try {
    const code = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('JumpServe sign-in timed out. Try again.')), 5 * 60_000);
      server.on('request', (req, res) => {
        const url = URL.parse(req.url, callback.origin);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Referrer-Policy', 'no-referrer');
        if (req.method !== 'GET' || req.headers.host !== callback.host || !url || url.origin !== callback.origin ||
            url.pathname !== callback.pathname || url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== state) {
          res.writeHead(400).end('Invalid JumpServe sign-in callback.');
          return;
        }
        const codes = url.searchParams.getAll('code');
        if (url.searchParams.has('error') || codes.length !== 1 || !isOpaqueCredential(codes[0])) {
          res.writeHead(400).end('JumpServe sign-in did not complete. Return to the terminal.');
          reject(new Error('JumpServe sign-in did not complete.'));
          return;
        }
        res.end('JumpServe received your authorization. Return to the terminal.', () => resolve(codes[0]));
      });
      console.error(`Open this URL to authorize the JumpServe CLI with Google:\n${authorize.href}`);
    });
    const session = await exchange(origin, access, { grant_type: 'authorization_code', code, redirect_uri: callback.href, code_verifier: verifier });
    const path = sessionPath(origin, access);
    await updateSession(path, () => saveSession(path, session));
    console.log(`Signed in to ${origin}.`);
  } finally {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  }
}

async function updateSession(path, update) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lockPath = `${path}.lock`;
  const lock = await open(lockPath, 'wx', 0o600).catch(error => {
    if (error.code === 'EEXIST') throw new Error(`A JumpServe CLI session update is locked. Retry shortly. Lock file: ${lockPath}`);
    throw error;
  });
  try {
    return await update();
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

async function refreshSession(origin, access, rejectedToken) {
  const path = sessionPath(origin, access);
  return updateSession(path, async () => {
    const current = await readSession(path, origin, access);
    if (current.expires_at > Date.now() + 30_000 && current.access_token !== rejectedToken) return current;
    const updated = await exchange(origin, access, { grant_type: 'refresh_token', refresh_token: current.refresh_token });
    await saveSession(path, updated);
    return updated;
  });
}

function connectorPost(origin, access) {
  let session;
  return async input => {
    session ??= await readSession(sessionPath(origin, access), origin, access);
    if (session.expires_at <= Date.now() + 30_000) session = await refreshSession(origin, access, session.access_token);
    const post = () => request(new URL(access.resource, origin), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(input),
    });
    let response = await post().catch(() => null);
    // All operations use stable identifiers or content digests, including retries after a lost response.
    if (!response || response.status >= 500) response = await post();
    if (response.status === 401) {
      session = await refreshSession(origin, access, session.access_token);
      response = await post();
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) throw new Error(result?.error ?? `JumpServe rejected ${input.action} (HTTP ${response.status}).`);
    return result;
  };
}

function uploadUrl(value, sha256) {
  const url = trustedUrl(value);
  const prefix = `/storage/v1/object/upload/sign/${PAPER_UPLOAD_BUCKET}/local-assessment-sources/`;
  const path = url.pathname.startsWith(prefix) && url.pathname.slice(prefix.length).split('/');
  if (!path || path.length !== 2 || !isResearchId(path[0]) || path[1] !== `${sha256}.pdf` ||
      !url.searchParams.get('token') || url.searchParams.size !== 1) {
    throw new Error('Private upload permission does not match the selected PDF.');
  }
  return url;
}

async function uploadPaper(post, filename, id, expected) {
  const blob = await openAsBlob(filename, { type: 'application/pdf' });
  const { sha256, byte_count } = await paperUploadMetadata(new File([blob], basename(filename)));
  if (expected && (expected.sha256 !== sha256 || expected.byte_count !== byte_count)) {
    throw new Error('The PDF does not match the Generator assessment.');
  }
  const source = action => post({ action, assessment_id: id, sha256, byte_count });
  const ticket = await source('reserve');
  if (ticket.status === 'pending') {
    const url = uploadUrl(ticket.upload_url, sha256);
    // Verification reconciles a concurrent upload or a lost storage response.
    await request(url, { method: 'PUT', body: blob, headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' } }).catch(() => null);
  } else if (ticket.status !== 'stored') {
    throw new Error('JumpServe did not issue a private upload ticket.');
  }
  if ((await source('verify')).status !== 'ready') throw new Error('JumpServe did not verify the uploaded PDF.');
}

async function start(origin, filename, id) {
  console.error(`Assessment ID ${id}. Use --assessment-id ${id} to retry the same upload.`);
  await uploadPaper(connectorPost(origin, uploadAccess), filename, id);
  return { assessment_id: id, status: 'ready', setup_url: new URL(localAssessmentSourcePage(id), origin).href,
    prompt: localAssessmentPrompt(id) };
}

export function privateResultsClient(url = process.env.JUMPSERVE_URL ?? PRODUCTION_SITE_ORIGIN) {
  const origin = originUrl(url);
  const post = connectorPost(origin, resultAccess);
  const receipt = async (input, field) => {
    const response = await post(input);
    if (response.status !== 'saved_private' || !isResearchId(response[field])) {
      throw new Error(`JumpServe did not confirm the private ${input.action} save.`);
    }
    return response[field];
  };
  return {
    origin,
    async check() {
      const response = await post({ action: 'check' });
      if (response.status !== 'ready') throw new Error('JumpServe private evaluation saves are unavailable.');
      return response.batch_guidance === true;
    },
    async batchGuidance() {
      const response = await post({ action: 'batch_guidance' });
      if (response.status !== 'ready' || !response.guidance) throw new Error('JumpServe published batch workflows are unavailable.');
      return response.guidance;
    },
    async generator(id, paper, bundle) {
      await uploadPaper(post, paper, id, bundle.paper);
      return receipt({ action: 'generator', assessment_id: id, bundle }, 'generator_result_id');
    },
    verifier: (id, assessmentJson, scorecard, version) => receipt({ action: 'verifier', assessment_id: id,
      assessment_json: assessmentJson, scorecard, verifier_version: version }, 'verification_id'),
    coach: report => receipt({ action: 'coach', report }, 'coach_report_id'),
  };
}

async function run(origin, id, yolo) {
  const directory = join(root, 'assessments');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const workspace = await mkdtemp(join(directory, `${id}-`));
  console.error(`Starting the local Generator in ${workspace}`);
  const args = ['exec', '--skip-git-repo-check', ...(yolo ? ['--dangerously-bypass-approvals-and-sandbox'] : []), '-'];
  const prompt = `${localAssessmentPrompt(id)} Use the JumpServe connector at ${origin}/mcp. ` +
    'Keep the evidence and assessment bundle in this working directory and save the completed assessment privately.';
  const child = spawn('codex', args, { cwd: workspace, stdio: ['pipe', 'inherit', 'inherit'] });
  child.stdin.on('error', () => {}); // Codex may exit before reading the prompt.
  child.stdin.end(prompt);
  const [code, signal] = await once(child, 'exit');
  if (code !== 0) throw new Error(`Codex exited with ${code ?? signal}. Local workspace: ${workspace}`);
}

async function main() {
  const { values, positionals: [command, input, ...extra] } = parseArgs({ allowPositionals: true, options: {
    url: { type: 'string' }, 'assessment-id': { type: 'string' }, json: { type: 'boolean' },
    run: { type: 'boolean' }, yolo: { type: 'boolean' }, results: { type: 'boolean' }, bundle: { type: 'string' },
    'callback-port': { type: 'string' },
    'verifier-version': { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help || !command) return console.log(usage);
  const origin = originUrl(values.url ?? process.env.JUMPSERVE_URL ?? PRODUCTION_SITE_ORIGIN);
  const access = values.results ? resultAccess : uploadAccess;
  const resultCommand = command === 'save-generator' || command === 'save-verifier';
  if (extra.length || (command !== 'start' && (values.json || values.run)) || (values.results && !['login', 'logout'].includes(command)) ||
      (!resultCommand && values.bundle) || (command !== 'save-verifier' && values['verifier-version']) ||
      (!resultCommand && command !== 'start' && values['assessment-id']) ||
      (command !== 'login' && values['callback-port'] !== undefined) ||
      (values.yolo && command !== 'run' && !values.run) || (values.json && values.run)) throw new Error(usage);
  if (command === 'login' && !input) {
    const port = values['callback-port'];
    if (port !== undefined && (!/^\d{4,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535)) {
      throw new Error('Use a callback port between 1024 and 65535.');
    }
    return login(origin, access, Number(port ?? 0));
  }
  if (command === 'logout' && !input) {
    const path = sessionPath(origin, access);
    await updateSession(path, () => rm(path, { force: true }));
    return console.log(`Removed local CLI sign-in for ${origin}.`);
  }
  if (command === 'start' && input) {
    const id = values['assessment-id'] ?? randomUUID();
    if (!isResearchId(id)) throw new Error('Specify a valid assessment ID.');
    const ready = await start(origin, input, id);
    if (values.run) return run(origin, id, values.yolo);
    return console.log(values.json ? JSON.stringify(ready) : `Assessment ready: ${ready.assessment_id}\n${ready.setup_url}\n\n${ready.prompt}`);
  }
  if (command === 'run' && isResearchId(input)) return run(origin, input, values.yolo);
  if (command === 'save-coach' && input) {
    const report = JSON.parse(await readFile(input, 'utf8'));
    return console.log(JSON.stringify({ status: 'saved_private', coach_report_id: await privateResultsClient(origin).coach(report) }));
  }
  if (resultCommand && input && isResearchId(values['assessment-id']) && values.bundle) {
    const id = values['assessment-id'];
    const artifact = await readFile(values.bundle, 'utf8');
    const client = privateResultsClient(origin);
    if (command === 'save-generator') {
      const generator_result_id = await client.generator(id, input, JSON.parse(artifact));
      return console.log(JSON.stringify({ status: 'saved_private', assessment_id: id, generator_result_id }));
    }
    const version = values['verifier-version'];
    if (!isVerifierVersion(version)) throw new Error('Supply the Verifier skill version from the review.');
    const verification_id = await client.verifier(id, artifact, JSON.parse(await readFile(input, 'utf8')), version);
    return console.log(JSON.stringify({ status: 'saved_private', assessment_id: id, verification_id }));
  }
  throw new Error(usage);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
