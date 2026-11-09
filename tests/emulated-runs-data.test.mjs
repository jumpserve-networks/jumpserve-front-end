import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {registerHooks} from 'node:module';

// Replace only the request-scoped database factory and Next's cache boundary.
// The loaders, units, filtering, summaries and aggregate provenance stay real.
const stubs = {
  '@/lib/supabase/server': `export const createClient=async()=>globalThis.__runsClient;export const createStaticClient=()=>globalThis.__staticRunsClient;`,
  'next/cache': `export const unstable_cache=(callback,keys,options)=>{globalThis.__runsCache={keys,options};return callback;};`,
};
const hooks = registerHooks({resolve(specifier, context, next) {
  return stubs[specifier] ? {shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier])} : next(specifier, context);
}});
const data = await import('../lib/emulated-runs-data.ts');
hooks.deregister();
afterEach(() => {delete globalThis.__runsClient; delete globalThis.__staticRunsClient;});

const parent = (id, change = {}) => ({id, created_at: `2026-11-${String(id).padStart(2, '0')}T00:00:00Z`,
  snapshot_length_ms: '1250', bottleneck_rate_megabit: '10', queue_buffer_size_kilobyte: '64', number_of_clients: 2, ...change});
const run = (id, parentId, client, change = {}) => ({id, emulated_parent_run_id: parentId, client_number: client,
  created_at: '2026-11-01T00:00:00Z', delay_added: 0, client_start_delay_ms: 0, client_file_size_megabytes: 5,
  flow_completion_time_ms: '120.5', congestion_control_algorithm_id: 1, congestion_control_algorithms: {name: 'cubic'}, ...change});
const stat = (id, runId, change = {}) => ({id, emulated_run_id: runId, snapshot_index: 0, elapsed_microseconds: '1250000',
  megabits_per_second: '8.75', round_trip_time_ms: '21.5', bottleneck_queuing_delay_ms: '0',
  in_flight_packets: 7, congestion_window_bytes: '15000', ...change});

function database({parents = [], runs = [], stats = [], jobs = [], respond} = {}) {
  const calls = [];
  const tables = {emulated_parent_runs: parents, emulated_runs: runs, emulated_snapshot_stats: stats, benchmark_jobs: jobs};
  const client = {calls, from(table) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`);
    const request = {table, filters: [], orders: []}; calls.push(request);
    const query = {
      select(columns) {request.columns = columns; return query;},
      order(column, options) {request.orders.push([column, options]); return query;},
      limit(value) {request.limit = value; return query;},
      range(from, to) {request.range = [from, to]; return query;},
      eq(column, value) {request.filters.push(['eq', column, value]); return query;},
      in(column, values) {request.filters.push(['in', column, values]); return query;},
      not(column, operator, value) {assert.equal(operator, 'is'); request.filters.push(['not', column, value]); return query;},
      gt(column, value) {request.filters.push(['gt', column, value]); return query;},
      maybeSingle() {request.single = true; return query;},
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          const explicit = respond?.(request);
          if (explicit !== undefined) return explicit;
          let rows = tables[table].filter(row => request.filters.every(([op, key, value]) =>
            op === 'eq' ? row[key] === value : op === 'in' ? value.includes(row[key]) : op === 'gt' ? row[key] > value : row[key] !== value));
          if (request.range) rows = rows.slice(request.range[0], request.range[1] + 1);
          if (request.limit !== undefined) rows = rows.slice(0, request.limit);
          return {data: request.single ? rows[0] ?? null : rows, error: null};
        }).then(resolve, reject);
      },
    };
    return query;
  }};
  globalThis.__runsClient = client;
  globalThis.__staticRunsClient = client;
  return client;
}

test('dashboard data converts numeric strings and microseconds while preserving missing and zero values', async () => {
  const db = database({parents: [parent(1)], runs: [run(11, 1, 1), run(12, 1, 2, {congestion_control_algorithms: [{name: 'bbr'}]})],
    stats: [stat(1, 11), stat(2, 12, {elapsed_microseconds: null, megabits_per_second: 'NaN', round_trip_time_ms: null,
      bottleneck_queuing_delay_ms: 'Infinity', congestion_window_bytes: 0})]});
  const result = await data.fetchCachedParentRunDashboardData(1);
  assert.deepEqual(result.parentRuns, [{id: 1, createdAt: parent(1).created_at, snapshotLengthSeconds: 1.25, bottleneckRateMegabit: 10}]);
  assert.deepEqual(result.runs.map(item => [item.id, item.congestionControlAlgorithmName, item.delayAddedMs, item.clientStartDelayMs]), [[11, 'cubic', 0, 0], [12, 'bbr', 0, 0]]);
  assert.deepEqual(result.stats[0], {id: 1, emulatedRunId: 11, snapshotIndex: 0, elapsedSeconds: 1.25, megabitsPerSecond: 8.75,
    roundTripTimeMs: 21.5, bottleneckQueuingDelayMs: 0, inFlightPackets: 7, congestionWindowBytes: 15000});
  assert.equal(result.stats[1].elapsedSeconds, null); assert.equal(result.stats[1].megabitsPerSecond, null);
  assert.equal(result.stats[1].roundTripTimeMs, null); assert.equal(result.stats[1].bottleneckQueuingDelayMs, null);
  assert.equal(result.stats[1].congestionWindowBytes, 0);
  assert.deepEqual(db.calls[0].filters, [['eq', 'id', 1]]); assert.equal(db.calls[1].limit, 400);
  assert.ok(db.calls[1].filters.some(filter => filter[0] === 'eq' && filter[1] === 'emulated_parent_run_id' && filter[2] === 1));
});

test('selected dashboards restrict both parent and client reads, and empty responses never fetch snapshots', async () => {
  const db = database({parents: [parent(1), parent(2)], runs: [run(1, 1, 1), run(2, 2, 1, {congestion_control_algorithms: []})]});
  const result = await data.fetchCachedParentRunDashboardData(2);
  assert.deepEqual(result.runs.map(item => item.id), [2]); assert.equal(result.runs[0].congestionControlAlgorithmName, null);
  assert.deepEqual(db.calls[0].filters, [['eq', 'id', 2]]);
  assert.ok(db.calls[1].filters.some(filter => filter[0] === 'eq' && filter[2] === 2));
  const empty = database({respond: () => ({data: null, error: null})});
  assert.deepEqual(await data.fetchCachedParentRunDashboardData(1), {parentRuns: [], runs: [], stats: []});
  assert.equal(empty.calls.length, 2);
});

test('a selected legacy client retains its parent identity without inventing configuration or creation times', async () => {
  database({runs: [run(10, 9, 1, {congestion_control_algorithms: null}), run(11, 8, 1)]});
  const result = await data.fetchCachedParentRunDashboardData(9);
  assert.deepEqual(result.parentRuns, [{id: 9, createdAt: null, snapshotLengthSeconds: null, bottleneckRateMegabit: null}]);
  assert.deepEqual(result.runs.map(item => item.id), [10]);
});

test('legacy and incomplete query results stay explicit through normalization', async () => {
  database({parents: [parent(2, {created_at: null, snapshot_length_ms: null, bottleneck_rate_megabit: 'invalid'})], runs: [run(1, 2, 1)],
    respond: q => q.table === 'emulated_snapshot_stats' ? {data: null, error: null} : undefined});
  const result = await data.fetchCachedParentRunDashboardData(2);
  assert.deepEqual(result.parentRuns.map(item => item.id), [2]);
  assert.equal(result.parentRuns[0].createdAt, null);
  assert.equal(result.parentRuns[0].snapshotLengthSeconds, null);
  assert.equal(result.parentRuns[0].bottleneckRateMegabit, null);
  assert.deepEqual(result.stats, []);

  database({parents: [parent(1)], respond: q => q.table === 'emulated_runs' ? {data: null, error: null} : undefined});
  const page = await data.fetchParentRunsForIndexPage();
  assert.equal(page.parentRuns[0].clientSummaryLine, 'No client runs');
  database({parents: [parent(1)], respond: q => q.table === 'emulated_runs' ? {data: [run(1, 1, null), run(2, null, 1), run(3, 1, 1)], error: null} :
    q.table === 'emulated_snapshot_stats' ? {data: [stat(1, 99), stat(2, 3)], error: null} : undefined});
  assert.equal((await data.fetchParentRunsForIndexPage()).parentRuns[0].chartDurationSeconds, 1.25);
  const summary = await data.fetchParentRunSummary(1);
  assert.equal(summary.clientCount, 1);
  assert.equal(summary.chartDurationSeconds, 1.25);
  database({parents: [parent(1)], runs: [run(1, 1, 1)], respond: q => q.table === 'emulated_snapshot_stats' ? {data: null, error: null} : undefined});
  assert.equal((await data.fetchParentRunSummary(1)).chartDurationSeconds, null);
});

test('all snapshot pages and 25-client batches are retrieved without skipping or duplicating measurements', async () => {
  const runs = Array.from({length: 26}, (_, i) => run(i + 1, 1, i + 1));
  const stats = [...Array.from({length: 1001}, (_, i) => stat(i, 1, {snapshot_index: i, elapsed_microseconds: String(i * 1000)})), stat(1001, 26)];
  const db = database({parents: [parent(1)], runs, stats});
  const result = await data.fetchCachedParentRunDashboardData(1);
  assert.equal(result.stats.length, 1002); assert.equal(new Set(result.stats.map(item => item.id)).size, 1002);
  const requests = db.calls.filter(item => item.table === 'emulated_snapshot_stats');
  assert.deepEqual(requests.map(item => item.range), [[0, 999], [1000, 1999], [0, 999]]);
  assert.deepEqual(requests.map(item => item.filters[0][2].length), [25, 25, 1]);
  assert.equal(result.stats[1000].elapsedSeconds, 1);
});

test('every dashboard retrieval stage propagates database diagnostics, including a later snapshot page', async () => {
  for (const table of ['emulated_parent_runs', 'emulated_runs', 'emulated_snapshot_stats']) {
    database({parents: [parent(1)], runs: [run(1, 1, 1)], respond: q => q.table === table ? {data: null, error: {message: 'Fixture failure'}} : undefined});
    await assert.rejects(data.fetchCachedParentRunDashboardData(1), new RegExp(`Failed to load ${table}: Fixture failure`));
  }
  database({parents: [parent(1)], runs: [run(1, 1, 1)], stats: Array.from({length: 1000}, (_, i) => stat(i, 1)),
    respond: q => q.table === 'emulated_snapshot_stats' && q.range[0] === 1000 ? {data: null, error: {message: 'Later page failed'}} : undefined});
  await assert.rejects(data.fetchCachedParentRunDashboardData(1), /Later page failed/);
});

const summaryRuns = () => [
  run(14, 1, 2, {congestion_control_algorithms: [{name: 'bbr'}], delay_added: 10, client_start_delay_ms: 30, client_file_size_megabytes: 8, flow_completion_time_ms: '0'}),
  run(12, 1, 1, {congestion_control_algorithms: null, delay_added: 2, client_start_delay_ms: 10, client_file_size_megabytes: 4}),
  run(11, 1, 1, {congestion_control_algorithms: [], congestion_control_algorithm_id: null, delay_added: null, client_start_delay_ms: null, client_file_size_megabytes: null}),
  run(15, 1, 3, {congestion_control_algorithms: {name: null}, congestion_control_algorithm_id: null, client_file_size_megabytes: null, flow_completion_time_ms: 'NaN'}),
  run(16, 1, null), run(17, null, 1),
];

test('parent summary chooses the latest record per client, preserves zero completion, and computes units and duration', async () => {
  database({parents: [parent(1)], runs: summaryRuns(), stats: [stat(1, 12), stat(2, 14, {elapsed_microseconds: null, snapshot_index: 3}),
    stat(3, 15, {elapsed_microseconds: null, snapshot_index: null}), stat(4, 15, {elapsed_microseconds: 'invalid', snapshot_index: null})]});
  const result = await data.fetchParentRunSummary(1);
  assert.equal(result.clientSummaryLine, 'id 1 2ms | bbr 10ms | n/a 0ms');
  assert.equal(result.clientCount, 3); assert.equal(result.totalClientFileSizeMegabytes, 12);
  assert.deepEqual(result.clientFlowCompletionTimes, [{clientNumber: 1, flowCompletionTimeMs: 120.5}, {clientNumber: 2, flowCompletionTimeMs: 0}, {clientNumber: 3, flowCompletionTimeMs: null}]);
  assert.equal(result.snapshotLengthSeconds, 1.25); assert.equal(result.chartDurationSeconds, 3);
  assert.deepEqual(result.delayLabels, ['0ms', '2ms', '10ms', 'n/a']);
  assert.deepEqual(result.ccaLabels, ['bbr', 'id 1', 'n/a']);
  assert.deepEqual(result.clientStartDelayMsValues, [0, 10, 30]); assert.deepEqual(result.clientFileSizeMegabytesValues, [4, 8]);
});

test('missing parent summaries and clientless parents do not manufacture counts, durations or file sizes', async () => {
  let db = database(); assert.equal(await data.fetchParentRunSummary(1), null); assert.equal(db.calls.length, 1);
  db = database({parents: [parent(1)], respond: q => q.table === 'emulated_runs' ? {data: null, error: null} : undefined});
  const result = await data.fetchParentRunSummary(1);
  assert.equal(result.clientCount, 0); assert.equal(result.clientSummaryLine, 'No client runs');
  assert.equal(result.totalClientFileSizeMegabytes, null); assert.equal(result.chartDurationSeconds, null);
  assert.equal(db.calls.length, 2);
});

test('summary read failures include the failed relation and do not publish partial summaries', async () => {
  for (const table of ['emulated_parent_runs', 'emulated_runs', 'emulated_snapshot_stats']) {
    database({parents: [parent(1)], runs: [run(1, 1, 1)], respond: q => q.table === table ? {data: null, error: {message: 'Summary failure'}} : undefined});
    await assert.rejects(data.fetchParentRunSummary(1), new RegExp(`Failed to load ${table}: Summary failure`));
  }
});

function filterFixture() {
  return database({parents: [parent(3, {number_of_clients: null, bottleneck_rate_megabit: null, queue_buffer_size_kilobyte: null}), parent(2, {number_of_clients: 1, bottleneck_rate_megabit: 20, queue_buffer_size_kilobyte: 128}), parent(1)], runs: [
    run(11, 1, 1), run(12, 1, 2, {congestion_control_algorithms: [{name: 'bbr'}], delay_added: 10, client_start_delay_ms: 20, client_file_size_megabytes: 8}),
    run(21, 2, 1, {congestion_control_algorithms: {name: 'bbr'}, delay_added: 20, client_start_delay_ms: 50, client_file_size_megabytes: 10}),
    run(31, 3, null, {congestion_control_algorithms: null, congestion_control_algorithm_id: null, delay_added: null, client_start_delay_ms: null, client_file_size_megabytes: null}),
    run(41, 99, 1), run(42, null, 1),
  ]});
}

test('index pagination is clamped, has-more uses matched parents, and defaults retain the public projection', async () => {
  let db = filterFixture();
  let result = await data.fetchParentRunsForIndexPage({page: -2, pageSize: 1});
  assert.deepEqual([result.page, result.pageSize, result.totalPages, result.totalCount, result.hasMore], [1, 1, 3, 3, true]);
  assert.equal(result.parentRuns[0].id, 3); assert.equal(result.parentRuns[0].clientCount, 0);
  assert.equal(result.parentRuns[0].clientSummaryLine, 'No client runs');
  assert.equal(result.parentRuns[0].totalClientFileSizeMegabytes, null);
  assert.equal(db.calls.some(q => /email|requester|\*/.test(q.columns)), false);
  result = await data.fetchParentRunsForIndexPage({page: 999, pageSize: 0});
  assert.equal(result.page, 3); assert.equal(result.pageSize, 1); assert.equal(result.hasMore, false);
  result = await data.fetchParentRunsForIndexPage({pageSize: 999}); assert.equal(result.pageSize, 100);
  database(); result = await data.fetchParentRunsForIndexPage();
  assert.deepEqual([result.page, result.pageSize, result.totalPages, result.totalCount, result.hasMore], [1, 30, 1, 0, false]);
});

test('every index filter uses recorded fields with OR within a category and AND between categories', async () => {
  const cases = [
    [{runSearchQuery: ' 1 '}, [1]], [{clientCounts: [2, 2, NaN, Infinity]}, [1]],
    [{ccaLabels: [' cubic ', '', 'cubic']}, [1]], [{ccaLabels: ['cubic', 'bbr']}, [2, 1]],
    [{ccaByClientNumber: {1: ['bbr'], bogus: ['cubic'], 2: []}}, [2]], [{ccaByClientNumber: {2: ['bbr']}}, [1]],
    [{addedDelaysMs: [10]}, [1]], [{clientStartDelaysMs: [20]}, [1]], [{clientFileSizesMegabytes: [8]}, [1]],
    [{bottleneckRatesMegabit: [10]}, [1]], [{queueBufferSizesKilobyte: [128]}, [2]],
    [{ccaLabels: ['cubic'], clientFileSizesMegabytes: [10]}, []], [{clientCounts: [3]}, []],
  ];
  for (const [filters, expected] of cases) {
    filterFixture(); const result = await data.fetchParentRunsForIndexPage({filters});
    assert.deepEqual(result.parentRuns.map(item => item.id), expected, JSON.stringify(filters));
  }
});

test('reactive filter facets omit their own category while respecting other filters and count a parent once', async () => {
  filterFixture();
  const all = (await data.fetchParentRunsForIndexPage()).filterOptions;
  assert.deepEqual(all.clientCounts, [{value: 1, count: 1}, {value: 2, count: 1}]);
  assert.deepEqual(all.ccaLabels, [{value: 'bbr', count: 2}, {value: 'cubic', count: 1}]);
  assert.deepEqual(all.ccaLabelsByClientNumber[2], [{value: 'bbr', count: 1}]);
  assert.deepEqual(all.bottleneckRatesMegabit, [{value: 10, count: 1}, {value: 20, count: 1}]);
  assert.deepEqual(all.queueBufferSizesKilobyte, [{value: 64, count: 1}, {value: 128, count: 1}]);
  const selected = (await data.fetchParentRunsForIndexPage({filters: {ccaLabels: ['cubic']}})).filterOptions;
  assert.deepEqual(selected.ccaLabels, all.ccaLabels);
  assert.deepEqual(selected.clientCounts, [{value: 2, count: 1}]);
  assert.deepEqual(selected.addedDelaysMs, [{value: 0, count: 1}, {value: 10, count: 1}]);
  const byClient = (await data.fetchParentRunsForIndexPage({filters: {ccaByClientNumber: {1: ['cubic']}}})).filterOptions;
  assert.deepEqual(byClient.ccaLabelsByClientNumber[1], [{value: 'bbr', count: 1}, {value: 'cubic', count: 1}]);
  assert.deepEqual(byClient.ccaLabelsByClientNumber[2], [{value: 'bbr', count: 1}]);
});

test('index summaries use latest client values and numeric units just like the detail summary', async () => {
  database({parents: [parent(1)], runs: summaryRuns(), stats: [stat(1, 14, {elapsed_microseconds: null, snapshot_index: 4}), stat(2, 14)]});
  const {parentRuns: [result]} = await data.fetchParentRunsForIndexPage();
  assert.equal(result.clientSummaryLine, 'id 1 2ms | bbr 10ms | n/a 0ms');
  assert.equal(result.clientCount, 2); // The recorded parent count has precedence in the index.
  assert.equal(result.totalClientFileSizeMegabytes, 12); assert.equal(result.chartDurationSeconds, 4);
  assert.deepEqual(result.clientFlowCompletionTimes.map(item => item.flowCompletionTimeMs), [120.5, 0, null]);
});

test('parent, client and snapshot pagination continue past full pages and batch selected parents', async () => {
  const parents = Array.from({length: 1001}, (_, i) => parent(i + 1));
  const runs = Array.from({length: 1001}, (_, i) => run(i + 1, 1, i + 1));
  const stats = Array.from({length: 1001}, (_, i) => stat(i, 1, {snapshot_index: i, elapsed_microseconds: null}));
  const db = database({parents, runs, stats});
  const result = await data.fetchParentRunsForIndexPage({pageSize: 100});
  assert.equal(result.totalCount, 1001); assert.equal(result.totalPages, 11); assert.equal(result.parentRuns.length, 100);
  assert.equal(result.parentRuns[0].chartDurationSeconds, 1000);
  assert.equal(result.parentRuns[0].clientCount, 2); assert.equal(result.parentRuns[0].clientFlowCompletionTimes.length, 1001);
  for (const table of ['emulated_parent_runs', 'emulated_runs']) {
    const requests = db.calls.filter(q => q.table === table && q.range);
    assert.deepEqual(requests.map(q => q.range), [[0, 999], [1000, 1999]]);
  }
  const durationCalls = db.calls.filter(q => q.table === 'emulated_snapshot_stats');
  assert.equal(durationCalls[0].filters[0][2].length, 25);
  assert.deepEqual(durationCalls[1].range, [1000, 1999]);
  assert.equal(durationCalls.at(-1).filters[0][2].length, 1);
});

test('index retrieval errors abort before returning any partial page or facet counts', async () => {
  for (const stage of ['parents', 'all-clients', 'selected-clients', 'duration']) {
    const db = filterFixture(); const original = db.from;
    db.from = table => {
      const query = original(table); const then = query.then;
      query.then = (resolve, reject) => {
        const q = db.calls.at(-1);
        const fail = stage === 'parents' ? table === 'emulated_parent_runs' : stage === 'duration' ? table === 'emulated_snapshot_stats' :
          table === 'emulated_runs' && (stage === 'selected-clients' ? q.filters.some(f => f[0] === 'in') : q.filters.length === 0);
        return fail ? Promise.resolve({data: null, error: {message: `Fixture ${stage}`}}).then(resolve, reject) : then(resolve, reject);
      };
      return query;
    };
    await assert.rejects(data.fetchParentRunsForIndexPage(), new RegExp(`Fixture ${stage}`));
  }
  database({respond: () => ({data: null, error: null})});
  assert.equal((await data.fetchParentRunsForIndexPage()).totalCount, 0);
});

test('cached dashboard reads use the anonymous static client and the declared short revalidation boundary', async () => {
  const db = database({parents: [parent(1)], runs: [run(1, 1, 1)]});
  globalThis.__staticRunsClient = db; delete globalThis.__runsClient;
  const result = await data.fetchCachedParentRunDashboardData(1);
  assert.equal(result.runs[0].id, 1);
  assert.deepEqual(globalThis.__runsCache, {keys: ['parent-run-dashboard'], options: {revalidate: 30}});
});

test('aggregate export retains the complete recorded configuration, without inferred throughput or paired trials', async () => {
  database({runs: [run(1, 1, 1, {emulated_parent_runs: {number_of_clients: 1, bottleneck_rate_megabit: 10,
    queue_buffer_size_kilobyte: 64, snapshot_length_ms: 1000, topology: 'proxy-delay', topology_config: {links: 1}}})],
    jobs: [{id: 'job-1', parent_run_id: 1, config: {clientStartDelays: [0]}}]});
  const [result] = await data.fetchAggregateDelayGraphData();
  assert.equal(result.parentRunId, 1); assert.equal(result.averageThroughputMbps, null); assert.equal(result.runCount, 1);
  assert.deepEqual(result.configuration.jobConfig, {clientStartDelays: [0]});
  assert.deepEqual(result.configuration.topologyConfig, {links: 1});
  assert.equal(result.configuration.clients[0].cca, 'cubic');
});
