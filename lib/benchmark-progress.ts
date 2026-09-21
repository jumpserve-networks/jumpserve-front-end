export const PUBLIC_BENCHMARK_COLUMNS = "id,created_at,updated_at,status,config,ec2_instance_id,parent_run_id,error_message";

export interface BenchmarkJob {
  id: string;
  created_at: string;
  updated_at?: string;
  status: string;
  config: {
    num_clients: number;
    client_ccas: string[];
    client_delays_ms: number[];
    bottleneck_all_client_rate_mbit: number;
    script?: string;
    topology?: string;
    bottleneck_rates_mbit?: number[];
    experiment_name?: string;
  };
  ec2_instance_id: string | null;
  parent_run_id: number | null;
  error_message: string | null;
  requested_by?: string | null;
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "terminated"]);

export function isBenchmarkTerminal(status: string) {
  return TERMINAL_STATUSES.has(status);
}

export type BenchmarkStepState = "complete" | "current" | "waiting" | "failed" | "unconfirmed";

const STEPS = [
  { title: "Request accepted", description: "Your configuration has been saved and assigned a run ID." },
  { title: "Start EC2 instance", description: "Launch a dedicated EC2 instance for this benchmark." },
  { title: "Prepare benchmark environment", description: "Prepare the benchmark image, logging, and network configuration." },
  { title: "Run benchmark", description: "Run the clients with your settings and record measurements. Timing depends on the workload." },
  { title: "Finish benchmark", description: "The runner reports completion and links available results for you to explore." },
];

const PHASE_STEP: Record<string, number> = {
  pending: 1, launching: 1, bootstrapping: 1,
  installing: 2, cloning: 2, running: 3, completed: 4,
};

export function benchmarkSteps(job: Pick<BenchmarkJob, "status" | "error_message">) {
  // Failures include the phase when the runner can identify it. A terminal
  // status alone cannot prove how far a cancelled or failed job progressed.
  const failedPhase = job.status === "failed"
    ? job.error_message?.match(/failed during (bootstrapping|installing|cloning|running)\b/i)?.[1].toLowerCase()
    : undefined;
  const phase = failedPhase ?? job.status;
  const current = PHASE_STEP[phase];

  return STEPS.map((step, index) => {
    let state: BenchmarkStepState;
    if (index === 0 || job.status === "completed") state = "complete";
    else if (typeof current !== "number") state = "unconfirmed";
    else if (index < current) state = "complete";
    else if (index > current) state = "waiting";
    else state = failedPhase ? "failed" : "current";
    return { ...step, state };
  });
}

export function benchmarkStatusMessage(job: Pick<BenchmarkJob, "status" | "parent_run_id">) {
  switch (job.status) {
    case "pending": return "Your request is queued for launch.";
    case "launching": return "Starting the EC2 instance. It may take a few minutes to report progress.";
    case "installing":
    case "cloning": return "Preparing the benchmark environment on the instance.";
    case "running": return "The benchmark is running and recording measurements.";
    case "completed": return job.parent_run_id != null
      ? "Benchmark complete. Your results are ready to explore."
      : "Benchmark complete. No results were linked to this job; check the logs for details.";
    case "failed": return "The benchmark failed. Review the error and logs below.";
    case "cancelled": return "This benchmark was cancelled. Instance termination was requested.";
    case "terminated": return "This benchmark was terminated before it completed.";
    default: return "Waiting for a recognized benchmark status. Updates will continue automatically.";
  }
}
