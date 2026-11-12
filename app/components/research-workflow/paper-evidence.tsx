"use client";

import type { PaperCitation, PaperCriterion } from "@/lib/paper-breakdown-evidence";

export function PaperEvidenceCitations({ citations, label = "Source quotes" }: { citations: PaperCitation[]; label?: string }) {
  if (!citations.length) return null;
  const pages = [...new Set(citations.map(c => c.page))].join(", ");
  return <details><summary className="cursor-pointer text-xs text-muted-foreground">{label} · PDF {new Set(citations.map(c => c.page)).size === 1 ? "page" : "pages"} {pages}</summary>
    <div className="mt-2 space-y-3">{citations.map((citation, index) => <div key={index}><p className="text-xs text-muted-foreground">PDF page {citation.page}</p><blockquote className="mt-1 whitespace-pre-wrap break-words border-l-2 pl-3 text-sm">{citation.quote}</blockquote></div>)}</div>
  </details>;
}

export function PaperClaimCriterion({ criterion }: { criterion: PaperCriterion }) {
  return <dl className="space-y-1 text-sm">
    <div><dt className="inline font-medium">Metric: </dt><dd className="inline">{criterion.metric}</dd></div>
    <div><dt className="inline font-medium">Comparison: </dt><dd className="inline">{criterion.comparison}</dd></div>
    <div><dt className="inline font-medium">Target: </dt><dd className="inline">{criterion.target}</dd></div>
    <div><dt className="inline font-medium">Agreement rule: </dt><dd className="inline">{criterion.acceptance === "needs_definition" ? "Needs an operational definition before execution." : "Use the paper-defined comparison."}{criterion.tolerance ? ` ${criterion.tolerance}` : " No separate tolerance is stated."}</dd></div>
  </dl>;
}
