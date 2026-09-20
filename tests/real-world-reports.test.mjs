import assert from "node:assert/strict";
import { test } from "node:test";
import { compareRealWorldReports, filterReportJobs, parseReportSelection, reportCsv, tracesCsv, displayNumber } from "../lib/real-world-reports.ts";

const placement = { region: "us-east-1", zone_id: "use1-az1", instance_type: "c6i.large" };
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function report(n, cca, value, config = {}) {
  const configuration = { server: placement, bottleneck: placement, receivers: [placement, placement], duration_seconds: 60, rate_mbit: 10, buffer_kbytes: 125, ...config };
  return { analysis_version: "v1", job: { job_id: id(n), created_at: Date.parse("2026-09-20T12:00:00Z") / 1000, status: "completed", config: { ...configuration, cca, notes: "Test hypothesis" } },
    comparison: { eligible: true, key: "server-checked", exclusions: [], configuration: { configuration, runtime_revision: "v1", machines: [{ name: "server", kernel: "kernel-a", image_id: "ami-a", iperf_version: "3.16" }] } },
    summary: { combined_mean_mbit_per_second: value, jain_fairness: .8 }, receivers: [], queue: [] };
}
const compare = reports => compareRealWorldReports(reports, "cubic", "bbr", "combined_mean_mbit_per_second");

test("different paths, duration, rate, buffer, types, receiver counts and software never pool", () => {
  for (const config of [{ duration_seconds: 10 }, { rate_mbit: 20 }, { buffer_kbytes: 250 }, { receivers: [placement] },
    { server: { ...placement, region: "eu-west-1" } }, { bottleneck: { ...placement, zone_id: "use1-az2" } },
    { receivers: [{ ...placement, instance_type: "c7i.large" }, placement] }]) {
    const result = compare([report(1, "cubic", 8), report(2, "bbr", 9, config)]);
    assert.equal(result.blocks.length, 2);
    assert.equal(result.matchedBlocks, 0);
    assert.ok(result.blocks.every(b => b.delta === null && b.interval === null));
  }
  for (const field of ["kernel", "image_id", "iperf_version"]) {
    const other = report(2, "bbr", 9);
    other.comparison.configuration.machines[0][field] = "different";
    assert.equal(compare([report(1, "cubic", 8), other]).matchedBlocks, 0);
  }
});
test("one test is one replication, independent of its number of trace samples", () => {
  const a = report(1, "cubic", 8), b = report(2, "bbr", 9);
  a.receivers = Array.from({ length: 16 }, () => ({ tcp: Array(600).fill({ rtt_ms: 78 }) }));
  const result = compare([a, a, b]);
  assert.equal(result.blocks[0].baseline.count, 1);
  assert.equal(result.blocks[0].comparison.count, 1);
  assert.equal(result.blocks[0].delta, 1);
  assert.equal(result.blocks[0].interval, null);
  assert.match(result.excluded[0].reason, /Duplicate/);
});
test("confidence intervals require five independent tests in each cohort and are deterministic", () => {
  const rows = Array.from({ length: 10 }, (_, n) => report(n, n < 5 ? "cubic" : "bbr", n));
  const a = compare(rows), b = compare([...rows].reverse());
  assert.deepEqual(a, b);
  assert.equal(a.blocks[0].delta, 5);
  assert.ok(a.blocks[0].interval.low <= 5 && a.blocks[0].interval.high >= 5);
  assert.equal(compare(rows.slice(1)).blocks[0].interval, null);
});
test("failed evidence, missing outcomes, and other algorithms remain visible as exclusions", () => {
  const failed = report(1, "cubic", 4);
  failed.comparison = { ...failed.comparison, eligible: false, exclusions: ["Transfer failed"] };
  const result = compare([failed, report(2, "bbr", null), report(3, "reno", 9)]);
  assert.equal(result.blocks.length, 0);
  assert.equal(result.excluded.length, 3);
});
test("selection is unique, bounded and restricted to test IDs", () => {
  assert.deepEqual(parseReportSelection(`${id(1)},${id(1)},../../secrets,invalid`), [id(1)]);
  assert.equal(parseReportSelection(Array.from({ length: 100 }, (_, n) => id(n)).join(",")).length, 60);
});
test("filters use any machine's region and inclusive UTC dates", () => {
  const a = report(1, "cubic", 8), b = report(2, "bbr", 9, { receivers: [{ ...placement, region: "eu-west-1" }] });
  const base = { search: "", cca: "", region: "", status: "", from: "2026-09-20", to: "2026-09-20" };
  assert.equal(filterReportJobs([a.job, b.job], base).length, 2);
  assert.deepEqual(filterReportJobs([a.job, b.job], { ...base, region: "eu-west-1", search: "HYPOTHESIS" }), [b.job]);
  assert.equal(filterReportJobs([a.job], { ...base, to: "2026-09-19" }).length, 0);
});
test("CSV escapes quotes and spreadsheet formulas, preserving numeric negatives and missing values", () => {
  assert.equal(reportCsv([['=SUM(A1)', 'a,"b"', -2, null]]), '"\'=SUM(A1)","a,""b""","-2",""\r\n');
  assert.equal(displayNumber(null), "Unavailable");
  assert.equal(displayNumber(0), "0.000");
  const data = report(1, "cubic", 8);
  data.receivers = [{ name: "receiver-1", throughput: [{ start: 0, seconds: 1, duration_seconds: 1, mbit_per_second: 0 }], tcp: [{ seconds: 1, rtt_ms: null, cwnd_bytes: null }] }];
  const csv = tracesCsv(data);
  assert.match(csv, /receiver_transfer_elapsed/);
  assert.match(csv, /scheduled_start/);
  assert.match(csv, /"0","","","","",""/);
});
