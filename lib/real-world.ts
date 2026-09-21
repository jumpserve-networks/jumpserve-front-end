export const REAL_WORLD_CCAS = ["cubic", "bbr", "reno"] as const;
export const REAL_WORLD_INSTANCE_TYPES = ["t3.small", "t3.medium", "t3.large"] as const;
export const REAL_WORLD_DEFAULT_INSTANCE_TYPE = "t3.medium";
export type Placement = { region: string; zone_id: string; instance_type: string };
export type AwsRegion = { region: string; enabled: boolean; opt_in_status: string };
export type AwsZone = { zone_id: string; name: string; type: string; available: boolean; reason: string | null; instance_types: string[] };
export type RealWorldConfig = {
  server: Placement; bottleneck: Placement; receivers: Placement[];
  cca: typeof REAL_WORLD_CCAS[number]; duration_seconds: number; rate_mbit: number; buffer_kbytes: number; notes: string;
};
export type RealWorldJob = {
  job_id: string; status: string; created_at: number; updated_at: number; deadline: number;
  config: RealWorldConfig; can_manage?: boolean; cancel_requested?: boolean; error?: string; cleanup_error?: string;
  runtime_revision: string; outcome?: string; start_epoch?: number;
  status_history?: RealWorldStatusEntry[];
  nodes: (Placement & { name: string; role: string; instance_id?: string; image_id?: string; state?: string })[];
  results?: { receiver: string; received_mbit_per_second: number; received_bytes: number; seconds: number; start_epoch: number }[];
};
export type RealWorldStatusEntry = {
  id: number; status: string; started_at: string | null; completed_at: string | null;
  outcome: "completed" | "failed" | "cancelled" | null;
};
export const emptyPlacement = (): Placement => ({ region: "", zone_id: "", instance_type: REAL_WORLD_DEFAULT_INSTANCE_TYPE });
export function isRealWorldInstanceType(instanceType: string): boolean {
  return REAL_WORLD_INSTANCE_TYPES.some((allowed) => allowed === instanceType);
}
export function isRealWorldZoneAvailable(zone: AwsZone, instanceType: string = REAL_WORLD_DEFAULT_INSTANCE_TYPE): boolean {
  return zone.available && isRealWorldInstanceType(instanceType) && zone.instance_types.includes(instanceType);
}
export function placementWithInstanceType(value: Placement, instanceType: string, zones: AwsZone[]): Placement {
  if (!isRealWorldInstanceType(instanceType) || instanceType === value.instance_type) return value;
  const keepZone = zones.some((zone) => zone.zone_id === value.zone_id && isRealWorldZoneAvailable(zone, instanceType));
  return { ...value, instance_type: instanceType, zone_id: keepZone ? value.zone_id : "" };
}
export function placementInRegion(value: Placement, region: string, regions: AwsRegion[]): Placement {
  if (region === value.region || !regions.some((item) => item.region === region && item.enabled)) return value;
  return { ...value, region, zone_id: "" };
}
export function defaultRealWorldConfig(): RealWorldConfig {
  return { server: emptyPlacement(), bottleneck: emptyPlacement(), receivers: [emptyPlacement(), emptyPlacement()],
    cca: "cubic", duration_seconds: 60, rate_mbit: 100, buffer_kbytes: 125, notes: "" };
}
export function isRealWorldTerminal(status: string) {
  return ["completed", "failed", "cancelled"].includes(status);
}

// The controller remains in `starting` while the scheduled transfer runs.
// This describes scheduled activity, not measured packets or throughput.
export function realWorldTrafficPhase(job: RealWorldJob, now: number, receivedAt: number, interrupted = false) {
  if (isRealWorldTerminal(job.status)) return { active: false, label: REAL_WORLD_STAGES[job.status] };
  if (job.cancel_requested) return { active: false, label: "Cancellation requested" };
  if (job.status === "cleaning") return { active: false, label: "Removing test resources" };
  if (interrupted || now - receivedAt >= 15_000) return { active: false, label: "Status updates unavailable" };
  if (!["starting", "running"].includes(job.status)) return { active: false, label: REAL_WORLD_STAGES[job.status] ?? job.status };
  if (!Number.isFinite(job.start_epoch) || !job.start_epoch) return { active: false, label: "Transfer timing unavailable" };
  const remaining = job.start_epoch * 1000 - now;
  if (remaining > 0) return { active: false, label: `Transfers scheduled in ${Math.ceil(remaining / 1000)} s` };
  const end = (job.start_epoch + job.config.duration_seconds) * 1000;
  if (now >= end) return { active: false, label: "Collecting measurements" };
  return { active: true, label: `Scheduled transfer · ${Math.ceil((end - now) / 1000)} s remaining` };
}
export function validateRealWorldConfig(config: RealWorldConfig): string | null {
  if (!REAL_WORLD_CCAS.includes(config.cca)) return "Choose a supported server CCA.";
  if (config.receivers.length < 1 || config.receivers.length > 16) return "Choose between 1 and 16 receivers.";
  const machines = [config.server, config.bottleneck, ...config.receivers];
  if (machines.some((node) => !node.region || !node.zone_id)) {
    return "Choose a Region and Availability Zone for every machine.";
  }
  if (machines.some((node) => !isRealWorldInstanceType(node.instance_type))) return "Every machine must use t3.small, t3.medium, or t3.large.";
  for (const [name, value, min, max] of [
    ["Duration (seconds)", config.duration_seconds, 10, 600],
    ["Bottleneck rate (Mbit/s)", config.rate_mbit, 1, 1000],
    ["Buffer (decimal kB)", config.buffer_kbytes, 2, 10000],
  ] as const) {
    if (!Number.isInteger(value) || value < min || value > max) return `${name} must be an integer from ${min} to ${max}.`;
  }
  if (config.notes.length > 4000) return "Notes must be at most 4,000 characters.";
  return null;
}

export const REAL_WORLD_STAGES: Record<string, string> = {
  provisioning: "Creating EC2 instances", bootstrapping: "Preparing machines", configuring: "Configuring the network",
  checking: "Checking routes and connectivity", starting: "Scheduling and executing TCP transfers", running: "Collecting TCP measurements",
  cleaning: "Terminating instances and removing network resources", completed: "Completed · resources removed",
  failed: "Failed · resources removed", cancelled: "Cancelled · resources removed",
};
