import { isResearchId } from "@/lib/research-experiment-queue";
import { researchApiBase } from "@/lib/research-workflow";

export const PAPER_WORKFLOW_STATUSES = ["running", "completed", "completed-with-blockers", "deadline", "budget", "cancelled"] as const;
export type PaperWorkflowStatus = typeof PAPER_WORKFLOW_STATUSES[number];
export type PaperAssessment = { id: string; title: string | null; created_at: string; workflow_status: PaperWorkflowStatus | null; published: boolean };
export type PaperCatalog = { version: "research-paper-catalog-v1"; access: "public-read-only"; papers: PaperAssessment[]; coverage: { papers: number }; next_cursor: string | null };
const fields = (v: unknown, keys: string[]): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every(k => keys.includes(k));
const title = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 4000;
const cursor = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(v);
const fail = (): never => { throw new Error("The assessment list is invalid or incomplete. Assessment counts are unknown."); };

export function validatePaperCatalog(value: unknown): PaperCatalog {
  const q = value as PaperCatalog;
  if (!fields(q, ["version", "access", "papers", "coverage", "next_cursor"]) || q.version !== "research-paper-catalog-v1" || q.access !== "public-read-only" ||
      !Array.isArray(q.papers) || q.papers.length > 10 || !fields(q.coverage, ["papers"]) || q.coverage.papers !== q.papers.length ||
      (q.next_cursor !== null && (!cursor(q.next_cursor) || q.papers.length !== 10))) fail();
  for (const p of q.papers) {
    if (!fields(p, ["id", "title", "created_at", "workflow_status", "published"]) || !isResearchId(p.id) ||
        (p.title !== null && !title(p.title)) || typeof p.created_at !== "string" || !Number.isFinite(Date.parse(p.created_at)) || typeof p.published !== "boolean" ||
        (p.workflow_status !== null && !PAPER_WORKFLOW_STATUSES.includes(p.workflow_status))) fail();
  }
  if (new Set(q.papers.map(p => p.id)).size !== q.papers.length) fail();
  return q;
}

// Fixed read-only public paths; never use the authenticated workspace transport.
async function read(path: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<unknown> {
  const base = researchApiBase(process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL ?? process.env.NEXT_PUBLIC_BENCHMARK_API_URL);
  if (!base) throw new Error("The assessment service is not configured. Assessment counts are unknown.");
  const controller = new AbortController();
  const relay = () => controller.abort(signal?.reason);
  if (signal?.aborted) relay(); else signal?.addEventListener("abort", relay, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Assessment retrieval timed out. Assessment counts are unknown.")), 30000);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const response = await fetcher(`${base}/research${path}`, { method: "GET", credentials: "omit", cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > 200_000) throw new Error("The assessment response exceeds its byte budget. No partial list is shown.");
    if (!response.ok) throw new Error(response.status === 404 ? "The assessment listing service is unavailable or has not been released. Assessment counts are unknown." : `Assessment retrieval failed (HTTP ${response.status}). Assessment counts are unknown.`);
    try { return JSON.parse(raw); } catch { throw new Error("The assessment service returned an unreadable response. Assessment counts are unknown."); }
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", relay); }
}

export async function loadPaperCatalog(before?: string, signal?: AbortSignal, fetcher: typeof fetch = fetch) {
  if (before !== undefined && !cursor(before)) throw new Error("The assessment page link is invalid.");
  const result = validatePaperCatalog(await read(before ? `/papers?${new URLSearchParams({ before })}` : "/papers", signal, fetcher));
  if (before && result.next_cursor === before) fail();
  return result;
}

export async function loadPaperTitle(id: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<string> {
  if (!isResearchId(id)) throw new Error("The paper identity is invalid.");
  const result = await read(`/papers/${id}/title`, signal, fetcher);
  if (!fields(result, ["version", "access", "id", "title"]) || result.version !== "research-paper-catalog-v1" || result.access !== "public-read-only" || result.id !== id || !title(result.title)) return fail();
  return result.title;
}

export function paperWorkflowLabel(status: PaperWorkflowStatus | null) {
  // Workflow completion is never described as scientific claim reproduction.
  return status === "running" ? "In progress" : status === "completed" ? "Finished" : status === "completed-with-blockers" ? "Finished with gaps" :
    status === "budget" ? "Spending limit reached" : status === "deadline" ? "Time limit reached" : status === "cancelled" ? "Cancelled" : "Submitted";
}
