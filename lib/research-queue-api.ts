import { isResearchId, validateExperimentQueue, type ExperimentQueue } from "@/lib/research-experiment-queue";
import { validateQueue, type ResearchQueue } from "@/lib/research-queue";
import { validateSnapshot, type ResearchStudy } from "@/lib/research-workflow";

type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
type Capabilities = { queue?: { version: string; overview_version?: string; workers_enabled: boolean; limits: ResearchQueue["limits"] }; preparation?: { gap_queue_version?: string } };
export const GAP_BACKEND_REQUIRED = "The connected research backend has not released evidence-gap experiment launching yet. Existing jobs are available in Experiment Queue; new gap launches require the backend update.";

export async function requireGapQueueApi(request: Request, signal?: AbortSignal) {
  const capabilities = await request<Capabilities>("/capabilities", { signal });
  if (capabilities.preparation?.gap_queue_version !== "research-gap-queue-v1") throw new Error(GAP_BACKEND_REQUIRED);
}

/** Older releases expose authenticated study queues, but no overview endpoint. */
export async function loadExperimentQueue(request: Request, signal?: AbortSignal): Promise<ExperimentQueue> {
  const controller = new AbortController();
  const relay = () => controller.abort(signal?.reason);
  if (signal?.aborted) relay(); else signal?.addEventListener("abort", relay, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Queue retrieval exceeded 30 seconds. Current counts are unverified; previously retrieved status may be stale.")), 30000);
  let bytes = 0;
  async function read<T>(path: string): Promise<T> {
    if (controller.signal.aborted) throw controller.signal.reason;
    const result = await request<T>(path, { signal: controller.signal });
    bytes += new TextEncoder().encode(JSON.stringify(result)).byteLength;
    if (bytes > 16_000_000) {
      const error = new Error("Queue retrieval exceeds its 16 MB parsed-response budget. No truncated counts are shown.");
      controller.abort(error); throw error;
    }
    return result;
  }
  try {
    const capabilities = await read<Capabilities>("/capabilities");
    if (capabilities.queue?.overview_version === "research-queue-overview-v1") return validateExperimentQueue(await read("/queue"));
    if (capabilities.queue?.version !== "research-queue-v1") throw new Error("The connected research backend does not support recorded study queues.");
    const listing = await read<{ access: string; studies: ResearchStudy[] }>("/studies?mine=1");
    if (listing.access !== "owner-drafts" || !Array.isArray(listing.studies) || listing.studies.length > 100 || new Set(listing.studies.map(s => s?.id)).size !== listing.studies.length || listing.studies.some(s => !s || !isResearchId(s.id) || typeof s.title !== "string" || !["paper", "idea"].includes(s.study_kind ?? "paper"))) throw new Error("Owned study coverage is invalid or incomplete; queue counts are unknown.");
    const studies = listing.studies.filter(s => (s.study_kind ?? "paper") === "paper");
    const collected = new Map<string, ExperimentQueue["jobs"]>();
    let cursor = 0; let count = 0; let metadataMissing = 0; let failure: unknown;
    async function slot() {
      try {
        while (cursor < studies.length && !controller.signal.aborted) {
          const study = studies[cursor++];
          const queue = validateQueue(await read(`/studies/${study.id}/queue`), study.id);
          if (queue.workers_enabled !== capabilities.queue!.workers_enabled || (["global_jobs", "study_jobs", "invocation_jobs", "lease_seconds", "automatic_retries"] as const).some(key => queue.limits[key] !== capabilities.queue!.limits[key])) throw new Error("Queue settings changed during retrieval. Refresh before interpreting the combined counts.");
          count += queue.jobs.length;
          if (count > 1000) throw new Error("Your paper queues exceed 1,000 jobs. No truncated counts are shown.");
          const titles = new Map<string, string>();
          if (queue.jobs.length) {
            try {
              const snapshot = validateSnapshot(await read(`/studies/${study.id}`));
              if (snapshot.study.id !== study.id || snapshot.access !== "owner-draft") throw new Error("Private campaign metadata identity differs.");
              for (const campaign of snapshot.records.campaigns) if (typeof campaign.title === "string") titles.set(campaign.id, campaign.title);
            } catch (error) { if (controller.signal.aborted) throw error; metadataMissing++; }
          }
          collected.set(study.id, queue.jobs.map(job => ({
            id: job.id, study_id: job.study_id, campaign_id: job.campaign_id,
            campaign_title: titles.get(job.campaign_id) ?? `Campaign ${job.campaign_id} (title unavailable)`,
            execution_mode: job.execution_mode, priority: job.priority, status: job.status, reason: job.reason,
            readiness: job.readiness, blockers: job.blockers, dependencies: job.dependencies,
            exclusive_resources: job.exclusive_resources, followup_of: job.followup_of,
            run_id: job.run_id ?? null, run_status: job.run_status ?? null, created_at: job.created_at,
            updated_at: job.updated_at, definition_sha256: job.definition_sha256, lease_until: job.lease_until ?? null,
          })));
        }
      } catch (error) { failure ??= error; controller.abort(error); throw error; }
    }
    const results = await Promise.allSettled(Array.from({ length: Math.min(3, studies.length) }, slot));
    if (failure) throw failure;
    if (controller.signal.aborted) throw controller.signal.reason;
    if (results.some(r => r.status === "rejected") || collected.size !== studies.length) throw new Error("Not all owned paper queues were returned. Combined counts are unknown.");
    const jobs = studies.flatMap(s => collected.get(s.id) ?? []);
    return validateExperimentQueue({ version: "research-queue-overview-v1", access: "owner-private", studies, jobs,
      workers_enabled: capabilities.queue.workers_enabled, limits: capabilities.queue.limits,
      coverage: { studies: studies.length, jobs: jobs.length },
      limitations: `Read from existing owner study queues. Studies are retrieved separately; combined counts are not an atomic global snapshot. Execution and scientific review remain separate.${metadataMissing ? ` Campaign metadata could not be retrieved for ${metadataMissing} studies; job status remains recorded and unavailable titles are labelled.` : ""}` });
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", relay); }
}
