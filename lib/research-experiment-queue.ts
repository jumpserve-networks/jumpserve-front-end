import { validateQueue, type QueueJob, type ResearchQueue } from "@/lib/research-queue";
import type { ResearchStudy } from "@/lib/research-workflow";
import { RESEARCH_WORKFLOW_MODULE_PATH as PATH } from "@/lib/test-modules";
import { validateAutonomy, type AutonomousOverview } from "@/lib/research-autonomy";

export type ExperimentQueue = {
  version: "research-queue-overview-v1"; access: "owner-private";
  studies: ResearchStudy[]; jobs: (QueueJob & { campaign_title: string })[];
  workers_enabled: boolean; limits: ResearchQueue["limits"];
  coverage: { studies: number; jobs: number }; limitations: string;
  autonomy?: AutonomousOverview;
};
export type GapCheck = { key: string; title: string; execution_mode: "automatic" | "manual"; experiment_type: string; coverage_limits: string; dependencies: { key: string; requirement: string }[] };
export type GapPreview = { version: "research-gap-queue-v1"; study_id: string; gap_id: string; gap_sha256: string; plan_sha256: string | null; choices: GapCheck[]; limitation: string; unavailable_reason: string | null };
export type GapEnqueued = { version: "research-gap-queue-v1"; study_id: string; job_id: string; queued_job_ids: string[]; complete: boolean; workers_enabled: boolean; limitation: string };
export const QUEUE_POLL_MS = 10000;
export const isResearchId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export function experimentQueuePath(studyId?: string, jobId?: string) {
  const query = new URLSearchParams();
  if (studyId) query.set("assessment", studyId);
  if (jobId) query.set("job", jobId);
  return `${PATH}/experiment-queue${query.size ? `?${query}` : ""}`;
}
export function gapExperimentPath(studyId: string, gapId: string) {
  return `${PATH}/experiment-queue?${new URLSearchParams({ sourceAssessment: studyId, gap: gapId })}`;
}
export function validateExperimentQueue(value: unknown): ExperimentQueue {
  const queue = value as ExperimentQueue;
  if (!queue || queue.version !== "research-queue-overview-v1" || queue.access !== "owner-private" || !Array.isArray(queue.studies) || !Array.isArray(queue.jobs) || !queue.coverage || queue.coverage.studies !== queue.studies.length || queue.coverage.jobs !== queue.jobs.length || queue.studies.length > 100 || queue.jobs.length > 1000 || typeof queue.limitations !== "string" || typeof queue.workers_enabled !== "boolean") throw new Error("Experiment queue coverage is incomplete. Current status is unknown.");
  const ids = new Set(queue.studies.map(s => s.id));
  if (queue.autonomy) {
    validateAutonomy(queue.autonomy);
    if (queue.autonomy.workflows.some(w => !ids.has(w.study_id))) throw new Error("Autonomous progress belongs to an unavailable assessment.");
  }
  if (ids.size !== queue.studies.length || queue.studies.some(s => !isResearchId(s.id) || typeof s.title !== "string" || (s.study_kind ?? "paper") !== "paper") || new Set(queue.jobs.map(j => j.id)).size !== queue.jobs.length || queue.jobs.some(j => !ids.has(j.study_id) || typeof j.campaign_title !== "string")) throw new Error("Experiment queue assessment identities are invalid.");
  // The same strict per-study validator checks dependency coverage and leases.
  for (const study of queue.studies) {
    const jobs = queue.jobs.filter(j => j.study_id === study.id);
    validateQueue({ version: "research-queue-v1", access: queue.access, study_id: study.id, workers_enabled: queue.workers_enabled, limits: queue.limits, jobs, events: [], coverage: { jobs: jobs.length, events: 0 }, limitations: queue.limitations }, study.id);
  }
  if (!queue.studies.length) validateQueue({ version: "research-queue-v1", access: queue.access, study_id: "empty", workers_enabled: queue.workers_enabled, limits: queue.limits, jobs: [], events: [], coverage: { jobs: 0, events: 0 }, limitations: queue.limitations }, "empty");
  return queue;
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
