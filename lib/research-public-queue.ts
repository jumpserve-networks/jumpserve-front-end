import type { AutonomousOverview, AutonomousTask, AutonomousWorkflow } from "@/lib/research-autonomy";
import { isResearchId } from "@/lib/research-experiment-queue";
import { QUEUE_STATUSES, type QueueStatus } from "@/lib/research-queue";
import { researchApiBase } from "@/lib/research-workflow";

export type PublicAutonomousTask = Omit<AutonomousTask, "required_inputs" | "next_at">;
export type PublicAutonomousWorkflow = Omit<AutonomousWorkflow, "initial_prompt" | "initial_sha256">;
export type PublicAutonomousOverview = Omit<AutonomousOverview, "workflows" | "tasks"> & {
  access: "public-read-only"; workflows: PublicAutonomousWorkflow[]; tasks: PublicAutonomousTask[];
};
export type PublicQueueJob = {
  id: string; study_id: string; status: QueueStatus; execution_mode: "automatic" | "manual";
  run_status: string | null; created_at: string; updated_at: string;
};
export type PublicStudyQueue = {
  version: "research-public-queue-v1"; access: "public-read-only"; study: { id: string; title: string };
  jobs: PublicQueueJob[]; workers_enabled: boolean; autonomy: PublicAutonomousOverview;
  coverage: { jobs: number }; limitations: string;
};
const fail = () => { throw new Error("Shared queue coverage is invalid or incomplete. Current status is unknown."); };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const fields = (v: unknown, keys: string[]) => object(v) && Object.keys(v).every(k => keys.includes(k));
const whole = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
const unique = (rows: { id: string }[]) => rows.every(object) && new Set(rows.map(r => r.id)).size === rows.length;
const taskStatuses = ["queued", "running", "waiting", "resolved", "finished", "blocked", "attempt-limit", "budget", "deadline", "cancelled"];
const workflowStatuses = ["running", "completed", "completed-with-blockers", "budget", "deadline", "cancelled"];

/** This contract deliberately cannot accept an owner-private snapshot. */
export function validatePublicStudyQueue(value: unknown, studyId: string): PublicStudyQueue {
  if (!isResearchId(studyId)) fail();
  const q = value as PublicStudyQueue;
  if (!fields(q, ["version", "access", "study", "jobs", "workers_enabled", "autonomy", "coverage", "limitations"]) ||
      q.version !== "research-public-queue-v1" || q.access !== "public-read-only" ||
      !fields(q.study, ["id", "title"]) || q.study.id !== studyId || typeof q.study.title !== "string" ||
      typeof q.workers_enabled !== "boolean" || typeof q.limitations !== "string" || !Array.isArray(q.jobs) ||
      q.jobs.length > 1000 || !unique(q.jobs) || !fields(q.coverage, ["jobs"]) || q.coverage.jobs !== q.jobs.length) fail();
  for (const j of q.jobs) {
    if (!fields(j, ["id", "study_id", "status", "execution_mode", "run_status", "created_at", "updated_at"]) ||
        !isResearchId(j.id) || j.study_id !== studyId || !QUEUE_STATUSES.includes(j.status) ||
        !["automatic", "manual"].includes(j.execution_mode) || (j.run_status !== null && !["complete", "partial", "failed", "excluded", "invalid"].includes(j.run_status)) ||
        !date(j.created_at) || !date(j.updated_at)) fail();
  }
  const a = q.autonomy;
  if (!fields(a, ["version", "access", "defaults", "enabled", "runtime", "workflows", "tasks", "coverage"]) ||
      a.access !== "public-read-only" || !["research-autonomy-v1", "research-autonomy-v2", "research-autonomy-v3"].includes(a.version) ||
      typeof a.enabled !== "boolean" || !fields(a.defaults, ["maximum_spend_usd", "elapsed_days", "attempts_per_claim", "parallel_claims_per_paper", "global_parallel_claims"]) || a.defaults.maximum_spend_usd !== 100 || a.defaults.elapsed_days !== 7 ||
      a.defaults.attempts_per_claim !== (a.version === "research-autonomy-v3" ? null : 25) ||
      !Array.isArray(a.workflows) || a.workflows.length > 1 || !Array.isArray(a.tasks) || a.tasks.length > 1000 ||
      !unique(a.tasks) || !fields(a.coverage, ["workflows", "tasks"]) || a.coverage.workflows !== a.workflows.length || a.coverage.tasks !== a.tasks.length ||
      (!a.workflows.length && a.tasks.length)) fail();
  if (a.runtime && (!fields(a.runtime, ["runtime", "model_id", "status", "updated_at"]) ||
      !["bedrock", "openclaw-production-v1"].includes(a.runtime.runtime) || typeof a.runtime.model_id !== "string" ||
      !["configured", "ready", "auth-required", "paused-quota", "unavailable"].includes(a.runtime.status))) fail();
  for (const w of a.workflows) {
    if (!fields(w, ["study_id", "max_spend_cents", "max_attempts", "committed_cents", "status", "reason", "created_at", "deadline_at", "updated_at"]) ||
        w.study_id !== studyId || w.max_spend_cents !== 10000 || w.max_attempts !== a.defaults.attempts_per_claim ||
        !whole(w.committed_cents, w.max_spend_cents) || !workflowStatuses.includes(w.status) || typeof w.reason !== "string" ||
        !date(w.created_at) || !date(w.deadline_at) || !date(w.updated_at)) fail();
  }
  for (const t of a.tasks) {
    if (!fields(t, ["id", "study_id", "claim_id", "claim_title", "stage", "status", "label", "attempts", "reason", "evidence_progress", "created_at", "updated_at"]) ||
        !isResearchId(t.id) || t.study_id !== studyId || !whole(t.attempts) || typeof t.reason !== "string" ||
        !["intake", "planning", "comprehension", "critic", "execution", "assessment"].includes(t.stage) || !taskStatuses.includes(t.status) ||
        !date(t.created_at) || !date(t.updated_at) ||
        (t.claim_id === null ? t.label !== null || t.claim_title !== null || t.stage !== "intake" :
          !isResearchId(t.claim_id) || typeof t.claim_title !== "string" || !["untested", "inconclusive", "reproduced", "discrepant"].includes(t.label ?? "")) ||
        (t.status === "resolved" && !["reproduced", "discrepant"].includes(t.label ?? ""))) fail();
    const p = t.evidence_progress;
    if (p != null && (!fields(p, ["required_checks", "completed_checks", "scope"]) || !whole(p.required_checks, 1000) || !whole(p.completed_checks, p.required_checks) || typeof p.scope !== "string")) fail();
  }
  if (a.tasks.filter(t => t.claim_id === null).length > 1) fail();
  return q;
}

/** Fixed GET transport: no cookies, access tokens, arbitrary paths or writes. */
export async function loadPublicStudyQueue(studyId: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<PublicStudyQueue> {
  if (!isResearchId(studyId)) throw new Error("The shared queue link has an invalid study identity.");
  const base = researchApiBase(process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL ?? process.env.NEXT_PUBLIC_BENCHMARK_API_URL);
  if (!base) throw new Error("The research queue service is not configured. Current status is unknown.");
  const controller = new AbortController();
  const relay = () => controller.abort(signal?.reason);
  if (signal?.aborted) relay(); else signal?.addEventListener("abort", relay, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Shared queue retrieval timed out. Current status is unknown.")), 30000);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const response = await fetcher(`${base}/research/studies/${studyId}/queue?public=1`, {
      method: "GET", credentials: "omit", cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal,
    });
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > 4_000_000) throw new Error("Shared queue exceeds its response budget. No partial counts are shown.");
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error(`The queue service returned an unreadable response (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(response.status === 404 ? "This paper queue is unavailable. Check the shared study link." : `Shared queue retrieval failed (HTTP ${response.status}). Current status is unknown.`);
    return validatePublicStudyQueue(value, studyId);
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", relay); }
}
