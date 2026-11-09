import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {registerHooks} from 'node:module';
const replacements = {'server-only': 'export {};', '@/lib/supabase/server': 'export const createClient=async()=>globalThis.__studyDatabase;'};
const hook = registerHooks({resolve(specifier, context, next) {return replacements[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(replacements[specifier])} : next(specifier, context);}});
const delay = await import('../lib/delay-study-server.ts');
const leo = await import('../lib/leo-study-server.ts');
const ipv6 = await import('../lib/ipv6-study-server.ts');
const reliable = await import('../lib/reliable-study-server.ts');
const http2 = await import('../lib/http2-study-server.ts'); hook.deregister();
const researchHook = registerHooks({resolve(specifier, context, next) {return specifier === 'server-only' ? {shortCircuit: true, url: 'data:text/javascript,export%20%7B%7D%3B'} : next(specifier, context);}});
const research = await import('../lib/research-workflow-server.ts'); researchHook.deregister();
const {RECORD_KINDS} = await import('../lib/research-workflow.ts');
const {STUDY_ID} = await import('../lib/delay-study.ts');
const {LEO_STUDY_ID, LEO_SATURATION_ID} = await import('../lib/leo-study.ts');
let tables, queries;
let originalFetch, originalEnvironment;
const fixtures = (n, prefix = 'row') => Array.from({length: n}, (_, i) => ({id: prefix + i}));
function reply(query) {
  assert.ok(Object.hasOwn(tables, query.table), 'Undeclared fixture relation: ' + query.table);
  let data = tables[query.table]; const count = Array.isArray(data) ? data.length : null;
  if (Array.isArray(data)) {
    if (query.range) data = data.slice(query.range[0], query.range[1] + 1);
    if (query.limit) data = data.slice(0, query.limit);
  }
  return {data, count, error: null};
}
beforeEach(() => {
  originalFetch = globalThis.fetch; originalEnvironment = Object.fromEntries(['NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL', 'NEXT_PUBLIC_BENCHMARK_API_URL'].map(key => [key, process.env[key]]));
  for (const key of Object.keys(originalEnvironment)) delete process.env[key];
  globalThis.fetch = async () => {throw new Error('Unexpected network read in unit test');};
  tables = {}; queries = []; globalThis.__studyReply = async query => reply(query);
  globalThis.__studyDatabase = {from(table) {
    assert.match(table, /^(delay|leo|ipv6|reliable|http2)_study_/);
    const query = {table, filters: [], order: []};
    const chain = {
      select(columns, options) {assert.equal(columns.includes('*'), false); assert.doesNotMatch(columns, /(?:email|owner_id|service_role|access_token)/); query.columns = columns; query.options = options; return chain;},
      eq(column, value) {query.filters.push(['eq', column, value]); return chain;},
      neq(column, value) {query.filters.push(['neq', column, value]); return chain;},
      order(column) {query.order.push(column); return chain;},
      limit(value) {query.limit = value; return chain;},
      range(first, last) {query.range = [first, last]; return chain;},
      maybeSingle() {query.single = 'optional'; return chain;}, single() {query.single = 'required'; return chain;},
      then(resolve, reject) {queries.push(structuredClone(query)); return Promise.resolve(globalThis.__studyReply(query)).then(resolve, reject);},
    }; return chain;
  }};
});
afterEach(() => {globalThis.fetch = originalFetch; for (const [key, value] of Object.entries(originalEnvironment)) {if (value === undefined) delete process.env[key]; else process.env[key] = value;} delete globalThis.__studyReply; delete globalThis.__studyDatabase;});

test('delay study requires the complete declared trial schedule and normalizes recorded numeric columns', async () => {
  tables = {delay_study_campaigns: {id: STUDY_ID, planned_trials: '2'}, delay_study_configurations: [{id: 'config', capacity_mbps: '100'}], delay_study_trials: fixtures(2), delay_study_summaries: [], delay_study_latency_trials: []};
  const data = await delay.getStudyData(); assert.equal(data.campaign.planned_trials, 2); assert.equal(data.configurations[0].capacity_mbps, 100); assert.equal(data.trials.length, 2);
  assert.ok(queries.every(q => q.filters.some(([, key, value]) => ['id', 'campaign_id'].includes(key) && value === STUDY_ID)));
  assert.equal(queries.find(q => q.table === 'delay_study_trials').limit, 1000);
  tables.delay_study_campaigns.planned_trials = 3; await assert.rejects(delay.getStudyData(), /schedule is incomplete/);
  tables.delay_study_campaigns.planned_trials = 1001; await assert.rejects(delay.getStudyData(), /truncated trial counts/);
  tables.delay_study_campaigns = null; assert.equal(await delay.getStudyData(), null);
});

test('delay bibliography claims and individual trials keep the campaign and matched block identities', async () => {
  const id = '847fb283-8e6c-4372-a14e-0c7c58a5c42a'; tables.delay_study_papers = [{reference_number: 1, citation: 'Synthetic paper'}]; tables.delay_study_claims = [{claim_id: 'claim', published_values: {value: 0}}];
  assert.equal((await delay.getStudyPapers())[0].citation, 'Synthetic paper'); assert.equal((await delay.getStudyClaims())[0].published_values.value, 0);
  queries = []; assert.equal(await delay.getStudyTrial('invalid'), null); assert.equal(queries.length, 0);
  tables.delay_study_trials = null; assert.equal(await delay.getStudyTrial(id), null);
  tables.delay_study_trials = {id, configuration_id: 'configuration', block_index: 7}; tables.delay_study_flows = [{flow_index: 0, goodput_mbps: '0'}]; tables.delay_study_samples = []; tables.delay_study_configurations = {id: 'configuration'};
  globalThis.__studyReply = async q => q.table === 'delay_study_trials' && q.filters.some(([op]) => op === 'neq') ? {data: {id: 'paired', block_index: 7}, error: null} : reply(q);
  const result = await delay.getStudyTrial(id); assert.equal(result.flows[0].goodput_mbps, 0); assert.equal(result.paired.id, 'paired'); assert.equal(result.configuration.id, 'configuration');
  const paired = queries.find(q => q.filters.some(([op]) => op === 'neq')); assert.ok(paired.filters.some(([, key, value]) => key === 'block_index' && value === 7)); assert.ok(paired.filters.some(([op, key, value]) => op === 'neq' && key === 'id' && value === id));
});

test('each study query exposes non-sensitive database errors instead of inventing empty results', async () => {
  globalThis.__studyReply = async () => ({data: null, error: {message: 'Synthetic permission rejection'}, status: 403});
  for (const read of [delay.getStudyCampaign, leo.getLeoCampaign, ipv6.getIPv6Data, reliable.getReliableData, http2.getHttp2Data]) await assert.rejects(read(), /Synthetic permission rejection/);
});

test('LEO primary and saturation campaigns remain separate and sample coverage cannot truncate silently', async () => {
  tables = {leo_study_campaigns: {id: LEO_STUDY_ID, planned_samples: '1', recorded_samples: '1'}, leo_study_configurations: [], leo_study_samples: [{capacity_gbps: '0'}], leo_study_summaries: []};
  globalThis.__studyReply = async q => q.table === 'leo_study_campaigns' && q.filters.some(([, key, value]) => key === 'id' && value === LEO_SATURATION_ID) ? {data: {id: LEO_SATURATION_ID, planned_samples: 1, recorded_samples: 1}, error: null} : reply(q);
  const result = await leo.getLeoData(); assert.equal(result.campaign.id, LEO_STUDY_ID); assert.equal(result.saturation.campaign.id, LEO_SATURATION_ID); assert.equal(result.samples[0].capacity_gbps, 0);
  tables.leo_study_campaigns.recorded_samples = 2; await assert.rejects(leo.getLeoData(), /counts do not match/);
  tables.leo_study_campaigns.planned_samples = 1001; await assert.rejects(leo.getLeoData(), /page size/);
  tables.leo_study_campaigns = null; assert.equal(await leo.getLeoData(), null);
  globalThis.__studyReply = async () => ({data: null, error: null}); assert.equal(await leo.getLeoData(), null);
});

test('LEO bibliography and selected campaign claims use bounded explicit public projections', async () => {
  tables.leo_study_papers = [{reference_number: 1}]; tables.leo_study_claims = [{claim_id: 'one'}];
  assert.equal((await leo.getLeoPapers()).length, 1); assert.equal((await leo.getLeoClaims()).length, 1); await leo.getLeoClaims(LEO_SATURATION_ID);
  assert.equal(queries[0].limit, 1000); assert.ok(queries[2].filters.some(([, key, value]) => key === 'campaign_id' && value === LEO_SATURATION_ID));
});

function studyTables(prefix, names) {
  tables[prefix + '_study_meta'] = {counts: Object.fromEntries(names.map(name => [name, 1]))};
  for (const name of names) tables[prefix + '_study_' + name] = [{id: name + '-original'}];
}
test('IPv6 reads every counted relation across pages and rejects any mismatch with the retained inventory', async () => {
  const names = ['configurations', 'summaries', 'comparisons', 'sources', 'claims', 'runs', 'protocols', 'campaigns', 'controls']; studyTables('ipv6', names);
  tables.ipv6_study_runs = fixtures(1001); tables.ipv6_study_meta.counts.runs = 1001;
  const result = await ipv6.getIPv6Data(); assert.equal(result.runs.length, 1001); assert.deepEqual(queries.filter(q => q.table === 'ipv6_study_runs').map(q => q.range), [[0, 999], [1000, 1999]]);
  tables.ipv6_study_meta.counts.claims = 2; await assert.rejects(ipv6.getIPv6Data(), /claims coverage mismatch/);
  tables.ipv6_study_meta.counts.claims = 1; tables.ipv6_study_runs = fixtures(2001); tables.ipv6_study_meta.counts.runs = 2001; await assert.rejects(ipv6.getIPv6Data(), /runs coverage mismatch/);
  tables.ipv6_study_meta = null; assert.equal(await ipv6.getIPv6Data(), null);
});

test('ReliableSketch inventory and run exports require complete counts and safe configuration identities', async () => {
  const names = ['campaigns', 'configurations', 'summaries', 'sources', 'claims', 'protocols', 'published', 'controls']; studyTables('reliable', names);
  assert.equal((await reliable.getReliableData()).published[0].id, 'published-original'); tables.reliable_study_meta.counts.controls = 2; await assert.rejects(reliable.getReliableData(), /controls coverage mismatch/);
  tables.reliable_study_meta = null; assert.equal(await reliable.getReliableData(), null);
  tables.reliable_study_runs = fixtures(1001); const all = await reliable.getReliableRuns(); assert.equal(all.length, 1001);
  await reliable.getReliableRuns('main-zipf0.3-8192-RS'); assert.ok(queries.at(-1).filters.some(([, key, value]) => key === 'configuration_id' && value === 'main-zipf0.3-8192-RS'));
  const count = queries.length; await assert.rejects(reliable.getReliableRuns('arbitrary/unrecorded'), /Invalid recorded/); assert.equal(queries.length, count);
  tables.reliable_study_runs = fixtures(2001); await assert.rejects(reliable.getReliableRuns(), /Truncated/);
});

function httpTables() {
  tables.http2_study_campaigns = {planned_runs: 1, recorded_runs: 1};
  for (const name of ['configurations', 'runs', 'summaries', 'claims', 'followups', 'protocols']) tables['http2_study_' + name] = [{id: name}];
  tables.http2_study_sources = fixtures(49, 'source');
}
test('HTTP/2 inventory checks both database counts and recorded campaign/source coverage', async () => {
  httpTables(); const result = await http2.getHttp2Data(); assert.equal(result.sources.length, 49); assert.equal(result.protocols.length, 1);
  assert.ok(queries.find(q => q.table === 'http2_study_sources').order.includes('reference_number')); assert.equal(queries.find(q => q.table === 'http2_study_protocols').limit, 100);
  tables.http2_study_claims = fixtures(1001); await assert.rejects(http2.getHttp2Data(), /Incomplete HTTP\/2 claims page/); tables.http2_study_claims = [];
  tables.http2_study_sources.pop(); await assert.rejects(http2.getHttp2Data(), /Study coverage/); tables.http2_study_campaigns = null; assert.equal(await http2.getHttp2Data(), null);
});

test('HTTP/2 measurement pagination preserves all 7176 originals and filters only declared archive identities', async () => {
  tables.http2_study_measurements = fixtures(7176); const rows = await http2.getHttp2Measurements(); assert.equal(rows.length, 7176);
  assert.deepEqual(queries.map(q => q.range), Array.from({length: 8}, (_, i) => [i * 1000, i * 1000 + 999]));
  tables.http2_study_measurements = fixtures(1); await assert.rejects(http2.getHttp2Measurements(), /Archived measurement coverage mismatch/);
  assert.equal((await http2.getHttp2Measurements('archive-001')).length, 1); assert.ok(queries.at(-1).filters.some(([, key, value]) => key === 'run_id' && value === 'archive-001'));
  const count = queries.length; await assert.rejects(http2.getHttp2Measurements('../other'), /Invalid archived/); assert.equal(queries.length, count);
  tables.http2_study_measurements = fixtures(10001); await assert.rejects(http2.getHttp2Measurements('archive-001'), /Incomplete HTTP\/2 measurements/);
});

test('HTTP/2 frame export retains its own follow-up identities and rejects truncated pages', async () => {
  tables.http2_study_frame_measurements = [{id: 'frame', followup_id: 'separate-followup', error_code: 0}]; const result = await http2.getHttp2Frames(); assert.equal(result[0].error_code, 0); assert.equal(result[0].followup_id, 'separate-followup');
  tables.http2_study_frame_measurements = fixtures(1001); await assert.rejects(http2.getHttp2Frames(), /Truncated loopback/);
});

test('public research reads distinguish unconfigured missing unavailable and invalid snapshots', async () => {
  assert.equal((await research.getResearchStudies()).status, 'unavailable'); assert.equal((await research.getResearchSnapshot('invalid')).status, 'not-found');
  process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL = 'https://research.example.test'; const id = '81e65112-0e28-47d0-a22a-a9c503148018'; let calls = 0;
  for (const status of [404, 503]) {
    globalThis.fetch = async () => {calls++; return new Response('{}', {status});}; assert.equal((await research.getResearchSnapshot(id)).status, status === 404 ? 'not-found' : 'unavailable');
  }
  assert.equal(calls, 2); globalThis.fetch = async () => {throw new TypeError('Synthetic connection loss');}; assert.equal((await research.getResearchStudies()).status, 'unavailable');
  globalThis.fetch = async () => new Response('not JSON', {status: 200}); assert.equal((await research.getResearchStudies()).status, 'unavailable');
  globalThis.fetch = async () => Response.json({records: {}}); assert.equal((await research.getResearchSnapshot(id)).status, 'unavailable');
});

test('public research snapshots are complete public projections fetched without caching or credentials', async () => {
  const id = '81e65112-0e28-47d0-a22a-a9c503148018'; process.env.NEXT_PUBLIC_BENCHMARK_API_URL = 'https://benchmark.example.test/';
  const snapshot = {study: {id}, access: 'published-snapshot', records: Object.fromEntries(RECORD_KINDS.map(kind => [kind, []])), coverage: Object.fromEntries(RECORD_KINDS.map(kind => [kind, 0]))};
  const calls = []; globalThis.fetch = async (url, options) => {calls.push({url, options}); return Response.json(snapshot);};
  assert.deepEqual(await research.getResearchSnapshot(id), {status: 'available', data: snapshot}); assert.equal(calls[0].url, 'https://benchmark.example.test/research/studies/' + id);
  assert.equal(calls[0].options.cache, 'no-store'); assert.deepEqual(calls[0].options.headers, {Accept: 'application/json'}); assert.ok(calls[0].options.signal instanceof AbortSignal);
  globalThis.fetch = async () => Response.json({studies: [], has_more: true}); assert.deepEqual(await research.getResearchStudies(), {status: 'available', data: {studies: [], has_more: true}});
  snapshot.coverage.claims = 1; globalThis.fetch = async () => Response.json(snapshot); assert.equal((await research.getResearchSnapshot(id)).status, 'unavailable');
});
