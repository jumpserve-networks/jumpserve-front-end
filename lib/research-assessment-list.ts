import { ASSESSMENTS_PATH } from "@/lib/test-modules";
import { loadMyPaperCatalog, loadPaperCatalog, loadPaperMetadata, validPaperAuthors, type PaperAssessment, type PaperCatalog } from "@/lib/research-paper-catalog";

export type AssessmentView = "card" | "table";
export type AssessmentListOptions = { before?: string; mine?: boolean; name?: string; view?: AssessmentView };

export function assessmentListPath({ before, mine = false, name = "", view = "card" }: AssessmentListOptions = {}) {
  const query = new URLSearchParams();
  if (mine) query.set("mine", "1");
  if (view === "table") query.set("view", "table");
  if (name.trim()) query.set("name", name.trim());
  if (before) query.set("before", before);
  return `${ASSESSMENTS_PATH}${query.size ? `?${query}` : ""}`;
}

const normalize = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const matches = (paper: PaperAssessment, name: string) => normalize([paper.title, ...(paper.authors ?? []), paper.initiated_by].filter(Boolean).join(" ")).includes(name);

// Search the same public/owner catalogue used for cards. A matching page can
// span several catalogue pages; its cursor belongs to the last displayed match,
// so lookahead never skips matches that share the underlying page.
export async function loadAssessmentList({ before, userId, name = "" }: { before?: string; userId?: string; name?: string }, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<PaperCatalog> {
  if (name.length > 200) throw new Error("Use at most 200 characters in the name filter.");
  const search = normalize(name);
  const read = (cursor: string | undefined, readSignal = signal) => userId ? loadMyPaperCatalog(userId, cursor, readSignal, fetcher) : loadPaperCatalog(cursor, readSignal, fetcher);
  if (!search) return read(before);
  const controller = new AbortController();
  const relay = () => controller.abort(signal?.reason);
  if (signal?.aborted) relay(); else signal?.addEventListener("abort", relay, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("The name filter took too long to load. Try again.")), 30000);
  const found: PaperAssessment[] = [], seen = new Set<string>(), cursors = new Set<string>();
  let cursor = before;
  try {
    for (let scanned = 0; scanned < 100; scanned++) {
      controller.signal.throwIfAborted();
      const page = await read(cursor, controller.signal);
      const papers = [...page.papers];
      let index = 0;
      async function bibliography() {
        while (!controller.signal.aborted && index < papers.length) {
          const i = index++, paper = papers[i];
          if (!matches(paper, search) && (paper.title === null || !validPaperAuthors(paper.authors))) {
            const metadata = await loadPaperMetadata(paper.id, controller.signal, fetcher);
            papers[i] = { ...paper, title: paper.title ?? metadata.title, authors: paper.authors ?? metadata.authors };
          }
        }
      }
      await Promise.all([bibliography(), bibliography()]);
      controller.signal.throwIfAborted();
      for (const paper of papers) {
        if (seen.has(paper.id)) throw new Error("The assessment service repeated a page. Try again.");
        seen.add(paper.id);
        if (matches(paper, search)) found.push(paper);
      }
      if (found.length > 10 || page.next_cursor === null) {
        const selected = found.slice(0, 10), last = selected.at(-1);
        const next = found.length > 10 && last ? btoa(JSON.stringify({ created_at: last.created_at, id: last.id })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") : null;
        return { ...page, papers: selected, coverage: { papers: selected.length }, next_cursor: next };
      }
      if (cursors.has(page.next_cursor)) throw new Error("The assessment service repeated a page. Try again.");
      cursors.add(page.next_cursor); cursor = page.next_cursor;
    }
    throw new Error("The name filter exceeded its lookup limit. No partial list is shown.");
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", relay); controller.abort(); }
}
