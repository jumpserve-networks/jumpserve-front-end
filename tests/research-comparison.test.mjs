import assert from "node:assert/strict";
import { test } from "node:test";
import { compareConfigurations, buildSweepGroups, configurationIssue, configurationKey, formatSeconds, medianInterval } from "../lib/research-comparison.ts";
import { loadAggregateResearchData } from "../lib/aggregate-research-data.ts";

function experiment(id, cca, fct, workload = 50, delay = 10) {
  const configuration = {
    numberOfClients: 2, rateMbps: 50, bufferKib: 125, snapshotMs: 100,
    topology: "single-bottleneck", topologyConfig: null,
    jobConfig: { script: "netem_nines.py" },
    clients: [1, 2].map(n => ({ clientNumber: n, delayMs: n === 1 ? delay : 60, startDelayMs: 0, workloadMb: workload, cca })),
  };
  return [1, 2].map(clientNumber => ({ parentRunId: id, clientNumber, flowCompletionTimeMs: fct, configuration }));
}

test("signed effects always use seconds, including negative and sub-second values", () => {
  assert.equal(formatSeconds(4930, true), "+4.930 s");
  assert.equal(formatSeconds(-19093, true), "−19.093 s");
  assert.equal(formatSeconds(-50, true), "−0.050 s");
  assert.equal(formatSeconds(0, true), "0.000 s");
});

test("different workloads never become an algorithm comparison", () => {
  const result = compareConfigurations([...experiment(1, "bbr", 1000, 5), ...experiment(2, "cubic", 30000, 500)], [1, 2]);
  assert.equal(result.blocks.length, 0);
  assert.equal(result.median, null);
  assert.equal(result.excluded.length, 2);
});

test("equal configuration weighting prevents repetition imbalance from reversing the effect", () => {
  const points = [...experiment(1, "bbr", 1000, 5), ...experiment(2, "cubic", 2000, 5), ...experiment(3, "bbr", 100000, 500), ...experiment(4, "cubic", 101000, 500)];
  for (let id = 5; id < 50; id++) points.push(...experiment(id, "bbr", 1000, 5));
  const result = compareConfigurations(points, [1, 2]);
  assert.equal(result.blocks.length, 2);
  assert.equal(result.median.delta, 1000);
  assert.equal(result.median.bbr, 50500);
  assert.equal(result.median.cubic, 51500);
  assert.equal(result.median.interval, null);
});

test("the complete competing-client configuration is matched even if only one client is visible", () => {
  for (const mutate of [c => c.clients[1].delayMs++, c => c.clients[1].workloadMb++, c => c.clients[1].startDelayMs++, c => c.rateMbps++, c => c.bufferKib++, c => c.snapshotMs++, c => c.jobConfig.loss_pct = 1, c => c.jobConfig.script = "netem_cubic_benchmark_nines.py"]) {
    const a = experiment(1, "bbr", 1000), b = experiment(2, "cubic", 2000);
    mutate(b[0].configuration);
    assert.equal(compareConfigurations([...a, ...b], [1]).blocks.length, 0);
  }
});

test("mixed algorithms, incomplete configurations, missing outcomes, and duplicate clients are excluded", () => {
  const valid = experiment(1, "bbr", 1000);
  for (const mutate of [rows => rows[0].configuration.clients[1].cca = "bbr", rows => rows[0].configuration.jobConfig = null, rows => rows[0].configuration.clients[1].startDelayMs = null, rows => rows[0].flowCompletionTimeMs = null, rows => rows[0].flowCompletionTimeMs = Infinity, rows => rows[1].clientNumber = 1, rows => rows.pop()]) {
    const other = experiment(2, "cubic", 2000); mutate(other);
    const result = compareConfigurations([...valid, ...other], [1, 2]);
    assert.equal(result.blocks.length, 0);
    assert.equal(result.excluded.length, 2);
  }
});

test("parent runs, not clients, determine replication and bootstrap eligibility", () => {
  const points = [];
  for (let n = 0; n < 5; n++) points.push(...experiment(n + 1, "bbr", 1000 + n * 100), ...experiment(n + 10, "cubic", 2000 + n * 200));
  const result = compareConfigurations(points, [1, 2]);
  assert.equal(result.blocks[0].bbr.length, 5);
  assert.equal(result.median.delta, 1200);
  assert.ok(result.median.interval.low < result.median.interval.high);
  assert.equal(result.p90.interval, null);
  assert.deepEqual(compareConfigurations([...points].reverse(), [1, 2]), result);
  assert.equal(medianInterval([1000]), null);
});

test("intervals require repetitions in every matched configuration, not only total sample count", () => {
  const points = [];
  for (let n = 0; n < 10; n++) points.push(...experiment(n + 1, "bbr", 1000 + n), ...experiment(n + 20, "cubic", 2000 + n));
  assert.ok(compareConfigurations(points, [1]).p90.interval);
  points.push(...experiment(100, "bbr", 10000, 100), ...experiment(101, "cubic", 11000, 100));
  assert.equal(compareConfigurations(points, [1]).median.interval, null);
});

test("notes cannot create matching blocks and conflicting launch settings are rejected", () => {
  const a = experiment(1, "bbr", 1000)[0].configuration;
  const b = structuredClone(a); b.jobConfig.notes = "a different hypothesis";
  assert.equal(configurationKey(a), configurationKey(b));
  b.jobConfig.client_file_sizes_mbytes = [5, 500];
  assert.match(configurationIssue(b), /conflict/);
});

test("sweeps vary only the focal delay and keep repetitions, workloads, competitors and CCAs distinct", () => {
  const a = experiment(1, "bbr", 1000, 50, 10), b = experiment(2, "bbr", 1100, 50, 11);
  const result = buildSweepGroups([...a, ...b]);
  assert.equal(result.groups.length, 3); // focal client 1 sweep; two separate client 2 configurations
  assert.equal(result.groups.find(g => g.clientNumber === 1).points.length, 2);
  const other = experiment(3, "cubic", 1200, 50, 12);
  assert.equal(buildSweepGroups([...a, ...b, ...other]).groups.filter(g => g.clientNumber === 1).length, 2);
  assert.equal(buildSweepGroups([...a, a[0]]).excluded, 2);
});

test("aggregate fetching consumes server-capped pages and retains configuration for missing FCT", async () => {
  const parent = { number_of_clients: 2, bottleneck_rate_megabit: "50", queue_buffer_size_kilobyte: "125", snapshot_length_ms: "100", topology: "single-bottleneck", topology_config: null };
  const runs = [1, 2, 3, 4].map(id => ({ id, emulated_parent_run_id: Math.ceil(id / 2), client_number: id % 2 || 2, delay_added: "10", client_start_delay_ms: "0", flow_completion_time_ms: id === 4 ? null : "1000", client_file_size_megabytes: "50", congestion_control_algorithms: { name: id <= 2 ? "bbr" : "cubic" }, emulated_parent_runs: parent }));
  const jobs = [1, 2].map(id => ({ id: `job-${id}`, parent_run_id: id, config: { script: "netem_nines.py" } }));
  const requests = [];
  const client = { from(table) {
    let after = null;
    return { select() { return this; }, order() { return this; }, limit() { return this; }, in() { return this; }, gt(_key, value) { after = value; return this; }, then(resolve) {
      requests.push([table, after]);
      const rows = (table === "emulated_runs" ? runs : jobs).filter(r => after === null || r.id > after).slice(0, 1);
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    } };
  } };
  const points = await loadAggregateResearchData(client);
  assert.equal(points.length, 4);
  assert.equal(points.find(p => p.parentRunId === 2 && p.clientNumber === 2).flowCompletionTimeMs, null);
  assert.equal(points[0].configuration.clients.length, 2);
  assert.equal(points[0].configuration.rateMbps, 50);
  assert.equal(requests.filter(r => r[0] === "emulated_runs").length, 5);
  assert.equal(compareConfigurations(points, [1, 2]).blocks.length, 0);
});
