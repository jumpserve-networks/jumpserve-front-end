"use client";

import { useState } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { PAPER_BREAKDOWN_SECTIONS, PAPER_BREAKDOWN_VERSION, validatePaperBreakdown, type PaperBreakdown, type PaperBreakdownSection } from "@/lib/research-paper-breakdown";
import type { ReviewedSections } from "@/lib/paper-experiment-plan";
import { Textarea } from "@/app/components/ui/textarea";
import { Checkbox } from "@/app/components/ui/checkbox";
import { PaperClaimCriterion, PaperEvidenceCitations } from "./paper-evidence";

export function PaperBreakdownPanel({ value, version, preparing, busy, onPrepare, review, onReviewChange }: {
  value?: unknown;
  version?: string;
  preparing: boolean;
  busy: boolean;
  onPrepare?: () => void;
  review?: ReviewedSections;
  onReviewChange?: (section: PaperBreakdownSection, itemId: string, description: string | null) => void;
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
      {breakdown && breakdown.status !== "ready" ? <Badge variant="secondary">{breakdown.status === "limited" ? "Partial breakdown" : "Preparing breakdown"}</Badge> : null}
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : breakdown ? <>
      {breakdown.provenance ? <aside aria-label="Document provenance" className="space-y-2 border-l-2 border-warning pl-3 text-sm"><h3 className="font-semibold">Document provenance</h3><p className="font-medium">{({ synthetic: "Synthetic document: reported benchmark results are fabricated.", simulated: "The paper reports simulated results.", reported_empirical: "The paper describes its results as empirical observations.", unspecified: "Document provenance is not explicitly identified." })[breakdown.provenance.classification]}</p>{breakdown.provenance.statement ? <p>{breakdown.provenance.statement}</p> : null}<PaperEvidenceCitations citations={breakdown.provenance.citations} /></aside> : null}
      <p role="status" className="text-sm">{breakdown.review ? `Reviewed version ${breakdown.review.revision} · ${breakdown.review.reviewer_type} document review. Original extraction retained.` : breakdown.extraction_version ? `One model pass over extracted text from ${breakdown.total_pages} PDF ${breakdown.total_pages === 1 ? "page" : "pages"}.` : `${breakdown.cursor} of ${breakdown.total_chunks} extracted text chunks examined across ${breakdown.total_pages} PDF pages.`}</p>
      {breakdown.reason ? <p className="content-panel rounded-md border p-3 text-sm">{breakdown.reason}</p> : null}
      {breakdown.missing_text_pages.length ? <p className="text-sm text-muted-foreground">No readable text on PDF pages {breakdown.missing_text_pages.join(", ")}. Those pages remain uncovered.</p> : null}
    </> : <div role="status" className="content-panel space-y-3 rounded-lg border p-4 text-sm">
      <p>{preparing ? "Preparing Access, Experiment, Data and Validate from the paper’s extracted text…" : version === PAPER_BREAKDOWN_VERSION ? "A four-section breakdown has not been prepared for this paper." : "The connected service needs the paper breakdown update to prepare these sections."}</p>
      {!preparing && version === PAPER_BREAKDOWN_VERSION && onPrepare ? <Button type="button" variant="outline" disabled={busy} onClick={onPrepare}>Prepare four-section breakdown</Button> : null}
    </div>}
    <div className="grid grid-cols-1 gap-4">
      {PAPER_BREAKDOWN_SECTIONS.map(section => {
        const entries = breakdown?.sections[section.id] ?? [];
        const limit = limits[section.id] ?? 8;
        return <section key={section.id} aria-labelledby={`paper-breakdown-${section.id}`} className="content-panel min-w-0 space-y-3 rounded-lg border p-4">
          <h3 id={`paper-breakdown-${section.id}`} className="font-semibold">{section.title}</h3>
          <p className="text-sm text-muted-foreground">{section.description}</p>
          {entries.length ? <>
            <ul className="divide-y divide-border">
              {entries.slice(0, limit).map((item, index) => <li key={item.id} className="space-y-2 py-3 text-sm first:pt-0 last:pb-0">
                {item.label ? <h4 className="font-medium">{item.label}</h4> : null}
                {item.kind === "reported_result" ? <p className="text-xs font-medium text-muted-foreground">Paper-reported result{breakdown?.provenance?.classification === "synthetic" ? " · Fabricated benchmark value" : ""}</p> : null}
                {review && onReviewChange ? <>
                  <label className="flex items-center gap-2"><Checkbox checked={review[section.id].some(entry => entry.id === item.id)} disabled={busy} onCheckedChange={checked => onReviewChange(section.id, item.id, checked ? item.description : null)} />Include {section.title} detail {index + 1}</label>
                  <Textarea aria-label={`${section.title} detail ${index + 1} description`} value={review[section.id].find(entry => entry.id === item.id)?.description ?? item.description} disabled={busy || !review[section.id].some(entry => entry.id === item.id)} maxLength={400} onChange={event => onReviewChange(section.id, item.id, event.target.value)} />
                </> : <p className="whitespace-pre-wrap break-words">{item.description}</p>}
                {item.criterion ? <PaperClaimCriterion criterion={item.criterion} /> : null}
                {item.specification ? <dl className="space-y-2">{Object.entries(item.specification).map(([key, detail]) => <div key={key}><dt className="font-medium capitalize">{key}</dt><dd className="whitespace-pre-wrap">{detail}</dd></div>)}</dl> : null}
                <PaperEvidenceCitations citations={item.citations ?? [{ quote: item.quote, page: item.page }]} label={item.citations ? "Source quotes" : "Source quote"} />
              </li>)}
            </ul>
            {entries.length > limit ? <Button type="button" size="sm" variant="outline" onClick={() => setLimits(previous => ({ ...previous, [section.id]: (previous[section.id] ?? 8) + 8 }))}>Show more {section.title.toLowerCase()} details</Button> : null}
          </> : <p className="text-sm text-muted-foreground">{error ? "Details unavailable until the saved breakdown can be verified." : breakdown ? "No details identified in the text examined so far." : "Details have not been extracted yet."}</p>}
        </section>;
      })}
    </div>
    {breakdown?.implementation_choices?.length ? <section aria-label="Implementation choices to resolve" className="space-y-3"><h3 className="font-semibold">Implementation choices to resolve</h3><p className="text-sm text-muted-foreground">The paper does not fix these implementation details. Select and record them explicitly before execution.</p><ul className="divide-y divide-border">{breakdown.implementation_choices.map(choice => <li key={choice.name} className="space-y-2 py-3 text-sm"><h4 className="font-medium">{choice.name}</h4><p>{choice.reason}</p><PaperEvidenceCitations citations={choice.citations} label="Related paper context" /></li>)}</ul></section> : null}
  </section>;
}
