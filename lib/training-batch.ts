export function isTrainingBatchId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
}

export function parseTrainingBatchId(value: string) {
  const id = Number(value);
  return isTrainingBatchId(id) && String(id) === value ? id : null;
}

export const trainingBatchSteps = ["generator", "verifier"] as const;
export type TrainingBatchStep = (typeof trainingBatchSteps)[number];
export const trainingBatchStepLabels: Record<TrainingBatchStep, string> = {
  generator: "Generator",
  verifier: "Verifier",
};

type TrainingBatchStepProgress = {
  status: "running" | "completed" | "stopped" | "interrupted";
  durationMs: number | null;
};

export type TrainingBatchPaper = {
  id: string;
  fileName: string;
  status: "pending" | "generating" | "verifying" | "passed" | "completed" | "stopped" | "interrupted";
  assessmentId: string | null;
  score: { earned: number; maximum: number } | null;
  steps?: Partial<Record<TrainingBatchStep, TrainingBatchStepProgress>>;
};

export function projectTrainingBatchSteps(value: unknown): TrainingBatchPaper["steps"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const steps: NonNullable<TrainingBatchPaper["steps"]> = {};
  for (const role of trainingBatchSteps) {
    const entry = (value as Record<string, unknown>)[role];
    if (typeof entry !== "object" || entry === null) continue;
    const { status, durationMs } = entry as Partial<TrainingBatchStepProgress>;
    if (status !== "running" && status !== "completed" && status !== "stopped" && status !== "interrupted") continue;
    steps[role] = {
      status,
      durationMs: status !== "running" && typeof durationMs === "number" &&
        Number.isSafeInteger(durationMs) && durationMs >= 0 ? durationMs : null,
    };
  }
  return steps;
}

export function formatTrainingBatchDuration(milliseconds: number) {
  const elapsedSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const secondsText = `${seconds} second${seconds === 1 ? "" : "s"}`;
  return minutes ? `${minutes} minute${minutes === 1 ? "" : "s"} ${secondsText}` : secondsText;
}

export type TrainingBatchSnapshot = {
  status: "preparing" | "running" | "passed" | "completed" | "stopped" | "failed" | "interrupted" | "busy";
  activityAvailable?: boolean;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  stopPhase: "generating" | "verifying" | "saving_generator" | "saving_verifier" | null;
  versions: { generator: number | null; verifier: number | null };
  papers: TrainingBatchPaper[];
};

export type TrainingBatch = Omit<TrainingBatchSnapshot, "status" | "updatedAt"> & {
  id: number;
  canViewAssessmentLinks?: true;
  status: TrainingBatchSnapshot["status"] | "requested" | "unconfirmed";
  requestedAt: string | null;
  updatedAt: string | null;
  stale: boolean;
};

export const trainingBatchStatusLabels: Record<TrainingBatch["status"], string> = {
  requested: "Waiting for the coordinator",
  unconfirmed: "Start unconfirmed",
  preparing: "Preparing the batch",
  running: "Running",
  passed: "Passed",
  completed: "Completed",
  stopped: "Stopped",
  failed: "Batch failed",
  interrupted: "Interrupted",
  busy: "Another batch is already running",
};

export function isTrainingBatchActive(status: TrainingBatch["status"]) {
  return status === "requested" || status === "unconfirmed" || status === "preparing" || status === "running";
}
