import type { AutonomousOverview, AutonomousTask, AutonomousWorkflow } from "@/lib/research-autonomy";
import { isResearchId } from "@/lib/research-experiment-queue";
import { QUEUE_STATUSES, type QueueStatus } from "@/lib/research-queue";
import { researchApiBase } from "@/lib/research-workflow";
import { parseAssessmentSummary, type AssessmentSummary } from "@/lib/assessment-notifications";
import { validateTurnHistory, validateBuilderEvidence, type TurnHistory } from "@/lib/research-autonomy";

export type PublicAutonomousTask = Omit<AutonomousTask, "required_inputs" | "next_at">;
export type PublicAutonomousWorkflow = Omit<AutonomousWorkflow, "initial_prompt" | "initial_sha256">;
export type PublicAutonomousOverview = Omit<AutonomousOverview, "workflows" | "tasks"> & {
  access: "public-read-only"; workflows: PublicAutonomousWorkflow[]; tasks: PublicAutonomousTask[];
};
export type PublicQueueJob = {
  id: string; study_id: string; status: QueueStatus; execution_mode: "automatic" | "manual";
  run_status: string | null; created_at: string; updated_at: string;
  reason?: string | null; run_reason?: string | null;
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
const diagnostic = (v: unknown) => v == null || typeof v === "string" && Array.from(v).length <= 4000;
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
    if (!fields(j, ["id", "study_id", "status", "execution_mode", "run_status", "reason", "run_reason", "created_at", "updated_at"]) ||
        !isResearchId(j.id) || j.study_id !== studyId || !QUEUE_STATUSES.includes(j.status) ||
        !["automatic", "manual"].includes(j.execution_mode) || (j.run_status !== null && !["complete", "partial", "failed", "excluded", "invalid"].includes(j.run_status)) ||
        !date(j.created_at) || !date(j.updated_at) || !diagnostic(j.reason) || !diagnostic(j.run_reason)) fail();
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
        !["intake", "planning", "building", "comprehension", "critic", "execution", "assessment"].includes(t.stage) || !taskStatuses.includes(t.status) ||
        !date(t.created_at) || !date(t.updated_at) ||
        (t.claim_id === null ? t.label !== null || t.claim_title !== null || t.stage !== "intake" :
          !isResearchId(t.claim_id) || typeof t.claim_title !== "string" || !["untested", "inconclusive", "reproduced", "discrepant"].includes(t.label ?? "")) ||
        (t.claim_id !== null && t.status === "resolved" && !["reproduced", "discrepant"].includes(t.label ?? ""))) fail();
    const p = t.evidence_progress;
    if (p != null && (!fields(p, ["required_checks", "completed_checks", "scope"]) || !whole(p.required_checks, 1000) || !whole(p.completed_checks, p.required_checks) || typeof p.scope !== "string")) fail();
  }
  if (a.tasks.filter(t => t.claim_id === null).length > 1) fail();
  return q;
}

/** Derive notification counts only from a complete, validated status snapshot. */
export function assessmentSummaryFromPublicQueue(value: unknown, studyId: string): AssessmentSummary | null {
  const queue = validatePublicStudyQueue(value, studyId);
  const workflow = queue.autonomy.workflows[0];
  if (!workflow) return null;
  const tasks = queue.autonomy.tasks.filter(task => task.claim_id !== null);
  if (new Set(tasks.map(task => task.claim_id)).size !== tasks.length) fail();
  const counts = { total: tasks.length, finished: 0, reproduced: 0, discrepant: 0, blocked: 0, running: 0, queued: 0, waiting: 0 };
  for (const task of tasks) {
    if (task.status === "resolved" || task.status === "finished") {
      counts.finished++;
      if (task.label === "reproduced" || task.label === "discrepant") counts[task.label]++;
    }
    if (task.status === "blocked" || task.status === "running" || task.status === "queued" || task.status === "waiting") counts[task.status]++;
  }
  return parseAssessmentSummary({ status: workflow.status, updated_at: workflow.updated_at, counts });
}

export function publicStatusReason(reason: string) {
  return reason === "Paused. The study owner can inspect the recorded requirements or failure details."
    ? "Paused. Recorded failure details were not returned by this server."
    : reason;
}

/** Fixed read-only transport; exported readers construct and validate every path. */
async function sharedRead(path: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<unknown> {
  const base = researchApiBase(process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL ?? process.env.NEXT_PUBLIC_BENCHMARK_API_URL);
  if (!base) throw new Error("The research queue service is not configured. Current status is unknown.");
  const controller = new AbortController();
  const relay = () => controller.abort(signal?.reason);
  if (signal?.aborted) relay(); else signal?.addEventListener("abort", relay, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Shared queue retrieval timed out. Current status is unknown.")), 30000);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const response = await fetcher(`${base}/research${path}`, {
      method: "GET", credentials: "omit", cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal,
    });
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > 4_000_000) throw new Error("Shared queue exceeds its response budget. No partial counts are shown.");
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error(`The queue service returned an unreadable response (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(response.status === 404 ? "This paper queue is unavailable. Check the shared assessment link." : `Shared queue retrieval failed (HTTP ${response.status}). Current status is unknown.`);
    return value;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", relay); }
}

export async function loadPublicStudyQueue(studyId: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<PublicStudyQueue> {
  if (!isResearchId(studyId)) throw new Error("The shared queue link has an invalid assessment identity.");
  return validatePublicStudyQueue(await sharedRead(`/studies/${studyId}/queue?public=1&diagnostics=1`, signal, fetcher), studyId);
}

export const SHARED_RECORD_KINDS = {
  autonomy_workflows: "Workflow and initial paper request", autonomy_tasks: "Claim planning and execution context",
  sources: "Sources and literature", claims: "Claims", protocols: "Protocols", configurations: "Configurations",
  campaigns: "Campaigns", claim_checks: "Claim checks", queue_jobs: "Experiment jobs", queue_events: "Event history",
  runs: "Runs and resource usage", published_values: "Published values", measurements: "Measurements", summaries: "Summaries",
  assessments: "Scientific assessments", gaps: "Evidence gaps", reviews: "Reviews", publications: "Publication history", artifacts: "Artifact metadata",
} as const;
export type SharedRecordKind = keyof typeof SHARED_RECORD_KINDS;
export type SharedProjection = { policy: "research-shared-details-v1"; redacted: number; truncated: number; note: string };
export type SharedRecords = { version: "research-shared-records-v1"; access: "public-read-only"; study_id: string; kind: SharedRecordKind; records: Record<string, unknown>[]; next_after: string | null; coverage: { returned: number }; projection: SharedProjection };
export type SharedTurnHistory = Omit<TurnHistory, "version" | "access"> & { version: "research-shared-turns-v1"; access: "public-read-only"; projection: SharedProjection };
function validProjection(value: unknown) {
  const p = value as SharedProjection;
  return fields(p, ["policy", "redacted", "truncated", "note"]) && p.policy === "research-shared-details-v1" && whole(p.redacted, 100000) && whole(p.truncated, 100000) && typeof p.note === "string";
}
export function validateSharedRecords(value: unknown, studyId: string, kind: SharedRecordKind): SharedRecords {
  const p = value as SharedRecords;
  if (!isResearchId(studyId) || !Object.hasOwn(SHARED_RECORD_KINDS, kind) || !fields(p, ["version", "access", "study_id", "kind", "records", "next_after", "coverage", "projection"]) || p.version !== "research-shared-records-v1" || p.access !== "public-read-only" || p.study_id !== studyId || p.kind !== kind || !Array.isArray(p.records) || p.records.length > 100 || p.coverage?.returned !== p.records.length || !validProjection(p.projection) || p.records.some(row => !object(row) || row.study_id !== studyId || !isResearchId(kind === "autonomy_workflows" ? row.study_id : row.id))) fail();
  const ids = p.records.map(row => String(kind === "autonomy_workflows" ? row.study_id : row.id));
  if (ids.some((id, index) => index > 0 && id <= ids[index-1]) || p.next_after !== null && (!isResearchId(p.next_after) || p.next_after !== ids.at(-1))) fail();
  return p;
}
export function validateSharedTurnHistory(value: unknown, studyId: string, taskId: string): SharedTurnHistory {
  const p = value as SharedTurnHistory;
  if (!isResearchId(studyId) || !isResearchId(taskId) || !fields(p, ["version", "access", "study_id", "task_id", "turns", "builder_calls", "next_before", "coverage", "projection"]) || p.version !== "research-shared-turns-v1" || p.access !== "public-read-only" || !validProjection(p.projection)) fail();
  validateTurnHistory({ ...p, version: "research-autonomy-v3", access: "owner-private" }, studyId, taskId);
  const numbers = p.turns.map(turn => turn.number);
  const allNumbers=[...numbers,...(p.builder_calls??[]).map(c=>c.number)];
  if (numbers.some((number, index) => index > 0 && number >= numbers[index-1]) || p.next_before !== null && p.next_before !== Math.min(...allNumbers)) fail();
  return p;
}
export async function loadSharedRecords(studyId: string, kind: SharedRecordKind, after?: string, signal?: AbortSignal, fetcher: typeof fetch = fetch) {
  if (!isResearchId(studyId) || !Object.hasOwn(SHARED_RECORD_KINDS, kind) || after !== undefined && !isResearchId(after)) throw new Error("The shared record selection is invalid.");
  const query = new URLSearchParams({ public: "1", records: kind }); if (after) query.set("after", after);
  const page = validateSharedRecords(await sharedRead(`/studies/${studyId}/queue?${query}`, signal, fetcher), studyId, kind);
  if (after && page.records.some(row => String(row.id) <= after)) fail();
  return page;
}
export async function loadSharedBuilderEvidence(studyId:string,taskId:string,callId:string,kind:"request"|"response",cursor:number,signal?:AbortSignal){
 if(![studyId,taskId,callId].every(isResearchId)||!whole(cursor))throw new Error("Invalid native evidence selection.");
 const query=new URLSearchParams({public:"1",task:taskId,builder_call:callId,kind,cursor:String(cursor)});
 return validateBuilderEvidence(await sharedRead(`/studies/${studyId}/autonomy?${query}`,signal),studyId,taskId,callId,kind,cursor);
}
export async function loadSharedTurnHistory(studyId: string, taskId: string, before?: number, signal?: AbortSignal, fetcher: typeof fetch = fetch) {
  if (!isResearchId(studyId) || !isResearchId(taskId) || before !== undefined && (!whole(before) || before < 1)) throw new Error("The shared turn selection is invalid.");
  const query = new URLSearchParams({ public: "1", task: taskId }); if (before !== undefined) query.set("before", String(before));
  const page = validateSharedTurnHistory(await sharedRead(`/studies/${studyId}/autonomy?${query}`, signal, fetcher), studyId, taskId);
  if (before !== undefined && page.turns.some(turn => turn.number >= before)) fail();
  return page;
}
