import type { IdeaDocument } from "./research-ideas";

export const NETWORK_EXECUTION_VERSION = "network-execution-v1";
export const NETWORK_RUNNERS = [
  { id: "emulated-netem-v1", name: "Emulated networking", units: [{ name: "flow_completion_time_ms", units: "ms" }] },
  { id: "real-world-iperf-v1", name: "Real-world networking", units: [{ name: "throughput_mbit_s", units: "Mbit/s" }, { name: "rtt_median_ms", units: "ms" }] },
  { id: "custom-package-v1", name: "Versioned custom experiment", units: [{ name: "ttfb_ms", units: "ms" }] },
  { id: "bounded-tcp-v1", name: "Bounded host-local TCP (emulated)", units: [{ name: "round_trip_time_ms", units: "ms", planned_observations: 1 }, { name: "received_bytes", units: "bytes", planned_observations: 1 }] },
] as const;
export type NetworkingCapabilities = { version: string; runners: { id: string; name: string; enabled: boolean }[]; max_jobs: number };

export function executableCandidate(plan: IdeaDocument, previous: Record<string, unknown> | null, runner: string, identity: string, config: unknown,
  replications: number, limits: { wall_seconds: number; max_instances: number; max_output_bytes: number; max_network_bytes: number }, metrics: unknown) {
  if (!NETWORK_RUNNERS.some(item => item.id === runner) || !identity.trim() || !config || typeof config !== "object" || Array.isArray(config)) throw new Error("Choose an executor, configuration identity, and experiment configuration.");
  if (!Number.isInteger(replications) || replications < 1 || replications > 32) throw new Error("Choose 1–32 experimental invocations per configuration.");
  if (!Array.isArray(metrics) || !metrics.length || metrics.some(m => !m || typeof m.name !== "string" || !m.name.trim() || typeof m.units !== "string" || !m.units.trim())) throw new Error("Declare metric names and units explicitly.");
  const prior = previous ?? {};
  const configurations = Array.isArray(prior.configurations) ? [...prior.configurations] : [];
  const index = configurations.findIndex(c => c && c.identity === identity);
  const configuration = { identity, details: { ...(index >= 0 ? configurations[index].details : {}), test_config: config } };
  if (index >= 0) configurations[index] = configuration; else configurations.push(configuration);
  return {
    questions: [plan.question], hypotheses: plan.hypothesis, dates_or_epochs: "", algorithms: [], seeds: { applicable: false, rationale: "" },
    controls: plan.controls.trim() ? [plan.controls] : [], sensitivity: { applicable: false, rationale: "" }, replication_unit: "", sample_size_rationale: "",
    exclusions: "", missing_data: "", statistics: "", dependence: "", stopping_rule: "", prior_exposure: "", coverage_limits: plan.limitations,
    ...prior, metrics, configurations, planned_units: configurations.length * replications,
    input_versions: Array.isArray(prior.input_versions) ? prior.input_versions : [],
    resource_limits: { max_observations: 1000, max_input_bytes: 256000, ...(prior.resource_limits && typeof prior.resource_limits === "object" ? prior.resource_limits : {}), wall_seconds: limits.wall_seconds },
    execution: { version: NETWORK_EXECUTION_VERSION, runner, replications, limits,
      exclusive_resources: prior.execution && typeof prior.execution === "object" && "exclusive_resources" in prior.execution ? prior.execution.exclusive_resources : [] },
  };
}

export function preparedQueueRequests(value: { queue_request: Record<string, unknown>; queue_requests?: Record<string, unknown>[] }) {
  const requests = value.queue_requests ?? [value.queue_request];
  if (!Array.isArray(requests) || !requests.length || requests.length > 32 || new Set(requests.map(r => r.request_id)).size !== requests.length || requests.some(r => !r.request_id || !r.campaign_id)) throw new Error("Prepared experiment jobs have incomplete or conflicting identities.");
  return requests;
}
