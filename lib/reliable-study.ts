export type Statistic = { n: number; median: number | null; min: number | null; max: number | null; units: string };
export type ReliableSummary = { configuration_id: string; campaign_id: string; planned: number; recorded: number; failed: number; excluded: number; statistics: Record<string, Statistic>; interval_kind: string; observed_keys: number | null; query_population: string; zero_outlier_runs: number; lossless_runs: number | null; interval_valid_runs: number | null };
export type ReliableConfiguration = { id: string; campaign_id: string; algorithm: string; skewness: number; budget_bytes: number; budget_regime: string; input_sha256: string; details: Record<string, unknown>; requested_resources: Record<string, unknown>; actual_resources: Record<string, unknown> };
export type ReliableClaim = { id: string; location: string; description: string; assessment: string; evidence: string; limitation: string; proposed_check: string; required_inputs: string; feasibility: string };
export type ReliableSource = { reference_number: number; citation: string; doi: string | null; kind: string; role: string; source_url: string | null; retrieved_url: string | null; access_status: string; review_status: string; retrieved_version: string | null; sha256: string | null; byte_count: number | null; pages: number | null; findings: string | null; limitations: string; retrieval_attempts: Record<string, unknown>[] };
export type ReliableRun = { id: string; campaign_id: string; configuration_id: string; protocol_id: string; stage: string; status: string; reason: string | null; algorithm: string; seed: number; input_sha256: string; raw_sha256: string | null; analysis_sha256: string; analysis_version: string; started_at: string | null; ended_at: string | null; measurements: Record<string, number | string | null> | null };
export type ReliableData = {
  meta: { id: string; analysis_version: string; assessment_sha256: string; review_definition: string; label_definitions: Record<string, string>; validation: Record<string, unknown>; counts: Record<string, number>; provenance: Record<string, unknown>; costs: Record<string, unknown> };
  campaigns: { id: string; title: string; stage: string; status: string; planned_runs: number; recorded_runs: number; experiment_type: string; elapsed_seconds: number; limitations: string[]; provenance: Record<string, unknown>; usage: Record<string, unknown> }[];
  configurations: ReliableConfiguration[]; summaries: ReliableSummary[]; sources: ReliableSource[]; claims: ReliableClaim[];
  protocols: { id: string; version: number; stage: string; document: Record<string, unknown>; sha256: string; locked_at: string }[];
  published: { id: string; source_number: number; location: string; metric: string; values: Record<string, unknown>; units: string }[];
  controls: { id: string; stage: string; payload: Record<string, unknown> }[];
};
export function numberLabel(value: unknown, digits = 2): string {
  if (value === null || value === undefined) return "missing";
  if (typeof value !== "number" || !Number.isFinite(value)) return "invalid";
  if (value !== 0 && Math.abs(value) < 10 ** -digits) return value.toPrecision(2);
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}
export function rangeLabel(s?: Statistic): string {
  return s ? `${numberLabel(s.median)} (${numberLabel(s.min)}–${numberLabel(s.max)})` : "missing";
}
const numeric = new Set(["seed", "value", "budget_bytes", "skewness", "planned_runs", "recorded_runs", "elapsed_seconds", "reference_number", "byte_count", "pages", "planned", "recorded", "failed", "excluded", "observed_keys", "zero_outlier_runs", "lossless_runs", "interval_valid_runs", "n", "median", "min", "max"]);
export function normalizeReliable(value: unknown, key = ""): unknown {
  if (value === null) return null;
  if (numeric.has(key) && typeof value === "string") {
    if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`Invalid recorded ${key}`);
    return Number(value);
  }
  if (["document", "payload", "details", "provenance", "costs", "usage", "retrieval_attempts", "values", "requested_resources", "actual_resources"].includes(key)) return value;
  if (Array.isArray(value)) return value.map(v => normalizeReliable(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,normalizeReliable(v,k)]));
  return value;
}
