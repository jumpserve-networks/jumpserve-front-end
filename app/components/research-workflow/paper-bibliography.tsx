"use client";

import { useEffect, useState } from "react";
import { loadPaperMetadata, validPaperAuthors, type PaperMetadata } from "@/lib/research-paper-catalog";

type Paper = { id: string; title: string | null; authors?: string[] | null };

export function usePaperBibliography(papers: readonly Paper[] | undefined) {
  const [metadata, setMetadata] = useState<Record<string, PaperMetadata>>({});
  useEffect(() => {
    if (!papers) return;
    const controller = new AbortController();
    const pending = papers.filter(paper => paper.title === null || !validPaperAuthors(paper.authors));
    let index = 0;
    async function worker() {
      while (!controller.signal.aborted && index < pending.length) {
        const paper = pending[index++];
        let result: PaperMetadata = { title: paper.title ?? "Paper title unavailable", authors: null };
        try { result = await loadPaperMetadata(paper.id, controller.signal); } catch { /* Bibliography gaps must not erase recorded assessments. */ }
        if (!controller.signal.aborted) setMetadata(previous => ({ ...previous, [paper.id]: result }));
      }
    }
    void Promise.all([worker(), worker()]);
    return () => controller.abort();
  }, [papers]);
  return metadata;
}

export function PaperAuthors({ authors, loading = false }: { authors?: string[] | null; loading?: boolean }) {
  return <p data-paper-authors className="break-words text-sm text-muted-foreground">{validPaperAuthors(authors) ? authors.join(", ") : loading ? "Reading authors…" : "Authors unavailable"}</p>;
}
