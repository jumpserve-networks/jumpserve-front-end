import type { Placement, RealWorldJob } from "./real-world";

export type SampleSummary = { samples: number; median: number | null; p95: number | null };
export type ThroughputPoint = { start: number; seconds: number; duration_seconds: number; received_bytes: number; mbit_per_second: number };
export type TcpPoint = { seconds: number; rtt_ms: number | null; cwnd_bytes: number | null };
export type QueuePoint = { seconds: number; backlog_bytes: number | null; queue_delay_ms: number | null; drops: number | null; sent_bytes: number | null };
export type RealWorldReport = {
  can_manage?: boolean;
  analysis_version: string;
  job: RealWorldJob;
  receivers: {
    name: string; placement: Placement; received_bytes: number | null; duration_seconds: number | null;
    mean_mbit_per_second: number | null; retransmits: number | null; preflight_rtt_ms: number | null;
    rtt: SampleSummary; throughput_intervals: number; tcp_samples: number;
    throughput?: ThroughputPoint[]; tcp?: TcpPoint[];
  }[];
  queue?: QueuePoint[];
  summary: {
    combined_mean_mbit_per_second: number | null; jain_fairness: number | null; received_bytes: number | null;
    queue_delay: SampleSummary; observed_queue_drops: number | null; start_skew_ms: number | null;
  };
  provenance: { name: string; kernel: string | null; iperf_version: string | null; image_id: string | null; success: boolean }[];
  sources: { name: string; sha256: string; version_id: string | null; bytes: number }[];
  warnings: string[];
  comparison: { eligible: boolean; exclusions: string[]; key: string | null; configuration: Record<string, unknown> };
};

export const MAX_REPORT_SELECTION = 60;
export const REPORT_MIN_REPEATS = 5;
export const REPORT_BOOTSTRAP_SAMPLES = 2000;
export type ReportMetric = "combined_mean_mbit_per_second" | "jain_fairness";
export const REPORT_METRICS: Record<ReportMetric, { label: string; unit: string }> = {
  combined_mean_mbit_per_second: { label: "Combined average throughput", unit: "Mbit/s" },
  jain_fairness: { label: "Jain fairness of flow averages", unit: "index" },
};

export function displayNumber(value: number | null | undefined, digits = 3): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "Unavailable";
}
export function dateUtc(epoch: number): string {
  return new Date(epoch * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}
export function parseReportSelection(value: string | null): string[] {
  return [...new Set((value ?? "").split(",").filter(id => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)))].slice(0, MAX_REPORT_SELECTION);
}
export function filterReportJobs(jobs: RealWorldJob[], filters: { search: string; cca: string; region: string; status: string; from: string; to: string }) {
  const from = filters.from ? Date.parse(filters.from + "T00:00:00Z") / 1000 : -Infinity;
  const to = filters.to ? Date.parse(filters.to + "T00:00:00Z") / 1000 + 86400 : Infinity;
  const search = filters.search.toLowerCase().trim();
  return jobs.filter(job => (!filters.cca || job.config.cca === filters.cca) && (!filters.status || job.status === filters.status)
    && (!filters.region || [job.config.server, job.config.bottleneck, ...job.config.receivers].some(n => n.region === filters.region))
    && job.created_at >= from && job.created_at < to
    && (!search || `${job.job_id} ${job.config.notes}`.toLowerCase().includes(search)));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b), middle = (sorted.length - 1) / 2;
  return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
}
function quantile(sorted: number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction, low = Math.floor(index), high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}
export type ReportInterval = { low: number; high: number };
function bootstrap(left: number[], right?: number[]): ReportInterval | null {
  if (left.length < REPORT_MIN_REPEATS || right && right.length < REPORT_MIN_REPEATS) return null;
  let state = 0x20260920;
  const draw = (values: number[]) => values.map(() => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return values[Math.floor(state / 4294967296 * values.length)];
  });
  const values = Array.from({ length: REPORT_BOOTSTRAP_SAMPLES }, () => {
    const a = median(draw(left));
    return right ? median(draw(right)) - a : a;
  }).sort((a, b) => a - b);
  return { low: quantile(values, .025), high: quantile(values, .975) };
}
export type ReportCohort = { count: number; ids: string[]; values: number[]; median: number | null; interval: ReportInterval | null };
export type ReportBlock = {
  key: string; example: RealWorldReport; baseline: ReportCohort; comparison: ReportCohort;
  delta: number | null; interval: ReportInterval | null;
};

/** One whole test is one replication. Configuration blocks are never pooled. */
export function compareRealWorldReports(reports: RealWorldReport[], baseline: string, comparison: string, metric: ReportMetric) {
  const groups = new Map<string, { example: RealWorldReport; left: RealWorldReport[]; right: RealWorldReport[] }>();
  const excluded: { jobId: string; reason: string }[] = [], seen = new Set<string>();
  for (const report of [...reports].sort((a, b) => a.job.job_id.localeCompare(b.job.job_id))) {
    const jobId = report.job.job_id, value = report.summary[metric];
    let reason = "";
    if (seen.has(jobId)) reason = "Duplicate test ID; counted only once";
    else if (!report.comparison.eligible || !report.comparison.key) reason = report.comparison.exclusions.join(" ") || "Comparison evidence is incomplete";
    else if (baseline === comparison) reason = "Choose two different algorithms";
    else if (![baseline, comparison].includes(report.job.config.cca)) reason = "Algorithm is outside the selected contrast";
    else if (value === null || !Number.isFinite(value)) reason = "Selected outcome is unavailable";
    seen.add(jobId);
    if (reason) { excluded.push({ jobId, reason }); continue; }
    const key = canonical({ version: report.analysis_version, configuration: report.comparison.configuration });
    const group = groups.get(key) ?? { example: report, left: [], right: [] };
    (report.job.config.cca === baseline ? group.left : group.right).push(report);
    groups.set(key, group);
  }
  const cohort = (rows: RealWorldReport[]): ReportCohort => {
    const values = rows.map(row => row.summary[metric] as number);
    return { count: rows.length, ids: rows.map(r => r.job.job_id), values, median: values.length ? median(values) : null, interval: bootstrap(values) };
  };
  const blocks: ReportBlock[] = [...groups.entries()].map(([key, group]) => {
    const a = cohort(group.left), b = cohort(group.right);
    return { key, example: group.example, baseline: a, comparison: b,
      delta: a.median !== null && b.median !== null ? b.median - a.median : null, interval: bootstrap(a.values, b.values) };
  });
  return { blocks, excluded, matchedBlocks: blocks.filter(block => block.delta !== null).length };
}

/** Neutralize spreadsheet formulas in user-controlled strings, then quote CSV. */
export function reportCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map(row => row.map(value => {
    let text = value == null ? "" : String(value);
    if (typeof value === "string" && /^\s*[=+\-@\t\r]/.test(text)) text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}
export function receiversCsv(report: RealWorldReport): string {
  return reportCsv([
    ["test_id", "created_utc", "cca", "receiver", "region", "zone_id", "instance_type", "throughput_mbit_s", "received_bytes", "duration_s", "sender_rtt_median_ms", "rtt_samples", "retransmits", "analysis_version", "runtime_revision", "hypothesis"],
    ...report.receivers.map(r => [report.job.job_id, dateUtc(report.job.created_at), report.job.config.cca, r.name, r.placement.region, r.placement.zone_id,
      r.placement.instance_type, r.mean_mbit_per_second, r.received_bytes, r.duration_seconds, r.rtt.median, r.rtt.samples, r.retransmits, report.analysis_version, report.job.runtime_revision, report.job.config.notes]),
  ]);
}
export function tracesCsv(report: RealWorldReport): string {
  const rows: (string | number | null | undefined)[][] = [["test_id", "machine", "clock", "seconds", "interval_start_s", "interval_duration_s", "throughput_mbit_s", "rtt_ms", "cwnd_bytes", "backlog_bytes", "estimated_queue_delay_ms", "cumulative_drops"]];
  for (const r of report.receivers) {
    for (const p of r.throughput ?? []) rows.push([report.job.job_id, r.name, "receiver_transfer_elapsed", p.seconds, p.start, p.duration_seconds, p.mbit_per_second, null, null, null, null, null]);
    for (const p of r.tcp ?? []) rows.push([report.job.job_id, r.name, "scheduled_start", p.seconds, null, null, null, p.rtt_ms, p.cwnd_bytes, null, null, null]);
  }
  for (const p of report.queue ?? []) rows.push([report.job.job_id, "bottleneck", "scheduled_start", p.seconds, null, null, null, null, null, p.backlog_bytes, p.queue_delay_ms, p.drops]);
  return reportCsv(rows);
}
