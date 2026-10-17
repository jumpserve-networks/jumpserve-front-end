import { isResearchId, validateGapEnqueued, type GapPreview } from "@/lib/research-experiment-queue";

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
export type GapRunIntent = { version: 1; studyId: string; gapId: string; requestId: string; createdAt: number };
const INTENT_PREFIX = "research-gap-run-v1:";
export function saveGapRunIntent(storage: Pick<Storage, "setItem">, intent: GapRunIntent) {
  storage.setItem(INTENT_PREFIX + intent.requestId, JSON.stringify(intent));
}
export function consumeGapRunIntent(storage: Pick<Storage, "getItem" | "removeItem">, requestId: string, studyId: string, gapId: string, now = Date.now()): GapRunIntent | null {
  const key = INTENT_PREFIX + requestId; const raw = storage.getItem(key);
  if (!raw) return null;
  storage.removeItem(key);
  try {
    const intent = JSON.parse(raw) as GapRunIntent;
    return intent.version === 1 && intent.requestId === requestId && isResearchId(requestId) && intent.studyId === studyId && intent.gapId === gapId && Number.isFinite(intent.createdAt) && intent.createdAt <= now && now - intent.createdAt <= 15 * 60 * 1000 ? intent : null;
  } catch { return null; }
}

export async function runGapExperiments(preview: GapPreview, requestId: string, request: Request, progress: (message: string, studyId?: string) => void) {
  if (!preview.choices.length || !isResearchId(requestId)) throw new Error(preview.unavailable_reason ?? "This gap has no retained runnable plan.");
  const path = `/studies/${preview.study_id}/gap-experiments`;
  const selection = { request_id: requestId, gap_id: preview.gap_id, gap_sha256: preview.gap_sha256, plan_sha256: preview.plan_sha256 };
  progress("Creating or resuming your private follow-up…");
  const followup = await request<{ version: string; study_id: string }>(path, { method: "POST", body: JSON.stringify({ ...selection, key: preview.choices[0].key, action: "create-followup" }) });
  if (followup?.version !== "research-gap-queue-v1" || !isResearchId(followup.study_id)) throw new Error("Private follow-up identity was not confirmed.");
  progress("Preserving the frozen plan and exact input bytes…", followup.study_id);
  await request(`/studies/${followup.study_id}/prepare`, { method: "POST", body: JSON.stringify({ action: "prepare", request_id: requestId }) });
  const jobs: string[] = [];
  for (const choice of preview.choices) {
    progress(`Queueing ${choice.title}…`, followup.study_id);
    const result = validateGapEnqueued(await request(path, { method: "POST", body: JSON.stringify({ ...selection, key: choice.key, action: "enqueue" }) }));
    if (result.study_id !== followup.study_id) throw new Error("Queue response identifies another follow-up study.");
    if (!result.complete) return { studyId: followup.study_id, jobIds: jobs, complete: false };
    jobs.push(result.job_id);
  }
  return { studyId: followup.study_id, jobIds: [...new Set(jobs)], complete: true };
}
