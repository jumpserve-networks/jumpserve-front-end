import { isResearchId } from "@/lib/research-experiment-queue";
import { researchApiBase } from "@/lib/research-workflow";
import { requireAccessToken } from "@/lib/browser-auth";

const PAPER_WORKFLOW_STATUSES = ["running", "completed", "completed-with-blockers", "deadline", "budget", "cancelled"] as const;
export type PaperWorkflowStatus = typeof PAPER_WORKFLOW_STATUSES[number];
export type PaperAssessment = { id: string; title: string | null; authors?: string[] | null; initiated_by?: string | null; created_at: string; workflow_status: PaperWorkflowStatus | null; published: boolean };
export type PaperMetadata = { title: string; authors: string[] | null };
export type PaperCatalog = { version: "research-paper-catalog-v1"; access: "public-read-only" | "owner-read-only"; papers: PaperAssessment[]; coverage: { papers: number }; next_cursor: string | null };
export type PaperDetail = { version: "research-paper-detail-v1"; access: "public-read-only"; paper: PaperAssessment; preparation_status: "preparing" | "ready" | "failed" | "confirmed" | null };
const fields = (v: unknown, keys: string[]): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every(k => keys.includes(k));
const title = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 4000;
export const validPaperAuthors = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every(name => typeof name === "string" && name.trim().length > 0 && [...name].length <= 200 && !/[\p{Cc}<>@]/u.test(name));
const cursor = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(v);
const fail = (): never => { throw new Error("The assessment list is invalid or incomplete. Assessment counts are unknown."); };

export function validatePaperCatalog(value: unknown, access: PaperCatalog["access"] = "public-read-only"): PaperCatalog {
  const q = value as PaperCatalog;
  if (!fields(q, ["version", "access", "papers", "coverage", "next_cursor"]) || q.version !== "research-paper-catalog-v1" || q.access !== access ||
      !Array.isArray(q.papers) || q.papers.length > 10 || !fields(q.coverage, ["papers"]) || q.coverage.papers !== q.papers.length ||
      (q.next_cursor !== null && (!cursor(q.next_cursor) || q.papers.length !== 10))) fail();
  for (const p of q.papers) {
    if (!fields(p, ["id", "title", "authors", "initiated_by", "created_at", "workflow_status", "published"]) || !isResearchId(p.id) || (p.authors != null && !validPaperAuthors(p.authors)) || (p.initiated_by != null && (typeof p.initiated_by !== "string" || !p.initiated_by.trim() || [...p.initiated_by].length > 201 || /[\p{Cc}<>@]/u.test(p.initiated_by))) ||
        (p.title !== null && !title(p.title)) || typeof p.created_at !== "string" || !Number.isFinite(Date.parse(p.created_at)) || typeof p.published !== "boolean" ||
        (p.workflow_status !== null && !PAPER_WORKFLOW_STATUSES.includes(p.workflow_status))) fail();
  }
  if (new Set(q.papers.map(p => p.id)).size !== q.papers.length) fail();
  return q;
}

// Catalogue metadata only. Public reads omit credentials; personal reads use
// a verified bearer token, never a caller-supplied owner ID.
async function read(path: string, signal?: AbortSignal, fetcher: typeof fetch = fetch, token?: string): Promise<unknown> {
  const base = researchApiBase(process.env.NEXT_PUBLIC_RESEARCH_CATALOG_API_URL ?? process.env.NEXT_PUBLIC_RESEARCH_WORKFLOW_API_URL ?? process.env.NEXT_PUBLIC_BENCHMARK_API_URL);
  if (!base) throw new Error("The assessment service is not configured. Assessment counts are unknown.");
  const controller = new AbortController();
  const relay = () => controller.abort(signal?.reason);
  if (signal?.aborted) relay(); else signal?.addEventListener("abort", relay, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Assessment retrieval timed out. Assessment counts are unknown.")), 30000);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const response = await fetcher(`${base}/research${path}`, { method: "GET", credentials: "omit", cache: "no-store", headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: controller.signal });
    const raw = await response.text();
    if (new TextEncoder().encode(raw).byteLength > 200_000) throw new Error("The assessment response exceeds its byte budget. No partial list is shown.");
    if (!response.ok) throw new Error(response.status === 404 ? "The assessment listing service is unavailable or has not been released. Assessment counts are unknown." : `Assessment retrieval failed (HTTP ${response.status}). Assessment counts are unknown.`);
    try { return JSON.parse(raw); } catch { throw new Error("The assessment service returned an unreadable response. Assessment counts are unknown."); }
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", relay); }
}

export async function loadPaperCatalog(before?: string, signal?: AbortSignal, fetcher: typeof fetch = fetch) {
  if (before !== undefined && !cursor(before)) throw new Error("The assessment page link is invalid.");
  const query = new URLSearchParams({ bibliography: "1", initiator: "1" });
  if (before) query.set("before", before);
  const result = validatePaperCatalog(await read(`/papers?${query}`, signal, fetcher));
  if (before && result.next_cursor === before) fail();
  return result;
}

async function legacyPersonalCatalog(firstPage: PaperCatalog, token: string, signal: AbortSignal | undefined, fetcher: typeof fetch): Promise<PaperCatalog> {
  const controller = new AbortController();
  const relay = () => controller.abort(signal?.reason);
  if (signal?.aborted) relay(); else signal?.addEventListener("abort", relay, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Your assessment list took too long to load. Please try again.")), 30000);
  try {
    // Older catalogues ignore mine=1. Only the authenticated owner listing can
    // establish membership; public names, titles and account IDs are not proof.
    const value = await read("/studies?mine=1&status=1", controller.signal, fetcher, token) as Record<string, unknown>;
    controller.signal.throwIfAborted();
    const studies = value?.studies;
    if (!value || value.access !== "owner-drafts" || value.has_more === true || !Array.isArray(studies) || studies.length > 100) return fail();
    const owned = new Set<string>(), identities = new Set<string>();
    for (const study of studies) {
      if (!study || !isResearchId(study.id) || identities.has(study.id) || (study.study_kind !== undefined && study.study_kind !== "paper" && study.study_kind !== "idea")) fail();
      identities.add(study.id);
      if (study.study_kind !== "idea") owned.add(study.id);
    }
    const papers: PaperAssessment[] = [], seen = new Set<string>();
    let page = firstPage;
    for (let scanned = 0; scanned < 100; scanned++) {
      for (const paper of page.papers) {
        if (seen.has(paper.id)) fail();
        seen.add(paper.id);
        if (owned.has(paper.id)) papers.push(paper);
      }
      if (papers.length === owned.size || papers.length > 10 || page.next_cursor === null) {
        const selected = papers.slice(0, 10), last = selected.at(-1);
        // Use the tenth owned paper as the boundary. A public page boundary
        // would skip owned papers that share its page with the lookahead row.
        const next = papers.length > 10 && last ? btoa(JSON.stringify({ created_at: last.created_at, id: last.id })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") : null;
        return { ...firstPage, access: "owner-read-only", papers: selected, coverage: { papers: selected.length }, next_cursor: next };
      }
      page = await loadPaperCatalog(page.next_cursor, controller.signal, fetcher);
    }
    throw new Error("The older assessment service could not finish your list. No partial list is shown; the backend needs the personal-list update.");
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", relay); }
}

export async function loadMyPaperCatalog(userId: string, before?: string, signal?: AbortSignal, fetcher: typeof fetch = fetch) {
  if (!isResearchId(userId)) throw new Error("Your signed-in account is invalid.");
  if (before !== undefined && !cursor(before)) throw new Error("The assessment page link is invalid.");
  if (signal?.aborted) throw signal.reason;
  const token = await requireAccessToken("Sign in to view your assessments.", userId);
  const query = new URLSearchParams({ bibliography: "1", initiator: "1", mine: "1" });
  if (before) query.set("before", before);
  const value = await read(`/papers?${query}`, signal, fetcher, token);
  const legacy = !!value && typeof value === "object" && "access" in value && value.access === "public-read-only";
  const result = legacy
    ? await legacyPersonalCatalog(validatePaperCatalog(value), token, signal, fetcher)
    : validatePaperCatalog(value, "owner-read-only");
  if (before && result.next_cursor === before) fail();
  return result;
}

export async function loadPaperDetail(id: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<PaperDetail> {
  if (!isResearchId(id)) throw new Error("The assessment identity is invalid.");
  const result = await read(`/papers/${id}`, signal, fetcher) as PaperDetail;
  if (!fields(result, ["version", "access", "paper", "preparation_status"]) || result.version !== "research-paper-detail-v1" || result.access !== "public-read-only" ||
      !result.paper || result.paper.id !== id || ![null, "preparing", "ready", "failed", "confirmed"].includes(result.preparation_status)) fail();
  validatePaperCatalog({ version: "research-paper-catalog-v1", access: "public-read-only", papers: [result.paper], coverage: { papers: 1 }, next_cursor: null });
  return result;
}

export async function loadPaperMetadata(id: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<PaperMetadata> {
  if (!isResearchId(id)) throw new Error("The paper identity is invalid.");
  const result = await read(`/papers/${id}/title?bibliography=1`, signal, fetcher);
  if (!fields(result, ["version", "access", "id", "title", "authors"]) || result.version !== "research-paper-catalog-v1" || result.access !== "public-read-only" || result.id !== id || !title(result.title) || result.authors != null && !validPaperAuthors(result.authors)) return fail();
  return { title: result.title, authors: result.authors == null ? null : result.authors as string[] };
}

export function paperWorkflowLabel(status: PaperWorkflowStatus | null) {
  // Workflow completion is never described as scientific claim reproduction.
  return status === "running" ? "In progress" : status === "completed" ? "Finished" : status === "completed-with-blockers" ? "Finished with gaps" :
    status === "budget" ? "Spending limit reached" : status === "deadline" ? "Time limit reached" : status === "cancelled" ? "Cancelled" : "Submitted";
}
