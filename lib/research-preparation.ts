export type PreparationRequest = <T>(path: string, options?: RequestInit) => Promise<T>;
export type PreparedJob = { id: string; campaign_id: string; title: string; execution_mode: "automatic" | "manual"; status: string };
export type PreparedPlan = { id: string; plan_id: string; manifest_sha256: string; jobs: PreparedJob[]; planned_jobs: number; queued_jobs: number; automatic_jobs: number; manual_jobs: number; status: string; provenance: Record<string, unknown> };
export type PreparationStatus = { version: string; available_plan: { plan_id: string; title: string; claims: number; automatic_jobs: number; manual_jobs: number; provenance: Record<string, unknown> } | null; prepared: PreparedPlan[]; uploaded_plan_bytes: number; limitation: string };
function validatePlan(plan: PreparedPlan) {
  const statuses = new Set(["not-queued", "queued", "manual", "running", "awaiting-review", "reviewed", "failed", "cancelled", "expired"]);
  if (!plan?.id || !Array.isArray(plan.jobs) || plan.jobs.length < 1 || plan.jobs.length > 100 || plan.jobs.length !== plan.planned_jobs || plan.jobs.some(job => !job.id || !job.campaign_id || !statuses.has(job.status) || !["automatic", "manual"].includes(job.execution_mode)) || plan.jobs.filter(job => job.status !== "not-queued").length !== plan.queued_jobs || plan.jobs.filter(job => job.execution_mode === "automatic").length !== plan.automatic_jobs || plan.jobs.filter(job => job.execution_mode === "manual").length !== plan.manual_jobs || new Set(plan.jobs.map(job => job.id)).size !== plan.jobs.length) throw new Error("Preparation coverage is incomplete or ambiguous; no missing jobs are treated as queued.");
}
export function validatePreparation(value: unknown): PreparationStatus {
  const status = value as PreparationStatus;
  if (!status || status.version !== "research-preparation-v1" || !Array.isArray(status.prepared) || !Number.isInteger(status.uploaded_plan_bytes) || !("available_plan" in status) || typeof status.limitation !== "string") throw new Error("Preparation status is incomplete; saved study data remain available.");
  for (const plan of status.prepared) validatePlan(plan);
  return status;
}
export async function prepareAndQueue(studyId: string, requestId: string, onProgress: (message: string) => void, request: PreparationRequest, planInput?: string, preparedId?: string) {
  let prepared: PreparedPlan;
  if (preparedId) {
    const status = validatePreparation(await request(`/studies/${studyId}/prepare`));
    const existing = status.prepared.find(plan => plan.id === preparedId);
    if (!existing) throw new Error("The retained preparation plan is unavailable; refresh its original status before resuming.");
    prepared = existing;
  } else {
    onProgress("Preserving sources, claims and frozen campaign protocols…");
    const result = await request<{ prepared: PreparedPlan }>(`/studies/${studyId}/prepare`, { method: "POST", body: JSON.stringify({ action: "prepare", request_id: requestId, ...(planInput !== undefined ? { plan_input: planInput } : {}) }) });
    prepared = result.prepared;
    validatePlan(prepared);
  }
  let queued = prepared.queued_jobs;
  for (const job of prepared.jobs) {
    if (job.status !== "not-queued") continue;
    onProgress(`Queueing ${queued + 1} of ${prepared.planned_jobs}: ${job.title}`);
    const result = await request<{ job: PreparedJob & { study_id: string } }>(`/studies/${studyId}/prepare`, { method: "POST", body: JSON.stringify({ action: "enqueue", prepared_id: prepared.id, job_id: job.id }) });
    if (!result?.job || result.job.id !== job.id || result.job.study_id !== studyId || result.job.campaign_id !== job.campaign_id || result.job.execution_mode !== job.execution_mode || !["queued", "manual", "running", "awaiting-review", "reviewed", "failed", "cancelled", "expired"].includes(result.job.status)) throw new Error("Queue response does not confirm this planned job. Refresh retained status before resuming.");
    job.status = result.job.status;
    queued += 1;
  }
  prepared.queued_jobs = queued;
  prepared.status = "queued";
  onProgress(`${prepared.automatic_jobs} numerical job definitions and ${prepared.manual_jobs} operator tasks preserved. Scientific review remains separate.`);
  return prepared;
}
