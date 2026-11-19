import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import OpenAI from 'openai';
import env from '@next/env';
import { RUN_NAME, privateDirectory, privateJSON, lockRun, readJSON } from './lib/paper-evaluation-store.mjs';

// This probe never creates sessions, submits inference, or reads assessment data.
// Keep the API origin fixed: local endpoint overrides must not receive credentials.
const { values } = parseArgs({ options: {
  probe: { type: 'boolean' }, live: { type: 'boolean' }, replay: { type: 'boolean' }, cleanup: { type: 'boolean' },
  'start-only': { type: 'boolean' }, 'time-limited': { type: 'boolean' }, run: { type: 'string' }, help: { type: 'boolean' },
  model: { type: 'string' },
  runtime: { type: 'boolean' }, step: { type: 'string' },
  'from-workflow': { type: 'string' },
} });

async function main() {
  if (values.help || !values.probe && !values.live && !values.replay && !values.cleanup) {
    console.log('npm run eval:agents-api -- --probe --run NAME\nnpm run eval:agents-api -- --live --run NAME [--start-only] [--time-limited] [--model MODEL]\nnpm run eval:agents-api -- --live --runtime --step 2 --time-limited --run NAME\nnpm run eval:agents-api -- --replay --run NAME\nnpm run eval:agents-api -- --cleanup --run NAME\nProbe is read-only. Live runs a fixed, retained SNC-003 paper repair case with a $1 provider limit by default. --time-limited explicitly omits the unsupported provider budget field: it uses a three-minute deadline and 16-call guard, without an exact dollar cap. --runtime instead exercises the production runner on Step 2, 3 or 4 fixtures, with private file-backed state, four minutes and 24 actions; completed sessions are deleted. Resume the same run to reconcile its existing session. Replay is offline. Cleanup deletes only the verified terminal evaluation session after evidence retention. No database operations or production changes.');
    return;
  }
  if ([values.probe, values.live, values.replay, values.cleanup].filter(Boolean).length !== 1) throw new Error('Choose exactly one evaluation mode.');
  if (!values.run || !RUN_NAME.test(values.run)) throw new Error('Provide a bounded report name with --run NAME.');
  if (values['start-only'] && !values.live) throw new Error('--start-only requires --live.');
  if (values['time-limited'] && !values.live) throw new Error('--time-limited requires --live.');
  if (values.model && (!values.live || !['gpt-5.4-2026-03-05', 'gpt-5.4', 'gpt-6-astra'].includes(values.model))) throw new Error('--model is restricted to the current production snapshot, its alias, or the documented Agents API example model.');
  if (values.runtime) {
    if (!values.live || !values['time-limited'] || values['start-only'] || values.model && values.model !== 'gpt-5.4' || !['2','3','4'].includes(values.step ?? '2')) throw new Error('Production-runtime smoke tests require --live --time-limited, --step 2/3/4, and GPT-5.4.');
    const { evaluateManagedPaperRuntime } = await import('./lib/managed-paper-agent-evaluation.mjs');
    await evaluateManagedPaperRuntime(values);
    return;
  }
  if (values.step) throw new Error('--step requires --runtime.');
  if (values['from-workflow']) throw new Error('--from-workflow requires --runtime.');
  if (values.live || values.replay || values.cleanup) {
    const { runPaperPilot } = await import('./lib/agents-api-paper-pilot.mjs');
    await runPaperPilot(values);
    return;
  }
  env.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY is not configured locally.');
  const directory = resolve('.test-artifacts/agents-api-evaluations', values.run);
  await privateDirectory(directory);
  const release = await lockRun(directory);
  try {
    const sdk = await readJSON(resolve('node_modules/openai/package.json'));
    const report = {
      version: 'agents-api-access-probe-v1', checked_at: new Date().toISOString(),
      sdk_version: sdk.version, sdk_supports_agents: false,
      inference_calls: 0, sessions_created: 0, database_operations: 0,
      endpoint: 'GET https://api.openai.com/v1/agents/sessions',
      beta_header: 'agents=v1',
      scope: 'One page filtered to JumpServe evaluation metadata; no contents retained.',
    };
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: 'https://api.openai.com/v1', maxRetries: 0, timeout: 15000 });
    report.sdk_supports_agents = typeof client.beta?.agents?.sessions?.list === 'function';
    if (!report.sdk_supports_agents) {
      report.outcome = 'sdk_unavailable';
    } else {
      try {
        const { data, response, request_id } = await client.beta.agents.sessions.list({
          limit: 1, metadata: { purpose: 'jumpserve-agents-api-evaluation' },
        }).withResponse();
        report.outcome = 'read_access_confirmed';
        report.http_status = response.status;
        report.request_id = request_id;
        report.matching_sessions_in_page = data.data.length;
      } catch (error) {
        report.outcome = typeof error.status === 'number' ? 'api_rejected' : 'transport_error';
        report.http_status = error.status ?? null;
        report.error_name = error.name ?? null;
        report.error_code = error.code ?? null;
        report.error_type = error.type ?? null;
        report.request_id = error.request_id ?? null;
        // Provider errors can contain sensitive request data. Retain only identifiers.
        report.missing_scopes = Array.isArray(error.error?.missing_scopes)
          ? error.error.missing_scopes.filter(scope => /^api\.[a-z_.]+$/.test(scope)) : [];
      }
    }
    report.does_not_establish = ['Session creation permission', 'GPT-5.4 compatibility', 'Repair quality', 'Background function handling', 'Cost or latency'];
    await privateJSON(join(directory, 'access-report.json'), report);
    console.log(JSON.stringify(report, null, 2));
    if (report.outcome !== 'read_access_confirmed') process.exitCode = 1;
  } finally {
    await release();
  }
}

await main().catch(error => { console.error(error.message); process.exitCode = 1; });
