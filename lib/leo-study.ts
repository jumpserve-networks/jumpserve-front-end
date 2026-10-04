export const LEO_STUDY_ID = "leo-failover-imc2025-v1";
export const LEO_SATURATION_ID = "leo-failover-imc2025-saturation-v1";
export const LEO_COUNTRIES = ["tonga", "haiti", "lithuania", "ghana", "britain", "southafrica"] as const;
export const COUNTRY_LABELS: Record<string, string> = { tonga: "Tonga", haiti: "Haiti", lithuania: "Lithuania", ghana: "Ghana", britain: "Britain", southafrica: "South Africa" };
export type LeoCampaign = { id: string; title: string; status: string; protocol: Record<string, unknown>; protocol_sha256: string; artifact_commit: string; planned_samples: number; recorded_samples: number; limitations: string[]; provenance: Record<string, unknown>; created_at: string };
export type LeoConfiguration = { id: string; country: string; constellation: string; satellites: number; requested_terminals: number; deployed_terminals: number; placement: string; beam_policy: string; ku_gbps: number; variant: string; cells: number; lost_capacity_gbps: number; published_capacity_gbps: number };
export type LeoSample = { id: string; configuration_id: string; second: number; capacity_gbps: number; rf_demand_gbps: number; cell_bound_gbps: number; failover_percent: number; served_cells: number; allocated_beams: number; validation_errors: string[]; graph_sha256: string; runner_sha256: string };
export type LeoSummary = { country: string; published_gbps: number; mean_gbps: number; min_gbps: number; max_gbps: number; relative_difference_percent: number; failover_percent: number; snapshots: number; assessment: string };
export type LeoPaper = { reference_number: number; citation: string; kind: string; source_url: string | null; download_status: string; reading_status: string; pages: number | null; sha256: string | null; version_note: string | null; reading_notes: string | null };
export type LeoClaim = { claim_id: string; figure: string; description: string; coverage: string; limitation: string };
export type LeoData = { campaign: LeoCampaign; configurations: LeoConfiguration[]; samples: LeoSample[]; summaries: LeoSummary[]; saturation?: LeoData | null };
const NUMERIC_FIELDS = new Set(["planned_samples", "recorded_samples", "satellites", "requested_terminals", "deployed_terminals", "ku_gbps", "cells", "lost_capacity_gbps", "published_capacity_gbps", "second", "capacity_gbps", "rf_demand_gbps", "cell_bound_gbps", "failover_percent", "served_cells", "allocated_beams", "published_gbps", "mean_gbps", "min_gbps", "max_gbps", "relative_difference_percent", "snapshots", "reference_number", "pages"]);
export function normalizeLeoData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeLeoData);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (NUMERIC_FIELDS.has(key) && typeof item === "string") {
      if (!item.trim() || !Number.isFinite(Number(item))) throw new Error(`Invalid recorded numeric value: ${key}`);
      return [key, Number(item)];
    }
    return [key, normalizeLeoData(item)];
  }));
}
export function scenarioRows(data: LeoData, country: string) {
  const configurations = new Map(data.configurations.filter(c => c.country === country).map(c => [c.id, c]));
  return data.samples.flatMap(sample => {
    const config = configurations.get(sample.configuration_id);
    return config ? [{ ...config, ...sample }] : [];
  });
}
export function isPrimaryConfiguration(c: LeoConfiguration) {
  return c.constellation === "starlink_5shells" && c.requested_terminals === 200000 && c.placement === "gcb-0" && c.beam_policy === "greedy-coordinated" && c.ku_gbps === 1.28 && c.variant === "paper";
}
