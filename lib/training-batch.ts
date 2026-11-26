export function isTrainingBatchId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
}

export function parseTrainingBatchId(value: string) {
  const id = Number(value);
  return isTrainingBatchId(id) && String(id) === value ? id : null;
}

export type TrainingBatchPaper = {
  id: string;
  fileName: string;
  status: "pending" | "generating" | "verifying" | "passed" | "stopped";
  assessmentId: string | null;
  score: { earned: number; maximum: number } | null;
};

export type TrainingBatchSnapshot = {
  status: "preparing" | "running" | "passed" | "stopped" | "failed" | "interrupted" | "busy";
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  stopPhase: "generating" | "verifying" | "saving_generator" | "saving_verifier" | null;
  versions: { generator: number | null; verifier: number | null };
  papers: TrainingBatchPaper[];
};

export type TrainingBatch = Omit<TrainingBatchSnapshot, "status" | "updatedAt"> & {
  id: number;
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
  stopped: "Stopped",
  failed: "Batch failed",
  interrupted: "Interrupted",
  busy: "Another batch is already running",
};

export function isTrainingBatchActive(status: TrainingBatch["status"]) {
  return status === "requested" || status === "unconfirmed" || status === "preparing" || status === "running";
}
