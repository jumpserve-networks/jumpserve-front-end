"use client";

import Link from "next/link";
import { LocalDateTime } from "@/app/components/user-preferences";
import { useEffect, useState } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { NEW_ASSESSMENT_PATH, PREVIOUS_ASSESSMENTS_PATH } from "@/lib/test-modules";
import { researchPublishedPath } from "@/lib/research-pathways";
import { experimentQueuePath } from "@/lib/research-experiment-queue";
import { loadPaperCatalog, loadPaperTitle, paperWorkflowLabel, type PaperCatalog } from "@/lib/research-paper-catalog";
import { ResearchHeader } from "./header";

export function PreviousAssessments({ before }: { before?: string }) {
  const [data, setData] = useState<PaperCatalog | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [titles, setTitles] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    loadPaperCatalog(before, controller.signal).then(value => {
      if (!controller.signal.aborted) { setData(value); setError(""); }
    }).catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "The assessment list is unavailable. Counts are unknown."); });
    return () => controller.abort();
  }, [before, revision]);
  useEffect(() => {
    if (!data) return;
    const controller = new AbortController();
    const pending = data.papers.filter(p => p.title === null);
    let index = 0;
    async function worker() {
      while (!controller.signal.aborted && index < pending.length) {
        const paper = pending[index++];
        let value = "Paper title unavailable";
        try { value = await loadPaperTitle(paper.id, controller.signal); } catch { /* A missing title does not erase recorded assessment status. */ }
        if (!controller.signal.aborted) setTitles(prior => ({ ...prior, [paper.id]: value }));
      }
    }
    // Title extraction has its own bounded requests; listing progress never
    // waits on an entire page of PDF text packets. At most two are in flight.
    void Promise.all([worker(), worker()]);
    return () => controller.abort();
  }, [data]);
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6" data-testid="previous-assessments">
    <ResearchHeader title="Previous Assessments" showModuleLabel={false} />
    {error ? <div role="alert" className="space-y-3 rounded-lg border p-4 text-sm"><p>{error}</p><Button variant="outline" onClick={() => { setData(null); setError(""); setRevision(value => value + 1); }}>Try again</Button></div> : !data ? <p role="status">Loading paper assessments…</p> : <>
      {!data.papers.length ? <section className="space-y-3 rounded-lg border p-5"><h2 className="font-semibold">{before ? "No assessments on this page" : "No paper assessments submitted yet"}</h2><Link className="text-sm underline" href={NEW_ASSESSMENT_PATH}>Assess a paper</Link></section> : <>
        <p className="text-sm text-muted-foreground">{data.coverage.papers} paper assessments on this page. Includes work in progress and stopped assessments.</p>
        <div className="grid gap-4 md:grid-cols-2">{data.papers.map(paper => {
          const title = paper.title ?? titles[paper.id] ?? "Reading paper title…";
          const assessment = researchPublishedPath("paper", paper.id);
          const queue = experimentQueuePath(paper.id);
          return <article key={paper.id} data-paper-id={paper.id} className="space-y-3 rounded-lg border p-5">
            <h2 className="break-words font-semibold"><Link className="underline" href={paper.published ? assessment : queue}>{title}</Link></h2>
            <div className="flex flex-wrap gap-2">{paper.workflow_status !== null || !paper.published ? <Badge variant="secondary">{paperWorkflowLabel(paper.workflow_status)}</Badge> : null}<Badge variant="outline">{paper.published ? "Published assessment" : "Not published"}</Badge></div>
            <p className="text-xs text-muted-foreground">Submitted <LocalDateTime value={paper.created_at} /></p>
            {paper.published ? <div className="text-sm"><Link className="underline" href={assessment}>Read assessment</Link></div> : null}
          </article>;
        })}</div>
      </>}
      {before || data.next_cursor ? <nav aria-label="Assessment pages" className="flex flex-wrap gap-5 text-sm">{before ? <Link className="underline" href={PREVIOUS_ASSESSMENTS_PATH}>Newest assessments</Link> : null}{data.next_cursor ? <Link className="underline" href={`${PREVIOUS_ASSESSMENTS_PATH}?${new URLSearchParams({ before: data.next_cursor })}`}>Older assessments</Link> : null}</nav> : null}
    </>}
  </main>;
}
