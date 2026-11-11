"use client";

import { useState } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { PAPER_BREAKDOWN_SECTIONS, PAPER_BREAKDOWN_VERSION, validatePaperBreakdown, type PaperBreakdown, type PaperBreakdownSection } from "@/lib/research-paper-breakdown";

export function PaperBreakdownPanel({ value, version, preparing, busy, onPrepare }: {
  value?: unknown;
  version?: string;
  preparing: boolean;
  busy: boolean;
  onPrepare?: () => void;
}) {
  const [limits, setLimits] = useState<Partial<Record<PaperBreakdownSection, number>>>({});
  let breakdown: PaperBreakdown | null = null;
  let error = "";
  try {
    if (version !== undefined && version !== PAPER_BREAKDOWN_VERSION) throw new Error("This service uses an unsupported paper breakdown version.");
    if (value != null) {
      if (version !== PAPER_BREAKDOWN_VERSION) throw new Error("The paper breakdown version could not be verified.");
      breakdown = validatePaperBreakdown(value);
    }
  } catch (failure) { error = failure instanceof Error ? failure.message : "Paper breakdown is unavailable."; }

  return <section aria-labelledby="paper-breakdown-title" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="paper-breakdown-title" className="text-lg font-semibold">Paper breakdown</h2>
      {breakdown ? <Badge variant="secondary">{breakdown.status === "ready" ? "Text breakdown ready" : breakdown.status === "limited" ? "Partial breakdown" : "Preparing breakdown"}</Badge> : null}
    </div>
    <p className="text-sm text-muted-foreground">Details from the paper, organized into four sections. This breakdown does not acquire resources, run experiments or independently validate results.</p>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : breakdown ? <>
      <p role="status" className="text-sm">{breakdown.extraction_version ? `One model pass over extracted text from ${breakdown.total_pages} PDF ${breakdown.total_pages === 1 ? "page" : "pages"}.` : `${breakdown.cursor} of ${breakdown.total_chunks} extracted text chunks examined across ${breakdown.total_pages} PDF pages.`}</p>
      {breakdown.reason ? <p className="rounded-md border p-3 text-sm">{breakdown.reason}</p> : null}
      {breakdown.missing_text_pages.length ? <p className="text-sm text-muted-foreground">No readable text on PDF pages {breakdown.missing_text_pages.join(", ")}. Those pages remain uncovered.</p> : null}
    </> : <div role="status" className="space-y-3 rounded-lg border p-4 text-sm">
      <p>{preparing ? "Preparing Access, Experiment, Data and Validate from the paper’s extracted text…" : version === PAPER_BREAKDOWN_VERSION ? "A four-section breakdown has not been prepared for this paper." : "The connected service needs the paper breakdown update to prepare these sections."}</p>
      {!preparing && version === PAPER_BREAKDOWN_VERSION && onPrepare ? <Button type="button" variant="outline" disabled={busy} onClick={onPrepare}>Prepare four-section breakdown</Button> : null}
    </div>}
    <div className="grid gap-4 lg:grid-cols-2">
      {PAPER_BREAKDOWN_SECTIONS.map(section => {
        const entries = breakdown?.sections[section.id] ?? [];
        const limit = limits[section.id] ?? 8;
        return <section key={section.id} aria-labelledby={`paper-breakdown-${section.id}`} className="min-w-0 space-y-3 rounded-lg border p-4">
          <h3 id={`paper-breakdown-${section.id}`} className="font-semibold">{section.title}</h3>
          <p className="text-sm text-muted-foreground">{section.description}</p>
          {entries.length ? <>
            <p className="text-xs text-muted-foreground">Showing {Math.min(limit, entries.length)} of {entries.length} recorded details.</p>
            <ul className="space-y-3">
              {entries.slice(0, limit).map(item => <li key={item.id} className="space-y-2 rounded-md border p-3 text-sm">
                <p className="whitespace-pre-wrap break-words">{item.description}</p>
                <details><summary className="cursor-pointer text-xs text-muted-foreground">Source quote · PDF page {item.page}</summary><blockquote className="mt-2 whitespace-pre-wrap break-words border-l-2 pl-3">{item.quote}</blockquote></details>
              </li>)}
            </ul>
            {entries.length > limit ? <Button type="button" size="sm" variant="outline" onClick={() => setLimits(previous => ({ ...previous, [section.id]: (previous[section.id] ?? 8) + 8 }))}>Show more {section.title.toLowerCase()} details</Button> : null}
          </> : <p className="text-sm text-muted-foreground">{error ? "Details unavailable until the saved breakdown can be verified." : breakdown ? "No details identified in the text examined so far." : "Details have not been extracted yet."}</p>}
        </section>;
      })}
    </div>
    {breakdown ? <p className="text-xs text-muted-foreground">{breakdown.limitation}</p> : null}
  </section>;
}
