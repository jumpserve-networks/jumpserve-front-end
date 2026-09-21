import type { RealWorldJob } from "./real-world";

export const REAL_WORLD_STEPS = [
  { status: "provisioning", label: "Create EC2 instances" },
  { status: "bootstrapping", label: "Prepare machines" },
  { status: "configuring", label: "Configure the network" },
  { status: "checking", label: "Check routes and connectivity" },
  { status: "starting", label: "Schedule and run TCP transfers" },
  { status: "running", label: "Collect measurements" },
  { status: "cleaning", label: "Remove test resources" },
] as const;

export type ProgressState = "completed" | "current" | "upcoming" | "failed" | "cancelled" | "skipped" | "unknown";
export type ProgressStep = { status: string; label: string; state: ProgressState;
  startedAt: string | null; completedAt: string | null; durationSeconds: number | null };

function timestamp(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value)) ? value : null;
}

export function realWorldProgress(job: RealWorldJob): ProgressStep[] {
  const terminal = ["completed", "failed", "cancelled"].includes(job.status);
  const outcome = terminal ? job.status : job.outcome;
  const interrupted = outcome === "failed" || outcome === "cancelled";
  const finalStatus = interrupted ? outcome : "completed";
  const steps = [...REAL_WORLD_STEPS, { status: finalStatus, label: "Finish test" }];
  const currentIndex = steps.findIndex(step => step.status === job.status);
  const history = [...(job.status_history ?? [])].sort((a, b) => a.id - b.id);
  const entries = new Map(history.map(entry => [entry.status, entry]));
  const completeHistory = history[0]?.status === "provisioning" && Boolean(timestamp(history[0].started_at));
  const interruptedIndex = steps.findIndex(step => ["failed", "cancelled"].includes(entries.get(step.status)?.outcome ?? ""));

  const progress = steps.map((step, index): ProgressStep => {
    const entry = entries.get(step.status);
    const startedAt = timestamp(entry?.started_at);
    const completedAt = timestamp(entry?.completed_at);
    let state: ProgressState;
    if (entry?.outcome) state = entry.outcome;
    else if (completedAt) state = "completed";
    else if (index === currentIndex) state = terminal ? job.status as ProgressState : "current";
    else if (index < currentIndex) {
      if (!interrupted || step.status === "cleaning") state = "completed";
      else state = completeHistory || (interruptedIndex >= 0 && index > interruptedIndex) ? "skipped" : "unknown";
    } else state = "upcoming";
    const elapsed = startedAt && completedAt ? (Date.parse(completedAt) - Date.parse(startedAt)) / 1000 : null;
    return { ...step, state, startedAt, completedAt,
      durationSeconds: elapsed !== null && elapsed >= 0 ? Math.round(elapsed) : null };
  });
  // Preserve an unrecognized future controller state without calling it complete.
  if (currentIndex < 0) progress.unshift({ status: job.status, label: job.status, state: "current",
    startedAt: null, completedAt: null, durationSeconds: null });
  return progress;
}

export function progressDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), remainder = seconds % 60;
  return [hours ? `${hours} h` : "", minutes ? `${minutes} min` : "", `${remainder} s`].filter(Boolean).join(" ");
}
