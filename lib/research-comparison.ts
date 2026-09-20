/** Configuration matching and exploratory, fixed-configuration bootstrap inference.
 * The resampling unit is a parent run, never a client or a snapshot.
 * No trial pairing is inferred from run IDs or timestamps.
 */
export type ResearchClient = {
  clientNumber: number | null;
  delayMs: number | null;
  startDelayMs: number | null;
  workloadMb: number | null;
  cca: string | null;
};

export type ResearchConfiguration = {
  numberOfClients: number | null;
  rateMbps: number | null;
  bufferKib: number | null;
  snapshotMs: number | null;
  topology: string | null;
  topologyConfig: unknown;
  jobConfig: Record<string, unknown> | null;
  clients: ResearchClient[];
};

export type ResearchPoint = {
  parentRunId: number;
  clientNumber: number;
  flowCompletionTimeMs: number | null;
  configuration: ResearchConfiguration;
};

export const BOOTSTRAP_SAMPLES = 2000;
export const MIN_MEDIAN_REPEATS = 5;
export const MIN_P90_REPEATS = 10;
const RUNNERS = new Set(["netem_nines.py", "netem_cubic_benchmark_nines.py", "netem_cubic_benchmark_hotnets.py"]);
const METADATA = new Set(["notes", "tags", "experiment_name", "client_ccas"]);

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function valid(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum;
}

export function configurationIssue(config: ResearchConfiguration): string | null {
  if (!config.jobConfig || !RUNNERS.has(String(config.jobConfig.script))) return "Runner configuration unavailable or unsupported";
  if (config.topology !== "single-bottleneck") return "Single-bottleneck configuration required";
  const n = config.numberOfClients;
  if (!valid(n, 1) || !Number.isInteger(n) || config.clients.length !== n) return "Incomplete client configuration";
  if (!valid(config.rateMbps, Number.MIN_VALUE) || !valid(config.bufferKib) || !valid(config.snapshotMs, Number.MIN_VALUE)) return "Missing or invalid link / sampling configuration";
  const clients = [...config.clients].sort((a, b) => (a.clientNumber ?? 0) - (b.clientNumber ?? 0));
  if (clients.some((c, i) => c.clientNumber !== i + 1 || !valid(c.delayMs) || !valid(c.startDelayMs) || !valid(c.workloadMb, Number.MIN_VALUE) || !c.cca)) return "Incomplete or duplicate client configuration";
  const job = config.jobConfig;
  const expected: Record<string, unknown> = {
    num_clients: n, client_delays_ms: clients.map(c => c.delayMs),
    client_start_delays_ms: clients.map(c => c.startDelayMs),
    client_file_sizes_mbytes: clients.map(c => c.workloadMb), client_ccas: clients.map(c => c.cca),
    bottleneck_all_client_rate_mbit: config.rateMbps, bottleneck_buffer_kbytes: config.bufferKib,
    topology: config.topology,
  };
  if (Object.entries(expected).some(([key, value]) => job[key] !== undefined && canonical(job[key]) !== canonical(value))) return "Stored results conflict with launch configuration";
  return null;
}

/** All recorded settings are matched. Metadata cannot define a scientific block. */
export function configurationKey(config: ResearchConfiguration, sweptClient?: number): string {
  const job = Object.fromEntries(Object.entries(config.jobConfig ?? {}).filter(([key]) => !METADATA.has(key)));
  if (job.loss_pct === undefined) job.loss_pct = 0;
  if (sweptClient !== undefined && Array.isArray(job.client_delays_ms)) {
    job.client_delays_ms = job.client_delays_ms.map((v, i) => i + 1 === sweptClient ? "swept" : v);
  }
  return canonical({
    ...config, jobConfig: job,
    clients: [...config.clients].sort((a, b) => (a.clientNumber ?? 0) - (b.clientNumber ?? 0)).map(c => ({
      ...c, cca: sweptClient === undefined ? "compared" : c.cca,
      delayMs: c.clientNumber === sweptClient ? "swept" : c.delayMs,
    })),
  });
}

export function quantile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}

export function formatSeconds(ms: number, signed = false): string {
  if (!Number.isFinite(ms)) return "Unavailable";
  const seconds = ms / 1000;
  const sign = seconds < 0 ? "−" : signed && seconds > 0 ? "+" : "";
  return `${sign}${Math.abs(seconds).toFixed(3)} s`;
}

function randomGenerator() {
  let state = 0x23522026;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}
function average(values: number[]) { return values.reduce((sum, n) => sum + n, 0) / values.length; }
function resample(values: number[], random: () => number) {
  return values.map(() => values[Math.floor(random() * values.length)]);
}
export type Interval = { low: number; high: number };
export function medianInterval(values: number[]): Interval | null {
  if (values.length < MIN_MEDIAN_REPEATS) return null;
  const random = randomGenerator();
  const draws = Array.from({ length: BOOTSTRAP_SAMPLES }, () => quantile(resample(values, random), .5));
  return { low: quantile(draws, .025), high: quantile(draws, .975) };
}

type Observation = { parentRunId: number; value: number };
export type MatchedBlock = {
  key: string; configuration: ResearchConfiguration; bbr: Observation[]; cubic: Observation[];
};

export function compareConfigurations(points: ResearchPoint[], selectedClients: number[]) {
  const parents = new Map<number, ResearchPoint[]>();
  for (const point of points) parents.set(point.parentRunId, [...(parents.get(point.parentRunId) ?? []), point]);
  const excluded: Array<{ parentRunId: number; reason: string }> = [];
  const groups = new Map<string, MatchedBlock>();
  for (const [parentRunId, rows] of [...parents].sort(([a], [b]) => a - b)) {
    const config = rows[0].configuration;
    let reason = configurationIssue(config);
    const cca = config.clients[0]?.cca;
    if (!reason && (cca !== "bbr" && cca !== "cubic" || config.clients.some(c => c.cca !== cca))) reason = "Homogeneous BBR or CUBIC competition required";
    if (!reason && (rows.length !== config.numberOfClients || new Set(rows.map(r => r.clientNumber)).size !== rows.length)) reason = "Incomplete or duplicate client results";
    const selected = rows.filter(r => selectedClients.includes(r.clientNumber));
    if (!reason && (!selected.length || selected.some(r => !valid(r.flowCompletionTimeMs, Number.MIN_VALUE)))) reason = "Selected client FCT unavailable";
    if (reason) { excluded.push({ parentRunId, reason }); continue; }
    const key = configurationKey(config);
    const group = groups.get(key) ?? { key, configuration: config, bbr: [], cubic: [] };
    group[cca as "bbr" | "cubic"].push({ parentRunId, value: quantile(selected.map(r => r.flowCompletionTimeMs as number), .5) });
    groups.set(key, group);
  }
  const blocks: MatchedBlock[] = [];
  for (const group of [...groups.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    if (group.bbr.length && group.cubic.length) blocks.push(group);
    else for (const row of [...group.bbr, ...group.cubic]) excluded.push({ parentRunId: row.parentRunId, reason: "No opposite-CCA run with the same configuration" });
  }
  function estimate(p: number, minimum: number) {
    if (!blocks.length) return null;
    const left = average(blocks.map(b => quantile(b.bbr.map(r => r.value), p)));
    const right = average(blocks.map(b => quantile(b.cubic.map(r => r.value), p)));
    let interval: Interval | null = null;
    if (blocks.every(b => b.bbr.length >= minimum && b.cubic.length >= minimum)) {
      const random = randomGenerator();
      const draws = Array.from({ length: BOOTSTRAP_SAMPLES }, () => average(blocks.map(b =>
        quantile(resample(b.cubic.map(r => r.value), random), p) - quantile(resample(b.bbr.map(r => r.value), random), p)
      )));
      interval = { low: quantile(draws, .025), high: quantile(draws, .975) };
    }
    return { bbr: left, cubic: right, delta: right - left, interval, minimum };
  }
  return { blocks, excluded, median: estimate(.5, MIN_MEDIAN_REPEATS), p90: estimate(.9, MIN_P90_REPEATS) };
}

export function configurationLabel(config: ResearchConfiguration, sweptClient?: number): string {
  return `${config.rateMbps} Mbps · ${config.bufferKib} KiB · ` + config.clients.map(c =>
    `C${c.clientNumber}: ${c.workloadMb} MB, ${c.clientNumber === sweptClient ? "varied delay" : `${c.delayMs} ms`}, start ${c.startDelayMs} ms`
  ).join(" / ");
}

export function buildSweepGroups<T extends ResearchPoint>(points: T[]) {
  const groups = new Map<string, { key: string; configuration: ResearchConfiguration; clientNumber: number; points: T[] }>();
  const duplicates = new Map<string, number>();
  for (const p of points) { const id = `${p.parentRunId}:${p.clientNumber}`; duplicates.set(id, (duplicates.get(id) ?? 0) + 1); }
  let excluded = 0;
  for (const point of points) {
    if (configurationIssue(point.configuration) || !valid(point.flowCompletionTimeMs, Number.MIN_VALUE) || duplicates.get(`${point.parentRunId}:${point.clientNumber}`) !== 1) { excluded++; continue; }
    const key = `${point.clientNumber}:${configurationKey(point.configuration, point.clientNumber)}`;
    const group = groups.get(key) ?? { key, configuration: point.configuration, clientNumber: point.clientNumber, points: [] };
    group.points.push(point); groups.set(key, group);
  }
  return { groups: [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)), excluded };
}
