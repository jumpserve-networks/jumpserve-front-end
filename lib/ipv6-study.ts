import type { ReliableClaim, ReliableSource } from "@/lib/reliable-study";
export type IPv6Statistic = { mean: number | null; min: number | null; max: number | null; n: number; planned: number; missing: number; invalid: number; pooled: number | null; routing_sensitivity_mean: number | null; routing_sensitivity_n: number; paired_v6_minus_v4_mean_pp: number | null; paired_days: number; units: string };
export type IPv6Configuration = { id: string; case_id: string; cohort: string; mtu: string; upstream: string; family: string; edns_bytes: number; details: Record<string, unknown> };
export type IPv6Run = { id: string; epoch: string | null; status: string; reason: string | null; original_execution_date: string; raw_sha256: Record<string, string>; analysis_sha256: string; started_at: string | null; ended_at: string | null };
export type IPv6Comparison = { id: string; configuration_id: string; epoch: string; metric: string; reproduced: number; published: number; difference_pp: number; assessment: string; valid_days: number; planned_days: number };
export type IPv6Data = {
 meta: { analysis_version: string; assessment_sha256: string; review_definition: string; label_definitions: Record<string, string>; validation: { published_cells: number; reproduced_cells: number; discrepant_cells: number; original_fold_comparisons: number; original_fold_disagreements: number; status_counts: Record<string, number>; source_review_counts: Record<string, number> }; counts: Record<string, number>; provenance: Record<string, unknown>; costs: Record<string, unknown> };
 configurations: IPv6Configuration[];
 summaries: { id: string; configuration_id: string; epoch: string; statistics: Record<string, IPv6Statistic>; interval_kind: string }[];
 comparisons: IPv6Comparison[];
 sources: ReliableSource[]; claims: ReliableClaim[]; runs: IPv6Run[];
 protocols: { id: string; version: number; document: Record<string, unknown>; sha256: string; locked_at: string }[];
 campaigns: { id: string; title: string; stage: string; status: string; experiment_type: string; planned_runs: number; recorded_runs: number; limitations: string[]; usage: Record<string, unknown> }[];
 controls: { id: string; status: string; reason: string | null; payload: Record<string, unknown> }[];
};
export const IPV6_METRICS = ["TIMEOUT", "SERVFAIL", "edns0_fallback", "tcp_fallback", "udp_fragments", "udp_packet_too_big"];
export const IPV6_MTUS = ["mtu1500", "mtu1280-pmtud", "mtu1280-nopmtud", "mtu1280onpath-nopmtud"];
export const IPV6_MTU_LABELS: Record<string, string> = { mtu1500: "1500 · baseline", "mtu1280-pmtud": "1280 · on-link, PMTUD", "mtu1280-nopmtud": "1280 · on-link, PTB blocked", "mtu1280onpath-nopmtud": "1280 · on-path, PTB blocked" };
