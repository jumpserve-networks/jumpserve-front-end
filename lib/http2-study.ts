export const HTTP2_CAMPAIGN = "http2-compliance-artifact-v2";
export const OUTCOMES = ["dropped", "500", "goaway", "reset", "unmodified", "modified", "received", "unknown"] as const;
export type Outcome = typeof OUTCOMES[number];
export type Counts = Partial<Record<Outcome, number>>;
export type Campaign = { id: string; title: string; status: string; protocol: Record<string, unknown>; protocol_sha256: string; artifact_commit: string; analysis_sha256: string; planned_runs: number; recorded_runs: number; planned_measurements: number; limitations: string[]; provenance: Record<string, unknown>; costs: Record<string, unknown> };
export type Configuration = { id: string; proxy: string; version: string | null; mode: string; tls: boolean | null; details: Record<string, unknown>; requested_resources: Record<string, unknown> | null; actual_resources: Record<string, unknown> | null };
export type Run = { id: string; configuration_id: string | null; protocol_id: string; stage: string; status: string; reason: string | null; source_path: string | null; raw_sha256: string | null; analysis_sha256: string | null; analysis_version: string; started_at: string | null; ended_at: string | null; original_execution_at: string | null; wall_seconds: number | null; units: string };
export type Summary = { run_id: string; configuration_id: string; planned: number; recorded: number; missing: number; unknown: number; recoded: number; author_counts: Counts; preserved_counts: Counts; published_counts: Counts | null; published_source: string | null; assessment: string; scope_observed: number; scope_mismatches: number; comparisons: { paired_cases: number | null; author_pair_differences: number | null; known_pairs: number; preserved_pair_differences: number | null; author_side_percent: number[] | null; published_side_percent: number[] | null; translation?: { common_cases: number; published_accepted_change: number | null; corrected_accepted_change: number; author_count_changes: Record<string, number>; correction: string }; historical?: Record<string, unknown> } };
export type Source = { reference_number: number; citation: string; doi: string | null; kind: string; source_url: string | null; retrieved_url: string | null; download_status: string; review_status: string; retrieved_version: string | null; sha256: string | null; pages: number | null; findings: string | null; limitations: string | null; retrieval_audit: Record<string, unknown>[] };
export type Claim = { claim_id: string; location: string; description: string; assessment: string; evidence: string; limitation: string };
export type Followup = { id: string; stage: string; planned: number; recorded: number; summary: { agreement: number; disagreement: number; unknown_or_failed: number }; provenance: Record<string, unknown>; processes: Record<string, unknown>[]; costs: Record<string, unknown> };
export type Protocol = { id: string; version: number; stage: string; document: Record<string, unknown>; sha256: string; code_sha256: string | null; locked_at: string | null };
export type Measurement = { run_id: string; test_id: number; side: string; description: string; rfc_section: string | null; expected: string; expected_scope: string | null; author_outcome: string; outcome: string; status: string; reason: string | null; error_code: number | null; observed_scope: string | null; scope_compatible: boolean | null; preserved_rule_conformant: boolean | null };
export type Http2Data = { campaign: Campaign; configurations: Configuration[]; runs: Run[]; summaries: Summary[]; sources: Source[]; claims: Claim[]; protocols: Protocol[]; followups: Followup[] };
const numeric = new Set(["test_id", "reference_number", "pages", "planned_runs", "recorded_runs", "planned_measurements", "planned", "recorded", "missing", "unknown", "recoded", "scope_observed", "scope_mismatches", "paired_cases", "known_pairs", "author_pair_differences", "preserved_pair_differences", "agreement", "disagreement", "unknown_or_failed", "error_code", "expected_error_code", "window_seconds", "elapsed_seconds", "wall_seconds", "replication"]);
const opaque = new Set(["protocol", "document", "details", "provenance", "costs", "retrieval_audit", "requested_resources", "actual_resources"]);
export function normalizeHttp2(value: unknown, key = ""): unknown {
  if (value === null) return null;
  // Protocol schemas and source notes can use metric names as descriptive text.
  // Only normalize recorded quantities; leave original JSON evidence intact.
  if (opaque.has(key)) return value;
  if (numeric.has(key) && typeof value === "string") {
    if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`Invalid recorded ${key}`);
    return Number(value);
  }
  if (Array.isArray(value)) return value.map(v => normalizeHttp2(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeHttp2(v, k)]));
  return value;
}
export function descriptiveCount(summary: Summary, outcome: Outcome, preserved: boolean) {
  return (preserved ? summary.preserved_counts : summary.author_counts)[outcome] ?? 0;
}
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Escape spreadsheet formula prefixes without changing the JSON research data.
  const safe = /^[=+@-]/.test(text) && typeof value !== "number" ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
