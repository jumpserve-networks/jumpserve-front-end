
import { ASSESSMENT_PATH } from "@/lib/test-modules";
export type GapCheck = { key: string; title: string; execution_mode: "automatic" | "manual"; experiment_type: string; coverage_limits: string; dependencies: { key: string; requirement: string }[] };
export type GapPreview = { version: "research-gap-queue-v1"; study_id: string; gap_id: string; gap_sha256: string; plan_sha256: string | null; choices: GapCheck[]; limitation: string; unavailable_reason: string | null };
export type GapEnqueued = { version: "research-gap-queue-v1"; study_id: string; job_id: string; queued_job_ids: string[]; complete: boolean; workers_enabled: boolean; limitation: string };
export const QUEUE_POLL_MS = 10000;
export const isResearchId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export function experimentQueuePath(studyId: string, jobId?: string) {
  const query = new URLSearchParams();
  if (jobId) query.set("job", jobId);
  return `${ASSESSMENT_PATH}/${studyId}${query.size ? `?${query}` : ""}#${jobId ? `job-${jobId}` : "experiment-queue"}`;
}
export function gapExperimentPath(studyId: string, gapId: string) {
  return `${ASSESSMENT_PATH}/${studyId}?${new URLSearchParams({ gap: gapId })}`;
}
export function validateGapPreview(value: unknown, studyId: string, gapId: string): GapPreview {
  const p = value as GapPreview;
  if (!p || p.version !== "research-gap-queue-v1" || p.study_id !== studyId || p.gap_id !== gapId || !/^[a-f0-9]{64}$/.test(p.gap_sha256) || !Array.isArray(p.choices) || p.choices.length > 100 || typeof p.limitation !== "string" || (p.choices.length ? !/^[a-f0-9]{64}$/.test(p.plan_sha256 ?? "") : typeof p.unavailable_reason !== "string") || new Set(p.choices.map(c => c.key)).size !== p.choices.length || p.choices.some(c => !c.key || typeof c.title !== "string" || !["automatic", "manual"].includes(c.execution_mode) || typeof c.coverage_limits !== "string" || !Array.isArray(c.dependencies))) throw new Error("The experiment preview is incomplete; no job can be queued.");
  return p;
}
export function validateGapEnqueued(value: unknown): GapEnqueued {
  const r = value as GapEnqueued;
  if (!r || r.version !== "research-gap-queue-v1" || !isResearchId(r.study_id) || !isResearchId(r.job_id) || !Array.isArray(r.queued_job_ids) || r.queued_job_ids.length > 100 || r.queued_job_ids.some(id => !isResearchId(id)) || typeof r.complete !== "boolean" || r.complete !== r.queued_job_ids.includes(r.job_id) || typeof r.workers_enabled !== "boolean" || typeof r.limitation !== "string") throw new Error("The response does not confirm the selected job. Refresh the queue before retrying.");
  return r;
}
