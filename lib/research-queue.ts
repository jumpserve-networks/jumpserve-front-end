import { latestByClaim, type ResearchSnapshot } from "@/lib/research-workflow";

export const QUEUE_STATUSES = ["queued", "manual", "running", "awaiting-review", "reviewed", "failed", "cancelled", "expired"] as const;
export type QueueStatus = typeof QUEUE_STATUSES[number];
export type QueueDependency = { job_id: string; requirement: "complete-run" | "reviewed-evidence" };
export type QueueJob = {
  id: string; study_id: string; campaign_id: string; execution_mode: "automatic" | "manual";
  priority: number; status: QueueStatus; reason: string; readiness: string; blockers: string[];
  dependencies: QueueDependency[]; exclusive_resources: string[]; followup_of: string | null;
  run_id: string | null; run_status: string | null; created_at: string; updated_at: string;
  definition_sha256: string; lease_until: string | null;
};
export type QueueEvent = { id: string; study_id: string; job_id: string; event: string; status: QueueStatus; reason: string; details: Record<string, unknown>; created_at: string };
export type ResearchQueue = {
  version: string; study_id: string; access: "owner-private"; workers_enabled: boolean; jobs: QueueJob[]; events: QueueEvent[];
  limits: { global_jobs: number; study_jobs: number; invocation_jobs: number; lease_seconds: number; automatic_retries: number };
  coverage: { jobs: number; events: number }; limitations: string;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function validateQueue(value: unknown, studyId: string): ResearchQueue {
  if (!value || typeof value !== "object") throw new Error("Queue response is missing.");
  const queue = value as ResearchQueue;
  if (queue.version !== "research-queue-v1" || queue.study_id !== studyId || queue.access !== "owner-private" || typeof queue.workers_enabled !== "boolean" || !queue.limits || !queue.coverage || typeof queue.limitations !== "string") throw new Error("Queue response is incomplete or belongs to another study.");
  for (const field of ["global_jobs", "study_jobs", "invocation_jobs", "lease_seconds"] as const) if (!Number.isInteger(queue.limits[field]) || queue.limits[field] < 1) throw new Error("Queue resource limits are invalid.");
  if (queue.limits.automatic_retries !== 0) throw new Error("Queue retry policy is unsupported.");
  for (const field of ["jobs", "events"] as const) {
    if (!Array.isArray(queue[field]) || queue.coverage[field] !== queue[field].length || new Set(queue[field].map(r => r.id)).size !== queue[field].length || queue[field].some(r => !uuid.test(r.id) || r.study_id !== studyId || !QUEUE_STATUSES.includes(r.status) || !Number.isFinite(Date.parse(r.created_at)))) throw new Error(`Invalid or incomplete queue ${field} coverage.`);
  }
  if (queue.jobs.length > 1000 || queue.events.length > 5000) throw new Error("Queue response exceeds its declared budget.");
  const ids = new Set(queue.jobs.map(j => j.id));
  for (const job of queue.jobs) {
    if (!uuid.test(job.campaign_id) || !["automatic", "manual"].includes(job.execution_mode) || !Number.isInteger(job.priority) || job.priority < 1 || job.priority > 5 || typeof job.reason !== "string" || typeof job.readiness !== "string" || !Array.isArray(job.blockers) || job.blockers.some(r => typeof r !== "string") || !Array.isArray(job.dependencies) || !Array.isArray(job.exclusive_resources) || !Number.isFinite(Date.parse(job.updated_at))) throw new Error("Invalid queue job; progress cannot be inferred.");
    if (job.dependencies.some(d => !ids.has(d.job_id) || !["complete-run", "reviewed-evidence"].includes(d.requirement))) throw new Error("Queue dependencies are incomplete or ambiguous.");
    if (job.status === "running" && (!job.lease_until || !Number.isFinite(Date.parse(job.lease_until)))) throw new Error("Running job lease is missing.");
  }
  if (queue.events.some(e => !ids.has(e.job_id) || typeof e.reason !== "string" || !e.details || typeof e.details !== "object")) throw new Error("Queue event history is incomplete.");
  return queue;
}

export function claimQueueRows(snapshot: ResearchSnapshot, queue: ResearchQueue) {
  const latest = latestByClaim(snapshot.records.assessments);
  const campaigns = new Map<string, Set<string>>();
  for (const check of snapshot.records.claim_checks) {
    if (check.applicability !== "applicable" || typeof check.claim_id !== "string" || typeof check.campaign_id !== "string") continue;
    const ids = campaigns.get(check.claim_id) ?? new Set<string>(); ids.add(check.campaign_id); campaigns.set(check.claim_id, ids);
  }
  const jobs = new Map<string, QueueJob[]>();
  for (const job of queue.jobs) jobs.set(job.campaign_id, [...(jobs.get(job.campaign_id) ?? []), job]);
  return snapshot.records.claims.map(claim => ({ claim, assessment: latest.get(claim.id), campaignIds: [...(campaigns.get(claim.id) ?? [])], jobs: [...(campaigns.get(claim.id) ?? [])].flatMap(id => jobs.get(id) ?? []) }));
}
