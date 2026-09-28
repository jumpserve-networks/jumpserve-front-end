export const STUDY_ID = "nines2026-balanced-v1";
export const STUDY_DOI = "https://doi.org/10.4230/OASIcs.NINeS.2026.27";

export type StudyCampaign = {
  id: string; title: string; status: string; protocol: string; protocol_sha256: string;
  manifest_sha256: string; kernel_commit: string; planned_trials: number;
  bootstrap_replicates: number; random_seed: number; limitations: string[];
  provenance: Record<string, unknown>; created_at: string; finished_at: string | null;
};
export type StudyConfig = {
  id: string; family: string; treatment: string; cca_group: string; capacity_mbps: number;
  queue_packets: number; duration_seconds: number; warmup_seconds: number; target_rtt_ms: number | null;
  delay_study_config_flows: { flow_index: number; cca: string; configured_base_rtt_ms: number }[];
  delay_study_cells: { flow_index: number; matched_repetitions: number; mean_goodput_mbps: number | null;
    ci_low_mbps: number | null; ci_high_mbps: number | null; mean_share: number | null }[];
};
export type StudyTrial = {
  id: string; configuration_id: string; block_index: number; replicate: number; attempt_id: string;
  status: string; start_order: number[]; kernel_release: string | null; runner_sha256: string | null;
  started_at: string | null; finished_at: string | null; validation_errors: string[]; error: string | null;
};
export type StudyFlow = {
  flow_index: number; cca: string; configured_base_rtt_ms: number; natural_min_rtt_ms: number | null;
  added_ack_delay_ms: number | null; effective_min_rtt_ms: number | null; goodput_mbps: number;
  measured_seconds: number; received_bytes: number; retransmits: number | null;
};
export type StudySample = { flow_index: number; snapshot_index: number; start_seconds: number; end_seconds: number;
  interval_seconds: number; received_bytes: number; goodput_mbps: number };
export type StudySummary = {
  family: string; cca_group: string; flow_index: number; cca: string;
  baseline_delta: number | null; baseline_ci_low: number | null; baseline_ci_high: number | null;
  treatment_delta: number | null; treatment_ci_low: number | null; treatment_ci_high: number | null;
  improvement: number | null; improvement_ci_low: number | null; improvement_ci_high: number | null;
  assessment: string; matched_pairs: number; expected_pairs: number;
  observed_assignments: number; expected_assignments: number; unbounded: boolean; analysis_sha256: string;
};
export type StudyLatency = { worker_index: number; treatment: string; sent_packets: number; received_packets: number;
  median_forward_ms: number; median_rtt_ms: number; validation_passed: boolean };
export type StudyPaper = { reference_number: number; citation: string; kind: string; source_url: string | null;
  download_status: string; reading_status: string; pages: number | null; sha256: string | null;
  version_note: string | null; reading_notes: string | null };
export type StudyClaim = { claim_id: string; figure: string; description: string; published_values: Record<string, number>;
  coverage: string; limitation: string };
export type StudyData = { campaign: StudyCampaign; configurations: StudyConfig[]; trials: StudyTrial[];
  summaries: StudySummary[]; latency: StudyLatency[] };

export function formatStudyNumber(value: number | null | undefined, digits = 2) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}
export function ccaName(cca: string) {
  return ({ bbr: "BBRv3", bbr1: "BBRv1" } as Record<string, string>)[cca] ?? cca.toUpperCase();
}
export function familyName(family: string) {
  return ({ homogeneous_bbr: "Common target RTT", common_shift: "Common delay shift", imperfect_equalization: "Imperfect equalization" } as Record<string, string>)[family] ?? family.replaceAll("_", " ");
}
export function treatmentName(treatment: string) {
  return ({ baseline: "Baseline", ack_equalized: "Equalized to 100 ms", shifted: "Changed delay assignment" } as Record<string, string>)[treatment] ?? treatment.replaceAll("_", " ");
}
export function assessmentName(assessment: string) {
  return ({ supports_reduction: "Supports a reduction", contrary_evidence: "Contrary evidence", inconclusive: "Inconclusive", incomplete: "Incomplete" } as Record<string, string>)[assessment] ?? assessment;
}

// Only known numeric columns are converted: hashes, identifiers, and source text
// must never be coerced. PostgREST may return numeric/bigint fields as strings.
const NUMERIC_COLUMNS = new Set([
  "planned_trials", "bootstrap_replicates", "random_seed", "capacity_mbps", "queue_packets", "duration_seconds", "warmup_seconds", "target_rtt_ms",
  "flow_index", "configured_base_rtt_ms", "matched_repetitions", "mean_goodput_mbps", "ci_low_mbps", "ci_high_mbps", "mean_share",
  "block_index", "replicate", "natural_min_rtt_ms", "added_ack_delay_ms", "effective_min_rtt_ms", "goodput_mbps", "measured_seconds", "received_bytes", "retransmits",
  "snapshot_index", "start_seconds", "end_seconds", "interval_seconds", "baseline_delta", "baseline_ci_low", "baseline_ci_high", "treatment_delta", "treatment_ci_low", "treatment_ci_high",
  "improvement", "improvement_ci_low", "improvement_ci_high", "matched_pairs", "expected_pairs", "observed_assignments", "expected_assignments", "worker_index", "sent_packets", "received_packets",
  "median_forward_ms", "median_rtt_ms", "reference_number", "pages",
]);
export function normalizeStudyData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeStudyData);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (NUMERIC_COLUMNS.has(key) && entry !== null && entry !== "") {
      const number = Number(entry);
      return [key, Number.isFinite(number) ? number : null];
    }
    return [key, normalizeStudyData(entry)];
  }));
}
