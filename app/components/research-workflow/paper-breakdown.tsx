"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { PAPER_BREAKDOWN_SECTIONS, PAPER_BREAKDOWN_VERSION, validatePaperBreakdown, type PaperBreakdown, type PaperBreakdownSection, type PaperBreakdownItem } from "@/lib/research-paper-breakdown";
import type { ReviewedSections } from "@/lib/paper-experiment-plan";
import { Textarea } from "@/app/components/ui/textarea";
import { Checkbox } from "@/app/components/ui/checkbox";
import { PaperClaimCriterion, PaperEvidenceCitations } from "./paper-evidence";
import { flattenPaperDetailTree, paperDependencyClosure, paperDetailTree, type PaperDetailNode } from "@/lib/paper-detail-dependencies";

export function PaperBreakdownPanel({ value, version, preparing, busy, onPrepare, review, onReviewChange, onEditingChange }: {
  value?: unknown;
  version?: string;
  preparing: boolean;
  busy: boolean;
  onPrepare?: () => void;
  review?: ReviewedSections;
  onReviewChange?: (section: PaperBreakdownSection, itemId: string, description: string | null) => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [limits, setLimits] = useState<Partial<Record<PaperBreakdownSection, number>>>({});
  const [editing, setEditing] = useState<{ id: string; description: string } | null>(null);
  const [savedDescriptions, setSavedDescriptions] = useState<Record<string, string>>({});
  const editor = useRef<HTMLTextAreaElement>(null);
  const editButton = useRef<HTMLButtonElement | null>(null);
  const editingId = editing?.id;
  useEffect(() => { if (editingId) editor.current?.focus(); }, [editingId]);
  useEffect(() => () => onEditingChange?.(false), [onEditingChange]);
  function closeEditor() {
    setEditing(null); onEditingChange?.(false);
    requestAnimationFrame(() => editButton.current?.focus());
  }
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
      {breakdown.review ? <p role="status" className="text-sm">{`Reviewed version ${breakdown.review.revision} · ${breakdown.review.reviewer_type} document review. Original extraction retained.`}</p> : !breakdown.extraction_version ? <p role="status" className="text-sm">{`${breakdown.cursor} of ${breakdown.total_chunks} extracted text chunks examined across ${breakdown.total_pages} PDF pages.`}</p> : null}
      {breakdown.reason ? <p className="content-panel rounded-md border p-3 text-sm">{breakdown.reason}</p> : null}
      {breakdown.missing_text_pages.length ? <p className="text-sm text-muted-foreground">No readable text on PDF pages {breakdown.missing_text_pages.join(", ")}. Those pages remain uncovered.</p> : null}
    </> : <div role="status" className="content-panel space-y-3 rounded-lg border p-4 text-sm">
      <p>{preparing ? "Preparing Access, Experiment, Data and Validate from the paper’s extracted text…" : version === PAPER_BREAKDOWN_VERSION ? "A four-section breakdown has not been prepared for this paper." : "The connected service needs the paper breakdown update to prepare these sections."}</p>
      {!preparing && version === PAPER_BREAKDOWN_VERSION && onPrepare ? <Button type="button" variant="outline" disabled={busy} onClick={onPrepare}>Prepare four-section breakdown</Button> : null}
    </div>}
    <ol role="list" aria-label="Paper sections" className="space-y-6">
      {PAPER_BREAKDOWN_SECTIONS.map((section, sectionIndex) => {
        const entries = breakdown?.sections[section.id] ?? [];
        const limit = limits[section.id] ?? 8;
        const number = sectionIndex + 1;
        const tree = paperDetailTree(entries, String(number)), flattened = flattenPaperDetailTree(tree);
        const visible = new Set(flattened.slice(0, limit).map(node => node.item.id));
        const numbers = new Map(flattened.map(node => [node.item.id, node.number]));
        const renderDetails = (nodes: PaperDetailNode<PaperBreakdownItem>[], parentNumber?: string): ReactNode => <ol role="list" aria-label={parentNumber ? `Details depending on ${parentNumber}` : `${section.title} details`} className={parentNumber ? "mt-4 space-y-4 pl-4 sm:pl-6" : "space-y-4"}>
          {nodes.filter(node => visible.has(node.item.id)).map(({ item, index, number: detailNumber, children }) => {
            const key = `${breakdown?.source_id}:${breakdown?.policy_sha256}:${item.id}`;
            const included = review?.[section.id].some(entry => entry.id === item.id) ?? false;
            const description = review?.[section.id].find(entry => entry.id === item.id)?.description ?? savedDescriptions[key] ?? item.description;
            const label = `${section.title} detail ${index + 1}`;
            const active = editing?.id === key;
            const validEdit = Boolean(editing?.description.trim()) && [...(editing?.description.trim() ?? "")].length <= 400;
            const affected = paperDependencyClosure(entries, item.id, "dependents");
            const affectsEditor = included && entries.some(entry => affected.has(entry.id) && editing?.id === `${breakdown?.source_id}:${breakdown?.policy_sha256}:${entry.id}`);
            return <li key={item.id}>
              <div className="flex items-start gap-3 text-sm">
                <span aria-hidden="true" className="shrink-0 tabular-nums text-muted-foreground">{detailNumber}</span>
                <div className="min-w-0 flex-1 space-y-2">
                  {item.label ? <h4 className="font-medium">{item.label}</h4> : null}
                  {item.kind === "reported_result" ? <p className="text-xs font-medium text-muted-foreground">Paper-reported result{breakdown?.provenance?.classification === "synthetic" ? " · Fabricated benchmark value" : ""}</p> : null}
                  {review && onReviewChange ? <div className="flex items-start gap-3">
                    <Checkbox className="mt-1" aria-label={`Include ${label}`} checked={included} disabled={busy || active || affectsEditor} onCheckedChange={checked => {
                      const selected = paperDependencyClosure(entries, item.id, checked ? "prerequisites" : "dependents");
                      for (const entry of entries) if (selected.has(entry.id) && review[section.id].some(detail => detail.id === entry.id) !== Boolean(checked)) {
                        const entryKey = `${breakdown?.source_id}:${breakdown?.policy_sha256}:${entry.id}`;
                        onReviewChange(section.id, entry.id, checked ? savedDescriptions[entryKey] ?? entry.description : null);
                      }
                    }} />
                    <div className="min-w-0 flex-1">
                      {active && editing ? <div className="space-y-2">
                        <Textarea ref={editor} aria-label={`${label} description`} aria-invalid={!validEdit} value={editing.description} disabled={busy} maxLength={400} onChange={event => setEditing({ id: key, description: event.target.value })} />
                        <div className="flex justify-end gap-2">
                          <Button type="button" size="sm" variant="ghost" aria-label={`Cancel editing ${label}`} disabled={busy} onClick={closeEditor}>Cancel</Button>
                          <Button type="button" size="sm" aria-label={`Save ${label}`} disabled={busy || !validEdit} onClick={() => {
                            const saved = editing.description.trim();
                            onReviewChange(section.id, item.id, saved);
                            setSavedDescriptions(previous => ({ ...previous, [key]: saved }));
                            closeEditor();
                          }}>Save</Button>
                        </div>
                      </div> : <div className="flex items-start gap-3">
                        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{description}</p>
                        <Button type="button" size="sm" variant="ghost" className="shrink-0" aria-label={`Edit ${label}`} disabled={busy || !included || Boolean(editing)} onClick={event => {
                          editButton.current = event.currentTarget;
                          setEditing({ id: key, description }); onEditingChange?.(true);
                        }}>Edit</Button>
                      </div>}
                    </div>
                  </div> : <p className="whitespace-pre-wrap break-words">{item.description}</p>}
                  {item.depends_on && item.depends_on.length > 1 ? <p className="text-xs text-muted-foreground">Also depends on {item.depends_on.slice(1).map(ref => numbers.get(ref)).join(", ")}.</p> : null}
                  <div className="space-y-2 pl-3">
                    {item.criterion ? <PaperClaimCriterion criterion={item.criterion} /> : null}
                    <PaperEvidenceCitations citations={item.citations ?? [{ quote: item.quote, page: item.page }]} label={item.citations ? "Source quotes" : "Source quote"} />
                  </div>
                </div>
              </div>
              {children.length ? renderDetails(children, detailNumber) : null}
            </li>;
          })}
        </ol>;
        return <li key={section.id}>
          <section aria-labelledby={`paper-breakdown-${section.id}`} className="min-w-0">
            <details open>
              <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4">
                <h3 id={`paper-breakdown-${section.id}`} className="inline font-semibold"><span aria-hidden="true" className="mr-2 tabular-nums text-muted-foreground">{number}.</span>{section.title}</h3>
              </summary>
              <div className="mt-3 space-y-3 pl-4 sm:pl-6">
                <p className="text-sm text-muted-foreground">{section.description}</p>
                {entries.some(item => item.depends_on?.length) ? <p className="text-xs text-muted-foreground">Selecting a detail includes its prerequisites. Excluding a detail also excludes its dependents.</p> : null}
                {entries.length ? <>
                  {renderDetails(tree)}
                  {entries.length > limit ? <Button type="button" size="sm" variant="outline" onClick={() => setLimits(previous => ({ ...previous, [section.id]: (previous[section.id] ?? 8) + 8 }))}>Show more {section.title.toLowerCase()} details</Button> : null}
                </> : <p className="text-sm text-muted-foreground">{error ? "Details unavailable until the saved breakdown can be verified." : breakdown ? "No details identified in the text examined so far." : "Details have not been extracted yet."}</p>}
              </div>
            </details>
          </section>
        </li>;
      })}
    </ol>
  </section>;
}
